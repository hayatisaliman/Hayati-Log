import { useEffect, useMemo, useRef, useState } from 'react'
import { MONTHS, fmtClock, longDate, monthKey, nowMinutes } from '../lib/time.js'
import { getData, update } from '../lib/store.js'
import { createGroup, createNote, deleteGroup, deleteNote, moveGroup, moveNote, noteTitle, patchGroup, patchNote } from '../lib/notes.js'
import { catMeta, elapsedSec, pauseRunning, resumePaused, startBlock, stopRunning } from './TimeBlocks.jsx'
import { Popover, Menu } from './Popover.jsx'
import { BrandMark, Icon, IconPicker } from './icons.jsx'
import { weeklyMonths } from './WeeklyPlan.jsx'
import { addChoreSection, choresTitle } from './Chores.jsx'
import { COLORS, cellText, MEMO_COLOR_NAMES, DEFAULT_MEMO_COLORS, hueName } from '../lib/schema.js'
import { BlockEditor, blocksToText } from './NoteEditor.jsx'

function usePref(key, init) {
  const [v, setV] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : init } catch { return init }
  })
  const set = (next) => { setV(next); try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* private mode */ } }
  return [v, set]
}

const savedLabel = (ts) => {
  const d = new Date(ts)
  return `${fmtClock(d.getHours() * 60 + d.getMinutes())}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`
}

function groupByYear(months) {
  const by = {}
  for (const m of months) (by[m.slice(0, 4)] = by[m.slice(0, 4)] || []).push(m)
  return Object.entries(by).sort((a, b) => b[0].localeCompare(a[0])).map(([y, ms]) => [y, [...ms].reverse()])
}

