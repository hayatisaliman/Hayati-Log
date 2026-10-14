import { useState } from 'react'
import { DAY_NAMES, MONTHS, addDays, isoOf, longDate, pad, toDate } from '../lib/time.js'
import { Popover } from './Popover.jsx'
import { Icon } from './icons.jsx'

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

export function Calendar({ value, onPick, marked = [] }) {
  const today = isoOf(new Date())
  const [cursor, setCursor] = useState(() => (value || today).slice(0, 7))
  const [y, m] = cursor.split('-').map(Number)
  const first = `${cursor}-01`
  const start = addDays(first, -((toDate(first).getDay() + 6) % 7))
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const shift = (n) => {
    const d = new Date(y, m - 1 + n, 1)
    setCursor(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
  }
  return (
    <div className="cal">
      <div className="cal-head">
        <span className="cal-title">{MONTHS[m - 1]} {y}</span>
        <button className="icon-btn" onClick={() => shift(-1)} title="Previous month"><Icon name="chevron" size={14} /></button>
        <button className="cal-today" onClick={() => setCursor(today.slice(0, 7))} title="Jump to this month">Today</button>
        <button className="icon-btn" onClick={() => shift(1)} title="Next month"><Icon name="chevron" size={14} /></button>
      </div>
      <div className="cal-grid">
        {DOW.map((d) => <span key={d} className="cal-dow">{d}</span>)}
        {days.map((d) => (
          <button
            key={d}
            className={`cal-day ${d.slice(0, 7) !== cursor ? 'out' : ''} ${d === today ? 'today' : ''} ${d === value ? 'on' : ''} ${marked.includes(d) ? 'marked' : ''}`}
            onClick={() => onPick(d)}
          >
            {+d.slice(8)}
          </button>
        ))}
      </div>
    </div>
  )
}

// DateNav — ‹ Weekday, D Month › with a calendar on the label
export function DateNav({ value, onChange, marked }) {
  const [el, setEl] = useState(null)
  const d = toDate(value)
  return (
    <div className="qe-date">
      <button className="icon-btn qe-prev" title="Previous day" onClick={() => onChange(addDays(value, -1))}><Icon name="chevron" size={14} /></button>
      <button className="qe-label" title="Pick a date" onClick={(e) => setEl(e.currentTarget)}>{DAY_NAMES[d.getDay()]}, {d.getDate()} {MONTHS[d.getMonth()]}</button>
      <button className="icon-btn" title="Next day" onClick={() => onChange(addDays(value, 1))}><Icon name="chevron" size={14} /></button>
      {el && (
        <Popover anchor={el} onClose={() => setEl(null)} width={260}>
          <Calendar value={value} marked={marked} onPick={(v) => { onChange(v); setEl(null) }} />
        </Popover>
      )}
    </div>
  )
}

export function DatePicker({ value, onChange, placeholder = 'Pick a date' }) {
  const [el, setEl] = useState(null)
  return (
    <>
      <button className="date-btn" onClick={(e) => setEl(e.currentTarget)}>
        <Icon name="calendar" size={15} />
        <span className={value ? '' : 'placeholder'}>{value ? longDate(value) : placeholder}</span>
      </button>
      {el && (
        <Popover anchor={el} onClose={() => setEl(null)} width={260}>
          <Calendar value={value} onPick={(d) => { onChange(d); setEl(null) }} />
        </Popover>
      )}
    </>
  )
}
