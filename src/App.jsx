import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FieldIcon, Icon } from './components/icons.jsx'
import { useData, useStatus, update, undo, redo, findField } from './lib/store.js'
import { addRoutines, routinesDue, newRow, rolloverMinute, wakeMinute, trackedMinutes, computedValue, applyPalette, cellText } from './lib/schema.js'
import { daysInMonth, logicalToday, monthKey, monthLabel, nowMinutes, pad, parseClock, normalizeClock } from './lib/time.js'
import { Table } from './components/Table.jsx'
import { Sidebar } from './components/Sidebar.jsx'
import { NotePanel } from './components/NotePanel.jsx'
import { TimeBlocksPage } from './components/TimeBlocksPage.jsx'
import { WeeklyPlan } from './components/WeeklyPlan.jsx'
import { Chores } from './components/Chores.jsx'
import { MonthReport } from './components/MonthReport.jsx'
import { QuarterReport } from './components/QuarterReport.jsx'
import { Settings } from './components/Settings.jsx'
import { Popover } from './components/Popover.jsx'
import { QuickEntry } from './components/QuickEntry.jsx'
import { FormatBar } from './components/FormatBar.jsx'
import { useMenubar } from './lib/menubar.jsx'
import { useNotesEpoch } from './lib/noteFiles.js'

function useNow(boundary) {
  const [ts, setTs] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setTs(Date.now()), 20000); return () => clearInterval(t) }, [])
  return useMemo(() => {
    const date = new Date(ts)
    const today = logicalToday(boundary, date)
    return {
      ts,
      today,
      minutesFor: (iso) => nowMinutes(iso, date),
      tracked: (row) => trackedMinutes(row, row.date === today, nowMinutes(row.date, date)),
    }
  }, [ts, boundary])
}