const nextMonth = (key) => {
  const [y, m] = key.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export function Sidebar({ data, view, setView, onWeekMonth, month, setMonth, now, status, onGoToDay, openNoteId, onOpenNote, searchRef }) {
  const [closedYears, setClosedYears] = usePref('hr.closedYears', [])
  const [allMonthYears, setAllMonthYears] = usePref('hr.allMonthYears', [])
  const [yearMenu, setYearMenu] = useState(null)

  const months = useMemo(() => {
    const set = new Set([...data.rows.map((r) => monthKey(r.date)), ...(data.months || []), monthKey(now.today)])
    return [...set].sort()
  }, [data.rows, data.months, now.today])
  const years = useMemo(() => groupByYear(months), [months])

  const addMonth = (e) => {
    e.stopPropagation()
    const next = nextMonth(months[months.length - 1])
    update((d) => { d.months = [...new Set([...(d.months || []), next])] })
    setClosedYears(closedYears.filter((y) => y !== next.slice(0, 4)))
    setMonth(next)
    setView('table')
  }

  const addWeekMonth = (e) => {
    e.stopPropagation()
    const next = nextMonth(weeklyMonths(data, now.today)[0])
    update((d) => { d.weekMonths = [...new Set([...(d.weekMonths || []), next])] })
    onWeekMonth(next)
  }

  const showGoals = data.settings.sidebarGoals !== false
  const removable = (m) => (data.months || []).includes(m) && m !== monthKey(now.today)
    && !data.rows.some((r) => r.date.startsWith(m)) && !data.monthGoals?.[m]
  const removeMonth = (m) => {
    update((d) => { d.months = (d.months || []).filter((x) => x !== m) })
    if (month === m) setMonth(monthKey(now.today))
  }

  const todayRow = data.rows.find((r) => r.date === now.today)
  const running = todayRow?.blocks.find((b) => b.end == null)
  const paused = running ? null : todayRow?.blocks.find((b) => b.paused)
  const active = running || paused
  const [watchMenu, setWatchMenu] = useState(null)
  const [startMenu, setStartMenu] = useState(null)

  const [newMemo, setNewMemo] = useState(null)
  const addMemo = () => {
    const id = `m-${Date.now().toString(36)}`
    update((d) => { d.memos = [...(d.memos || []), { id, text: '' }] })
    setNewMemo(id)
  }

  return (
    <aside className="sidebar">
      <div className="drag-region" data-tauri-drag-region />
      <div className="brand">
        <BrandMark />
        <span>Hayati Log</span>
        <Search data={data} onGoToDay={onGoToDay} onOpenNote={onOpenNote} inputRef={searchRef} />
        <button className="icon-btn memo-add" title="New memo" onClick={addMemo}><Icon name="plus" size={14} /></button>
      </div>

      {(data.memos || []).map((m) => <Memo key={m.id} memo={m} autoFocus={m.id === newMemo} />)}

      <div className="side-scroll">
        <div className={`notes-head log-head ${view === 'table' ? 'on' : ''}`} onClick={() => setView('table')}>
          <span>Daily log</span>
          <span className="nav-actions">
          <button className={`nav-add ${showGoals ? 'on' : ''}`} title={showGoals ? 'Hide goals in sidebar' : 'Show goals in sidebar'}
            onClick={(e) => { e.stopPropagation(); update((d) => { d.settings.sidebarGoals = !showGoals }) }}>
            <Icon name={showGoals ? 'eye' : 'eye-off'} size={14} />
          </button>
          <button className="nav-add" title="Add next month" onClick={addMonth}><Icon name="plus" size={14} /></button>
          </span>
        </div>
        <div className="nav-sub">
          {years.map(([y, ms]) => {
            const closed = closedYears.includes(y)
            const all = allMonthYears.includes(y)
            const latest = [...ms].sort().slice(-2)
            const shown = all ? ms : ms.filter((m) => latest.includes(m) || (view === 'table' && month === m))
            return (
              <div key={y} className="year">
                <div role="button" className="nav-year" onClick={() => setClosedYears(closed ? closedYears.filter((x) => x !== y) : [...closedYears, y])}>
                  <span className={`caret ${closed ? '' : 'open'}`}><Icon name="chevron" size={11} /></span>{y}
                  {ms.length > latest.length && <button className="row-more" onClick={(e) => { e.stopPropagation(); setYearMenu({ y, el: e.currentTarget }) }}>⋯</button>}
                </div>
                {!closed && shown.map((m) => (
                  <button className={`nav-month ${view === 'table' && month === m ? 'on' : ''}`} onClick={() => { setMonth(m); setView('table') }}>
                    <span className="nav-month-name">
                      {MONTHS[+m.slice(5) - 1]}
                      {removable(m) && (
                        <span role="button" className="nav-undo" title="Remove this empty month" onClick={(e) => { e.stopPropagation(); removeMonth(m) }}>
                          <Icon name="undo" size={13} />
                        </span>
                      )}
                    </span>
                    {showGoals && data.monthGoals?.[m] && <span className="nav-goals">{data.monthGoals[m]}</span>}
                  </button>
                ))}
              </div>
            )
          })}
          {yearMenu && (() => {
            const all = allMonthYears.includes(yearMenu.y)
            return (
              <Popover anchor={yearMenu.el} onClose={() => setYearMenu(null)} width={180}>
                <Menu onPick={() => setYearMenu(null)} items={[
                  { icon: 'calendar', label: all ? 'View recent months' : 'View all months', run: () => {
                    setAllMonthYears(all ? allMonthYears.filter((x) => x !== yearMenu.y) : [...allMonthYears, yearMenu.y])
                    setClosedYears(closedYears.filter((x) => x !== yearMenu.y))
                  } },
                ]} />
              </Popover>
            )
          })()}
        </div>
        <div role="button" className={`nav ${view === 'weekly' ? 'on' : ''}`} onClick={() => setView('weekly')}>
          <span className="nav-ico"><Icon name="layers" /></span>Weekly Plan
          <button className="nav-add" title="Plan next month" onClick={addWeekMonth}><Icon name="plus" size={14} /></button>
        </div>
        <button className={`nav ${view === 'report' ? 'on' : ''}`} onClick={() => setView('report')}><span className="nav-ico"><Icon name="calendar-check" /></span>Monthly Report</button>
        <button className={`nav ${view === 'quarters' ? 'on' : ''}`} onClick={() => setView('quarters')}><span className="nav-ico"><Icon name="pie" /></span>Quarterly Report</button>
        <button className={`nav ${view === 'blocks' ? 'on' : ''}`} onClick={() => setView('blocks')}><span className="nav-ico"><Icon name="stopwatch" /></span>Time Blocks</button>
        <ChoresNav data={data} on={view === 'chores'} onOpen={() => setView('chores')} />

        <NotesTree data={data} openNoteId={openNoteId} onOpenNote={onOpenNote} />
      </div>

      <div className="side-bottom">
        {active && (
          <div className="side-running" onClick={() => setView('blocks')}>
            <span className="side-running-label">{active.cats.map((c) => { const m = catMeta(data, c); return `${m.emoji} ${m.name}` }).join(' · ') || 'Running block'}</span>
            <Stopwatch day={now.today} block={active} onClick={(e) => { e.stopPropagation(); setWatchMenu(e.currentTarget) }} />
          </div>
        )}
        {!active && (
          <button className={`nav side-start ${startMenu ? 'on' : ''}`} title="Start a time block" onClick={(e) => setStartMenu(e.currentTarget.querySelector('.nav-add'))}>
            <span className="nav-ico"><Icon name="stopwatch" /></span>
            <span className="grow">{data.settings.startLabel || 'Bismillah'}</span>
            <span className="nav-add"><Icon name="chevron" size={13} /></span>
          </button>
        )}
        {startMenu && !active && (
          <StartMenu data={data} anchor={startMenu} onClose={() => setStartMenu(null)}
            onPick={(catId) => { startBlock(todayRow?.id || `r-${now.today}`, catId, nowMinutes(now.today)); setStartMenu(null) }} />
        )}
        {watchMenu && active && (
          <Popover anchor={watchMenu} onClose={() => setWatchMenu(null)} align="right" width={150}>
            <Menu onPick={() => setWatchMenu(null)} items={[
              running
                ? { icon: 'pause', label: 'Pause', run: () => pauseRunning(todayRow.id, nowMinutes(now.today)) }
                : { icon: 'play', label: 'Resume', run: () => resumePaused(todayRow.id, nowMinutes(now.today)) },
              { icon: 'stop', label: 'Stop', run: () => stopRunning(todayRow.id, nowMinutes(now.today)) },
            ]} />
          </Popover>
        )}
        <div className="side-foot">
          <div className={`save-status ${status.error ? 'err' : ''}`} title={status.file}>
            {status.error ? status.error : status.saving ? 'Saving…' : status.savedAt ? `Last saved: ${savedLabel(status.savedAt)}` : 'Local file'}
          </div>
          <button className={`nav-add ${view === 'settings' ? 'on' : ''}`} title="Settings" onClick={() => setView('settings')}><Icon name="gear" size={14} /></button>
        </div>
      </div>
    </aside>
  )
}

// StartMenu — group › category picker that starts a time block
function StartMenu({ data, anchor, onClose, onPick }) {
  const groups = data.groups.map((g) => ({ g, cats: data.categories.filter((c) => !c.archived && c.group === g.id) })).filter((x) => x.cats.length)
  const [active, setActive] = useState(groups[0]?.g.id)
  const cur = groups.find((x) => x.g.id === active) || groups[0]
  return (
    <Popover anchor={anchor} onClose={onClose} align="right" width={330}>
      <div className="move-panel">
        <div className="move-col">
          <div className="move-head">Group</div>
          {groups.map(({ g }) => (
            <button key={g.id} className={`menu-item ${g.id === cur?.g.id ? 'active' : ''}`} onMouseEnter={() => setActive(g.id)} onClick={() => setActive(g.id)}>
              <span className="swatch" style={{ background: COLORS[g.color] || COLORS.gray }} /><span>{g.name}</span><span className="menu-hint">›</span>
            </button>
          ))}
        </div>
        <div className="move-col">
          <div className="move-head">Start</div>
          {cur?.cats.map((c) => (
            <button key={c.id} className="menu-item" onClick={() => onPick(c.id)}><span>{c.emoji} {c.name}</span></button>
          ))}
        </div>
      </div>
    </Popover>
  )
}

// Stopwatch — live h m s since the running block started
function Stopwatch({ day, block, onClick }) {
  const [, tick] = useState(0)
  useEffect(() => { if (block.paused) return; const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t) }, [block.paused])
  const sec = elapsedSec(day, block)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const text = h ? `${h}h ${m}m ${sec % 60}s` : m ? `${m}m ${sec % 60}s` : `${sec}s`
  return <button className={`num side-stopwatch ${block.paused ? 'paused' : ''}`} title={block.paused ? 'Paused' : 'Pause or stop'} onClick={onClick}>{text}</button>
}

