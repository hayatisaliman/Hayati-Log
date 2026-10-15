import { useEffect, useMemo, useRef, useState } from 'react'
import { MONTHS, addDays, monthKey, toDate, isoOf, pad, shortDate } from '../lib/time.js'
import { update } from '../lib/store.js'
import { BlockEditor, MoveToItem, isDoneToggle, moveBlockTo } from './NoteEditor.jsx'
import { Popover } from './Popover.jsx'
import { Icon } from './icons.jsx'
import { ScrollTabs } from './ScrollTabs.jsx'

const editors = new Map()

const mondayOf = (iso) => {
  const d = toDate(iso)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return isoOf(d)
}

const nextMonthKey = (key) => {
  const [y, m] = key.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`
}

// weeksOfMonth — Monday weeks; the week holding the 1st belongs to that month
function weeksOfMonth(key) {
  const first = `${key}-01`
  const nextFirst = `${nextMonthKey(key)}-01`
  const startsMonday = toDate(first).getDay() === 1
  const out = []
  for (let m = mondayOf(first); m < nextFirst; m = addDays(m, 7)) {
    const sunday = addDays(m, 6)
    if (m > first && nextFirst <= sunday) break
    out.push({ monday: m, sunday, num: out.length + (startsMonday ? 1 : 0) })
  }
  return out
}

const monthOfWeek = (monday) => {
  const sunday = addDays(monday, 6)
  return sunday.slice(8) <= '06' && sunday.slice(0, 7) !== monday.slice(0, 7) ? sunday.slice(0, 7) : monday.slice(0, 7)
}

const fmt = (iso) => shortDate(iso).slice(0, 6)

const TEMPLATE = [
  { type: 'paragraph', props: { backgroundColor: 'gray' }, content: '' },
  { type: 'toggleListItem', content: 'Done' },
]

export function weeklyMonths(data, today) {
  const set = new Set([monthKey(today), ...(data.weekMonths || [])])
  for (const [k, w] of Object.entries(data.weeks || {})) if (w.blocks?.length) set.add(monthOfWeek(k))
  return [...set].sort().reverse()
}

export function WeeklyPlan({ data, now, focus }) {
  const months = useMemo(() => weeklyMonths(data, now.today), [data.weeks, data.weekMonths, now.today])
  const latest = months[0]
  const years = useMemo(() => [...new Set(months.map((m) => m.slice(0, 4)))], [months])
  const [year, setYear] = useState(() => (focus?.month || now.today).slice(0, 4))
  const shown = years.includes(year) ? year : now.today.slice(0, 4)
  useEffect(() => { if (focus) setYear(focus.month.slice(0, 4)) }, [focus])
  useEffect(() => {
    const el = focus && document.getElementById(`wp-${focus.month}`)
    const box = el?.closest('.weekly')
    if (box) box.scrollTo({ top: box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - 12, behavior: 'smooth' })
  }, [focus, shown])

  return (
    <div className="weekly">
      <div className="view-head">
        <h1 className="view-title">Weekly Plan</h1>
        <ScrollTabs items={years} value={shown} onPick={setYear} />
        <button className="btn primary" onClick={() => { update((d) => { d.weekMonths = [...new Set([...(d.weekMonths || []), nextMonthKey(latest)])] }); setYear(nextMonthKey(latest).slice(0, 4)) }}>
          + Plan {MONTHS[+nextMonthKey(latest).slice(5) - 1]}
        </button>
      </div>
      <MovePanel />
      {months.filter((m) => m.startsWith(shown)).map((m) => <MonthRow key={m} month={m} data={data} now={now} moveMonths={[nextMonthKey(latest), ...months].sort()} />)}
    </div>
  )
}

function MonthRow({ month, data, now, moveMonths }) {
  const weeks = weeksOfMonth(month)
  return (
    <section className="wp-month" id={`wp-${month}`}>
      <h2 className="wp-month-title">{MONTHS[+month.slice(5) - 1]} {month.slice(0, 4)}</h2>
      <div className="wp-grid" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', minWidth: 5 * 250 }}>
        {weeks.map((w) => (
          <WeekColumn
            key={w.monday}
            week={w}
            label={`Week ${w.num}`}
            current={now.today >= w.monday && now.today <= w.sunday}
            stored={data.weeks?.[w.monday]?.blocks}
            targets={moveMonths.map((mk) => ({ month: mk, weeks: weeksOfMonth(mk).filter((x) => x.monday !== w.monday) })).filter((g) => g.weeks.length)}
          />
        ))}
      </div>
    </section>
  )
}

function WeekColumn({ week, label, current, stored, targets }) {
  const timer = useRef(null)
  const initial = useMemo(() => (stored?.length ? stored : TEMPLATE), [week.monday])
  const save = (blocks) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => update((d) => {
      d.weeks = d.weeks || {}
      d.weeks[week.monday] = { blocks }
    }, { fromEditor: true }), 500)
  }
  const toTarget = (t) => ({
    key: t.monday,
    label: `Week ${t.num} · ${fmt(t.monday)} – ${fmt(t.sunday)}`,
    resolve: () => editors.get(t.monday)
      ? { editor: editors.get(t.monday) }
      : { append: (b) => update((d) => { d.weeks = d.weeks || {}; const w = d.weeks[t.monday] || { blocks: [...TEMPLATE] }; const i = w.blocks.findIndex(isDoneToggle); w.blocks = i < 0 ? [...w.blocks, b] : [...w.blocks.slice(0, i), b, ...w.blocks.slice(i)]; d.weeks[t.monday] = w }) },
  })
  const targetList = targets.map((g) => ({ key: g.month, label: `${MONTHS[+g.month.slice(5) - 1]} ${g.month.slice(0, 4)}`, items: g.weeks.map(toTarget) }))
  const targetsKey = targets.map((g) => g.month + g.weeks.length).join()
  const MoveTo = useMemo(() => function MoveTo() { return <MoveToItem targets={targetList} current={monthOfWeek(week.monday)} /> }, [targetsKey])

  return (
    <div className={`wp-week ${current ? 'current' : ''}`}>
      <h2 className="wp-title">{label}</h2>
      <div className="wp-dates">
        <span><Icon name="calendar" size={14} /> {fmt(week.monday)} – {fmt(week.sunday)}</span>
      </div>
      <BlockEditor
        docId={`week-${week.monday}`}
        initial={initial}
        onChange={save}
        className="note-blocks week-blocks"
        menuExtra={MoveTo}
        placeholder="Goal or task — type '/' for blocks"
        onEditor={(ed) => { if (ed) editors.set(week.monday, ed); else editors.delete(week.monday) }}
      />
    </div>
  )
}

function MovePanel() {
  const [req, setReq] = useState(null)
  const [active, setActive] = useState(null)
  useEffect(() => {
    const on = (e) => { setReq(e.detail); setActive(e.detail.current) }
    window.addEventListener('hr-move-to', on)
    return () => window.removeEventListener('hr-move-to', on)
  }, [])
  if (!req) return null
  const rect = req.rect || { left: 200, top: 200, right: 200, bottom: 200, width: 0, height: 0 }
  const anchor = { getBoundingClientRect: () => rect }
  const group = req.targets.find((g) => g.key === active) || req.targets[0]
  const close = () => setReq(null)
  return (
    <Popover anchor={anchor} onClose={close} width={430}>
      <div className="move-panel">
        <div className="move-col">
          <div className="move-head">Month</div>
          {req.targets.map((g) => (
            <button key={g.key} className={`menu-item ${g.key === group.key ? 'active' : ''}`} onMouseEnter={() => setActive(g.key)} onClick={() => setActive(g.key)}>
              <span>{g.label}</span><span className="menu-hint">›</span>
            </button>
          ))}
        </div>
        <div className="move-col">
          <div className="move-head">Week</div>
          {group.items.map((t) => (
            <button key={t.key} className="menu-item" onClick={() => { moveBlockTo(req.editor, req.block, t.resolve()); close() }}>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </Popover>
  )
}