export default function App() {
  const data = useData()
  const notesEpoch = useNotesEpoch()
  applyPalette(data.settings)
  const status = useStatus()
  const now = useNow(rolloverMinute(data))
  const [view, setView] = useState('table')
  const [weekFocus, setWeekFocus] = useState(null)
  const [toasts, setToasts] = useState([])
  const [month, setMonth] = useState(() => monthKey(now.today))
  const [blocksDate, setBlocksDate] = useState(now.today)
  const [focusRow, setFocusRow] = useState(null)
  const [note, setNote] = useState(null)
  const [noteFull, setNoteFull] = useState(false)
  const [noteWidth, setNoteWidth] = useState(() => { try { return +localStorage.getItem('hr.noteWidth') || 560 } catch { return 560 } })
  const searchRef = useRef(null)
  const [tableView, setTableView] = useState({ sort: { field: 'date', dir: 'asc' }, filters: [], search: '' })
  const months = useMemo(() => {
    const set = new Set([...data.rows.map((r) => monthKey(r.date)), ...(data.months || []), monthKey(now.today)])
    return [...set].sort().reverse()
  }, [data.rows, data.months, now.today])

  const toast = (text, action) => {
    const id = Math.random()
    setToasts((t) => [...t, { id, text, action }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
  }

  useEffect(() => {
    const due = routinesDue(data, now.today)
    if (due.length) update((d) => addRoutines(d, now.today, due), { history: false })
  }, [now.today, data.settings.routines])

  useEffect(() => { try { localStorage.setItem('hr.noteWidth', String(noteWidth)) } catch { /* private mode */ } }, [noteWidth])

  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) document.activeElement?.closest?.('input, textarea, select, [contenteditable="true"]')?.blur()
      if (!(e.metaKey || e.ctrlKey)) return
      const inField = e.target.closest?.('input, textarea, [contenteditable="true"]')
      if (e.key.toLowerCase() === 'z' && !inField) { e.preventDefault(); e.shiftKey ? redo() : undo() }
      if (e.key.toLowerCase() === 'y' && !inField) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const goToDay = (rowId) => {
    const r = data.rows.find((x) => x.id === rowId)
    if (!r) return
    setTableView((v) => ({ ...v, search: '', filters: [] }))
    setMonth(monthKey(r.date))
    setView('table')
    setFocusRow({ id: rowId, ts: Date.now() })
  }

  const openBlocks = (date) => { if (!date) return; setBlocksDate(date); setView('blocks') }

  useMenubar(data, (v) => (v === 'blocks' ? openBlocks(now.today) : setView(v)))

  const openNote = (id, fresh) => setNote(id ? { id, fresh: !!fresh } : null)

  const newDay = () => {
    const taken = new Set(data.rows.map((r) => r.date))
    for (let i = 1; i <= daysInMonth(month); i++) {
      const date = `${month}-${pad(i)}`
      if (!taken.has(date)) { update((d) => { d.rows.push(newRow(date)) }); return }
    }
    toast(`${monthLabel(month)} already has every day`)
  }

  const deleteRow = (id) => {
    const r = data.rows.find((x) => x.id === id)
    update((d) => { d.rows = d.rows.filter((x) => x.id !== id) })
    toast(`Deleted ${r?.date}`, { label: 'Undo', run: undo })
  }

  const rows = useMemo(() => {
    let rs = data.rows.filter((r) => r.date.startsWith(month))
    const q = tableView.search.trim().toLowerCase()
    if (q) rs = rs.filter((r) => r.date.includes(q) || Object.values(r.cells).some((v) => (typeof v === 'string' || (Array.isArray(v) && typeof v[0] === 'object')) && cellText(v).toLowerCase().includes(q)) || r.blocks.some((b) => b.text?.toLowerCase().includes(q)))
    for (const f of tableView.filters) rs = rs.filter((r) => matchFilter(f, r, data))
    const sf = findField(data, tableView.sort.field) || data.fields[0]
    const dir = tableView.sort.dir === 'asc' ? 1 : -1
    const val = (r) => {
      if (sf.type === 'date') return r.date
      if (sf.type === 'tracked') return now.tracked(r)
      const v = computedValue(sf, r, data)
      if (sf.type === 'cycle') return v?.day ?? null
      if (Array.isArray(v)) return v.map((id) => sf.options?.find((o) => o.id === id)?.name || '').join(',')
      if (v != null && typeof v === 'object') return null
      return v
    }
    return [...rs].sort((a, b) => {
      const x = val(a)
      const y = val(b)
      if (x == null && y == null) return a.date.localeCompare(b.date)
      if (x == null || x === '') return 1
      if (y == null || y === '') return -1
      return (x > y ? 1 : x < y ? -1 : a.date.localeCompare(b.date)) * dir
    })
  }, [data, month, tableView, now])

  const noteOpen = note && data.notes.some((n) => n.id === note.id)

  return (
    <div className="app">
      <Sidebar data={data} view={view} setView={setView} onWeekMonth={(m) => { setView('weekly'); setWeekFocus({ month: m, t: Date.now() }) }} month={month} setMonth={setMonth} now={now} status={status}
        onGoToDay={goToDay} openNoteId={noteOpen ? note.id : null} onOpenNote={openNote} searchRef={searchRef} />

      <main className="main" hidden={noteOpen && noteFull}>
        <div className="drag-region top" data-tauri-drag-region />
        {view === 'table' && (
          <div className="table-view">
            <div className="view-head">
              <h1 className="view-title">{monthLabel(month)}</h1>
              <QuickEntry data={data} onSaved={(id, date, text) => { setMonth(monthKey(date)); setFocusRow({ id, ts: Date.now() }); toast(`Saved to ${text}`, { label: 'Undo', run: undo }) }} />
            </div>
            <div className="table-bar">
              <MonthGoals key={month} month={month} value={data.monthGoals?.[month] || ''} />
              <Toolbar data={data} view={tableView} setView={setTableView} />
            </div>
            <Table data={data} rows={rows} view={tableView} setView={setTableView} onOpenBlocks={openBlocks} onNewRow={newDay} now={now} onDeleteRow={deleteRow} focusRow={focusRow} />
          </div>
        )}
        {view === 'blocks' && <TimeBlocksPage data={data} date={blocksDate} setDate={setBlocksDate} now={now} onGoToDay={goToDay} />}
        {view === 'chores' && <Chores data={data} />}
        {view === 'weekly' && <WeeklyPlan data={data} now={now} focus={weekFocus} />}
        {view === 'report' && <MonthReport data={data} month={month} months={months} setMonth={setMonth} onOpen={goToDay} now={now} />}
        {view === 'quarters' && <QuarterReport data={data} now={now} />}
        {view === 'settings' && <Settings data={data} toast={toast} now={now} />}
      </main>

      {noteOpen && <NotePanel key={`${note.id}:${notesEpoch}`}data={data} noteId={note.id} focusTitle={note.fresh} onClose={() => setNote(null)} width={Math.max(360, Math.min(noteWidth, window.innerWidth - 232 - 420))} setWidth={setNoteWidth} toast={toast} full={noteFull} setFull={setNoteFull} />}

      <FormatBar />

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
            {t.action && <button className="btn tiny" onClick={() => { t.action.run(); setToasts((x) => x.filter((y) => y.id !== t.id)) }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </div>
  )
}

function matchFilter(f, r, data) {
  const field = findField(data, f.field)
  if (!field) return true
  const v = field.type === 'date' ? r.date : computedValue(field, r, data)
  const empty = v == null || v === '' || v === false || (Array.isArray(v) && !v.length)
  switch (f.op) {
    case 'empty': return empty
    case 'filled': return !empty
    case 'checked': return !!v
    case 'unchecked': return !v
    case 'has': return Array.isArray(v) ? v.includes(f.value) : v === f.value
    case 'contains': return cellText(v).toLowerCase().includes(String(f.value || '').toLowerCase())
    case 'before': { const m = parseClock(f.value); return m != null && v != null && v < normalizeClock(m, wakeMinute(data, r, f.field)) }
    case 'after': { const m = parseClock(f.value); return m != null && v != null && v > normalizeClock(m, wakeMinute(data, r, f.field)) }
    default: return true
  }
}

const OPS = {
  text: [['contains', 'contains'], ['filled', 'is not empty'], ['empty', 'is empty']],
  checkbox: [['checked', 'is checked'], ['unchecked', 'is not checked']],
  select: [['has', 'is'], ['filled', 'is not empty'], ['empty', 'is empty']],
  multi: [['has', 'has'], ['filled', 'is not empty'], ['empty', 'is empty']],
  time: [['before', 'before'], ['after', 'after'], ['filled', 'is not empty'], ['empty', 'is empty']],
}
const opsFor = (f) => OPS[f.type] || [['filled', 'is not empty'], ['empty', 'is empty']]
const needsValue = (op) => ['contains', 'has', 'before', 'after'].includes(op)

function Toolbar({ data, view, setView }) {
  const [filterEl, setFilterEl] = useState(null)
  const [propsEl, setPropsEl] = useState(null)
  const searchRef = useRef(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const hidden = data.fields.filter((f) => f.hidden).length
  const setFilters = (filters) => setView({ ...view, filters })
  const sortField = findField(data, view.sort.field)
  return (
    <div className="toolbar">
      <div className={`search ${searchOpen || view.search ? 'open' : ''}`} title="Search" onClick={() => { setSearchOpen(true); searchRef.current?.focus() }}>
        <span className="search-ico"><Icon name="search" size={15} /></span>
        <input ref={searchRef} placeholder="Search" value={view.search} onChange={(e) => setView({ ...view, search: e.target.value })}
          onFocus={() => setSearchOpen(true)} onBlur={() => setSearchOpen(false)} tabIndex={searchOpen || view.search ? 0 : -1} />
        {view.search && <button className="chip-x" onClick={() => setView({ ...view, search: '' })}>×</button>}
      </div>
      <button className={`btn ghost ${view.filters.length ? 'on' : ''}`} onClick={(e) => setFilterEl(e.currentTarget)}>
        Filter{view.filters.length ? ` · ${view.filters.length}` : ''}
      </button>
      {sortField && (
        <button className="btn ghost" onClick={() => setView({ ...view, sort: { ...view.sort, dir: view.sort.dir === 'asc' ? 'desc' : 'asc' } })}>
          {sortField.name}<span className="sort-arrow">{view.sort.dir === 'asc' ? '↑' : '↓'}</span>
        </button>
      )}
      <button className="btn ghost" onClick={(e) => setPropsEl(e.currentTarget)}>Properties{hidden ? ` · ${hidden} hidden` : ''}</button>

      {filterEl && (
        <Popover anchor={filterEl} onClose={() => setFilterEl(null)} width={430}>
          <div className="filters">
            {!view.filters.length && <div className="empty-note">No filters. Add one below.</div>}
            {view.filters.map((f, i) => {
              const field = findField(data, f.field)
              const set = (patch) => setFilters(view.filters.map((x, j) => (j === i ? { ...x, ...patch } : x)))
              return (
                <div key={i} className="filter-row">
                  <select className="select" value={f.field} onChange={(e) => { const nf = findField(data, e.target.value); set({ field: nf.id, op: opsFor(nf)[0][0], value: '' }) }}>
                    {data.fields.filter((x) => x.type !== 'tracked').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <select className="select" value={f.op} onChange={(e) => set({ op: e.target.value })}>
                    {opsFor(field).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  {needsValue(f.op) && (field.type === 'select' || field.type === 'multi' ? (
                    <select className="select" value={f.value} onChange={(e) => set({ value: e.target.value })}>
                      <option value="">—</option>
                      {(field.options || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  ) : (
                    <input className="line-editor slim" placeholder={field.type === 'time' ? 'e.g. 4am' : 'Value'} value={f.value || ''} onChange={(e) => set({ value: e.target.value })} />
                  ))}
                  <button className="icon-btn" onClick={() => setFilters(view.filters.filter((_, j) => j !== i))}>✕</button>
                </div>
              )
            })}
            <button className="btn ghost" onClick={() => { const f = data.fields.find((x) => x.type === 'text'); setFilters([...view.filters, { field: f.id, op: 'contains', value: '' }]) }}>+ Add filter</button>
          </div>
        </Popover>
      )}

      {propsEl && (
        <Popover anchor={propsEl} onClose={() => setPropsEl(null)} width={240}>
          <div className="menu">
            {data.fields.filter((f) => !f.primary).map((f) => (
              <button key={f.id} className="menu-item" onClick={() => update((d) => { findField(d, f.id).hidden = !f.hidden })}>
                <span className="menu-icon"><FieldIcon type={f.type} icon={f.icon} /></span>
                <span style={{ opacity: f.hidden ? 0.45 : 1 }}>{f.name}</span>
                <span className="menu-hint">{f.hidden ? '◌' : '●'}</span>
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  )
}

function MonthGoals({ month, value }) {
  const [v, setV] = useState(value)
  const ref = useRef(null)
  const timer = useRef(null)
  const fit = () => { const el = ref.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }
  useLayoutEffect(fit, [v])
  useEffect(() => { const ro = new ResizeObserver(fit); ro.observe(ref.current); return () => ro.disconnect() }, [])
  const save = (next) => update((d) => {
    d.monthGoals = d.monthGoals || {}
    if (next.trim()) d.monthGoals[month] = next
    else delete d.monthGoals[month]
  })
  return (
    <div className="month-goals">
      <textarea
        ref={ref}
        rows={1}
        value={v}
        placeholder={`Goals for ${monthLabel(month).split(' ')[0]}`}
        onChange={(e) => { setV(e.target.value); clearTimeout(timer.current); const next = e.target.value; timer.current = setTimeout(() => save(next), 700) }}
        onBlur={() => { clearTimeout(timer.current); if (v !== value) save(v) }}
      />
    </div>
  )
}