function snippet(text, q) {
  const i = text.toLowerCase().indexOf(q)
  if (i < 0) return text.slice(0, 60)
  const s = Math.max(0, i - 24)
  return `${s ? '…' : ''}${text.slice(s, i + q.length + 36).replace(/\n/g, ' · ')}`
}

// ChoresNav — sidebar entry with rename / new section menu
function ChoresNav({ data, on, onOpen }) {
  const [menu, setMenu] = useState(null)
  const [renaming, setRenaming] = useState(false)
  const [iconPick, setIconPick] = useState(false)
  const icoRef = useRef(null)
  const title = choresTitle(data)
  const rename = (v) => {
    const next = v.trim()
    if (next && next !== title) update((d) => { d.settings.choresTitle = next })
    setRenaming(false)
  }
  return (
    <div role="button" className={`nav ${on ? 'on' : ''}`} onClick={(e) => { if (!renaming && e.currentTarget.contains(e.target)) onOpen() }}>
      <span className="nav-ico" ref={icoRef}><Icon name={data.settings.choresIcon || 'clipboard-check'} /></span>
      {renaming ? (
        <input autoFocus className="group-input" defaultValue={title}
          onFocus={(e) => e.target.select()}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => rename(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false) }} />
      ) : <span className="grow nav-title">{title}</span>}
      {!renaming && <button className="row-more" onClick={(e) => { e.stopPropagation(); setMenu(e.currentTarget) }}>⋯</button>}
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)} width={180}>
          <Menu onPick={() => setMenu(null)} items={[
            { icon: 'pen-line', label: 'Rename', run: () => setRenaming(true) },
            { icon: 'smile', label: 'Change icon', run: () => setIconPick(true) },
            { icon: 'plus', label: 'New section page', run: () => { addChoreSection(); onOpen() } },
          ]} />
        </Popover>
      )}
      {iconPick && (
        <IconPicker anchor={icoRef.current} value={data.settings.choresIcon} onClose={() => setIconPick(false)}
          onPick={(icon) => update((d) => { d.settings.choresIcon = icon || undefined })} />
      )}
    </div>
  )
}

