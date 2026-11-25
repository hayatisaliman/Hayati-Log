import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { COLORS, COLOR_NAMES, computedValue, newRow, todoId, cycleInfo, setCycleDay, togglePeriodStart, togglePeriodEnd, wakeMinute, todoAge, rolloverMinute, cellText, textToMixed, todosFromText } from '../lib/schema.js'
import { addDays, fmtClock, fmtDuration, isNight, logicalToday, nowMinutes, normalizeClock, parseClock, parseDuration, toDate, weekOfMonth, DAY_SHORT } from '../lib/time.js'
import { plainText } from '../lib/richText.js'
import { CatIcon, blockSec, catMeta, resumePaused, startBlock, stopRunning } from './TimeBlocks.jsx'
import { update, findRow, findField, useData as useDataSnapshot } from '../lib/store.js'
import { RichInput, RichText } from './FormatBar.jsx'
import { InlineHost, Popover } from './Popover.jsx'
import { ColorSwatch } from './ColorPicker.jsx'
import { Icon } from './icons.jsx'
import { Calendar } from './DatePicker.jsx'

const WEEK_COLORS = { 1: 'var(--cyan)', 2: 'var(--blue)', 3: 'var(--orange)', 4: 'var(--red)' }

export function Chip({ color = 'gray', children, onRemove, title }) {
  return (
    <span className="chip" style={{ '--c': COLORS[color] || COLORS.gray }} title={title}>
      {children}
      {onRemove && <button className="chip-x" onClick={(e) => { e.stopPropagation(); onRemove() }}>×</button>}
    </span>
  )
}

