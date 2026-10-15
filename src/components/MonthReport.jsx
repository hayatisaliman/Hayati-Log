import { useEffect, useId, useRef, useState } from 'react'
import { cellText, COLORS, cycleInfo, cycleHistory, cycleLen, blockEnd } from '../lib/schema.js'
import { DAY_SHORT, MONTHS, addDays, daysInMonth, fmtClock, fmtDuration, monthLabel, pad, weekday, toDate } from '../lib/time.js'
import { catMeta } from './TimeBlocks.jsx'
import { Chip } from './cells.jsx'
import { useTip } from './Tip.jsx'
import { ScrollTabs } from './ScrollTabs.jsx'
import { ProcrastinationCard } from './Procrastination.jsx'
import { avg, sleepOn, clockWindow, inWindow } from '../lib/report.js'

const textOf = (row, id) => cellText(row.cells[id]).trim()
const short = (iso) => `${toDate(iso).getDate()} ${MONTHS[toDate(iso).getMonth()].slice(0, 3)}`
const PHASE_ABBR = { 'Prolif.': 'PF', Ovulation: 'OV', Luteal: 'LT' }
const phaseAbbr = (c) => (c.phase === 'Period' ? `P${c.day}` : c.phase === 'Late' ? `L${c.late}` : PHASE_ABBR[c.phase] || '')
const PHASE_COLS = [['Prolif.', 'PF'], ['Ovulation', 'OV'], ['Luteal', 'LT'], ['Late', 'L'], ['Period', 'P']]