// Memo — sidebar sticker, removed when left empty
function Memo({ memo, autoFocus }) {
  const wrapRef = useRef(null)
  const editor = useRef(null)
  const [picker, setPicker] = useState(null)
  const color = MEMO_COLOR_NAMES.includes(memo.color) ? memo.color : 'm1'
  const timer = useRef(null)
  const pending = useRef(null)
  const initial = useMemo(() => {
    if (memo.blocks?.length) return memo.blocks
    if (!memo.text?.trim()) return undefined
    return memo.text.split('\n').map((l) => (l.startsWith('• ') ? { type: 'bulletListItem', content: l.slice(2) } : { type: 'paragraph', content: l }))
  }, [memo.id])
  const save = () => {
    clearTimeout(timer.current)
    if (!pending.current) return
    const blocks = pending.current
    pending.current = null
    update((d) => { const m = (d.memos || []).find((x) => x.id === memo.id); if (m) { m.blocks = blocks; m.text = blocksToText(blocks) } }, { fromEditor: true })
  }
  const remove = () => { clearTimeout(timer.current); pending.current = null; update((d) => { d.memos = (d.memos || []).filter((x) => x.id !== memo.id) }) }
  useEffect(() => { if (autoFocus) setTimeout(() => editor.current?.focus(), 0) }, [autoFocus])
  useEffect(() => save, [])
  return (
    <div className="memo" ref={wrapRef} style={{ background: `var(--memo-${color})`, color: `var(--memo-${color}-text)` }} onBlur={(e) => {
      if (wrapRef.current.contains(e.relatedTarget) || picker) return
      save()
      if (!blocksToText(editor.current?.document || []).trim()) remove()
    }}>
      <BlockEditor
        docId={memo.id}
        initial={initial}
        editorRef={editor}
        className="note-blocks memo-blocks"
        placeholder="Memo"
        noSideMenu
        onChange={(blocks) => { pending.current = blocks; clearTimeout(timer.current); timer.current = setTimeout(save, 600) }}
      />
      <button className="row-more memo-more" onMouseDown={(e) => e.preventDefault()} onClick={(e) => setPicker(e.currentTarget)}>⋯</button>
      {picker && (
        <Popover anchor={picker} onClose={() => setPicker(null)} width={196}>
          <div className="memo-swatches">
            {MEMO_COLOR_NAMES.map((n) => (
              <button key={n} title={hueName(getData().settings.memoColors?.[n] || DEFAULT_MEMO_COLORS[n])} className={`memo-swatch ${n === color ? 'on' : ''}`} style={{ background: `var(--memo-${n})` }}
                onClick={() => { update((d) => { const m = (d.memos || []).find((x) => x.id === memo.id); if (m) m.color = n }); setPicker(null) }} />
            ))}
          </div>
          <div className="menu-sep" />
          <Menu onPick={() => setPicker(null)} items={[{ icon: 'x', label: 'Delete memo', danger: true, run: remove }]} />
        </Popover>
      )}
    </div>
  )
}