function Check({ checked, onToggle }) {
  return (
    <button className={`check ${checked ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); onToggle?.() }} aria-pressed={!!checked}>
      {checked && <svg viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6l4.6-5.2" /></svg>}
    </button>
  )
}

export function ClockText({ min }) {
  if (min == null) return null
  return (
    <span className="clock">
      <span className={`clock-ico ${isNight(min) ? 'night' : 'day'}`}>{isNight(min) ? '☾' : '☀'}</span>
      {fmtClock(min, { compact: true })}
    </span>
  )
}

// freshCopy — copied to-dos get new ids and lose carry links
export const freshCopy = (v) => (Array.isArray(v) ? v.map((t) => (t && typeof t === 'object' && t.id ? { id: todoId(), text: t.text, ...(t.kind ? { kind: t.kind } : { done: !!t.done }) } : t)) : structuredClone(v ?? null))

let listClip = null

// copyItems / pasteItems — shared multi-row clipboard for checklist and note cells
export function copyItems(items, cd) {
  if (!items.length) return false
  listClip = { items: structuredClone(items), text: cellText(items) }
  cd.setData('text/plain', listClip.text)
  return true
}

export function pasteItems(rowId, fieldId, type, text, always) {
  const ours = listClip && (!text || text === listClip.text)
  if (!ours && !always && !text?.includes('\n')) return false
  let items = ours ? listClip.items : text ? (type === 'mixed' ? textToMixed(text) : todosFromText(text)) : []
  if (!items.length) return false
  items = freshCopy(items)
  if (type === 'todo') items = items.map((t) => (t.kind === 'text' ? { id: t.id, text: t.text, done: false } : t))
  update((d) => {
    const r = findRow(d, rowId)
    if (r) r.cells[fieldId] = [...(Array.isArray(r.cells[fieldId]) ? r.cells[fieldId] : []), ...items]
  })
  return true
}

export function setCell(rowId, fieldId, value) {
  update((d) => {
    const r = findRow(d, rowId)
    if (!r) return
    if (fieldId === 'date') { r.date = value; return }
    if (value == null || value === '' || (Array.isArray(value) && !value.length) || value === false) delete r.cells[fieldId]
    else r.cells[fieldId] = value
  })
}

export function CellView({ field, row, data, now }) {
  const v = field.type === 'tracked' ? null : computedValue(field, row, data)
  switch (field.type) {
    case 'date': {
      const d = toDate(row.date)
      return <span className="date-cell"><b>{String(d.getDate()).padStart(2, '0')}</b><i className={`muted-caps ${d.getDay() % 6 === 0 ? 'weekend' : ''}`}>{DAY_SHORT[d.getDay()]}</i></span>
    }
    case 'weekday': return <span className={`muted-caps ${v === 'SAT' || v === 'SUN' ? 'weekend' : ''}`}>{v}</span>
    case 'week': return <span className="text-cell muted" style={{ color: WEEK_COLORS[weekOfMonth(row.date)] }}>{v}</span>
    case 'cycle': return v ? <Chip color={v.color}>D{v.day} · {v.phase === 'Ovulation' ? 'Ovul.' : v.phase}{v.late ? ` +${v.late}d` : ''}</Chip> : null
    case 'tracked': {
      const m = now?.tracked?.(row)
      return m ? <span className="num">{fmtDuration(m)}</span> : null
    }
    case 'checkbox': return <Check checked={!!v} onToggle={() => setCell(row.id, field.id, !v)} />
    case 'todo':
    case 'mixed': return <TodoLines items={v} rowId={row.id} fieldId={field.id} data={data} date={row.date} />
    case 'time': return <ClockText min={v} />
    case 'number': return v == null ? null : <span className="num">{v}</span>
    case 'select':
    case 'multi': {
      const ids = Array.isArray(v) ? v : v ? [v] : []
      return <span className="chips">{ids.map((id) => { const o = field.options?.find((x) => x.id === id); return o ? <Chip key={id} color={o.color}>{o.name}</Chip> : null })}</span>
    }
    default: return v ? <span className="text-cell"><RichText text={v} /></span> : null
  }
}

// todayBlocks — the row's time blocks when the stopwatch can run there (today, or yesterday before its End), else null
const todayBlocks = (data, row) => {
  if (!data || !row) return null
  const today = logicalToday(rolloverMinute(data))
  return row.date === today || (row.date === addDays(today, -1) && row.cells.end == null) ? row.blocks || [] : null
}

// daySec — finished seconds recorded for a to-do on its own row
const daySec = (row, t) => (row?.blocks || []).reduce((n, b) => n + (b.todo === t.id && b.end != null ? blockSec(b) : 0), 0)

// tagTodo — sets a line's Category / Plan and copies them onto its time blocks
function tagTodo(rowId, id, patch) {
  update((d) => {
    const r = findRow(d, rowId)
    if (!r) return
    for (const v of Object.values(r.cells)) if (Array.isArray(v)) for (const x of v) if (x?.id === id) {
      for (const [k, val] of Object.entries(patch)) { if (val == null || (Array.isArray(val) && !val.length)) delete x[k]; else x[k] = val }
    }
    for (const b of r.blocks || []) if (b.todo === id) {
      if ('cats' in patch) b.cats = patch.cats || []
      if ('plan' in patch) b.plan = patch.plan ?? null
    }
  })
}

// TagButton — quick Category / Plan for a line, synced to its time blocks
function TagButton({ rowId, t, data }) {
  const [el, setEl] = useState(null)
  const [q, setQ] = useState('')
  const [plan, setPlan] = useState('')
  const cats = t.cats || []
  const stop = (e) => e.stopPropagation()
  const open = (e) => { stop(e); setQ(''); setPlan(t.plan ? fmtDuration(t.plan) : ''); setEl(e.currentTarget) }
  const commitPlan = () => { const v = plan.trim() ? parseDuration(plan) : null; if (plan.trim() && v == null) return; if (v !== (t.plan ?? null)) tagTodo(rowId, t.id, { plan: v }) }
  const list = data.categories.filter((c) => (!c.archived || cats.includes(c.id)) && c.name.toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (id) => tagTodo(rowId, t.id, { cats: cats.includes(id) ? cats.filter((x) => x !== id) : [...cats, id] })
  const set = cats.length || t.plan
  return (
    <>
      <button className={`todo-tag ${set ? 'on' : ''}`} title="Category / Target" onMouseDown={stop} onClick={open}><Icon name="tag" size={13} /></button>
      {el && (
        <Popover anchor={el} align="right" width={220} onClose={() => { commitPlan(); setEl(null) }}>
          <div className="tag-pop" onClick={stop} onMouseDown={stop} onKeyDown={stop}>
            <div className="tag-row">
              <input autoFocus className="line-editor slim tag-search" value={q} placeholder="Category" onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) toggle(list[0].id); if (e.key === 'Escape') setEl(null) }} />
              <input className="line-editor slim tag-plan" value={plan} placeholder="Target" title="Target time, e.g. 30m or 1h" onChange={(e) => setPlan(e.target.value)} onBlur={commitPlan}
                onKeyDown={(e) => { if (e.key === 'Enter') { commitPlan(); setEl(null) } if (e.key === 'Escape') setEl(null) }} />
            </div>
            <div className="tag-list">
              {list.map((c) => { const m = catMeta(data, c.id); return (
                <button key={c.id} className={`menu-item ${cats.includes(c.id) ? 'active' : ''}`} onClick={() => toggle(c.id)}>
                  <Chip color={m.color}><CatIcon c={c} />{c.name}</Chip>
                  {cats.includes(c.id) && <span className="menu-hint">✓</span>}
                </button>
              ) })}
              {!list.length && <div className="empty-note">No categories</div>}
            </div>
          </div>
        </Popover>
      )}
    </>
  )
}

// WatchButton — starts the menu bar stopwatch for a to-do or note line
function WatchButton({ rowId, date, t, blocks }) {
  const running = blocks.some((b) => b.end == null && b.todo === t.id)
  const paused = !running && blocks.some((b) => b.paused && b.todo === t.id)
  const click = (e) => {
    e.stopPropagation()
    const min = nowMinutes(date)
    if (running) stopRunning(rowId, min)
    else if (paused) resumePaused(rowId, min)
    else startBlock(rowId, null, min, plainText(t.text).trim(), t.id)
  }
  return (
    <button className={`todo-watch ${running ? 'on' : paused ? 'paused' : ''}`} title={running ? 'Stop stopwatch' : paused ? 'Resume stopwatch' : 'Start stopwatch'}
      onMouseDown={(e) => e.stopPropagation()} onClick={click}>
      <Icon name="stopwatch" size={13} />
    </button>
  )
}

const shortMin = (m) => (m < 60 ? String(m) : `${Math.round(m / 60)}h`)

// setTodoMinutes — edits a to-do's tracked total for its day by moving the end of its latest finished block
function setTodoMinutes(rowId, id, total) {
  update((d) => {
    const r = findRow(d, rowId)
    const mine = (r?.blocks || []).filter((b) => b.todo === id && b.end != null && !b.paused)
    const last = mine.reduce((a, b) => (!a || b.start > a.start ? b : a), null)
    if (!last) return
    const others = Math.round(mine.reduce((n, b) => n + (b === last ? 0 : blockSec(b)), 0) / 60)
    last.end = last.start + Math.max(1, total - others)
    delete last.sec
  })
}

// TodoTime — tracked minutes for a to-do or note line, click to edit
function TodoTime({ rowId, t, mins }) {
  const [edit, setEdit] = useState(null)
  const stop = (e) => e.stopPropagation()
  const done = useRef(false)
  const commit = () => {
    if (done.current) return
    done.current = true
    const v = parseDuration(edit)
    if (v != null && v !== mins) setTodoMinutes(rowId, t.id, Math.min(1440, Math.max(1, v)))
    setEdit(null)
  }
  const open = (e) => { stop(e); done.current = false; setEdit(String(mins)) }
  if (edit != null) return (
    <input autoFocus className="todo-time-input num" value={edit} onFocus={(e) => e.target.select()} onClick={stop} onMouseDown={stop}
      onChange={(e) => setEdit(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commit(); if (e.key === 'Escape') { done.current = true; setEdit(null) } }} />
  )
  return <button className="todo-time num" title={`${fmtDuration(mins)} tracked · click to edit`} onMouseDown={stop} onClick={open}>{shortMin(mins)}</button>
}

function TodoLines({ items, rowId, fieldId, data, date }) {
  if (!Array.isArray(items) || !items.length) return null
  const row = data && findRow(data, rowId)
  const blocks = todayBlocks(data, row)
  const side = (t) => {
    const mins = Math.floor(daySec(row, t) / 60)
    if (!blocks && !mins) return null
    return (
      <span className="todo-side">
        {blocks && <span className="todo-hover"><TagButton rowId={rowId} t={t} data={data} /><WatchButton rowId={rowId} date={date} t={t} blocks={blocks} /></span>}
        {mins > 0 && <TodoTime rowId={rowId} t={t} mins={mins} />}
      </span>
    )
  }
  return (
    <span className="todo-list">
      {items.map((t) => (
        t.kind === 'text' ? <span key={t.id} className="todo-line text-line"><span className="todo-text"><RichText text={t.text} /></span>{side(t)}</span> :
        <span key={t.id} className={`todo-line ${t.done ? 'done' : ''} ${moved(t) ? 'carried' : ''}`}>
          {moved(t) ? <MovedMark t={t} /> : <Check checked={t.done} onToggle={() => toggleTodo(rowId, fieldId, t.id)} />}
          <span className="todo-text"><RichText text={t.text} /></span>
          {moved(t) && data && <span className="todo-age num">{todoAge(data, date, t)}d</span>}
          {side(t)}
        </span>
      ))}
    </span>
  )
}

export function CellEditor({ anchor, field, row, onClose, data }) {
  if (field.type === 'cycle') return <CycleEditor anchor={anchor} row={row} data={data} onClose={onClose} />
  if (field.type === 'date') return <DateEditor anchor={anchor} row={row} onClose={onClose} data={data} />
  if (field.type === 'time') return <TimeEditor anchor={anchor} value={row.cells[field.id]} boundary={wakeMinute(data, row, field.id)} onCommit={(m) => setCell(row.id, field.id, field.id === 'end' && m != null && row.cells.start != null && m <= row.cells.start ? m + 1440 : m)} onClose={onClose} />
  if (field.type === 'todo' || field.type === 'mixed') return <TodoEditor anchor={anchor} row={row} field={field} onClose={onClose} />
  if (field.type === 'select' || field.type === 'multi') return <SelectEditor anchor={anchor} fieldId={field.id} rowId={row.id} onClose={onClose} />
  return null
}

function patchTodos(rowId, fieldId, fn) {
  update((d) => {
    const r = findRow(d, rowId)
    if (!r) return
    const list = fn(Array.isArray(r.cells[fieldId]) ? r.cells[fieldId] : [], d, r)
    if (list.length) r.cells[fieldId] = list
    else delete r.cells[fieldId]
  })
}

const toggleTodo = (rowId, fieldId, id) => patchTodos(rowId, fieldId, (l) => l.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))

// copyToNextDay — ↓ copies into the same column, → into Pending; clicking again removes the copy
function copyToNextDay(rowId, fieldId, id, { flag, target, link }) {
  patchTodos(rowId, fieldId, (list, d, r) => {
    const t = list.find((x) => x.id === id)
    const next = addDays(r.date, 1)
    let nr = d.rows.find((x) => x.date === next)
    if (t[flag]) {
      if (nr && Array.isArray(nr.cells[target])) {
        nr.cells[target] = nr.cells[target].filter((x) => x[link] !== id)
        if (!nr.cells[target].length) delete nr.cells[target]
      }
    } else {
      if (!nr) { nr = newRow(next); d.rows.push(nr) }
      nr.cells[target] = [...(Array.isArray(nr.cells[target]) ? nr.cells[target] : []), { id: todoId(), text: t.text, done: false, [link]: id }]
    }
    return list.map((x) => (x.id === id ? { ...x, [flag]: !x[flag] } : x))
  })
}

const moved = (t) => (t.carried || t.sent) && !t.done
const MovedMark = ({ t }) => <span className="todo-carried-mark" title={t.carried ? 'Carried to next day' : "Moved to next day's Pending"}><Icon name={t.carried ? 'arrow-down' : 'arrow-right'} size={14} /></span>

const carryTodo = (rowId, fieldId, id) => copyToNextDay(rowId, fieldId, id, { flag: 'carried', target: fieldId, link: 'from' })
const sendToPending = (rowId, fieldId, id) => copyToNextDay(rowId, fieldId, id, { flag: 'sent', target: 'pending', link: 'sentFrom' })

function TodoList({ rowId, date, fieldId, autoFocus, mixed }) {
  const data = useDataSnapshot()
  const live = findRow(data, rowId)
  const items = Array.isArray(live?.cells[fieldId]) ? live.cells[fieldId] : []
  const [draft, setDraft] = useState('')
  const [kind, setKind] = useState(mixed ? 'text' : 'todo')
  const [armed, setArmed] = useState(null)
  const [drag, setDrag] = useState(null)
  const [over, setOver] = useState(null)
  const addRef = useRef(null)
  const latest = useRef({ draft: '', kind })
  latest.current = { draft, kind }
  useEffect(() => { if (autoFocus) addRef.current?.focus() }, [])
  const add = (text = draft.trim(), k = kind) => {
    if (!text) return
    patchTodos(rowId, fieldId, (l) => [...l, k === 'text' ? { id: todoId(), kind: 'text', text } : { id: todoId(), text, done: false }])
    setDraft('')
  }
  useEffect(() => () => add(latest.current.draft.trim(), latest.current.kind), [])
  const type = mixed ? 'mixed' : 'todo'
  const onAdd = (e) => addRef.current && addRef.current.contains(e.target)
  const emptyAdd = () => !latest.current.draft.trim() && getSelection()?.isCollapsed !== false
  useEffect(() => {
    const before = (e) => { if (addRef.current && addRef.current.contains(document.activeElement) && emptyAdd()) e.preventDefault() }
    document.addEventListener('beforecopy', before)
    return () => document.removeEventListener('beforecopy', before)
  }, [])
  const onCopy = (e) => { if (onAdd(e) && emptyAdd() && copyItems(items, e.clipboardData)) { e.preventDefault(); e.stopPropagation() } }
  const onPaste = (e) => { if (onAdd(e) && pasteItems(rowId, fieldId, type, e.clipboardData.getData('text/plain'))) { e.preventDefault(); e.stopPropagation() } }
  const listRef = useRef(null)
  useEffect(() => {
    if (!drag) return
    let el = listRef.current?.parentElement
    while (el && !(el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement
    if (!el) return
    let y = null
    let raf
    const onOver = (e) => { y = e.clientY }
    const tick = () => {
      if (y != null) {
        const r = el.getBoundingClientRect()
        const zone = Math.min(40, r.height / 3)
        const d = y < r.top + zone ? y - (r.top + zone) : y > r.bottom - zone ? y - (r.bottom - zone) : 0
        if (d) el.scrollBy({ top: Math.sign(d) * Math.min(20, 2 + Math.abs(d) / 3), behavior: 'instant' })
      }
      raf = requestAnimationFrame(tick)
    }
    document.addEventListener('dragover', onOver)
    raf = requestAnimationFrame(tick)
    return () => { document.removeEventListener('dragover', onOver); cancelAnimationFrame(raf) }
  }, [drag])
  const drop = () => {
    if (drag && over && drag !== over.id) patchTodos(rowId, fieldId, (l) => {
      const list = [...l]
      const [m] = list.splice(list.findIndex((x) => x.id === drag), 1)
      const i = list.findIndex((x) => x.id === over.id)
      list.splice(over.pos === 'after' ? i + 1 : i, 0, m)
      return list
    })
    setDrag(null); setOver(null); setArmed(null)
  }
  return (
    <div ref={listRef} onMouseUp={() => !drag && setArmed(null)} onCopyCapture={onCopy} onPasteCapture={onPaste}>
      {items.map((t) => (
        <TodoRow key={t.id} t={t} rowId={rowId} fieldId={fieldId} date={date} blocks={todayBlocks(data, live)} data={data} age={moved(t) ? todoAge(data, date, t) : null} onEnter={() => addRef.current?.focus()}
          drag={{
            draggable: armed === t.id,
            className: `${drag === t.id ? 'dragging' : ''} ${over?.id === t.id ? `drop-${over.pos}` : ''}`,
            onArm: () => setArmed(t.id),
            onDragStart: (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); setDrag(t.id) },
            onDragOver: (e) => { if (!drag) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver({ id: t.id, pos: e.clientY < r.top + r.height / 2 ? 'before' : 'after' }) },
            onDrop: (e) => { e.preventDefault(); drop() },
            onDragEnd: drop,
          }} />
      ))}
      <div className="todo-row add">
        {mixed
          ? <button className={`todo-kind ${kind}`} title={kind === 'todo' ? 'Adding a to-do · click for text' : 'Adding text · click for a to-do'} onMouseDown={(e) => e.preventDefault()} onClick={() => setKind(kind === 'todo' ? 'text' : 'todo')}><Icon name={kind === 'todo' ? 'checkbox' : 'text'} size={14} /></button>
          : <span className="todo-plus">+</span>}
        <RichInput
          inputRef={addRef}
          className="todo-input"
          value={draft}
          placeholder={mixed && kind === 'text' ? 'Add text' : 'Add a to-do'}
          onChange={setDraft}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        />
      </div>
    </div>
  )
}

// TodoEditor — in a table cell it keeps the cell's height and scrolls instead of spilling over
function TodoEditor({ anchor, row, field, onClose }) {
  const inline = useContext(InlineHost)
  const [maxHeight] = useState(() => (inline ? Math.max((anchor?.offsetHeight || 0) - 8, 64) : undefined))
  return (
    <Popover anchor={anchor} cover width={340} className="cell-editor todo-editor" onClose={onClose}>
      <div className={inline ? 'todo-scroll' : ''} style={{ maxHeight }}>
        <TodoList rowId={row.id} date={row.date} fieldId={field.id} autoFocus mixed={field.type === 'mixed'} />
      </div>
    </Popover>
  )
}

function TodoRow({ t, rowId, fieldId, date, blocks, data, onEnter, drag, age }) {
  const [text, setText] = useState(t.text)
  useEffect(() => setText(t.text), [t.text])
  const commit = () => { const v = text.trim(); if (v && v !== t.text) patchTodos(rowId, fieldId, (l) => l.map((x) => (x.id === t.id ? { ...x, text: v } : x))); if (!v) setText(t.text) }
  const latest = useRef({ text, saved: t.text })
  latest.current = { text, saved: t.text }
  useEffect(() => () => { const { text: v, saved } = latest.current; if (v.trim() && v.trim() !== saved) patchTodos(rowId, fieldId, (l) => l.map((x) => (x.id === t.id ? { ...x, text: v.trim() } : x))) }, [])
  const remove = () => patchTodos(rowId, fieldId, (l) => l.filter((x) => x.id !== t.id))
  const isText = t.kind === 'text'
  return (
    <div className={`todo-row ${isText ? 'text-row' : ''} ${t.done ? 'done' : ''} ${moved(t) ? 'carried' : ''} ${drag?.className || ''}`}
      draggable={drag?.draggable} onDragStart={drag?.onDragStart} onDragOver={drag?.onDragOver} onDrop={drag?.onDrop} onDragEnd={drag?.onDragEnd}>
      <span className="todo-handle" title="Drag to reorder" onMouseDown={drag?.onArm}><Icon name="grip" size={12} /></span>
      {isText ? null : moved(t) ? <MovedMark t={t} /> : <Check checked={t.done} onToggle={() => toggleTodo(rowId, fieldId, t.id)} />}
      <RichInput
        className="todo-input"
        value={text}
        onChange={setText}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); onEnter() }
          if (e.key === 'Backspace' && !text) { e.preventDefault(); remove(); onEnter() }
        }}
      />
      {age != null && <span className="todo-age num">{age}d</span>}
      <span className="todo-actions">
      {blocks && <TagButton rowId={rowId} t={t} data={data} />}
      {blocks && <WatchButton rowId={rowId} date={date} t={t} blocks={blocks} />}
      {!isText && fieldId !== 'pending' && (
        <button className={`todo-carry todo-send ${t.sent ? 'on' : ''}`} title={t.sent ? "Copied to next day's Pending · click to undo" : "Copy to next day's Pending"} onClick={() => sendToPending(rowId, fieldId, t.id)}>
          <Icon name="arrow-right" size={14} />
        </button>
      )}
      {!isText && !t.done && (
        <button className={`todo-carry ${t.carried ? 'on' : ''}`} title={t.carried ? 'Carried to next day · click to undo' : 'Carry to next day'} onClick={() => carryTodo(rowId, fieldId, t.id)}>
          <Icon name="arrow-down" size={14} />
        </button>
      )}
      <button className="todo-del" title="Delete" onClick={remove}>×</button>
      </span>
    </div>
  )
}

function useAutosize(ref, value) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [ref, value])
}

// isInline — fields edited by typing straight into the cell
export const isInline = (field) => field.type === 'text' || field.type === 'number'

export function InlineEditor({ field, row, seed, onClose }) {
  const value = row.cells[field.id] ?? ''
  const [v, setV] = useState(seed ?? String(value))
  const ref = useRef(null)
  const done = useRef(false)
  useAutosize(ref, v)
  useEffect(() => { const el = ref.current; if (!el) return; el.focus(); el.setSelectionRange(el.value.length, el.value.length) }, [])
  const finish = (next) => {
    if (done.current) return
    done.current = true
    if (field.type === 'number') { const n = v.trim(); if (n !== String(value)) setCell(row.id, field.id, n === '' || Number.isNaN(+n) ? null : +n) }
    else if (v !== value) setCell(row.id, field.id, v.replace(/\s+$/, ''))
    onClose(next)
  }
  const keys = (e) => {
    e.stopPropagation()
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) { e.preventDefault(); finish('down') }
    if (e.key === 'Enter' && field.type === 'number') e.preventDefault()
    if (e.key === 'Tab') { e.preventDefault(); finish(e.shiftKey ? 'left' : 'right') }
    if (e.key === 'Escape') { e.preventDefault(); finish() }
  }
  if (field.type === 'text') return <RichInput className="inline-editor" value={v} onChange={setV} onBlur={() => finish()} onKeyDown={keys} multiline autoFocus />
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`inline-editor ${field.type === 'number' ? 'num' : ''}`}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish()}
      onKeyDown={keys}
    />
  )
}

function LineEditor({ anchor, value, onCommit, onClose, placeholder, validate }) {
  const [v, setV] = useState(String(value))
  const ref = useRef(null)
  const done = useRef(false)
  useEffect(() => { ref.current.focus(); ref.current.select() }, [])
  const ok = validate ? validate(v) : true
  const finish = (next, commit = true) => {
    if (done.current) return
    done.current = true
    if (commit && ok && v !== String(value)) onCommit(v.trim())
    onClose(next)
  }
  return (
    <Popover anchor={anchor} cover width={190} className="cell-editor" onClose={() => finish()}>
      <input
        ref={ref}
        className={`line-editor ${ok ? '' : 'bad'}`}
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); finish('down') }
          if (e.key === 'Tab') { e.preventDefault(); finish(e.shiftKey ? 'left' : 'right') }
        }}
      />
    </Popover>
  )
}

function TimeEditor({ anchor, value, boundary, onCommit, onClose }) {
  return (
    <LineEditor
      anchor={anchor}
      value={value == null ? '' : fmtClock(value)}
      placeholder="Time"
      validate={(s) => !s.trim() || parseClock(s) != null}
      onCommit={(s) => onCommit(s ? normalizeClock(parseClock(s), boundary) : null)}
      onClose={onClose}
    />
  )
}

function DateEditor({ anchor, row, onClose, data }) {
  const [warn, setWarn] = useState(false)
  const taken = data.rows.filter((r) => r.id !== row.id).map((r) => r.date)
  return (
    <Popover anchor={anchor} width={260} onClose={() => onClose()}>
      <Calendar value={row.date} onPick={(d) => {
        if (taken.includes(d)) return setWarn(true)
        if (d !== row.date) setCell(row.id, 'date', d)
        onClose('down')
      }} />
      {warn && <div className="editor-hint warn">That date already has a row</div>}
    </Popover>
  )
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'opt'

export function SelectEditor({ anchor, fieldId, rowId, onClose, value: valueProp, onChange, options: optionsProp, onCreate, onEditOption, multi: multiProp }) {
  const data = useDataSnapshot()
  const field = fieldId ? findField(data, fieldId) : null
  const row = rowId ? findRow(data, rowId) : null
  const multi = multiProp ?? field?.type === 'multi'
  const options = optionsProp ?? field?.options ?? []
  const raw = valueProp !== undefined ? valueProp : row?.cells[fieldId]
  const value = Array.isArray(raw) ? raw : raw ? [raw] : []
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const [editing, setEditing] = useState(null)

  const set = (ids) => {
    if (onChange) return onChange(multi ? ids : ids[0] ?? null)
    setCell(rowId, fieldId, multi ? ids : ids[0] ?? null)
  }
  const toggle = (id) => {
    if (multi) { set(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]); setQ(''); setHi(0) }
    else { set(value[0] === id ? [] : [id]); onClose() }
  }
  const create = (name) => {
    if (onCreate) { const id = onCreate(name); if (id) toggle(id); setQ(''); return }
    const color = COLOR_NAMES[(options.length + 2) % COLOR_NAMES.length]
    let id = slug(name)
    while (options.some((o) => o.id === id)) id += '-x'
    update((d) => { findField(d, fieldId).options = [...(findField(d, fieldId).options || []), { id, name, color }] })
    if (multi) setCell(rowId, fieldId, [...value, id])
    else { setCell(rowId, fieldId, id); onClose() }
    setQ('')
  }
  const list = options.filter((o) => !value.includes(o.id) && o.name.toLowerCase().includes(q.toLowerCase()))
  const exact = options.some((o) => o.name.toLowerCase() === q.trim().toLowerCase())
  const items = [...list.map((o) => ({ o })), ...(q.trim() && !exact ? [{ create: q.trim() }] : [])]

  return (
    <Popover anchor={anchor} cover width={240} className="cell-editor select-editor" onClose={() => onClose()}>
      <div className="select-input">
        {value.map((id) => { const o = options.find((x) => x.id === id); return o && <Chip key={id} color={o.color} onRemove={() => set(value.filter((x) => x !== id))}>{o.label ?? o.name}</Chip> })}
        <input
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setHi(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(items.length - 1, h + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
            if (e.key === 'Enter') { e.preventDefault(); const it = items[hi]; if (it?.o) toggle(it.o.id); else if (it?.create) create(it.create) }
            if (e.key === 'Backspace' && !q && value.length) set(value.slice(0, -1))
          }}
        />
      </div>
      <div className="select-list">
        {items.map((it, i) => it.o ? (
          <div key={it.o.id} className={`select-row ${i === hi ? 'hi' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => toggle(it.o.id)}>
            <Chip color={it.o.color} title={it.o.label ?? it.o.name}><span className="chip-text">{it.o.label ?? it.o.name}</span></Chip>
            {(fieldId || onEditOption) && (
              <button className="row-more" onClick={(e) => { e.stopPropagation(); setEditing({ id: it.o.id, el: e.currentTarget }) }}>⋯</button>
            )}
          </div>
        ) : (
          <div key="create" className={`select-row ${i === hi ? 'hi' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => create(it.create)}>
            <span className="create-label">Create</span><Chip color="gray">{it.create}</Chip>
          </div>
        ))}
        {!items.length && <div className="empty-note">No options</div>}
      </div>
      {editing && fieldId && (
        <OptionEditor anchor={editing.el} fieldId={fieldId} optionId={editing.id} onClose={() => setEditing(null)} />
      )}
      {editing && onEditOption && onEditOption(editing, () => setEditing(null))}
    </Popover>
  )
}

function OptionEditor({ anchor, fieldId, optionId, onClose }) {
  const data = useDataSnapshot()
  const o = findField(data, fieldId)?.options?.find((x) => x.id === optionId)
  const [name, setName] = useState(o?.name || '')
  if (!o) return null
  const patch = (p) => update((d) => { Object.assign(findField(d, fieldId).options.find((x) => x.id === optionId), p) })
  return (
    <Popover anchor={anchor} width={180} onClose={() => { if (name.trim() && name !== o.name) patch({ name: name.trim() }); onClose() }}>
      <div className="option-editor">
        <input autoFocus className="line-editor" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { if (name.trim()) patch({ name: name.trim() }); onClose() } }} />
        <div className="option-color">
          <span>Colour</span>
          <ColorSwatch value={o.color} onChange={(c) => patch({ color: c })} />
        </div>
        <button className="menu-item danger" onClick={() => {
          update((d) => {
            const f = findField(d, fieldId)
            f.options = f.options.filter((x) => x.id !== optionId)
            for (const r of d.rows) {
              const v = r.cells[fieldId]
              if (Array.isArray(v)) { r.cells[fieldId] = v.filter((x) => x !== optionId); if (!r.cells[fieldId].length) delete r.cells[fieldId] }
              else if (v === optionId) delete r.cells[fieldId]
            }
          })
          onClose()
        }}>Delete option</button>
      </div>
    </Popover>
  )
}

function CycleEditor({ anchor, row, data, onClose }) {
  const info = cycleInfo(row.date, data.settings)
  const [n, setN] = useState(info ? String(info.day) : '')
  const isStart = data.settings.cycleStarts.includes(row.date)
  const isEnd = (data.settings.periodEnds || []).includes(row.date)
  const canEnd = info && info.day <= 14
  const commitDay = () => {
    const v = parseInt(n, 10)
    if (!v || v < 1 || v > 90 || v === info?.day) return
    update((d) => setCycleDay(d.settings, row.date, v))
  }
  return (
    <Popover anchor={anchor} cover width={250} className="cell-editor" onClose={() => { commitDay(); onClose() }}>
      <div className="cycle-editor">
        <div className="ce-head">
          {info ? <Chip color={info.color}>D{info.day} · {info.phase}{info.late ? ` +${info.late}d` : ''}</Chip> : <span className="muted">No cycle recorded yet</span>}
        </div>
        <div className="ce-row">
          <span title="Cycle day">Day</span>
          <input autoFocus className="line-editor slim ce-day" inputMode="numeric" value={n} placeholder="—"
            onChange={(e) => setN(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') { commitDay(); onClose('down') } }} />
        </div>
        <button className={`menu-item ${isStart ? 'active' : ''}`} onClick={() => { update((d) => togglePeriodStart(d.settings, row.date)); onClose() }}>
          <span className="menu-icon"><Icon name="drop" size={15} /></span>Start
        </button>
        <button className={`menu-item ${isEnd ? 'active' : ''}`} disabled={!canEnd && !isEnd} onClick={() => { update((d) => togglePeriodEnd(d.settings, row.date)); onClose() }}>
          <span className="menu-icon"><Icon name="drop" size={15} /></span>End
        </button>
      </div>
    </Popover>
  )
}
