import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { COLORS, COLOR_NAMES, computedValue, newRow, todoId, cycleInfo, cycleLen, setCycleDay, togglePeriodStart, togglePeriodEnd, wakeMinute, todoAge } from '../lib/schema.js'
import { addDays, fmtClock, fmtDuration, isNight, normalizeClock, parseClock, toDate, weekOfMonth, DAY_SHORT } from '../lib/time.js'
import { update, findRow, findField, useData as useDataSnapshot } from '../lib/store.js'
import { RichInput, RichText } from './FormatBar.jsx'
import { Popover } from './Popover.jsx'
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

function TodoLines({ items, rowId, fieldId, data, date }) {
  if (!Array.isArray(items) || !items.length) return null
  return (
    <span className="todo-list">
      {items.map((t) => (
        t.kind === 'text' ? <span key={t.id} className="todo-line text-line"><span className="todo-text"><RichText text={t.text} /></span></span> :
        <span key={t.id} className={`todo-line ${t.done ? 'done' : ''} ${t.carried ? 'carried' : ''}`}>
          {t.carried && !t.done ? <span className="todo-carried-mark" title="Carried to next day"><Icon name="arrow-down" size={14} /></span> : <Check checked={t.done} onToggle={() => toggleTodo(rowId, fieldId, t.id)} />}
          <span className="todo-text"><RichText text={t.text} /></span>
          {t.carried && !t.done && data && <span className="todo-age num">{todoAge(data, date, t)}d</span>}
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
    <div onMouseUp={() => !drag && setArmed(null)}>
      {items.map((t) => (
        <TodoRow key={t.id} t={t} rowId={rowId} fieldId={fieldId} age={t.carried && !t.done ? todoAge(data, date, t) : null} onEnter={() => addRef.current?.focus()}
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

function TodoEditor({ anchor, row, field, onClose }) {
  return (
    <Popover anchor={anchor} cover width={340} className="cell-editor todo-editor" onClose={onClose}>
      <TodoList rowId={row.id} date={row.date} fieldId={field.id} autoFocus mixed={field.type === 'mixed'} />
    </Popover>
  )
}

function TodoRow({ t, rowId, fieldId, onEnter, drag, age }) {
  const [text, setText] = useState(t.text)
  useEffect(() => setText(t.text), [t.text])
  const commit = () => { const v = text.trim(); if (v && v !== t.text) patchTodos(rowId, fieldId, (l) => l.map((x) => (x.id === t.id ? { ...x, text: v } : x))); if (!v) setText(t.text) }
  const latest = useRef({ text, saved: t.text })
  latest.current = { text, saved: t.text }
  useEffect(() => () => { const { text: v, saved } = latest.current; if (v.trim() && v.trim() !== saved) patchTodos(rowId, fieldId, (l) => l.map((x) => (x.id === t.id ? { ...x, text: v.trim() } : x))) }, [])
  const remove = () => patchTodos(rowId, fieldId, (l) => l.filter((x) => x.id !== t.id))
  const isText = t.kind === 'text'
  return (
    <div className={`todo-row ${isText ? 'text-row' : ''} ${t.done ? 'done' : ''} ${t.carried ? 'carried' : ''} ${drag?.className || ''}`}
      draggable={drag?.draggable} onDragStart={drag?.onDragStart} onDragOver={drag?.onDragOver} onDrop={drag?.onDrop} onDragEnd={drag?.onDragEnd}>
      <span className="todo-handle" title="Drag to reorder" onMouseDown={drag?.onArm}><Icon name="grip" size={12} /></span>
      {isText ? null : t.carried && !t.done ? <span className="todo-carried-mark" title="Carried to next day"><Icon name="arrow-down" size={14} /></span> : <Check checked={t.done} onToggle={() => toggleTodo(rowId, fieldId, t.id)} />}
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
  const list = options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()))
  const exact = options.some((o) => o.name.toLowerCase() === q.trim().toLowerCase())
  const items = [...list.map((o) => ({ o })), ...(q.trim() && !exact ? [{ create: q.trim() }] : [])]

  return (
    <Popover anchor={anchor} cover width={240} className="cell-editor select-editor" onClose={() => onClose()}>
      <div className="select-input">
        {value.map((id) => { const o = options.find((x) => x.id === id); return o && <Chip key={id} color={o.color} onRemove={() => set(value.filter((x) => x !== id))}>{o.name}</Chip> })}
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
            <Chip color={it.o.color}>{it.o.name}</Chip>
            {value.includes(it.o.id) && <span className="tick">✓</span>}
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
    <Popover anchor={anchor} width={220} onClose={() => { if (name.trim() && name !== o.name) patch({ name: name.trim() }); onClose() }}>
      <div className="option-editor">
        <input autoFocus className="line-editor" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { if (name.trim()) patch({ name: name.trim() }); onClose() } }} />
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
        <div className="option-color">
          <span>Colour</span>
          <ColorSwatch value={o.color} onChange={(c) => patch({ color: c })} />
        </div>
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
          <span>Cycle day</span>
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
        {info?.late > 0 && <div className="ce-note warn">{info.late} day{info.late > 1 ? 's' : ''} late against your usual {cycleLen(data.settings)}-day cycle. Mark the day it starts.</div>}
      </div>
    </Popover>
  )
}
