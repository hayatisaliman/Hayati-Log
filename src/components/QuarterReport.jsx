import { useEffect, useRef, useState } from 'react'
import { COLORS, blockEnd, cycleHistory, cycleInfo } from '../lib/schema.js'
import { MONTHS, daysInMonth, fmtClock, fmtDuration, pad } from '../lib/time.js'
import { avg, sleepOn, clockWindow, inWindow } from '../lib/report.js'
import { groupShares } from './TimeBlocks.jsx'
import { useTip } from './Tip.jsx'
import { ScrollTabs } from './ScrollTabs.jsx'
import { Icon } from './icons.jsx'

const QUARTERS = [1, 2, 3, 4]
const Q_COLORS = { 1: 'var(--cyan)', 2: 'var(--green)', get 3() { return COLORS.light }, 4: 'var(--pink)' }
const WEEKS = 13
const monthsOf = (year, q) => [0, 1, 2].map((i) => `${year}-${pad((q - 1) * 3 + i + 1)}`)
const datesOf = (month) => Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${pad(i + 1)}`)
const qLabel = (q) => `Q${q}`
export const qRange = (q) => `${MONTHS[(q - 1) * 3].slice(0, 3)} – ${MONTHS[(q - 1) * 3 + 2].slice(0, 3)}`
const hours = (m) => (m == null ? '—' : `${Math.round(m / 6) / 10}h`)
const pctText = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)

function useWidth(init) {
  const ref = useRef(null)
  const [w, setW] = useState(init)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

// groupMinsOn — minutes of time blocks in one group on one day
function groupMinsOn(data, rowOf, d, now, id) {
  const r = rowOf[d]
  if (!r || d > now.today) return 0
  return r.blocks.reduce((t, b) => {
    const e = blockEnd(b, d === now.today, now.minutesFor(d))
    return e == null ? t : t + (groupShares(data, b, Math.max(0, e - b.start))[id] || 0)
  }, 0)
}

// weekly — averages a per-day value into the 13 weeks of a quarter
function weekly(dates, get) {
  const buckets = Array.from({ length: WEEKS }, () => [])
  dates.forEach((d, i) => { const v = get(d); if (v != null) buckets[Math.min(WEEKS - 1, Math.floor(i / 7))].push(v) })
  return buckets.map(avg)
}

// quarterStats — everything the page compares, for one quarter
export function quarterStats(data, year, q, now, rowOf) {
  const dates = monthsOf(year, q).flatMap(datesOf)
  const past = dates.filter((d) => d <= now.today)
  const rows = past.map((d) => rowOf[d]).filter(Boolean)
  const logged = rows.filter((r) => Object.keys(r.cells).length || r.blocks.length)
  const minsOf = (r, b) => { const e = blockEnd(b, r.date === now.today, now.minutesFor(r.date)); return e == null ? 0 : Math.max(0, e - b.start) }
  const groupMins = (id) => rows.reduce((t, r) => t + r.blocks.reduce((s, b) => s + (groupShares(data, b, minsOf(r, b))[id] || 0), 0), 0)
  const tracked = rows.reduce((t, r) => t + r.blocks.reduce((s, b) => s + minsOf(r, b), 0), 0)
  const starts = rows.map((r) => r.cells.start).filter((v) => v != null)
  const ends = rows.map((r) => r.cells.end).filter((v) => v != null)
  const days = rows.filter((r) => r.cells.start != null && r.cells.end != null).map((r) => r.cells.end - r.cells.start)
  const sleeps = past.map((d) => sleepOn(rowOf, d)?.m).filter((v) => v != null)
  const per = (m) => (logged.length ? m / logged.length : null)
  const habits = data.fields.filter((f) => f.type === 'checkbox' && !f.hidden).map((f) => ({ f, v: logged.length ? logged.filter((r) => r.cells[f.id]).length / logged.length : null }))
  const stateField = data.fields.find((f) => f.id === 'state')
  const states = (stateField?.options || []).map((o) => ({ o, n: rows.filter((r) => (r.cells.state || []).includes(o.id)).length }))
  const cycles = cycleHistory(data.settings).filter((c) => c.length && c.start >= dates[0] && c.start <= dates[dates.length - 1]).map((c) => c.length)
  return {
    q, dates, past: past.length, logged: logged.length, tracked,
    start: avg(starts), end: avg(ends), day: avg(days), sleep: avg(sleeps),
    trackedDay: per(tracked), workDay: per(groupMins('work')), restDay: per(groupMins('rest')),
    habits, states, cycle: avg(cycles), periodDays: past.filter((d) => cycleInfo(d, data.settings)?.phase === 'Period').length,
  }
}

export function QuarterReport({ data, now }) {
  const years = [...new Set([...data.rows.map((r) => r.date.slice(0, 4)), now.today.slice(0, 4)])].sort().reverse()
  const [year, setYear] = useState(now.today.slice(0, 4))
  const [bind, tipEl] = useTip()
  const rowOf = Object.fromEntries(data.rows.map((r) => [r.date, r]))
  const stats = QUARTERS.map((q) => quarterStats(data, year, q, now, rowOf))
  const prevQ4 = quarterStats(data, String(+year - 1), 4, now, rowOf)
  const current = year === now.today.slice(0, 4) ? Math.ceil(+now.today.slice(5, 7) / 3) : null
  const work = data.groups.find((g) => g.id === 'work')
  const rest = data.groups.find((g) => g.id === 'rest')
  const metrics = metricsFor(stats, work, rest)

  return (
    <div className="report quarter-report">
      <div className="view-head">
        <h1 className="view-title">Quarterly Report</h1>
        <ScrollTabs items={years} value={year} onPick={setYear} />
      </div>

      <div className="tiles q-tiles">
        {stats.map((s) => (
          <div key={s.q} className={`tile q-tile ${s.q === current ? 'current' : ''} ${s.past ? '' : 'future'}`}>
            <div className="tile-label">{qLabel(s.q)} · {qRange(s.q)}{s.q === current && <span className="q-now">now</span>}</div>
            <div className="tile-value num">{s.past ? fmtDuration(s.tracked) || '0m' : '—'}</div>
            <div className="tile-sub">{s.past ? `tracked · ${s.logged} of ${s.past} days logged` : 'Not started'}</div>
          </div>
        ))}
      </div>

      <section className="card">
        <div className="card-head">
          <h3>State &amp; Sleep</h3>
          <span className="section-meta">Weekly averages · week 1 is the first week of each quarter</span>
          <div className="grow" />
          <div className="legend">{QUARTERS.map((q) => <span key={q} className="legend-item"><span className="lc-dot" style={{ background: Q_COLORS[q] }} />{qLabel(q)}</span>)}</div>
        </div>
        <StateLines data={data} stats={stats} rowOf={rowOf} bind={bind} />
        <SleepLines stats={stats} rowOf={rowOf} now={now} bind={bind} />
      </section>

      <section className="card">
        <div className="card-head"><h3>Compare Averages</h3><span className="section-meta">Averages are per logged day. Bars compare each row across the four quarters.</span></div>
        <CompareTable stats={stats} prevQ4={prevQ4} metrics={metrics} current={current} year={year} bind={bind} />
      </section>


      <section className="card">
        <div className="card-head">
          <h3>{work?.name || 'Work'} and {rest?.name || 'Rest'} by month</h3>
          <span className="section-meta">Total hours from time blocks</span>
          <div className="grow" />
          <div className="legend">
            <span className="legend-item"><span className="swatch" style={{ background: COLORS[work?.color] || COLORS.blue }} />{work?.name || 'Work'}</span>
            <span className="legend-item"><span className="swatch" style={{ background: COLORS[rest?.color] || COLORS.pink }} />{rest?.name || 'Rest'}</span>
          </div>
        </div>
        <MonthBars data={data} year={year} now={now} rowOf={rowOf} work={work} rest={rest} bind={bind} />
      </section>

      <section className="card">
        <div className="card-head"><h3>State mix</h3><span className="section-meta">Share of tagged days in each quarter</span></div>
        <StateMix stats={stats} bind={bind} />
      </section>
      {tipEl}
    </div>
  )
}

// metricsFor — measures shown in the table; change: false keeps clock times and raw counts out of the % change arrows
function metricsFor(stats, work, rest) {
  return [
    { group: 'Logging' },
    { label: 'Days logged', get: (s) => s.logged, fmt: (v) => `${v}`, change: false },
    { label: 'Days logged %', get: (s) => (s.past ? s.logged / s.past : null), fmt: pctText },
    { group: 'Rhythm' },
    { label: 'Avg start', get: (s) => s.start, fmt: (v) => fmtClock(v, { compact: true }), bar: false, change: false },
    { label: 'Avg end', get: (s) => s.end, fmt: (v) => fmtClock(v, { compact: true }), bar: false, change: false },
    { label: 'Avg day length', get: (s) => s.day, fmt: fmtDuration },
    { label: 'Avg sleep', get: (s) => s.sleep, fmt: fmtDuration },
    { group: 'Time blocks' },
    { label: 'Tracked per day', get: (s) => s.trackedDay, fmt: hours },
    { label: `${work?.name || 'Work'} per day`, get: (s) => s.workDay, fmt: hours },
    { label: `${rest?.name || 'Rest'} per day`, get: (s) => s.restDay, fmt: hours },
    ...(stats[0].habits.length ? [{ group: 'Habits · share of logged days' }] : []),
    ...stats[0].habits.map(({ f }, k) => ({ label: f.name, get: (s) => s.habits[k].v, fmt: pctText })),
    { group: 'Cycle' },
    { label: 'Avg cycle length', get: (s) => s.cycle, fmt: (v) => `${Math.round(v)} days`, bar: false },
    { label: 'Period days', get: (s) => s.periodDays, fmt: (v) => `${v}`, change: false },
  ]
}

const valueOf = (m, s) => (s?.past ? m.get(s) : null)
const prevName = (stats, i, year) => (i ? qLabel(stats[i - 1].q) : `Q4 ${+year - 1}`)

// changeAt — % change from the quarter before (Q1 against last year's Q4)
function changeAt(m, stats, prevQ4, i) {
  const cur = valueOf(m, stats[i])
  const prev = valueOf(m, i ? stats[i - 1] : prevQ4)
  if (m.change === false || cur == null || prev == null || prev === 0) return null
  return { v: ((cur - prev) / Math.abs(prev)) * 100, cur, prev }
}

function Delta({ c }) {
  const n = Math.round(c.v)
  if (!n) return <span className="q-delta flat">0%</span>
  return <span className={`q-delta ${n > 0 ? 'up' : 'down'}`}>{Math.abs(n)}%<Icon name={n > 0 ? 'arrow-up' : 'arrow-down'} size={12} /></span>
}

// CompareTable — one row per measure, Q1–Q4 side by side with a bar scaled to that row's max
function CompareTable({ stats, prevQ4, metrics, current, year, bind }) {
  return (
    <table className="q-table">
      <thead>
        <tr><th />{stats.map((s) => <th key={s.q} className={s.q === current ? 'current' : ''}>{qLabel(s.q)}<span className="muted"> {qRange(s.q)}</span></th>)}</tr>
      </thead>
      <tbody>
        {metrics.map((m) => {
          if (m.group) return <tr key={m.group} className="q-group"><td colSpan={5}>{m.group}</td></tr>
          const vals = stats.map((s) => valueOf(m, s))
          const max = Math.max(...vals.filter((v) => v != null), 0)
          return (
            <tr key={m.label}>
              <td className="q-metric">{m.label}</td>
              {vals.map((v, i) => {
                const c = changeAt(m, stats, prevQ4, i)
                return (
                <td key={i} className={`q-cell ${stats[i].q === current ? 'current' : ''}`} {...bind(<><b>{qLabel(stats[i].q)} · {m.label}</b><div>{v == null ? 'No data' : m.fmt(v)}</div>{c && <div className="muted">vs {prevName(stats, i, year)}: {m.fmt(c.prev)}</div>}</>)}>
                  <span className="q-cell-top"><span className="num">{v == null ? '—' : m.fmt(v)}</span>{c && <Delta c={c} />}</span>
                  {m.bar !== false && v != null && <span className="q-bar"><span style={{ width: max ? `${(v / max) * 100}%` : 0 }} /></span>}
                </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// QuarterLines — one line per quarter across 13 weeks; frac maps a value to 0 (bottom) … 1 (top)
function QuarterLines({ series, frac, ticks, fmt, refLine, H, L, bind }) {
  const [ref, w] = useWidth(600)
  const [hover, setHover] = useState(null)
  const R = 26, T = 10, AX = 26
  const baseY = H - AX
  const px = (i) => L + (i * (w - L - R)) / (WEEKS - 1)
  const py = (v) => T + (1 - frac(v)) * (baseY - T)
  const move = (e) => {
    const rx = e.clientX - e.currentTarget.getBoundingClientRect().left
    const i = Math.max(0, Math.min(WEEKS - 1, Math.round(((rx - L) / (w - L - R)) * (WEEKS - 1))))
    setHover(i)
    bind(<><b>Week {i + 1}</b>{series.map((s) => <div key={s.key || s.q} className="lc-tip-row"><span className="lc-dot" style={{ background: s.dot || Q_COLORS[s.q] }} />{qLabel(s.q)}{s.name ? ` ${s.name}` : ''}<span className="grow" /><span className="num">{s.points[i] == null ? '—' : fmt(s.points[i])}</span></div>)}</>).onMouseMove(e)
  }
  const leave = () => { setHover(null); bind(null).onMouseLeave() }
  return (
    <div className="line-chart" ref={ref}>
      <svg width={w} height={H} onMouseMove={move} onMouseLeave={leave}>
        {ticks.map((t, k) => (
          <g key={k}>
            <line className={k ? 'lc-grid' : 'lc-base'} x1={L} x2={w - R} y1={py(t.v)} y2={py(t.v)} />
            <text className="lc-tick" x={L - 10} y={py(t.v)} dy="0.35em" textAnchor="end">{t.label}</text>
          </g>
        ))}
        {refLine && <><line className="lc-ref" x1={L} x2={w - R} y1={py(refLine.v)} y2={py(refLine.v)} /><text className="lc-ref-label" x={w - R} y={py(refLine.v) - 4} textAnchor="end">{refLine.label}</text></>}
        {Array.from({ length: WEEKS }, (_, i) => <text key={i} className="lc-tick" x={px(i)} y={H - 8} textAnchor="middle">W{i + 1}</text>)}
        {hover != null && <line className="lc-cross" x1={px(hover)} x2={px(hover)} y1={T} y2={baseY} />}
        {series.map((s) => {
          const pts = s.points.map((v, i) => (v == null ? null : i)).filter((i) => i != null)
          const last = pts[pts.length - 1]
          return (
            <g key={s.key || s.q}>
              {pts.slice(1).map((b, k) => <line key={b} className={`lc-line ${b - pts[k] > 1 ? 'gap' : ''}`} style={{ stroke: Q_COLORS[s.q] }} x1={px(pts[k])} y1={py(s.points[pts[k]])} x2={px(b)} y2={py(s.points[b])} />)}
              {pts.map((i) => <circle key={i} cx={px(i)} cy={py(s.points[i])} r={hover === i ? 5.5 : 4} style={{ fill: s.dot || Q_COLORS[s.q] }} stroke="var(--surface)" strokeWidth="2" />)}
              {last != null && <text className="q-line-label" x={px(last) + 8} y={py(s.points[last])} dy="0.35em">{qLabel(s.q)}</text>}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// StateLines — weekly average of the day's top dopamine/brainfog level, per quarter
function StateLines({ data, stats, rowOf, bind }) {
  const options = data.fields.find((f) => f.id === 'state')?.options || []
  const levels = options.filter((o) => /dopa|fog/i.test(o.name))
  const lanes = levels.length ? levels : options
  if (!lanes.length) return <div className="empty-note">No state options set up</div>
  const top = (lanes.length - 1) || 1
  const series = stats.map((s) => ({
    q: s.q,
    points: weekly(s.dates, (d) => { const tags = rowOf[d]?.cells.state || []; const k = lanes.findIndex((o) => tags.includes(o.id)); return k < 0 ? null : k }),
  }))
  const nearest = (v) => lanes[Math.max(0, Math.min(lanes.length - 1, Math.round(v)))]
  return (
    <>
      <div className="mini-head">State level</div>
      <QuarterLines series={series} H={Math.max(150, lanes.length * 40 + 36)} L={92} bind={bind}
        frac={(v) => 1 - v / top} ticks={[...lanes].reverse().map((o, k) => ({ v: lanes.length - 1 - k, label: o.name }))}
        fmt={(v) => `≈ ${nearest(v).name}`} />
    </>
  )
}

// SleepLines — weekly average Start and End per quarter on a 24h axis; both lines take the quarter colour, dots mark Start and End
function SleepLines({ stats, rowOf, now, bind }) {
  const val = (d, key) => (d <= now.today ? rowOf[d]?.cells[key] ?? null : null)
  const w0 = clockWindow(stats.flatMap((s) => s.dates.flatMap((d) => [val(d, 'start'), val(d, 'end')])).filter((v) => v != null))
  const kinds = [{ key: 'start', name: 'Start', dot: COLORS.orange }, { key: 'end', name: 'End', dot: COLORS.blue }]
  const series = stats.flatMap((s) => kinds.map((k) => ({
    key: `${s.q}-${k.key}`, q: s.q, name: k.name, dot: k.dot, kind: k.key,
    points: weekly(s.dates, (d) => { const v = val(d, k.key); return v == null ? null : inWindow(v, w0) }),
  })))
  const avgOf = (kind) => avg(series.filter((s) => s.kind === kind).flatMap((s) => s.points).filter((v) => v != null))
  const ticks = [6, 5, 4, 3, 2, 1, 0].map((k) => ({ v: w0 + k * 240, label: fmtClock(w0 + k * 240, { compact: true }) }))
  return (
    <div className="sleep-chart q-sleep">
      <div className="mini-head">Sleep pattern<span className="muted">{kinds.map((k) => avgOf(k.key) != null && <span key={k.key}> · avg {k.name.toLowerCase()} <b className="num">{fmtClock(avgOf(k.key), { compact: true })}</b></span>)}</span></div>
      <QuarterLines series={series} H={300} L={50} bind={bind}
        frac={(v) => 1 - (v - w0) / 1440} ticks={ticks} fmt={(v) => fmtClock(v)} />
      <div className="legend lc-legend">
        {kinds.map((k) => <span key={k.key} className="legend-item"><span className="lc-dot" style={{ background: k.dot }} />{k.name}</span>)}
        <span className="muted">Line colour is the quarter</span>
      </div>
    </div>
  )
}

// MonthBars — work and rest hours per month, grouped in pairs, quarters marked under the axis
function MonthBars({ data, year, now, rowOf, work, rest, bind }) {
  const [ref, w] = useWidth(700)
  const months = QUARTERS.flatMap((q) => monthsOf(year, q))
  const totals = months.map((m) => {
    const sum = (id) => datesOf(m).reduce((t, d) => t + groupMinsOn(data, rowOf, d, now, id), 0)
    return { m, work: sum('work'), rest: sum('rest') }
  })
  const H = 230, L = 40, R = 8, T = 12, AX = 44
  const plotH = H - T - AX
  const max = Math.max(10 * 60, ...totals.flatMap((t) => [t.work, t.rest]))
  const step = max > 200 * 60 ? 100 : max > 80 * 60 ? 40 : max > 40 * 60 ? 20 : 10
  const top = Math.ceil(max / 60 / step) * step
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step)
  const slot = (w - L - R) / 12
  const bw = Math.max(4, Math.min(16, (slot - 10) / 2))
  const y = (m) => T + plotH - (m / 60 / top) * plotH
  const workColor = COLORS[work?.color] || COLORS.blue
  const restColor = COLORS[rest?.color] || COLORS.pink
  const bar = (x, v, color) => {
    if (!v) return null
    const h = Math.max(2, (v / 60 / top) * plotH)
    const yb = T + plotH
    const r = Math.min(4, bw / 2, h)
    return <path d={`M${x} ${yb}V${yb - h + r}Q${x} ${yb - h} ${x + r} ${yb - h}H${x + bw - r}Q${x + bw} ${yb - h} ${x + bw} ${yb - h + r}V${yb}Z`} fill={color} />
  }
  return (
    <div className="line-chart" ref={ref}>
      <svg width={w} height={H}>
        {ticks.map((t) => (
          <g key={t}>
            <line className={t ? 'lc-grid' : 'lc-base'} x1={L} x2={w - R} y1={y(t * 60)} y2={y(t * 60)} />
            <text className="lc-tick" x={L - 8} y={y(t * 60)} dy="0.35em" textAnchor="end">{t}h</text>
          </g>
        ))}
        {QUARTERS.slice(1).map((q) => <line key={q} className="lc-grid q-divider" x1={L + slot * (q - 1) * 3} x2={L + slot * (q - 1) * 3} y1={T} y2={H - 8} />)}
        {totals.map((t, i) => {
          const cx = L + slot * i + slot / 2
          return (
            <g key={t.m}>
              {bar(cx - bw - 1, t.work, workColor)}
              {bar(cx + 1, t.rest, restColor)}
              <text className="lc-tick" x={cx} y={T + plotH + 16} textAnchor="middle">{MONTHS[i].slice(0, 3)}</text>
              <rect x={L + slot * i} y={T} width={slot} height={plotH} fill="transparent"
                {...bind(<><b>{MONTHS[i]} {year}</b><div className="lc-tip-row"><span className="lc-dot" style={{ background: workColor }} />{work?.name || 'Work'}<span className="grow" /><span className="num">{hours(t.work)}</span></div><div className="lc-tip-row"><span className="lc-dot" style={{ background: restColor }} />{rest?.name || 'Rest'}<span className="grow" /><span className="num">{hours(t.rest)}</span></div></>)} />
            </g>
          )
        })}
        {QUARTERS.map((q) => <text key={q} className="lc-tick q-axis" x={L + slot * ((q - 1) * 3 + 1.5)} y={H - 8} textAnchor="middle">{qLabel(q)}</text>)}
      </svg>
    </div>
  )
}

// StateMix — 100% bar per quarter, one segment per state option
function StateMix({ stats, bind }) {
  if (!stats[0].states.length) return <div className="empty-note">No state options set up</div>
  return (
    <div className="q-mix">
      {stats.map((s) => {
        const total = s.states.reduce((t, x) => t + x.n, 0)
        return (
          <div key={s.q} className="q-mix-row">
            <span className="q-mix-label">{qLabel(s.q)}</span>
            {total ? (
              <span className="q-mix-bar">
                {s.states.filter((x) => x.n).map(({ o, n }) => (
                  <span key={o.id} style={{ flexGrow: n, background: COLORS[o.color] || COLORS.gray }}
                    {...bind(<><b>{qLabel(s.q)} · {o.name}</b><div>{n} day{n > 1 ? 's' : ''} · {Math.round((n / total) * 100)}%</div></>)} />
                ))}
              </span>
            ) : <span className="q-mix-empty muted">No states logged</span>}
            <span className="q-mix-total num muted">{total ? `${total} tags` : ''}</span>
          </div>
        )
      })}
      <div className="legend lc-legend">
        {stats[0].states.map(({ o }) => <span key={o.id} className="legend-item"><span className="lc-dot" style={{ background: COLORS[o.color] || COLORS.gray }} />{o.name}</span>)}
      </div>
    </div>
  )
}