export function MonthReport({ data, month, months, setMonth, onOpen, now }) {
  const [bind, tipEl] = useTip()
  const rows = data.rows.filter((r) => r.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date))
  const n = daysInMonth(month)
  const byDate = Object.fromEntries(rows.map((r) => [r.date, r]))
  const dates = Array.from({ length: n }, (_, i) => `${month}-${pad(i + 1)}`)
  const field = (id) => data.fields.find((f) => f.id === id)
  const checkFields = data.fields.filter((f) => f.type === 'checkbox' && !f.hidden)
  const stateField = data.fields.find((f) => f.id === 'state')

  const logged = rows.filter((r) => Object.keys(r.cells).length || r.blocks.length || r.notes)
  const starts = rows.map((r) => r.cells.start).filter((v) => v != null)
  const ends = rows.map((r) => r.cells.end).filter((v) => v != null)
  const awake = rows.filter((r) => r.cells.start != null && r.cells.end != null).map((r) => r.cells.end - r.cells.start)

  const blockDur = (r, b) => { const e = blockEnd(b, r.date === now.today, now.minutesFor(r.date)); return e == null ? 0 : Math.max(0, e - b.start) }
  const groupTotals = {}
  let tracked = 0
  for (const r of rows) for (const b of r.blocks) {
    const d = blockDur(r, b)
    tracked += d
    const g = catMeta(data, b.cats?.[0]).group || 'none'
    groupTotals[g] = (groupTotals[g] || 0) + d
  }
  const stateCounts = (stateField?.options || []).map((o) => ({ o, n: rows.filter((r) => (r.cells.state || []).includes(o.id)).length })).filter((x) => x.n).sort((a, b) => b.n - a.n)

  const cyc = cycleSummary(data.settings, dates, now.today)
  const chartOptions = [...(stateField?.options || []), ...(field('exercise') ? [{ id: 'exercise', name: field('exercise').name, color: 'orange', cell: true }] : [])]
  const workGroup = data.groups.find((g) => g.id === 'work')
  const restGroup = data.groups.find((g) => g.id === 'rest')
  const groupMins = (d, id) => (byDate[d] ? byDate[d].blocks.filter((b) => catMeta(data, b.cats?.[0]).group === id).reduce((t, b) => t + blockDur(byDate[d], b), 0) : 0)
  const rowOf = Object.fromEntries(data.rows.map((r) => [r.date, r]))
  const notesOf = (d) => ['friction', 'rest'].map((id) => field(id) && byDate[d] && textOf(byDate[d], id) ? { label: field(id).name, text: textOf(byDate[d], id) } : null).filter(Boolean)
  const extras = dates.map((d) => ({
    sleep: sleepOn(rowOf, d),
    start: byDate[d]?.cells.start ?? null,
    end: byDate[d]?.cells.end ?? null,
    work: groupMins(d, 'work'),
    rest: groupMins(d, 'rest'),
    notes: notesOf(d),
  }))

  let lo = Math.min(...starts, ...rows.flatMap((r) => r.blocks.map((b) => b.start)))
  let hi = Math.max(...ends, ...rows.flatMap((r) => r.blocks.map((b) => blockEnd(b, false, 0) ?? b.start)))
  if (!Number.isFinite(lo)) { lo = 9 * 60; hi = 33 * 60 }
  lo = Math.floor(lo / 120) * 120
  hi = Math.ceil(hi / 120) * 120
  if (hi - lo < 12 * 60) hi = lo + 12 * 60
  const span = hi - lo
  const ticks = []
  for (let t = lo; t <= hi; t += span > 1200 ? 240 : 120) ticks.push(t)
  const x = (m) => `${((m - lo) / span) * 100}%`

  const lists = ['learn'].map((id) => ({ f: field(id), items: rows.filter((r) => textOf(r, id)) })).filter((x) => x.f && x.items.length)

  return (
    <div className="report">
      <div className="view-head">
        <h1 className="view-title">{monthLabel(month)}</h1>
        <ScrollTabs items={months} value={month} onPick={setMonth} label={(m) => monthLabel(m, true)} />
      </div>

      <div className="tiles">
        <Tile label="Days logged" value={`${logged.length}`} sub={`of ${n}`} />
        <Tile label="Avg start" value={starts.length ? fmtClock(avg(starts), { compact: true }) : '—'} sub={starts.length ? `${starts.length} days` : ''} />
        <Tile label="Avg end" value={ends.length ? fmtClock(avg(ends), { compact: true }) : '—'} sub={ends.length ? `${ends.length} days` : ''} />
        <Tile label="Avg day length" value={awake.length ? fmtDuration(avg(awake)) : '—'} sub="start → end" />
        <Tile label="Time tracked" value={tracked ? fmtDuration(tracked) : '—'} sub={`${rows.filter((r) => r.blocks.length).length} days with blocks`} />
      </div>

      <section className="card">
        <div className="card-head"><h3>State &amp; Cycle</h3><span className="section-meta">usual cycle {cycleLen(data.settings)} days</span></div>
        <div className="cycle-events">
          {cyc.events.map((e) => (
            <div key={e.start} className="cycle-event">
              <span>🩸 Started <b>{short(e.start)}</b></span>
              {e.status ? <Chip color={e.color}>{e.status}{e.diff ? ` ${e.diff > 0 ? '+' : ''}${e.diff}d` : ''}</Chip> : <Chip color="gray">First recorded</Chip>}
              {e.length && <span className="muted">cycle was {e.length} days</span>}
            </div>
          ))}
          {cyc.lateNow && (
            <div className="cycle-event">
              <span>⚠ Day <b>{cyc.lateNow.day}</b>{cyc.isCurrent ? ' today' : ' at month end'}</span>
              <Chip color="orange">Late +{cyc.lateNow.late}d</Chip>
              <span className="muted">no period yet</span>
            </div>
          )}
          {!cyc.events.length && !cyc.lateNow && (
            <div className="cycle-event muted">No period started this month{cyc.nextExpected ? ` · next expected ${short(cyc.nextExpected)}` : ''}</div>
          )}
        </div>
        <div className="mini-head">Period days <b className="num">{cyc.periodDays}</b>{cyc.ranges.length ? <span className="muted"> · {cyc.ranges.join(', ')}</span> : null}</div>
        <StateChart dates={dates} byDate={byDate} options={chartOptions} extras={extras} workName={workGroup?.name || 'Work'} workColor={COLORS[workGroup?.color] || COLORS.blue} restName={restGroup?.name || 'Rest'} restColor={COLORS[restGroup?.color] || COLORS.pink} settings={data.settings} today={now.today} bind={bind} />
        <div className="state-pair">
          <SleepChart dates={dates} extras={extras} settings={data.settings} today={now.today} bind={bind} />
          <PhaseTable dates={dates} byDate={byDate} options={chartOptions} extras={extras} workName={workGroup?.name || 'Work'} restName={restGroup?.name || 'Rest'} settings={data.settings} today={now.today} />
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Daily Rhythm</h3>
          <span className="section-meta">Each bar runs from Start to End. Coloured segments are time blocks.</span>
          <div className="grow" />
          <div className="legend">
            <span className="legend-item"><span className="swatch rhythm" />Day (start → end)</span>
            {data.groups.map((g) => <span key={g.id} className="legend-item"><span className="swatch" style={{ background: COLORS[g.color] }} />{g.name}</span>)}
          </div>
        </div>
        <div className="rhythm">
          <div className="rhythm-axis">
            <span className="rhythm-day" />
            <div className="rhythm-scale">
              {ticks.map((t) => <span key={t} style={{ left: x(t) }}>{fmtClock(t, { compact: true }).replace(' ', '').toLowerCase()}</span>)}
            </div>
          </div>
          {dates.map((d) => {
            const r = byDate[d]
            const cyc = cycleInfo(d, data.settings)
            return (
              <div key={d} className="rhythm-row" onClick={() => r && onOpen(r.id)}>
                <span className="rhythm-day">
                  <b className="num">{toDate(d).getDate()}</b>
                  {cyc && <i className="rhythm-phase" style={{ color: COLORS[cyc.color] }} title={`D${cyc.day} ${cyc.phase}`}>{phaseAbbr(cyc)}</i>}
                </span>
                <div className="rhythm-track">
                  {ticks.map((t) => <span key={t} className="rhythm-grid" style={{ left: x(t) }} />)}
                  {r && r.cells.start != null && r.cells.end != null && (
                    <span className="rhythm-bar" style={{ left: x(r.cells.start), width: `${((r.cells.end - r.cells.start) / span) * 100}%` }}
                      {...bind(<><b>{d}</b><div>{fmtClock(r.cells.start)} → {fmtClock(r.cells.end)}</div><div>{fmtDuration(r.cells.end - r.cells.start)}</div></>)} />
                  )}
                  {r && r.blocks.map((b) => {
                    const e = blockEnd(b, d === now.today, now.minutesFor(d))
                    if (e == null) return null
                    const m = catMeta(data, b.cats?.[0])
                    return <span key={b.id} className="rhythm-seg" style={{ left: x(b.start), width: `calc(${((e - b.start) / span) * 100}% - 1px)`, background: COLORS[m.color] }}
                      {...bind(<><b>{m.emoji} {b.cats.map((c) => catMeta(data, c).name).join(', ') || 'Block'}</b><div>{fmtClock(b.start)} → {fmtClock(e)} · {fmtDuration(e - b.start)}</div>{b.text && <div className="muted">{b.text}</div>}</>)} />
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <div className="report-grid habits-row">
        <section className="card">
          <div className="card-head"><h3>Habits</h3></div>
          <div className="habits" style={{ gridTemplateColumns: `90px repeat(${n}, minmax(12px, 14px)) 54px` }}>
            <span />
            {dates.map((d) => <span key={d} className={`habit-day num ${weekday(d) === 0 || weekday(d) === 6 ? 'weekend' : ''}`}>{toDate(d).getDate()}</span>)}
            <span />
            {checkFields.map((f) => {
              const count = dates.filter((d) => byDate[d]?.cells[f.id]).length
              return [
                <span key={f.id} className="habit-name">{f.name}</span>,
                ...dates.map((d) => {
                  const on = !!byDate[d]?.cells[f.id]
                  return <span key={f.id + d} className={`habit-cell ${on ? 'on' : ''} ${byDate[d] ? '' : 'none'}`} {...bind(<><b>{f.name}</b><div>{d} · {on ? 'Done' : byDate[d] ? 'Not done' : 'No entry'}</div></>)} />
                }),
                <span key={f.id + 'n'} className="habit-count num">{count}/{n}</span>,
              ]
            })}
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h3>Time Blocks</h3></div>
          {tracked ? <Bars items={Object.entries(groupTotals).sort((a, b) => b[1] - a[1]).map(([g, v]) => {
            const grp = data.groups.find((x) => x.id === g)
            return { key: g, label: grp?.name || 'Uncategorised', value: v, color: COLORS[grp?.color] || COLORS.gray, fmt: fmtDuration }
          })} bind={bind} /> : <div className="empty-note">No time blocks this month</div>}
        </section>
      </div>

      <div className="report-grid">
        <ProcrastinationCard rows={rows} data={data} today={now.today} onOpen={onOpen} />
        {lists.map((l) => (
          <section key={l.f.id} className="card">
            <div className="card-head"><h3>{l.f.name}</h3><span className="section-meta">{l.items.length} entries</span></div>
            <div className="mini-list">
              {l.items.map((r) => (
                <div key={r.id} className="mini-row" onClick={() => onOpen(r.id)}>
                  <span className="num muted">{toDate(r.date).getDate()}</span>
                  <span className="pre">{textOf(r, l.f.id)}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      {tipEl}
    </div>
  )
}

function Tile({ label, value, sub }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value num">{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  )
}

function StateChart({ dates, byDate, options, extras, workName, workColor, restName, restColor, settings, today, bind }) {
  const ref = useRef(null)
  const [w, setW] = useState(600)
  const [hover, setHover] = useState(null)
  const uid = useId()
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  const LANE = 30, L = 92, R = 12, T = 12, AX = 30, BAR = 34
  const workTop = T + options.length * LANE + 14
  const baseY = workTop + BAR + 6
  const H = baseY + AX
  const px = (i) => L + (i * (w - L - R)) / Math.max(1, dates.length - 1)
  const py = (k) => T + k * LANE + LANE / 2
  const bw = Math.max(3, Math.min(10, ((w - L - R) / Math.max(1, dates.length - 1)) * 0.55))
  const workMax = Math.max(8 * 60, ...extras.map((x) => x.work + x.rest))
  const tight = (w - L - R) / Math.max(1, dates.length - 1) < 20
  const levelIds = options.filter((o) => /dopa|fog/i.test(o.name)).map((o) => o.id)
  const isLevel = (o) => !levelIds.length || levelIds.includes(o.id)
  const days = dates.map((d) => {
    const tags = options.map((o, k) => ({ o, k })).filter(({ o }) => (o.cell ? !!byDate[d]?.cells[o.id] : (byDate[d]?.cells.state || []).includes(o.id)))
    const c = d <= today ? cycleInfo(d, settings) : null
    return { d, tags, main: tags.find(({ o }) => isLevel(o))?.k, period: c?.phase === 'Period', cyc: c }
  })
  const segs = []
  let prev = null
  days.forEach((x, i) => { if (x.main == null) return; if (prev != null) segs.push([prev, i]); prev = i })
  const move = (e) => {
    const rx = e.clientX - e.currentTarget.getBoundingClientRect().left
    const i = Math.max(0, Math.min(dates.length - 1, Math.round(((rx - L) / (w - L - R)) * (dates.length - 1))))
    const x = days[i]
    const ex = extras[i]
    setHover(i)
    bind(<><b>{short(x.d)}</b>{x.cyc && <div className="muted">D{x.cyc.day} · {x.cyc.phase}</div>}{x.tags.length ? x.tags.map(({ o }) => <div key={o.id} className="lc-tip-row"><span className="lc-dot" style={{ background: COLORS[o.color] }} />{o.name}</div>) : <div className="muted">No state logged</div>}
      <div className="lc-tip-sep" />
      <div className="lc-tip-row">Sleep<span className="grow" /><span className="num">{ex.sleep ? `${fmtDuration(ex.sleep.m)} · ${fmtClock(ex.sleep.from % 1440, { compact: true })} → ${fmtClock(ex.sleep.to, { compact: true })}` : '—'}</span></div>
      <div className="lc-tip-row">{workName}<span className="grow" /><span className="num">{ex.work ? fmtDuration(ex.work) : '—'}</span></div>
      <div className="lc-tip-row">{restName}<span className="grow" /><span className="num">{ex.rest ? fmtDuration(ex.rest) : '—'}</span></div>
      {ex.notes.map((n) => <div key={n.label} className="lc-tip-note"><span className="muted">{n.label}</span><div className="pre">{n.text}</div></div>)}</>).onMouseMove(e)
  }
  const leave = () => { setHover(null); bind(null).onMouseLeave() }
  return (
    <div className="line-chart" ref={ref}>
      <svg width={w} height={H} onMouseMove={move} onMouseLeave={leave}>
        {options.map((o, k) => (
          <g key={o.id}>
            <line className="lc-grid" x1={L} x2={w - R} y1={py(k)} y2={py(k)} />
            <text className="lc-tick" x={L - 10} y={py(k)} dy="0.35em" textAnchor="end">{o.name}</text>
          </g>
        ))}
        {options.map((o, k) => !isLevel(o) && days.map((x, i) => x.tags.some((t) => t.o.id === o.id) && days[i + 1]?.tags.some((t) => t.o.id === o.id) && <line key={o.id + x.d} className="lc-line" style={{ stroke: COLORS[o.color] }} x1={px(i)} x2={px(i + 1)} y1={py(k)} y2={py(k)} />))}
        <line className="lc-base" x1={L} x2={w - R} y1={baseY} y2={baseY} />
        {days.map((x, i) => x.cyc && <text key={x.d} className={`lc-tick lc-phase ${tight ? 'tight' : ''}`} style={{ fill: COLORS[x.cyc.color] }} x={px(i)} y={H - 10} textAnchor="middle">{phaseAbbr(x.cyc)}</text>)}
        <text className="lc-tick" x={L - 10} y={workTop + BAR / 2} dy="0.35em" textAnchor="end">{workName}/{restName}</text>
        {extras.map((x, i) => x.rest > 0 && <rect key={'r' + i} x={px(i) - bw / 2} y={workTop + BAR - (x.rest / workMax) * BAR} width={bw} height={(x.rest / workMax) * BAR} rx="2" fill={restColor} />)}
        {extras.map((x, i) => x.work > 0 && <rect key={'w' + i} x={px(i) - bw / 2} y={workTop + BAR - ((x.work + x.rest) / workMax) * BAR - (x.rest > 0 ? 1 : 0)} width={bw} height={(x.work / workMax) * BAR} rx="2" fill={workColor} />)}
        {hover != null && <line className="lc-cross" x1={px(hover)} x2={px(hover)} y1={T} y2={baseY} />}
        <defs>
          {segs.map(([a, b]) => (
            <linearGradient key={a} id={`lc-g-${uid}-${a}`} gradientUnits="userSpaceOnUse" x1={px(a)} y1={py(days[a].main)} x2={px(b)} y2={py(days[b].main)}>
              <stop offset="0" stopColor={COLORS[options[days[a].main].color]} />
              <stop offset="1" stopColor={COLORS[options[days[b].main].color]} />
            </linearGradient>
          ))}
        </defs>
        {segs.map(([a, b]) => <line key={a} className={`lc-line ${b - a > 1 ? 'gap' : ''}`} style={{ stroke: `url(#lc-g-${uid}-${a})` }} x1={px(a)} y1={py(days[a].main)} x2={px(b)} y2={py(days[b].main)} />)}
        {days.map((x, i) => x.tags.map(({ o, k }) => <circle key={x.d + o.id} cx={px(i)} cy={py(k)} r={hover === i ? 5.5 : 4} fill={COLORS[o.color]} stroke="var(--surface)" strokeWidth="2" />))}
      </svg>
      <div className="legend lc-legend">
        {options.map((o) => <span key={o.id} className="legend-item"><span className="lc-dot" style={{ background: COLORS[o.color] }} />{o.name}</span>)}
        <span className="legend-item"><span className="swatch" style={{ background: workColor }} />{workName} hours</span>
        <span className="legend-item"><span className="swatch" style={{ background: restColor }} />{restName} hours</span>
      </div>
    </div>
  )
}

// SleepChart — Start and End times per day on a 24h axis
function SleepChart({ dates, extras, settings, today, bind }) {
  const ref = useRef(null)
  const [w, setW] = useState(480)
  const [hover, setHover] = useState(null)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  const H = 240, L = 50, R = 12, T = 10, AX = 30
  const baseY = H - AX
  const w0 = clockWindow(extras.flatMap((x) => [x.start, x.end]).filter((v) => v != null))
  const px = (i) => L + (i * (w - L - R)) / Math.max(1, dates.length - 1)
  const py = (v) => T + ((inWindow(v, w0) - w0) / 1440) * (baseY - T)
  const tight = (w - L - R) / Math.max(1, dates.length - 1) < 20
  const cyc = dates.map((d) => (d <= today ? cycleInfo(d, settings) : null))
  const lines = [
    { key: 'start', name: 'Start', color: COLORS.orange },
    { key: 'end', name: 'End', color: COLORS.blue },
  ].map((s) => {
    const pts = extras.map((x, i) => (x[s.key] != null ? i : null)).filter((i) => i != null)
    return { ...s, pts, segs: pts.slice(1).map((b, k) => [pts[k], b]), avg: avg(pts.map((i) => inWindow(extras[i][s.key], w0))) }
  })
  const move = (e) => {
    const rx = e.clientX - e.currentTarget.getBoundingClientRect().left
    const i = Math.max(0, Math.min(dates.length - 1, Math.round(((rx - L) / (w - L - R)) * (dates.length - 1))))
    const x = extras[i]
    setHover(i)
    bind(<><b>{short(dates[i])}</b>{cyc[i] && <div className="muted">D{cyc[i].day} · {cyc[i].phase}</div>}
      {lines.map((s) => <div key={s.key} className="lc-tip-row"><span className="lc-dot" style={{ background: s.color }} />{s.name}<span className="grow" /><span className="num">{x[s.key] != null ? fmtClock(x[s.key], { compact: true }) : '—'}</span></div>)}
      {x.sleep && <div className="lc-tip-row muted">Slept before<span className="grow" /><span className="num">{fmtDuration(x.sleep.m)}</span></div>}</>).onMouseMove(e)
  }
  const leave = () => { setHover(null); bind(null).onMouseLeave() }
  return (
    <div className="sleep-chart">
      <div className="mini-head">Sleep pattern{lines.some((s) => s.pts.length) ? <span className="muted">{lines.map((s) => s.avg != null && <span key={s.key}> · avg {s.name.toLowerCase()} <b className="num">{fmtClock(s.avg, { compact: true })}</b></span>)}</span> : null}</div>
      <div className="line-chart" ref={ref}>
        <svg width={w} height={H} onMouseMove={move} onMouseLeave={leave}>
          {[0, 1, 2, 3, 4, 5, 6].map((k) => (
            <g key={k}>
              <line className={k === 6 ? 'lc-base' : 'lc-grid'} x1={L} x2={w - R} y1={T + (k / 6) * (baseY - T)} y2={T + (k / 6) * (baseY - T)} />
              <text className="lc-tick" x={L - 8} y={T + (k / 6) * (baseY - T)} dy="0.35em" textAnchor="end">{fmtClock(w0 + k * 240, { compact: true })}</text>
            </g>
          ))}
          {dates.map((d, i) => cyc[i] && <text key={d} className={`lc-tick lc-phase ${tight ? 'tight' : ''}`} style={{ fill: COLORS[cyc[i].color] }} x={px(i)} y={H - 10} textAnchor="middle">{phaseAbbr(cyc[i])}</text>)}
          {hover != null && <line className="lc-cross" x1={px(hover)} x2={px(hover)} y1={T} y2={baseY} />}
          {lines.map((s) => s.segs.map(([a, b]) => <line key={s.key + a} className={`lc-line ${b - a > 1 ? 'gap' : ''}`} style={{ stroke: s.color }} x1={px(a)} y1={py(extras[a][s.key])} x2={px(b)} y2={py(extras[b][s.key])} />))}
          {lines.map((s) => s.pts.map((i) => <circle key={s.key + i} cx={px(i)} cy={py(extras[i][s.key])} r={hover === i ? 5.5 : 4} fill={s.color} stroke="var(--surface)" strokeWidth="2" />))}
        </svg>
        <div className="legend lc-legend">
          {lines.map((s) => <span key={s.key} className="legend-item"><span className="lc-dot" style={{ background: s.color }} />{s.name}</span>)}
        </div>
      </div>
    </div>
  )
}

function PhaseTable({ dates, byDate, options, extras, workName, restName, settings, today }) {
  const info = dates.map((d, i) => ({ d, i, c: d <= today ? cycleInfo(d, settings) : null }))
  const cols = PHASE_COLS.map(([phase, abbr]) => ({ phase, abbr, days: info.filter((x) => x.c?.phase === phase) })).filter((c) => c.days.length)
  if (!cols.length) return null
  const color = (phase) => COLORS[info.find((x) => x.c?.phase === phase).c.color]
  const has = (o, d) => (o.cell ? !!byDate[d]?.cells[o.id] : (byDate[d]?.cells.state || []).includes(o.id))
  const totalOf = (days, get) => { const t = days.reduce((a, x) => a + get(extras[x.i]), 0); return t ? fmtDuration(t) : '—' }
  const sleepOf = (days) => { const v = avg(days.map((x) => extras[x.i].sleep?.m).filter((m) => m != null)); return v == null ? '—' : fmtDuration(Math.round(v)) }
  return (
    <div className="phase-table-wrap">
      <div className="mini-head">By cycle phase</div>
      <table className="phase-table">
        <thead>
          <tr>
            <th />
            {cols.map((c) => <th key={c.phase} style={{ color: color(c.phase) }} title={c.phase}>{c.abbr}<span className="muted"> {c.days.length}d</span></th>)}
          </tr>
        </thead>
        <tbody>
          {options.map((o) => (
            <tr key={o.id}>
              <td><span className="lc-dot" style={{ background: COLORS[o.color] }} />{o.name}</td>
              {cols.map((c) => { const n = c.days.filter((x) => has(o, x.d)).length; return <td key={c.phase} className={`num ${n ? '' : 'zero'}`}>{n}</td> })}
            </tr>
          ))}
          <tr className="sep">
            <td>Total {workName.toLowerCase()}</td>
            {cols.map((c) => <td key={c.phase} className="num">{totalOf(c.days, (x) => x.work)}</td>)}
          </tr>
          <tr>
            <td>Total {restName.toLowerCase()}</td>
            {cols.map((c) => <td key={c.phase} className="num">{totalOf(c.days, (x) => x.rest)}</td>)}
          </tr>
          <tr>
            <td>Avg sleep</td>
            {cols.map((c) => <td key={c.phase} className="num">{sleepOf(c.days)}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Bars({ items, bind }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="bars">
      {items.map((it) => (
        <div key={it.key} className="bar-row" {...bind(<><b>{it.label}</b><div>{it.fmt(it.value)}</div></>)}>
          <span className="bar-label">{it.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(it.value / max) * 100}%`, background: it.color }} /></span>
          <span className="bar-value num">{it.fmt(it.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function cycleSummary(settings, dates, today) {
  const upto = dates.filter((d) => d <= today)
  const period = upto.filter((d) => cycleInfo(d, settings)?.phase === 'Period')
  const ranges = []
  for (const d of period) {
    const last = ranges[ranges.length - 1]
    if (last && addDays(last[1], 1) === d) last[1] = d
    else ranges.push([d, d])
  }
  const first = dates[0]
  const lastDay = dates[dates.length - 1]
  const events = cycleHistory(settings).filter((c) => c.start >= first && c.start <= lastDay)
  const endDate = upto[upto.length - 1]
  const endInfo = endDate ? cycleInfo(endDate, settings) : null
  const latest = [...(settings.cycleStarts || [])].filter((s) => s <= lastDay).sort().pop()
  return {
    events,
    periodDays: period.length,
    ranges: ranges.map(([a, b]) => (a === b ? short(a) : `${short(a)}–${toDate(b).getDate()}`)),
    lateNow: endInfo?.phase === 'Late' ? endInfo : null,
    isCurrent: lastDay >= today,
    nextExpected: latest ? addDays(latest, cycleLen(settings)) : null,
  }
}
