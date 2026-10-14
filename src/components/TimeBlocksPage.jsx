import { useEffect, useRef, useState } from 'react'
import { DAY_NAMES, addDays, fmtDuration, weekday } from '../lib/time.js'
import { COLORS, blockEnd } from '../lib/schema.js'
import { TimeBlocks, catMeta } from './TimeBlocks.jsx'
import { useTip } from './Tip.jsx'
import { ClockText } from './cells.jsx'
import { DateNav } from './DatePicker.jsx'
import { Icon } from './icons.jsx'

export function TimeBlocksPage({ data, date, setDate, now, onGoToDay }) {
  const existing = data.rows.find((r) => r.date === date)
  const row = existing || { id: `r-${date}`, date, cells: {}, notes: '', blocks: [] }
  const isToday = date === now.today
  const week = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6))
  const [hidePref, setHidePref] = useState(null)
  const hide = hidePref ?? isToday
  useEffect(() => setHidePref(null), [date])
  const addRef = useRef(null)
  const [bind, tipEl] = useTip()
  const groupsOf = (r, d) => {
    const by = {}
    for (const b of r?.blocks || []) {
      const e = blockEnd(b, d === now.today, now.minutesFor(d))
      if (e == null) continue
      const g = catMeta(data, b.cats?.[0]).group || 'none'
      by[g] = (by[g] || 0) + Math.max(0, e - b.start)
    }
    const total = Object.values(by).reduce((a, b) => a + b, 0)
    return { total, list: Object.entries(by).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([g, v]) => ({ g, v, grp: data.groups.find((x) => x.id === g) })) }
  }
  const hrs = (m) => `${Math.round(m / 6) / 10}h`
  const mins = (gs, id) => gs.list.find((x) => x.g === id)?.v || 0
  const nameOf = (id, fallback) => data.groups.find((x) => x.id === id)?.name || fallback

  return (
    <div className="blocks-page">
      <div className="view-head">
        <h1 className="view-title">Time Blocks</h1>
        <DateNav value={date} onChange={setDate} marked={data.rows.filter((r) => r.blocks.length).map((r) => r.date)} />
        <div className="grow" />
        <button className="nav-add tb-eye" title={hide ? 'Show quick start, timeline and totals' : 'Hide quick start, timeline and totals'} onClick={() => setHidePref(!hide)}><Icon name={hide ? 'eye-off' : 'eye'} size={15} /></button>
        {existing && (
          <span className="day-bounds">
            {existing.cells.start != null && <>Start <ClockText min={existing.cells.start} /></>}
            {existing.cells.end != null && <>End <ClockText min={existing.cells.end} /></>}
            <button className="btn ghost" onClick={() => onGoToDay(existing.id)}>Show in daily log</button>
          </span>
        )}
        <button className="btn primary" onClick={() => addRef.current?.()}>+ Add Block</button>
      </div>

      <div className="week-strip">
        {week.map((d) => {
          const r = data.rows.find((x) => x.date === d)
          const gs = groupsOf(r, d)
          return (
            <button key={d} className={`week-day ${d === date ? 'on' : ''}`} onClick={() => setDate(d)}>
              <span className="week-day-label">{DAY_NAMES[weekday(d)].slice(0, 3)} <b className="num">{+d.slice(8)}</b></span>
              {gs.total ? (
                <span className="stack-bar week-stack">
                  {gs.list.map(({ g, v, grp }) => <span key={g} style={{ width: `${(v / gs.total) * 100}%`, background: COLORS[grp?.color] || COLORS.gray }} {...bind(<><b>{grp?.name || 'Uncategorised'}</b><div>{fmtDuration(v)} · {Math.round((v / gs.total) * 100)}%</div></>)} />)}
                </span>
              ) : <span className="week-day-empty" />}
              {gs.total ? (
                <span className="week-day-total num"><span>{hrs(mins(gs, 'work'))} {nameOf('work', 'Work')}</span><span>{hrs(mins(gs, 'rest'))} {nameOf('rest', 'Rest')}</span></span>
              ) : <span className="week-day-total num">—</span>}
            </button>
          )
        })}
      </div>

      {tipEl}
      <div className="blocks-body">
        <TimeBlocks row={row} data={data} isToday={isToday} nowMin={now.minutesFor(date)} addRef={addRef} compact={hide} />
      </div>
    </div>
  )
}
