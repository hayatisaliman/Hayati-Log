import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons.jsx'
import { DateNav } from './DatePicker.jsx'
import { update } from '../lib/store.js'
import { newRow, wakeMinute } from '../lib/schema.js'
import { DAY_NAMES, MONTHS, fmtClock, isoOf, normalizeClock, parseClock, toDate } from '../lib/time.js'

const label = (iso) => { const d = toDate(iso); return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}` }
const show = (v) => (v == null ? '' : fmtClock(v))

// QuickEntry — Start / End for any day, written into that day's row
export function QuickEntry({ data, onSaved }) {
  const [date, setDate] = useState(() => isoOf(new Date()))
  const row = data.rows.find((r) => r.date === date)
  const [start, setStart] = useState(show(row?.cells.start))
  const [end, setEnd] = useState(show(row?.cells.end))
  const [bad, setBad] = useState(null)
  const endRef = useRef(null)

  useEffect(() => { setStart(show(row?.cells.start)); setEnd(show(row?.cells.end)); setBad(null) }, [date, row?.cells.start, row?.cells.end])

  const submit = () => {
    const s = start.trim() ? parseClock(start) : null
    const e = end.trim() ? parseClock(end) : null
    if (start.trim() && s == null) return setBad('start')
    if (end.trim() && e == null) return setBad('end')
    const sv = s == null ? null : normalizeClock(s, wakeMinute(data, row, 'start'))
    const ev = e == null ? null : sv != null ? (e <= sv % 1440 ? e + 1440 : e) + Math.floor(sv / 1440) * 1440 : normalizeClock(e, wakeMinute(data, row))
    let id = row?.id
    update((d) => {
      let r = d.rows.find((x) => x.date === date)
      if (!r) { r = newRow(date); d.rows.push(r) }
      id = r.id
      if (sv == null) delete r.cells.start
      else r.cells.start = sv
      if (ev == null) delete r.cells.end
      else r.cells.end = ev
    })
    setBad(null)
    onSaved?.(id, date, label(date))
  }

  const field = (key, value, set, ref, onEnter) => (
    <input
      ref={ref}
      className={`qe-time ${bad === key ? 'bad' : ''}`}
      placeholder={key === 'start' ? 'Start' : 'End'}
      title="Type 4 30 a for 4:30 AM"
      value={value}
      onFocus={(e) => e.target.select()}
      onChange={(e) => { set(e.target.value); if (bad === key) setBad(null) }}
      onBlur={() => { const m = parseClock(value); if (value.trim() && m != null) set(fmtClock(m)) }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } }}
    />
  )

  return (
    <div className="quick-entry">
      <DateNav value={date} onChange={setDate} />
      {field('start', start, setStart, null, () => endRef.current?.focus())}
      {field('end', end, setEnd, endRef, submit)}
      <button className="qe-go" title="Save to this day's row" onClick={submit}><Icon name="arrow-right" size={15} /></button>
    </div>
  )
}