function Search({ data, onGoToDay, onOpenNote, inputRef }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hi, setHi] = useState(0)
  const wrapRef = useRef(null)
  const query = q.trim().toLowerCase()

  const results = useMemo(() => {
    if (!query) return []
    const out = []
    for (const n of data.notes) {
      const hay = `${noteTitle(n)}\n${n.body}`
      if (hay.toLowerCase().includes(query)) out.push({ kind: 'note', id: n.id, title: noteTitle(n), sub: snippet(noteTitle(n).toLowerCase().includes(query) ? n.body || '' : n.body, query) })
      if (out.length >= 6) break
    }
    const days = []
    for (const r of [...data.rows].sort((a, b) => b.date.localeCompare(a.date))) {
      const texts = [...Object.values(r.cells).filter((v) => typeof v === 'string' || (Array.isArray(v) && typeof v[0] === 'object')).map(cellText), ...r.blocks.map((b) => b.text || '')]
      const hit = texts.find((t) => t.toLowerCase().includes(query)) || (r.date.includes(query) ? texts[0] || '' : null)
      if (hit != null) days.push({ kind: 'day', id: r.id, title: longDate(r.date), sub: snippet(hit, query) })
      if (days.length >= 8) break
    }
    return [...out, ...days]
  }, [query, data])

  useEffect(() => {
    const down = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [])

  const pick = (r) => {
    if (!r) return
    if (r.kind === 'note') onOpenNote(r.id)
    else onGoToDay(r.id)
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div className="side-search" ref={wrapRef}>
      <div className={`search ${focused || q ? 'open' : ''}`} title="Search" onClick={() => inputRef.current?.focus()}>
        <span className="search-ico"><Icon name="search" size={14} /></span>
        <input
          ref={inputRef}
          placeholder="Search"
          value={q}
          tabIndex={focused || q ? 0 : -1}
          onFocus={() => { setFocused(true); setOpen(true) }}
          onBlur={() => setFocused(false)}
          onChange={(e) => { setQ(e.target.value); setHi(0); setOpen(true) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(results.length - 1, h + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
            if (e.key === 'Enter') pick(results[hi])
            if (e.key === 'Escape') { setQ(''); e.currentTarget.blur() }
          }}
        />
        {q && <button className="chip-x" onClick={() => setQ('')}>×</button>}
      </div>
      {open && query && (
        <div className="search-results">
          {!results.length && <div className="empty-note">No matches</div>}
          {results.map((r, i) => (
            <button key={r.kind + r.id} className={`search-hit ${i === hi ? 'hi' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => pick(r)}>
              <span className="search-kind">{r.kind === 'note' ? '¶' : '▦'}</span>
              <span className="search-text">
                <span className="search-title">{r.title}</span>
                <span className="search-sub">{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NotesTree({ data, openNoteId, onOpenNote }) {
  const [drag, setDrag] = useState(null)
  const [drop, setDrop] = useState(null)
  const [menu, setMenu] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [iconPick, setIconPick] = useState(null)
  const loose = data.notes.filter((n) => !n.group || !data.noteGroups.some((g) => g.id === n.group))

  const posOf = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    return e.clientY < r.top + r.height / 2 ? 'before' : 'after'
  }
  const endDrag = () => { setDrag(null); setDrop(null) }

  const onNoteOver = (e, n) => {
    if (drag?.type !== 'note' || drag.id === n.id) return
    e.preventDefault()
    setDrop({ type: 'note', id: n.id, pos: posOf(e) })
  }
  const onGroupOver = (e, g) => {
    if (!drag) return
    e.preventDefault()
    if (drag.type === 'note') setDrop({ type: 'group', id: g.id, pos: 'into' })
    else if (drag.id !== g.id) setDrop({ type: 'group', id: g.id, pos: posOf(e) })
  }
  const doDrop = (e) => {
    e.preventDefault()
    if (!drag || !drop) return endDrag()
    if (drag.type === 'note') {
      if (drop.type === 'note') moveNote(drag.id, { noteId: drop.id, pos: drop.pos })
      else if (drop.type === 'group') moveNote(drag.id, { group: drop.id })
      else moveNote(drag.id, { group: null })
    } else if (drop.type === 'group' && drop.pos !== 'into') moveGroup(drag.id, drop.id, drop.pos)
    endDrag()
  }

  const noteRow = (n, nested) => (
    <div
      key={n.id}
      className={`note-row ${nested ? 'nested' : ''} ${openNoteId === n.id ? 'on' : ''} ${drop?.type === 'note' && drop.id === n.id ? `drop-${drop.pos}` : ''} ${drag?.id === n.id ? 'dragging' : ''}`}
      draggable
      onDragStart={(e) => { e.stopPropagation(); setDrag({ type: 'note', id: n.id }); e.dataTransfer.effectAllowed = 'move' }}
      onDragOver={(e) => onNoteOver(e, n)}
      onDrop={doDrop}
      onDragEnd={endDrag}
      onClick={() => onOpenNote(n.id)}
    >
      <button className="note-ico" title="Change icon" onClick={(e) => { e.stopPropagation(); setIconPick({ id: n.id, el: e.currentTarget }) }}><Icon name={n.icon || 'page'} size={15} /></button>
      <span className={`note-name ${n.title?.trim() ? '' : 'untitled'}`}>{noteTitle(n)}</span>
      <button className="row-more" onClick={(e) => { e.stopPropagation(); setMenu({ kind: 'note', id: n.id, el: e.currentTarget }) }}>⋯</button>
    </div>
  )

  return (
    <div className="notes-section">
      <div
        className={`notes-head ${drop?.type === 'root' ? 'drop-into' : ''}`}
        onDragOver={(e) => { if (drag?.type === 'note') { e.preventDefault(); setDrop({ type: 'root' }) } }}
        onDrop={doDrop}
      >
        <span>Notes</span>
        <span className="nav-actions">
        <button className="nav-add" title="New group" onClick={() => setRenaming(createGroup())}><Icon name="folder" size={14} /></button>
        <button className="nav-add" title="New note" onClick={() => onOpenNote(createNote(null), true)}><Icon name="plus" size={14} /></button>
        </span>
      </div>

      {data.noteGroups.map((g) => {
        const notes = data.notes.filter((n) => n.group === g.id)
        return (
          <div key={g.id} className="note-group">
            <div
              className={`group-row ${drop?.type === 'group' && drop.id === g.id ? `drop-${drop.pos}` : ''} ${drag?.id === g.id ? 'dragging' : ''}`}
              draggable={renaming !== g.id}
              onDragStart={(e) => { setDrag({ type: 'group', id: g.id }); e.dataTransfer.effectAllowed = 'move' }}
              onDragOver={(e) => onGroupOver(e, g)}
              onDrop={doDrop}
              onDragEnd={endDrag}
              onClick={() => renaming !== g.id && patchGroup(g.id, { collapsed: !g.collapsed })}
              onDoubleClick={() => setRenaming(g.id)}
            >
              <span className={`caret ${g.collapsed ? '' : 'open'}`}><Icon name="chevron" size={11} /></span>
              {renaming === g.id ? (
                <input
                  autoFocus
                  className="group-input"
                  defaultValue={g.name}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => { if (e.target.value.trim()) patchGroup(g.id, { name: e.target.value.trim() }); setRenaming(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null) }}
                />
              ) : <span className="group-name">{g.name}</span>}
              <button className="row-more" title="New note in group" onClick={(e) => { e.stopPropagation(); patchGroup(g.id, { collapsed: false }); onOpenNote(createNote(g.id), true) }}>+</button>
              <button className="row-more" onClick={(e) => { e.stopPropagation(); setMenu({ kind: 'group', id: g.id, el: e.currentTarget }) }}>⋯</button>
            </div>
            {!g.collapsed && notes.map((n) => noteRow(n, true))}
            {!g.collapsed && !notes.length && <div className="note-empty">Drop notes here</div>}
          </div>
        )
      })}

      {loose.map((n) => noteRow(n, false))}
      {!data.notes.length && !data.noteGroups.length && <div className="note-empty">No notes yet</div>}

      {iconPick && (
        <IconPicker anchor={iconPick.el} value={data.notes.find((n) => n.id === iconPick.id)?.icon} onClose={() => setIconPick(null)}
          onPick={(icon) => patchNote(iconPick.id, { icon: icon || undefined })} />
      )}

      {menu && (
        <Popover anchor={menu.el} onClose={() => setMenu(null)} width={200}>
          {menu.kind === 'note' ? (
            <Menu onPick={() => setMenu(null)} items={[
              ...data.noteGroups.map((g) => ({ icon: 'arrow-right', label: `Move to ${g.name}`, run: () => moveNote(menu.id, { group: g.id }) })),
              ...(data.notes.find((n) => n.id === menu.id)?.group ? [{ icon: 'arrow-out', label: 'Remove from group', run: () => moveNote(menu.id, { group: null }) }] : []),
              '-',
              { icon: 'x', label: 'Delete note', danger: true, run: () => { deleteNote(menu.id); if (openNoteId === menu.id) onOpenNote(null) } },
            ]} />
          ) : (
            <Menu onPick={() => setMenu(null)} items={[
              { icon: 'pen', label: 'Rename', run: () => setRenaming(menu.id) },
              { icon: 'plus', label: 'New note here', run: () => onOpenNote(createNote(menu.id), true) },
              '-',
              { icon: 'x', label: 'Delete group', danger: true, run: () => deleteGroup(menu.id) },
            ]} />
          )}
        </Popover>
      )}
    </div>
  )
}
