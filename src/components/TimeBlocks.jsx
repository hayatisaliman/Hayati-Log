import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { COLORS, blockEnd, blockShares, todoId, wakeMinute } from '../lib/schema.js'
import { addDays, fmtClock, fmtDuration, normalizeClock, nowMinutes, parseClock, parseDuration, toDate } from '../lib/time.js'
import { update, findRow } from '../lib/store.js'
import { Chip, SelectEditor } from './cells.jsx'
import { Popover, Menu } from './Popover.jsx'
import { useTip } from './Tip.jsx'
import { Icon } from './icons.jsx'
import { Toggle } from './Settings.jsx'

const bid = () => `b-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

export function catMeta(data, id) {
  const c = data.categories.find((x) => x.id === id)
  if (!c) return { id, name: id, emoji: '', color: 'gray', group: null }
  const g = data.groups.find((x) => x.id === c.group)
  return { ...c, color: g?.color || 'gray', groupName: g?.name || '' }
}

export function CatIcon({ c, size = 13 }) {
  if (c?.icon) return <span className="cat-ico"><Icon name={c.icon} size={size} /></span>
  return c?.emoji ? <span className="cat-ico">{c.emoji}</span> : null
}

// groupShares — minutes per group for one block, split across its categories
export function groupShares(data, b, dur) {
  const out = {}
  for (const { cat, min } of blockShares(b, dur)) { const g = catMeta(data, cat).group || 'none'; out[g] = (out[g] || 0) + min }
  return out
}

const blockColor = (data, b) => COLORS[catMeta(data, b.cats?.[0]).color] || COLORS.gray

// watchRow — row holding the live stopwatch: today, else yesterday while its End is empty
export function watchRow(d, today) {
  const rows = [d.rows.find((r) => r.date === today), d.rows.find((r) => r.date === addDays(today, -1) && r.cells.end == null)].filter(Boolean)
  return rows.find((r) => r.blocks?.some((b) => b.end == null)) || rows.find((r) => r.blocks?.some((b) => b.paused)) || null
}

function editBlocks(rowId, fn) {
  update((d) => {
    let r = findRow(d, rowId)
    if (!r && /^r-\d{4}-\d{2}-\d{2}$/.test(rowId) && !d.rows.some((x) => x.date === rowId.slice(2))) {
      r = { id: rowId, date: rowId.slice(2), cells: {}, notes: '', blocks: [] }
      d.rows.push(r)
    }
    if (r) fn(r, r.blocks, d)
  })
}

// blockSec — seconds a finished block ran, from its saved stopwatch seconds unless its times were edited since
export function blockSec(b) {
  const span = Math.max(0, b.end - b.start) * 60
  return b.sec != null && Math.abs(b.sec - span) < 60 ? b.sec : span
}

const carryOf = (blocks, todo) => (todo ? blocks.reduce((n, b) => n + (b.todo === todo && b.end != null ? blockSec(b) : 0), 0) : 0)
const closeBlock = (r, b, end) => { b.sec = Math.max(0, elapsedSec(r.date, b) - (b.carrySec || 0)); b.end = end }

// findEntry — the checklist / note line with this id in a row's cells
export function findEntry(r, id) {
  for (const [field, v] of Object.entries(r?.cells || {})) if (Array.isArray(v)) { const i = v.findIndex((x) => x?.id === id); if (i >= 0) return { field, i, item: v[i] } }
  return null
}

const listFields = (d) => d.fields.filter((f) => f.type === 'todo' || f.type === 'mixed')
const syncFields = (d) => d.fields.filter((f) => f.type === 'todo' || f.type === 'mixed' || f.type === 'text')
const blockLabel = (d, b) => b.text?.trim() || b.cats.map((c) => catMeta(d, c).name).join(' · ') || 'Untitled block'
const textLines = (v) => (typeof v === 'string' && v ? v.split('\n') : [])

// syncPlace — where a block's synced line sits: a checklist / note line, or a line in a text column
export function syncPlace(r, b) {
  if (b.syncText) return textLines(r.cells[b.syncText.field]).includes(b.syncText.line) ? { field: b.syncText.field, text: true } : null
  const e = b.todo && findEntry(r, b.todo)
  return e ? { field: e.field, item: e.item } : null
}

function takeOut(r, b) {
  if (b.syncText) {
    const { field, line } = b.syncText
    const lines = textLines(r.cells[field])
    const i = lines.indexOf(line)
    if (i >= 0) lines.splice(i, 1)
    if (lines.length) r.cells[field] = lines.join('\n')
    else delete r.cells[field]
    delete b.syncText
    return { text: line }
  }
  const e = b.todo && findEntry(r, b.todo)
  if (!e) return null
  r.cells[e.field] = r.cells[e.field].filter((x) => x.id !== e.item.id)
  if (!r.cells[e.field].length) delete r.cells[e.field]
  delete b.todo
  delete b.syncItem
  return e.item
}

function putIn(d, r, b, field, kind, from) {
  const type = d.fields.find((f) => f.id === field)?.type
  const text = from?.text || blockLabel(d, b)
  if (type === 'text') {
    const lines = textLines(r.cells[field])
    r.cells[field] = [...lines, text].join('\n')
    b.syncText = { field, line: text }
    return
  }
  const id = from?.id || todoId()
  const { kind: _k, done, ...rest } = from?.id ? from : { id, text }
  const k = type === 'todo' ? 'todo' : kind || (from?.kind === 'text' ? 'text' : 'todo')
  const item = k === 'text' ? { ...rest, id, text, kind: 'text' } : { ...rest, id, text, done: !!done }
  r.cells[field] = [...(Array.isArray(r.cells[field]) ? r.cells[field] : []), item]
  b.todo = id
  b.syncItem = id
}

// setSync — Sync log on: adds the block as a line in a month table column; off: removes the line it added
function setSync(rowId, blockId, on) {
  editBlocks(rowId, (r, blocks, d) => {
    const b = blocks.find((x) => x.id === blockId)
    if (!b) return
    if (!on) {
      if (b.syncText || b.syncItem) takeOut(r, b)
      else if (b.todo) { b.offTodo = b.todo; delete b.todo }
      return
    }
    if (b.offTodo && findEntry(r, b.offTodo)) { b.todo = b.offTodo; delete b.offTodo; return }
    delete b.offTodo
    const f = listFields(d).find((x) => x.id === 'plan') || syncFields(d)[0]
    if (f) putIn(d, r, b, f.id)
  })
}

// moveSync — changes the synced line's type (checkbox / text note) or column
function moveSync(rowId, blockId, { field, kind }) {
  editBlocks(rowId, (r, blocks, d) => {
    const b = blocks.find((x) => x.id === blockId)
    const at = b && syncPlace(r, b)
    if (!at) return
    const to = field || at.field
    const owned = b.syncText || b.syncItem
    const from = takeOut(r, b)
    putIn(d, r, b, to, kind, from)
    if (!owned) delete b.syncItem
  })
}

export function startBlock(rowId, catId, nowMin, text = '', todo = null) {
  let id = bid()
  editBlocks(rowId, (r, blocks, d) => {
    for (const o of d.rows) if (o !== r) for (const b of o.blocks || []) { if (b.end == null) closeBlock(o, b, Math.max(b.start, nowMinutes(o.date))); delete b.paused; delete b.pausedSec }
    const open = blocks.find((b) => b.end == null && nowMin - b.start < 1)
    if (open) { open.cats = catId ? [catId] : []; open.text = text; if (todo) open.todo = todo; else delete open.todo; const carry = carryOf(blocks, todo); if (carry) open.carrySec = carry; else delete open.carrySec; id = open.id; return }
    for (const b of blocks) { if (b.end == null && b.start <= nowMin) closeBlock(r, b, nowMin); delete b.paused; delete b.pausedSec }
    const carry = carryOf(blocks, todo)
    const item = todo && findEntry(r, todo)?.item
    const cats = catId ? [catId] : item?.cats ? [...item.cats] : []
    blocks.push({ id, start: nowMin, startedAt: Date.now(), end: null, cats, text, plan: item?.plan ?? null, ...(todo ? { todo } : {}), ...(carry ? { carrySec: carry } : {}) })
    if (r.cells.start == null) r.cells.start = nowMin
  })
  return id
}

export function stopRunning(rowId, nowMin, endDay) {
  editBlocks(rowId, (r, blocks) => {
    for (const b of blocks) { if (b.end == null) closeBlock(r, b, Math.max(b.start, nowMin)); delete b.paused; delete b.pausedSec }
    if (endDay) r.cells.end = nowMin
  })
}

// elapsedSec — stopwatch seconds for a block, including time carried over from before a pause
export function elapsedSec(day, b) {
  if (b.paused) return b.pausedSec || 0
  const base = toDate(day).getTime() + b.start * 60000
  const from = b.startedAt && Math.abs(b.startedAt - base) < 60000 ? b.startedAt : base
  return (b.carrySec || 0) + Math.max(0, Math.floor((Date.now() - from) / 1000))
}

export function pauseRunning(rowId, nowMin) {
  editBlocks(rowId, (r, blocks) => {
    for (const b of blocks) if (b.end == null) { b.pausedSec = elapsedSec(r.date, b); closeBlock(r, b, Math.max(b.start, nowMin)); b.paused = true }
  })
}

export function resumePaused(rowId, nowMin) {
  editBlocks(rowId, (r, blocks) => {
    const p = blocks.find((b) => b.paused)
    if (!p) return
    blocks.push({ id: bid(), start: nowMin, startedAt: Date.now(), end: null, cats: [...p.cats], text: p.text, plan: null, carrySec: p.pausedSec || 0, ...(p.todo ? { todo: p.todo } : {}) })
    delete p.paused
    delete p.pausedSec
  })
}

export function TimeBlocks({ row, data, isToday, nowMin, addRef, compact }) {
  const boundary = wakeMinute(data, row)
  const blocks = [...row.blocks].sort((a, b) => a.start - b.start)
  const running = isToday ? blocks.find((b) => b.end == null) : null
  const [focusId, setFocusId] = useState(null)
  const [catPick, setCatPick] = useState(null)

  const durations = blocks.map((b) => { const e = blockEnd(b, isToday, nowMin); return e == null ? null : Math.max(0, e - b.start) })
  const total = durations.reduce((a, b) => a + (b || 0), 0)

  if (addRef) addRef.current = () => addBlock()
  const addBlock = () => {
    const last = blocks[blocks.length - 1]
    const start = last ? (blockEnd(last, isToday, nowMin) ?? last.start + 30) : (row.cells.start ?? boundary)
    const id = bid()
    editBlocks(row.id, (r, bs) => bs.push({ id, start, end: start + 30, cats: [], text: '', plan: null }))
    setFocusId(id)
  }

  const quick = (catId) => setFocusId(startBlock(row.id, catId, nowMinutes(row.date)))

  const used = {}
  for (const b of data.rows.slice(-30).flatMap((r) => r.blocks)) for (const c of b.cats || []) used[c] = (used[c] || 0) + 1

  return (
    <section className="tb">
      <div className="section-head">
        <h3>Time Blocks</h3>
        <span className="section-meta">{blocks.length ? `${fmtDuration(total)} tracked · ${blocks.length} block${blocks.length > 1 ? 's' : ''}` : 'Nothing logged yet'}</span>
      </div>

      {isToday && !compact && (
        <div className="quick">
          {running ? (
            <div className="running">
              <span className="pulse" style={{ '--c': blockColor(data, running) }} />
              <span className="running-label">{running.cats.map((c) => { const m = catMeta(data, c); return `${m.emoji} ${m.name}` }).join(' · ') || 'Untitled block'}</span>
              <span className="running-time num">{fmtDuration(nowMin - running.start)}</span>
              <button className="btn" onClick={() => stopRunning(row.id, nowMinutes(row.date))}>■ Stop</button>
              <button className="btn ghost" onClick={() => stopRunning(row.id, nowMinutes(row.date), true)}>☾ End day</button>
            </div>
          ) : (
            <div className="quick-hint">Tap what you're starting now. The previous block ends automatically.</div>
          )}
          <div className="quick-cats">
            {data.groups.map((g) => {
              const cats = data.categories.filter((c) => c.group === g.id && !c.archived).sort((a, b) => (used[b.id] || 0) - (used[a.id] || 0))
              if (!cats.length) return null
              return (
                <div key={g.id} className="quick-group">
                  <span className="quick-group-name" style={{ color: COLORS[g.color] }}>{g.name}</span>
                  {cats.map((c) => (
                    <button key={c.id} className={`quick-cat ${running?.cats?.[0] === c.id ? 'on' : ''}`} style={{ '--c': COLORS[g.color] }} onClick={() => quick(c.id)}>
                      <CatIcon c={c} />{c.name}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {blocks.length > 0 && !compact && <Ribbon blocks={blocks} data={data} row={row} isToday={isToday} nowMin={nowMin} />}

      {blocks.length > 0 && (
        <div className="tb-list">
          <div className="tb-row tb-headrow">
            <span /><span>Time</span><span>Length</span><span>Category</span><span>Activity / reason</span><span>Plan</span><span>Sync log</span><span />
          </div>
          {blocks.map((b, i) => (
            <BlockRow
              key={b.id}
              b={b}
              dur={durations[i]}
              data={data}
              rowId={row.id}
              boundary={boundary}
              row={row}
              isRunning={running?.id === b.id}
              autoFocus={focusId === b.id}
              onPickCats={(el) => setCatPick({ id: b.id, el })}
            />
          ))}
        </div>
      )}

      {blocks.length > 1 && !compact && <Totals blocks={blocks} durations={durations} data={data} />}

      {catPick && (() => {
        const b = row.blocks.find((x) => x.id === catPick.id)
        if (!b) return null
        return (
          <SelectEditor
            anchor={catPick.el}
            multi
            value={b.cats}
            options={data.categories.filter((c) => !c.archived || b.cats.includes(c.id)).map((c) => ({ id: c.id, name: c.name, label: <><CatIcon c={c} />{c.name}</>, color: catMeta(data, c.id).color }))}
            onChange={(ids) => editBlocks(row.id, (r) => { r.blocks.find((x) => x.id === b.id).cats = ids })}
            onCreate={(name) => {
              const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 5)
              update((d) => { d.categories.push({ id, emoji: '', name, group: d.groups[0]?.id }) })
              return id
            }}
            onClose={() => setCatPick(null)}
          />
        )
      })()}
    </section>
  )
}

function TimeInput({ value, boundary, onCommit, placeholder, className = '' }) {
  const [v, setV] = useState(value == null ? '' : fmtClock(value))
  const [bad, setBad] = useState(false)
  useEffect(() => { setV(value == null ? '' : fmtClock(value)); setBad(false) }, [value])
  const commit = () => {
    if (!v.trim()) { if (value != null) onCommit(null); return }
    const m = parseClock(v)
    if (m == null) { setBad(true); return }
    const n = normalizeClock(m, boundary)
    if (n !== value) onCommit(n)
    else setV(fmtClock(n))
  }
  return (
    <input
      className={`time-input ${bad ? 'bad' : ''} ${className}`}
      value={v}
      placeholder={placeholder}
      onChange={(e) => { setV(e.target.value); setBad(false) }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setV(value == null ? '' : fmtClock(value)); e.currentTarget.blur() } }}
    />
  )
}

function AutoText({ value, onCommit, placeholder, autoFocus }) {
  const [v, setV] = useState(value || '')
  const ref = useRef(null)
  useEffect(() => setV(value || ''), [value])
  useLayoutEffect(() => { const el = ref.current; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }, [v])
  useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus])
  return (
    <textarea
      ref={ref}
      rows={1}
      className="auto-text"
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== (value || '')) onCommit(v.replace(/\s+$/, '')) }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() } }}
    />
  )
}

function BlockRow({ b, dur, data, row, rowId, boundary, isRunning, autoFocus, onPickCats }) {
  const [menu, setMenu] = useState(null)
  const set = (patch) => editBlocks(rowId, (r) => Object.assign(r.blocks.find((x) => x.id === b.id), patch))
  const [planText, setPlanText] = useState(b.plan == null ? '' : fmtDuration(b.plan))
  useEffect(() => setPlanText(b.plan == null ? '' : fmtDuration(b.plan)), [b.plan])
  const delta = b.plan != null && dur != null ? dur - b.plan : null
  const color = blockColor(data, b)
  const split = b.cats.length > 1 && dur != null
  const commitSplit = (cat, min) => {
    const next = Object.fromEntries(Object.entries(b.split || {}).filter(([c]) => b.cats.includes(c) && c !== cat))
    if (min != null) {
      next[cat] = Math.max(0, Math.min(min, dur))
      const others = b.cats.filter((c) => c !== cat)
      if (others.every((c) => next[c] != null)) delete next[others[others.length - 1]]
    }
    set({ split: Object.keys(next).length ? next : undefined })
  }
  return (
    <div className={`tb-row ${isRunning ? 'is-running' : ''}`}>
      <span className="tb-bar" style={{ background: color }} />
      <span className={`tb-time ${split ? 'stacked' : ''}`}>
        <span className="tb-time-line">
          <TimeInput value={b.start} boundary={boundary} onCommit={(m) => m != null && set({ start: m })} />
          <span className="arrow">→</span>
          {isRunning ? <span className="now-tag">now</span> : <TimeInput value={b.end} boundary={boundary} placeholder="End" onCommit={(m) => set({ end: m == null ? null : Math.max(m, b.start) })} />}
        </span>
        {split && <span className="tb-total num">{fmtDuration(dur)}</span>}
      </span>
      {split ? (
        <span className="tb-dur tb-split num">
          {blockShares(b, dur).map(({ cat, min }) => <SplitLength key={cat} value={min} typed={b.split?.[cat] != null} onCommit={(v) => commitSplit(cat, v)} />)}
        </span>
      ) : <span className="tb-dur num">{dur != null ? fmtDuration(dur) : '—'}</span>}
      <span className={`tb-cats ${split ? 'stacked' : ''}`} onClick={(e) => onPickCats(e.currentTarget)}>
        {b.cats.length ? b.cats.map((c) => { const m = catMeta(data, c); return <span key={c} className="tb-cat-line"><Chip color={m.color}><CatIcon c={m} />{m.name}</Chip></span> }) : <span className="placeholder">+ Category</span>}
      </span>
      <AutoText value={b.text} placeholder="" autoFocus={autoFocus} onCommit={(text) => editBlocks(rowId, (r) => {
        const x = r.blocks.find((y) => y.id === b.id)
        x.text = text
        const e = x.syncItem && findEntry(r, x.syncItem)
        if (e && text.trim()) e.item.text = text.trim()
        if (x.syncText && text.trim()) {
          const lines = textLines(r.cells[x.syncText.field])
          const i = lines.indexOf(x.syncText.line)
          if (i >= 0) { lines[i] = text.trim(); r.cells[x.syncText.field] = lines.join('\n'); x.syncText.line = text.trim() }
        }
      })} />
      <span className="tb-plan">
        <input
          className={`plan-input ${delta != null && delta <= 5 ? 'ok' : ''}`}
          value={planText}
          placeholder="Plan"
          onChange={(e) => setPlanText(e.target.value)}
          onBlur={() => { const p = parseDuration(planText); if (!planText.trim()) set({ plan: null }); else if (p != null) { set({ plan: p }); setPlanText(fmtDuration(p)) } else setPlanText(b.plan == null ? '' : fmtDuration(b.plan)) }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {delta != null && (
          <span className={`delta ${delta <= 5 ? 'ok' : 'over'}`}>{delta <= 5 ? '✓' : `+${fmtDuration(delta)}`}</span>
        )}
      </span>
      <SyncCell b={b} row={row} data={data} rowId={rowId} />
      <button className="row-more" onClick={(e) => setMenu(e.currentTarget)}>⋯</button>
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)} align="right" width={180}>
          <Menu onPick={() => setMenu(null)} items={[
            ...(isRunning ? [] : [{ icon: 'play', label: 'Resume (reopen end)', run: () => set({ end: null }) }]),
            { icon: 'duplicate', label: 'Duplicate', run: () => editBlocks(rowId, (r) => { const src = r.blocks.find((x) => x.id === b.id); const s = src.end ?? src.start; r.blocks.push({ ...src, id: bid(), start: s, end: src.end == null ? null : s + (src.end - src.start) }) }) },
            '-',
            { icon: 'x', label: 'Delete block', danger: true, run: () => editBlocks(rowId, (r) => { r.blocks = r.blocks.filter((x) => x.id !== b.id) }) },
          ]} />
        </Popover>
      )}
    </div>
  )
}

// SyncCell — Sync log toggle and where the synced line goes in the month table
function SyncCell({ b, row, data, rowId }) {
  const [menu, setMenu] = useState(null)
  const at = syncPlace(row, b)
  const type = data.fields.find((f) => f.id === at?.field)?.type
  const isText = at?.text || at?.item?.kind === 'text'
  return (
    <span className="tb-sync">
      <Toggle on={!!at} onChange={(v) => setSync(rowId, b.id, v)} />
      {at && <button className="row-more tb-sync-more" title="Sync options" onClick={(ev) => setMenu(ev.currentTarget)}>⋯</button>}
      {menu && at && (
        <Popover anchor={menu} onClose={() => setMenu(null)} align="right" width={170}>
          <Menu onPick={() => setMenu(null)} items={[
            { icon: isText ? 'text' : 'checkbox', label: 'Type', sub: [
              ...(type !== 'text' ? [{ icon: 'checkbox', label: 'Checkbox', active: !isText, run: () => moveSync(rowId, b.id, { kind: 'todo' }) }] : []),
              ...(type !== 'todo' ? [{ icon: 'text', label: 'Text note', active: isText, run: () => type === 'mixed' && moveSync(rowId, b.id, { kind: 'text' }) }] : []),
            ] },
            { icon: 'layers', label: 'Column', sub: syncFields(data).map((f) => ({ label: f.name, active: f.id === at.field, run: () => f.id !== at.field && moveSync(rowId, b.id, { field: f.id }) })) },
          ]} />
        </Popover>
      )}
    </span>
  )
}

function SplitLength({ value, typed, onCommit }) {
  const [v, setV] = useState(fmtDuration(value))
  useEffect(() => setV(fmtDuration(value)), [value])
  const commit = () => {
    if (!v.trim()) return onCommit(null)
    const m = parseDuration(v)
    if (m == null || m === value) setV(fmtDuration(value))
    else onCommit(m)
  }
  return (
    <input className={`plan-input split-input num ${typed ? 'typed' : ''}`} value={v} title="Type a length. Clear it to share the time equally."
      onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setV(fmtDuration(value)); e.currentTarget.blur() } }} />
  )
}

function Ribbon({ blocks, data, row, isToday, nowMin, compact }) {
  const ends = blocks.map((b) => blockEnd(b, isToday, nowMin) ?? b.start + 15)
  let lo = Math.min(...blocks.map((b) => b.start), row.cells.start ?? Infinity)
  let hi = Math.max(...ends, row.cells.end ?? -Infinity, isToday ? nowMin : -Infinity)
  lo = Math.floor(lo / 60) * 60
  hi = Math.ceil(hi / 60) * 60
  if (hi - lo < 480) hi = lo + 480
  const span = hi - lo
  const step = span > 960 ? 180 : span > 600 ? 120 : 60
  const ticks = []
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t)
  const pctOf = (m) => `${((m - lo) / span) * 100}%`
  const [bind, tipEl] = useTip()
  return (
    <div className={`ribbon ${compact ? 'compact' : ''}`}>
      <div className="ribbon-track">
        {ticks.map((t) => <span key={t} className="ribbon-tick" style={{ left: pctOf(t) }} />)}
        {row.cells.start != null && <span className="ribbon-mark" style={{ left: pctOf(row.cells.start) }} {...bind(<><b>Start</b><div>{fmtClock(row.cells.start)}</div></>)} />}
        {row.cells.end != null && <span className="ribbon-mark end" style={{ left: pctOf(row.cells.end) }} {...bind(<><b>End</b><div>{fmtClock(row.cells.end)}</div></>)} />}
        {blocks.map((b, i) => {
          const m = catMeta(data, b.cats?.[0])
          const e = ends[i]
          return (
            <span
              key={b.id}
              className={`ribbon-seg ${b.end == null && isToday ? 'live' : ''}`}
              style={{ left: pctOf(b.start), width: `calc(${((e - b.start) / span) * 100}% - 1px)`, background: COLORS[m.color] }}
              {...bind(<><b>{b.cats.length ? b.cats.map((c) => <span key={c}><CatIcon c={catMeta(data, c)} />{catMeta(data, c).name} </span>) : 'Block'}</b><div>{fmtClock(b.start)} → {fmtClock(e)} · {fmtDuration(e - b.start)}</div>{b.text && <div className="muted">{b.text}</div>}</>)}
            />
          )
        })}
        {isToday && <span className="ribbon-now" style={{ left: pctOf(nowMin) }} />}
      </div>
      {tipEl}
      {!compact && (
        <div className="ribbon-labels">
          {ticks.map((t) => <span key={t} style={{ left: pctOf(t) }}>{fmtClock(t, { compact: true }).replace(' ', '').toLowerCase()}</span>)}
        </div>
      )}
    </div>
  )
}

function Totals({ blocks, durations, data }) {
  const byGroup = {}
  const byCat = {}
  const countCat = {}
  let planned = 0
  let onPlan = 0
  blocks.forEach((b, i) => {
    const d = durations[i] || 0
    for (const [g, v] of Object.entries(groupShares(data, b, d))) byGroup[g] = (byGroup[g] || 0) + v
    for (const { cat, min } of blockShares(b, d)) { const c = cat ?? 'none'; byCat[c] = (byCat[c] || 0) + min; countCat[c] = (countCat[c] || 0) + 1 }
    if (b.plan != null && durations[i] != null) { planned++; if (durations[i] - b.plan <= 5) onPlan++ }
  })
  const total = Object.values(byGroup).reduce((a, b) => a + b, 0) || 1
  const [bind, tipEl] = useTip()
  const [sort, setSort] = useState({ key: 'time', dir: -1 })
  const catRows = Object.entries(byCat).filter(([c]) => c !== 'none').map(([c, v]) => {
    const m = catMeta(data, c)
    const grp = data.groups.find((x) => x.id === m.group)
    return { c, v, m, grp, n: countCat[c], color: COLORS[grp?.color] || COLORS.gray }
  })
  const sortVal = { name: (r) => r.m.name.toLowerCase(), group: (r) => (r.grp?.name || '').toLowerCase(), blocks: (r) => r.n, time: (r) => r.v, share: (r) => r.v }
  catRows.sort((a, b) => { const x = sortVal[sort.key](a), y = sortVal[sort.key](b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || b.v - a.v })
  const th = (key, label, cls = '') => (
    <th className={`${cls} sortable ${sort.key === key ? 'on' : ''}`} onClick={() => setSort(sort.key === key ? { key, dir: -sort.dir } : { key, dir: ['name', 'group'].includes(key) ? 1 : -1 })}>
      {label}{sort.key === key && <span className="sort-arrow">{sort.dir > 0 ? '↑' : '↓'}</span>}
    </th>
  )
  return (
    <div className="totals">
      {tipEl}
      <div className="stack-bar">
        {Object.entries(byGroup).sort((a, b) => b[1] - a[1]).map(([g, v]) => {
          const grp = data.groups.find((x) => x.id === g)
          return <span key={g} style={{ width: `${(v / total) * 100}%`, background: COLORS[grp?.color] || COLORS.gray }} {...bind(<><b>{grp?.name || 'Uncategorised'}</b><div>{fmtDuration(v)} · {Math.round((v / total) * 100)}%</div></>)} />
        })}
      </div>
      <div className="totals-list">
        {Object.entries(byGroup).sort((a, b) => b[1] - a[1]).map(([g, v]) => {
          const grp = data.groups.find((x) => x.id === g)
          return (
            <span key={g} className="total-item">
              <span className="dot" style={{ background: COLORS[grp?.color] || COLORS.gray }} />
              {grp?.name || 'Uncategorised'} <b className="num">{fmtDuration(v)}</b>
            </span>
          )
        })}
        {planned > 0 && <span className="total-item muted">On plan {onPlan}/{planned}</span>}
      </div>
      <table className="cat-table">
        <thead>
          <tr>{th('name', 'Category')}{th('group', 'Group')}{th('blocks', 'Blocks', 'c')}{th('time', 'Time', 'r')}{th('share', 'Share', 'share')}</tr>
        </thead>
        <tbody>
          {catRows.map(({ c, v, m, grp, color }) => {
            return (
              <tr key={c}>
                <td><CatIcon c={m} />{m.name}</td>
                <td className="muted"><span className="dot" style={{ background: color }} />{grp?.name || '—'}</td>
                <td className="c num muted">{countCat[c]}</td>
                <td className="r num">{fmtDuration(v)}</td>
                <td className="share"><div className="share-cell"><span className="share-bar"><span style={{ width: `${(v / total) * 100}%`, background: color }} /></span><span className="num muted">{Math.round((v / total) * 100)}%</span></div></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
