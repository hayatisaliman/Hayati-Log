import { useEffect, useRef, useState } from 'react'
import { FieldIcon, Icon, IconPicker } from './icons.jsx'
import { FIELD_TYPES, EDITABLE_TYPES, todosFromText, textToMixed } from '../lib/schema.js'
import { fmtClock } from '../lib/time.js'
import { update, findField } from '../lib/store.js'
import { CellView, CellEditor, InlineEditor, isInline, setCell, freshCopy, copyItems, pasteItems } from './cells.jsx'
import { InlineHost, Popover, Menu } from './Popover.jsx'

const READONLY = new Set(['weekday', 'week', 'tracked'])


const LIST_TYPES = new Set(['todo', 'mixed'])
// copyCell / pasteCell — copy/paste events on a selected checklist or note cell, appends on paste
function copyCell(row, field, cd) {
  return copyItems(Array.isArray(row.cells[field.id]) ? row.cells[field.id] : [], cd)
}

const pasteCell = (row, field, text) => pasteItems(row.id, field.id, field.type, text, true)

export function Table({ data, rows, view, setView, onOpenBlocks, onNewRow, now, onDeleteRow, focusRow }) {
  const fields = data.fields.filter((f) => !f.hidden)
  const [sel, setSel] = useState(null)
  const [editing, setEditing] = useState(null)
  const [menu, setMenu] = useState(null)
  const [rowMenu, setRowMenu] = useState(null)
  const [drag, setDrag] = useState(null)
  const [over, setOver] = useState(null)
  const wrapRef = useRef(null)
  const cellRefs = useRef(new Map())

  const rowIndex = sel ? rows.findIndex((r) => r.id === sel.row) : -1
  const fieldIndex = sel ? fields.findIndex((f) => f.id === sel.field) : -1

  const move = (dr, df) => {
    if (rowIndex < 0) return
    const r = Math.max(0, Math.min(rows.length - 1, rowIndex + dr))
    const f = Math.max(0, Math.min(fields.length - 1, fieldIndex + df))
    setSel({ row: rows[r].id, field: fields[f].id })
  }

  useEffect(() => {
    if (!focusRow) return
    setSel({ row: focusRow.id, field: 'date' })
    wrapRef.current?.focus({ preventScroll: true })
  }, [focusRow])

  const clipState = useRef(null)
  clipState.current = !editing && !menu && !rowMenu && rowIndex >= 0 && LIST_TYPES.has(fields[fieldIndex]?.type) ? { row: rows[rowIndex], field: fields[fieldIndex] } : null
  useEffect(() => {
    const live = () => (document.activeElement === wrapRef.current ? clipState.current : null)
    const before = (e) => { if (live()) e.preventDefault() }
    const copy = (e) => { const c = live(); if (c && copyCell(c.row, c.field, e.clipboardData)) e.preventDefault() }
    const paste = (e) => { const c = live(); if (!c) return; e.preventDefault(); pasteCell(c.row, c.field, e.clipboardData?.getData('text/plain')) }
    const evs = [['beforecopy', before], ['beforepaste', before], ['copy', copy], ['paste', paste]]
    for (const [n, f] of evs) document.addEventListener(n, f)
    return () => { for (const [n, f] of evs) document.removeEventListener(n, f) }
  }, [])

  useEffect(() => {
    if (!sel) return
    cellRefs.current.get(`${sel.row}:${sel.field}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [sel])

  const openEditor = (row, field) => {
    if (field.type === 'checkbox') return setCell(row.id, field.id, !row.cells[field.id])
    const el = cellRefs.current.get(`${row.id}:${field.id}`)
    if (field.type === 'tracked') return onOpenBlocks(row.date)
    if (READONLY.has(field.type)) return
    if (el) setEditing((p) => (p?.seed != null && p.row === row.id && p.field === field.id ? p : { row: row.id, field: field.id, el }))
  }

  const onKeyDown = (e) => {
    if (editing || menu || rowMenu || !sel || e.target !== wrapRef.current) return
    const row = rows[rowIndex]
    const field = fields[fieldIndex]
    if (!row || !field) return
    const k = e.key
    const writable = !READONLY.has(field.type) && field.type !== 'cycle' && !field.primary
    if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'd') { e.preventDefault(); if (writable && rowIndex > 0) setCell(row.id, field.id, freshCopy(rows[rowIndex - 1].cells[field.id])) }
    else if (k === 'ArrowDown') { e.preventDefault(); move(1, 0) }
    else if (k === 'ArrowUp') { e.preventDefault(); move(-1, 0) }
    else if (k === 'ArrowRight' || (k === 'Tab' && !e.shiftKey)) { e.preventDefault(); move(0, 1) }
    else if (k === 'ArrowLeft' || (k === 'Tab' && e.shiftKey)) { e.preventDefault(); move(0, -1) }
    else if (k === 'Enter') { e.preventDefault(); openEditor(row, field) }
    else if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && isInline(field)) { e.preventDefault(); setEditing((p) => (p?.seed != null && p.row === row.id && p.field === field.id ? { ...p, seed: p.seed + k } : { row: row.id, field: field.id, seed: k })) }
    else if (k === ' ' && field.type === 'checkbox') { e.preventDefault(); openEditor(row, field) }
    else if ((k === 'Backspace' || k === 'Delete') && writable) { e.preventDefault(); setCell(row.id, field.id, null) }
    else if (k === 'Escape') setSel(null)
  }

  const closeEditor = (dir) => {
    setEditing(null)
    wrapRef.current?.focus({ preventScroll: true })
    if (dir === 'down') move(1, 0)
    if (dir === 'right') move(0, 1)
    if (dir === 'left') move(0, -1)
  }

  const startResize = (e, field) => {
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    const w0 = field.width || 150
    let w = w0
    const th = e.currentTarget.parentElement
    const onMove = (ev) => {
      w = Math.max(48, w0 + ev.clientX - x0)
      document.querySelectorAll(`[data-col="${field.id}"]`).forEach((el) => { el.style.width = `${w}px` })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      update((d) => { findField(d, field.id).width = w })
      th.classList.remove('resizing')
    }
    th.classList.add('resizing')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const dropOn = (target) => {
    const side = over?.id === target ? over.side : 'left'
    setDrag(null)
    setOver(null)
    if (!drag || drag === target) return
    update((d) => {
      const from = d.fields.findIndex((f) => f.id === drag)
      const [f] = d.fields.splice(from, 1)
      const to = d.fields.findIndex((x) => x.id === target)
      d.fields.splice(side === 'right' ? to + 1 : to, 0, f)
    })
  }

  const [newMenu, setNewMenu] = useState(null)
  const addField = (type) => {
    const id = `f-${Math.random().toString(36).slice(2, 8)}`
    const el = newMenu
    update((d) => { d.fields.push({ id, name: 'New property', type, width: type === 'text' ? 160 : 200 }) })
    setTimeout(() => setMenu({ field: id, el: document.querySelector(`[data-head="${id}"]`) || el, rename: true }), 0)
  }

  return (
    <div className="table-wrap wrap" ref={wrapRef} tabIndex={0} onKeyDown={onKeyDown}>
      <div className="table">
        <div className="tr thead">
          <div className="gutter" />
          {fields.map((f) => (
            <div
              key={f.id}
              data-col={f.id}
              data-head={f.id}
              className={`th ${f.primary ? 'sticky' : ''} ${drag === f.id ? 'dragging' : ''} ${over?.id === f.id ? `drop-${over.side}` : ''}`}
              style={{ width: f.width || 150 }}
              draggable={!f.primary}
              onDragStart={(e) => { setDrag(f.id); e.dataTransfer.effectAllowed = 'move' }}
              onDragOver={(e) => {
                if (!drag || f.primary || drag === f.id) return
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                const side = e.clientX < r.left + r.width / 2 ? 'left' : 'right'
                if (over?.id !== f.id || over.side !== side) setOver({ id: f.id, side })
              }}
              onDragLeave={() => setOver((o) => (o?.id === f.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); dropOn(f.id) }}
              onDragEnd={() => { setDrag(null); setOver(null) }}
              onClick={(e) => setMenu({ field: f.id, el: e.currentTarget })}
            >
              <span className="th-icon"><FieldIcon type={f.type} icon={f.icon} /></span>
              <span className="th-name">{f.name}</span>
              <span className="th-resize" onPointerDown={(e) => startResize(e, f)} onClick={(e) => e.stopPropagation()} />
            </div>
          ))}
          <button className="th add" onClick={(e) => setNewMenu(e.currentTarget)} title="Add a property">+</button>
        </div>

        {rows.map((row) => (
          <div key={row.id} className={`tr ${sel?.row === row.id ? 'row-sel' : ''} ${row.date === now?.today ? 'today' : ''}`}>
            <div className="gutter">
              <button className="handle" title="Row menu" onClick={(e) => setRowMenu({ row: row.id, el: e.currentTarget })}><Icon name="grip" size={14} /></button>
            </div>
            {fields.map((f) => {
              const selected = sel?.row === row.id && sel?.field === f.id
              return (
                <div
                  key={f.id}
                  data-col={f.id}
                  ref={(el) => { if (el) cellRefs.current.set(`${row.id}:${f.id}`, el); else cellRefs.current.delete(`${row.id}:${f.id}`) }}
                  className={`td t-${f.type} ${f.primary ? 'sticky' : ''} ${selected ? 'sel' : ''} ${editing?.row === row.id && editing.field === f.id && !f.primary ? 'editing' : ''}`}
                  style={{ width: f.width || 150 }}
                  onClick={(e) => {
                    if (editing?.row === row.id && editing.field === f.id) return
                    setSel({ row: row.id, field: f.id })
                    wrapRef.current?.focus({ preventScroll: true })
                    if (f.primary) return
                    if (f.type === 'checkbox' && e.target.closest('.check')) return
                    openEditor(row, f)
                  }}
                >
                  {editing?.row === row.id && editing.field === f.id && !f.primary
                    ? isInline(f)
                      ? <InlineEditor field={f} row={row} seed={editing.seed} onClose={closeEditor} />
                      : <InlineHost.Provider value><CellEditor anchor={editing.el} field={f} row={row} data={data} onClose={closeEditor} /></InlineHost.Provider>
                    : <CellView field={f} row={row} data={data} now={now} />}
                </div>
              )
            })}
            <div className="td filler" />
          </div>
        ))}

        <div className="tr new-row" onClick={onNewRow}>
          <div className="gutter" />
          <span>+ New Day</span>
        </div>

        <div className="tr tfoot">
          <div className="gutter" />
          {fields.map((f) => <CalcCell key={f.id} field={f} rows={rows} />)}
        </div>
      </div>

      {editing && (() => {
        const row = rows.find((r) => r.id === editing.row)
        const field = fields.find((f) => f.id === editing.field)
        return row && field?.primary ? <CellEditor anchor={editing.el} field={field} row={row} data={data} onClose={closeEditor} /> : null
      })()}

      {newMenu && (
        <Popover anchor={newMenu} onClose={() => setNewMenu(null)} align="right" width={200}>
          <Menu onPick={() => setNewMenu(null)} items={[
            { icon: 'text', label: 'Text', run: () => addField('text') },
            { icon: 'list', label: 'Text + checklist', run: () => addField('mixed') },
            { icon: 'checkbox', label: 'Checklist', run: () => addField('todo') },
          ]} />
        </Popover>
      )}
      {menu && <HeaderMenu menu={menu} data={data} view={view} setView={setView} onClose={() => setMenu(null)} />}

      {rowMenu && (
        <Popover anchor={rowMenu.el} onClose={() => setRowMenu(null)} width={180}>
          <Menu onPick={() => setRowMenu(null)} items={[
            { icon: 'stopwatch', label: 'Time blocks', run: () => onOpenBlocks(rows.find((r) => r.id === rowMenu.row)?.date) },
            '-',
            { icon: 'x', label: 'Delete day', danger: true, run: () => onDeleteRow(rowMenu.row) },
          ]} />
        </Popover>
      )}
    </div>
  )
}

const CALCS = {
  checked: { label: 'Checked', run: (n, total) => `${n} / ${total}` },
  pctChecked: { label: '% checked', run: (n, total) => (total ? `${Math.round((n / total) * 100)}%` : '—') },
}

// CalcCell — footer count, shown for checkbox columns only
function CalcCell({ field, rows }) {
  const [open, setOpen] = useState(null)
  const cls = `td calc ${field.primary ? 'sticky' : ''}`
  if (field.type !== 'checkbox') return <div data-col={field.id} className={`${cls} empty`} style={{ width: field.width || 150 }} />
  const calc = CALCS[field.calc] ? field.calc : 'checked'
  const checked = rows.filter((r) => r.cells[field.id]).length
  return (
    <div data-col={field.id} className={cls} style={{ width: field.width || 150 }} onClick={(e) => setOpen(e.currentTarget)}>
      {CALCS[calc].run(checked, rows.length)}
      {open && (
        <Popover anchor={open} onClose={() => setOpen(null)} width={170}>
          <Menu onPick={() => setOpen(null)} items={Object.entries(CALCS).map(([k, c]) => ({
            label: c.label, active: calc === k,
            run: () => update((d) => { findField(d, field.id).calc = k }),
          }))} />
        </Popover>
      )}
    </div>
  )
}

function HeaderMenu({ menu, data, view, setView, onClose }) {
  const field = data.fields.find((f) => f.id === menu.field)
  const [name, setName] = useState(field?.name || '')
  const [typeMenu, setTypeMenu] = useState(null)
  const [iconEl, setIconEl] = useState(null)
  if (!field) return null
  const commitName = () => { if (name.trim() && name !== field.name) update((d) => { findField(d, field.id).name = name.trim() }) }
  const close = () => { commitName(); onClose() }
  const insert = (offset) => {
    const id = `f-${Math.random().toString(36).slice(2, 8)}`
    update((d) => { const i = d.fields.findIndex((f) => f.id === field.id); d.fields.splice(i + offset, 0, { id, name: 'New property', type: 'text', width: 160 }) })
  }
  const changeType = (type) => update((d) => {
    const f = findField(d, field.id)
    const old = f.type
    f.type = type
    if ((type === 'select' || type === 'multi') && !f.options) f.options = []
    for (const r of d.rows) {
      const v = r.cells[f.id]
      if (v == null) continue
      if (type === 'todo' && typeof v === 'string') r.cells[f.id] = todosFromText(v)
      else if (type === 'todo' && old === 'mixed') r.cells[f.id] = v.map((t) => (t.kind === 'text' ? { id: t.id, text: t.text, done: false } : t))
      else if (type === 'mixed' && typeof v === 'string') r.cells[f.id] = textToMixed(v)
      else if (type === 'mixed' && old === 'todo') r.cells[f.id] = v
      else if (type === 'text' && (old === 'todo' || old === 'mixed')) r.cells[f.id] = v.map((t) => t.text).join('\n')
      else if (type === 'text') r.cells[f.id] = Array.isArray(v) ? v.map((id) => f.options?.find((o) => o.id === id)?.name || id).join(', ') : old === 'time' ? fmtClock(v) : String(v)
      else if (type === 'multi' && old === 'select') r.cells[f.id] = [v]
      else if (type === 'select' && old === 'multi') r.cells[f.id] = v[0]
      else if (type === 'number' && typeof v === 'string' && !Number.isNaN(+v)) r.cells[f.id] = +v
      else if (type !== old) delete r.cells[f.id]
    }
  })
  const items = [
    { icon: 'arrow-up', label: 'Sort ascending', run: () => setView({ ...view, sort: { field: field.id, dir: 'asc' } }) },
    { icon: 'arrow-down', label: 'Sort descending', run: () => setView({ ...view, sort: { field: field.id, dir: 'desc' } }) },
    '-',
    ...(field.primary ? [] : [
      { icon: 'insert-left', label: 'Insert left', run: () => insert(0) },
      { icon: 'insert-right', label: 'Insert right', run: () => insert(1) },
      { icon: 'eye-off', label: 'Hide', run: () => update((d) => { findField(d, field.id).hidden = true }) },
    ]),
    { icon: 'arrows-h', label: field.wide ? 'Default width' : 'Wider', run: () => update((d) => { const f = findField(d, field.id); f.width = f.wide ? 150 : 280; f.wide = !f.wide }) },
    ...(field.primary || FIELD_TYPES[field.type]?.computed ? [] : [
      '-',
      { icon: 'x', label: 'Delete property', danger: true, run: () => update((d) => { d.fields = d.fields.filter((f) => f.id !== field.id); for (const r of d.rows) delete r.cells[field.id] }) },
    ]),
  ]
  return (
    <Popover anchor={menu.el} onClose={close} width={250}>
      <div className="head-menu">
        <div className="head-name">
          <button className="icon-btn head-icon" title="Change icon" onClick={(e) => setIconEl(e.currentTarget)}><FieldIcon type={field.type} icon={field.icon} /></button>
          <input autoFocus={menu.rename} className="line-editor" value={name} onChange={(e) => setName(e.target.value)}
            onFocus={(e) => menu.rename && e.target.select()}
            onKeyDown={(e) => { if (e.key === 'Enter') close() }} />
        </div>
        <button className="menu-item" disabled={field.primary || FIELD_TYPES[field.type]?.computed} onClick={(e) => setTypeMenu(e.currentTarget)}>
          <span className="menu-icon"><FieldIcon type={field.type} /></span>
          <span>Type</span>
          <span className="menu-hint">{FIELD_TYPES[field.type]?.label} ›</span>
        </button>
        <div className="menu-sep" />
        <Menu items={items} onPick={close} />
      </div>
      {iconEl && <IconPicker anchor={iconEl} value={field.icon} onClose={() => setIconEl(null)} onPick={(icon) => update((d) => { const f = findField(d, field.id); if (icon) f.icon = icon; else delete f.icon })} />}
      {typeMenu && (
        <Popover anchor={typeMenu} onClose={() => setTypeMenu(null)} width={180}>
          <Menu onPick={() => setTypeMenu(null)} items={EDITABLE_TYPES.map((t) => ({
            icon: <FieldIcon type={t} />, label: FIELD_TYPES[t].label, active: field.type === t,
            run: () => changeType(t),
          }))} />
        </Popover>
      )}
    </Popover>
  )
}
