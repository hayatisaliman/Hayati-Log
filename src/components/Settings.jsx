import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Icon, IconPicker, isEmoji } from './icons.jsx'
import { COLORS, COLOR_NAMES, averageCycle, cycleHistory, cycleLen, periodLen, DEFAULT_PALETTE, NOTE_COLOR_NAMES, DEFAULT_NOTE_COLORS, hueName, ACCENT_USES, noteBgDefault, DEFAULT_CHECK_COLOR, DEFAULT_NOTE_BG_COLORS, DEFAULT_MENUBAR_COLORS, DEFAULT_START_LABEL, marksList } from '../lib/schema.js'
import { ColorSwatch } from './ColorPicker.jsx'
import { Chip } from './cells.jsx'
import { DatePicker } from './DatePicker.jsx'
import { CatIcon } from './TimeBlocks.jsx'
import { DAY_NAMES, fmtClock, isoOf, longDate } from '../lib/time.js'
import { update, replaceData, useStatus, listBackups, readBackup, exportData, fullData, MOD } from '../lib/store.js'
import { monthMarkdown, quarterMarkdown } from './reportMarkdown.js'
import { dailyLogCsv } from '../lib/csv.js'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const OpenCard = createContext({ open: null, setOpen: () => {} })

// SetCard — collapsible Settings card; opening one closes the others
function SetCard({ id, title, meta, children }) {
  const { open, setOpen } = useContext(OpenCard)
  const on = open === id
  return (
    <section className={`card set-card ${on ? 'open' : ''}`}>
      <button className="card-head set-card-head" aria-expanded={on} onClick={() => setOpen(on ? null : id)}>
        <h3>{title}</h3>{meta && <span className="section-meta">{meta}</span>}
        <span className="set-chev"><Icon name="chevron" size={14} /></span>
      </button>
      {on && <div className="set-card-body">{children}</div>}
    </section>
  )
}

export function Settings({ data, toast, now }) {
  const status = useStatus()
  const fileRef = useRef(null)
  const [newStart, setNewStart] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [open, setOpen] = useState(null)
  const [drag, setDrag] = useState(null)
  const [drop, setDrop] = useState(null)
  const [armed, setArmed] = useState(null)
  const s = data.settings
  const active = data.categories.filter((c) => !c.archived)
  const archived = data.categories.filter((c) => c.archived)
  const uses = {}
  for (const r of data.rows) for (const b of r.blocks) for (const c of b.cats || []) uses[c] = (uses[c] || 0) + 1

  const removeCategory = (c) => {
    if (uses[c.id]) {
      update((d) => { d.categories.find((x) => x.id === c.id).archived = true })
      toast(`Archived ${c.name}. Its ${uses[c.id]} old blocks are untouched.`)
    } else update((d) => { d.categories = d.categories.filter((x) => x.id !== c.id) })
  }

  const moveCategory = () => {
    if (drag && drop && drag !== drop.id) update((d) => {
      const from = d.categories.findIndex((x) => x.id === drag)
      const [c] = d.categories.splice(from, 1)
      const to = d.categories.findIndex((x) => x.id === drop.id)
      d.categories.splice(drop.pos === 'after' ? to + 1 : to, 0, c)
    })
    setDrag(null); setDrop(null); setArmed(null)
  }

  const saveFile = async (text, name) => {
    try {
      const where = await exportData(text, name)
      if (where) toast(`Exported to ${where.replace(/^\/Users\/[^/]+/, '~')}`)
    } catch (e) { toast(`Export failed: ${e.message || e}`) }
  }
  const exportCsv = () => saveFile(dailyLogCsv(data, now), `hayati-log-daily-log-${new Date().toISOString().slice(0, 10)}.csv`)
  const exportJson = async () => saveFile(JSON.stringify(await fullData(), null, 1),`hayati-log-${new Date().toISOString().slice(0, 10)}.json`)

  const importData = (next, label) => {
    if (!Array.isArray(next?.rows)) throw new Error('Not a Hayati Log file')
    replaceData(next)
    toast(`${label ? `Restored ${label}` : 'Imported'} · ${next.rows.length} days · ${MOD}Z to undo`)
  }

  const importJson = async (file) => {
    try { importData(JSON.parse(await file.text())) } catch (e) { toast(`Import failed: ${e.message || e}`) }
  }

  return (
    <OpenCard.Provider value={{ open, setOpen }}>
    <div className="settings">
      <div className="view-head"><h1 className="view-title">Settings</h1></div>

      <SetCard id="cycle" title={<>Cycle</>} meta={<>The Cycle column counts days from the latest start</>}>
        <div className="cycle-list">
          {[...cycleHistory(s)].reverse().map((c) => (
            <div key={c.start} className="cycle-row">
              <Icon name="drop" size={15} />
              <span className="cycle-date">{longDate(c.start)}</span>
              <span className="cycle-len num">{c.length ? `${c.length}-day cycle` : 'First recorded'}</span>
              {c.status ? <Chip color={c.color}>{c.status}{c.diff ? ` ${c.diff > 0 ? '+' : ''}${c.diff}d` : ''}</Chip> : <span />}
              <button className="icon-btn" title="Remove" onClick={() => update((x) => { x.settings.cycleStarts = x.settings.cycleStarts.filter((y) => y !== c.start) })}><Icon name="x" size={14} /></button>
            </div>
          ))}
          {!s.cycleStarts.length && <div className="empty-note">No period starts yet. Mark one from a day's Cycle cell.</div>}
        </div>
        <div className="inline-form">
          <label className="set-label">Usual cycle</label>
          <input type="number" min="18" max="45" className="select num-input" value={cycleLen(s)} onChange={(e) => +e.target.value && update((d) => { d.settings.cycleLength = +e.target.value })} />
          <span className="set-label">days</span>
          {averageCycle(s) && averageCycle(s) !== cycleLen(s) && (
            <button className="btn ghost" onClick={() => update((d) => { d.settings.cycleLength = averageCycle(s) })}>Use my average ({averageCycle(s)})</button>
          )}
          <label className="set-label" style={{ marginLeft: 12 }}>Period length</label>
          <input type="number" min="1" max="10" className="select num-input" value={periodLen(s)} onChange={(e) => +e.target.value && update((d) => { d.settings.periodLength = +e.target.value })} />
          <span className="set-label">days</span>
        </div>
        <p className="help">A cycle longer than the usual length counts as late. Up to 2 days shorter is on time, and anything shorter than that is early.</p>
        <div className="inline-form end">
          <DatePicker value={newStart} onChange={setNewStart} placeholder="Choose a start date" />
          <button className="btn" disabled={!newStart} onClick={() => { update((x) => { if (!x.settings.cycleStarts.includes(newStart)) x.settings.cycleStarts = [...x.settings.cycleStarts, newStart].sort() }); setNewStart('') }}>Add Start</button>
        </div>
      </SetCard>

      <SetCard id="colours" title={<>Colours</>}>
        <div className="mini-head">General app</div>
        <div className="palette-grid">
          {COLOR_NAMES.map((n) => {
            const v = s.palette?.[n] || DEFAULT_PALETTE[n]
            return (
              <label key={n} className="palette-item">
                <ColorSwatch value={v} onChange={(c) => update((d) => { d.settings.palette = { ...(d.settings.palette || {}), [n]: COLORS[c] || c } })} />
                <span className="palette-label"><b>{hueName(v)}</b><small>{ACCENT_USES[n]}</small></span><span className="hex">{v}</span>
              </label>
            )
          })}
        </div>
        <div className="mini-head">Text</div>
        <div className="palette-grid">
          {NOTE_COLOR_NAMES.map((n) => {
            const v = s.noteColors?.[n] || DEFAULT_NOTE_COLORS[n]
            return (
              <label key={n} className="palette-item">
                <ColorSwatch value={v} onChange={(c) => update((d) => { d.settings.noteColors = { ...(d.settings.noteColors || {}), [n]: COLORS[c] || c } })} />
                <span className="palette-label"><b>{hueName(v)}</b></span><span className="hex">{v}</span>
              </label>
            )
          })}
        </div>
        <div className="mini-head">Text Background</div>
        <div className="palette-grid">
          {NOTE_COLOR_NAMES.map((n) => {
            const v = s.noteBgColors?.[n] || (s.noteColors?.[n] ? noteBgDefault(s.noteColors[n]) : DEFAULT_NOTE_BG_COLORS[n])
            return (
              <label key={n} className="palette-item">
                <ColorSwatch value={v} onChange={(c) => update((d) => { d.settings.noteBgColors = { ...(d.settings.noteBgColors || {}), [n]: COLORS[c] || c } })} />
                <span className="palette-label"><b>{hueName(v)}</b></span><span className="hex">{v}</span>
              </label>
            )
          })}
        </div>
        <div className="mini-head">To-Do checklist boxes</div>
        <div className="palette-grid">
          <label className="palette-item">
            <ColorSwatch value={s.checkColor || DEFAULT_CHECK_COLOR} onChange={(c) => update((d) => { d.settings.checkColor = COLORS[c] || c })} />
            <span className="palette-label"><b>{hueName(s.checkColor || DEFAULT_CHECK_COLOR)}</b><small>Ticked checkboxes</small></span><span className="hex">{s.checkColor || DEFAULT_CHECK_COLOR}</span>
          </label>
        </div>
        <div className="mini-head">Menu Bar &amp; Time-Block Groups</div>
        <div className="palette-grid">
          {[['timer', 'Menu bar timer'], ['stopwatch', 'Menu bar stopwatch']].map(([k, use]) => {
            const v = s.menubarColors?.[k] || DEFAULT_MENUBAR_COLORS[k]
            return (
              <label key={k} className="palette-item">
                <ColorSwatch value={v} onChange={(c) => update((d) => { d.settings.menubarColors = { ...(d.settings.menubarColors || {}), [k]: COLORS[c] || c } })} />
                <span className="palette-label"><b>{hueName(v)}</b><small>{use}</small></span><span className="hex">{v}</span>
              </label>
            )
          })}
          {data.groups.map((g) => (
            <label key={g.id} className="palette-item">
              <ColorSwatch value={g.color} onChange={(c) => update((d) => { d.groups.find((x) => x.id === g.id).color = c })} />
              <span className="palette-label"><b>{g.name}</b><small>Time-block group</small></span><span className="hex">{COLORS[g.color] || g.color}</span>
            </label>
          ))}
        </div>
        <div className="btn-row"><button className="btn" onClick={() => update((d) => { delete d.settings.palette; delete d.settings.noteColors; delete d.settings.noteBgColors; delete d.settings.checkColor; delete d.settings.menubarColors })}>Reset All Colours</button></div>
      </SetCard>

      <SetCard id="routine" title={<>Routine</>} meta={<>Added to {data.fields.find((f) => f.id === 'plan')?.name || 'Day Plan'}'s checklist</>}>
        {(s.routines || []).map((r) => (
          <div key={r.id} className="set-row routine-row">
            <input className="inline-edit grow" defaultValue={r.text} placeholder="e.g. Trash out" onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              onBlur={(e) => e.target.value !== r.text && update((d) => { d.settings.routines.find((x) => x.id === r.id).text = e.target.value.trim() })} />
            <RoutineWhen routine={r} set={(patch) => update((d) => { Object.assign(d.settings.routines.find((y) => y.id === r.id), patch) })} />
            <button className="icon-btn" title="Delete routine" onClick={() => update((d) => { d.settings.routines = d.settings.routines.filter((x) => x.id !== r.id) })}><Icon name="x" size={14} /></button>
          </div>
        ))}
        <div className="btn-row"><button className="btn add-cat" onClick={() => update((d) => { d.settings.routines = [...(d.settings.routines || []), { id: `rt-${Math.random().toString(36).slice(2, 8)}`, text: '', kind: null, days: [] }] })}>Add Routine</button></div>
      </SetCard>

      <MarksCard data={data} />

      <SetCard id="time-block-groups-and-categories" title={<>Time Block</>} meta={<>Quick-start buttons and Category column options. Drag to reorder.</>}>
        <div className="set-row start-label-row">
          <span className="set-label">Default text label on sidebar &amp; menu bar</span>
          <input className="inline-edit grow" defaultValue={s.startLabel || DEFAULT_START_LABEL} placeholder={DEFAULT_START_LABEL} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            onBlur={(e) => { const v = e.target.value.trim(); if (v !== (s.startLabel || DEFAULT_START_LABEL)) update((d) => { d.settings.startLabel = v && v !== DEFAULT_START_LABEL ? v : undefined }) }} />
        </div>
        <div className="mini-head">Groups</div>
        <div className="group-grid">
        {data.groups.map((g) => {
          const n = data.categories.filter((c) => c.group === g.id && !c.archived).length
          const used = data.categories.some((c) => c.group === g.id)
          return (
            <div key={g.id} className="set-row tb-group-row">
              <span className="swatch" style={{ background: COLORS[g.color] || g.color }} />
              <input className="inline-edit grow" defaultValue={g.name} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== g.name && update((d) => { d.groups.find((x) => x.id === g.id).name = e.target.value.trim() })} />
              <span className="muted cat-uses">{n ? `${n} categor${n > 1 ? 'ies' : 'y'}` : 'empty'}</span>
              <button className="icon-btn" title="Delete group"
                onClick={() => (used ? toast(`Move ${g.name}'s categories to another group first`) : update((d) => { d.groups = d.groups.filter((x) => x.id !== g.id) }))}>✕</button>
            </div>
          )
        })}
        </div>
        <div className="btn-row"><button className="btn add-cat" onClick={() => update((d) => { d.groups.push({ id: `g-${Math.random().toString(36).slice(2, 7)}`, name: 'New group', color: '#8a8a8a' }) })}>Add Group</button></div>
        <div className="mini-head">Categories</div>
        {active.map((c) => (
          <div key={c.id} className={`set-row cat-row ${drag === c.id ? 'dragging' : ''} ${drop?.id === c.id ? `drop-${drop.pos}` : ''}`}
            draggable={armed === c.id}
            onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.name); setDrag(c.id) }}
            onDragEnd={() => { setDrag(null); setDrop(null); setArmed(null) }}
            onDragOver={(e) => {
              if (!drag || drag === c.id) return
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              setDrop({ id: c.id, pos: e.clientY < r.top + r.height / 2 ? 'before' : 'after' })
            }}
            onDrop={(e) => { e.preventDefault(); moveCategory() }}>
            <span className="cat-grip" title="Drag to reorder" onMouseDown={() => setArmed(c.id)} onMouseUp={() => setArmed(null)}><Icon name="grip" size={14} /></span>
            <span className="swatch" style={{ background: COLORS[data.groups.find((g) => g.id === c.group)?.color] || COLORS.gray }} />
            <CategoryIcon cat={c} />
            <input className="inline-edit grow" defaultValue={c.name} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} onBlur={(e) => e.target.value.trim() && update((d) => { d.categories.find((x) => x.id === c.id).name = e.target.value.trim() })} />
            <select className="select" value={c.group} onChange={(e) => update((d) => { d.categories.find((x) => x.id === c.id).group = e.target.value })}>
              {data.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <span className="muted cat-uses">{uses[c.id] ? `${uses[c.id]} blocks` : 'unused'}</span>
            <button className="icon-btn" title="Remove category" onClick={() => removeCategory(c)}>✕</button>
          </div>
        ))}
        <div className="btn-row"><button className="btn add-cat" onClick={() => update((d) => { d.categories.push({ id: `c-${Math.random().toString(36).slice(2, 7)}`, emoji: '', name: 'New category', group: d.groups[0]?.id }) })}>Add Category</button></div>
        {archived.length > 0 && (
          <>
            <button className={`mini-head archived-toggle ${showArchived ? 'open' : ''}`} onClick={() => setShowArchived(!showArchived)}>
              <Icon name="chevron" size={12} />Archived ({archived.length})
            </button>
            <p className="help archived-help">Kept so old time blocks keep their names and colours.</p>
            {showArchived && archived.map((c) => (
              <div key={c.id} className="set-row archived">
                <span className="swatch" style={{ background: COLORS[data.groups.find((g) => g.id === c.group)?.color] || COLORS.gray }} />
                <span className="grow"><CatIcon c={c} />{c.name}</span>
                <span className="muted cat-uses">{uses[c.id] || 0} blocks</span>
                <button className="btn tiny ghost" onClick={() => update((d) => { delete d.categories.find((x) => x.id === c.id).archived })}>Restore</button>
                <button className={`btn tiny ghost danger ${confirmDel === c.id ? 'on' : ''}`} onBlur={() => setConfirmDel(null)}
                  title="Removes the category. Its old time blocks stay but lose their name and colour."
                  onClick={() => {
                    if (confirmDel !== c.id) return setConfirmDel(c.id)
                    setConfirmDel(null)
                    update((d) => { d.categories = d.categories.filter((x) => x.id !== c.id); for (const r of d.rows) for (const b of r.blocks) if (b.cats?.includes(c.id)) b.cats = b.cats.filter((x) => x !== c.id) })
                    toast(`Deleted ${c.name} · ${MOD}Z to undo`)
                  }}>{confirmDel === c.id ? 'Confirm delete' : 'Delete permanently'}</button>
              </div>
            ))}
          </>
        )}
      </SetCard>

      <MenuBarCard />

      <SetCard id="export-data" title={<>Export Data</>} meta={<>Auto backup daily · last 7 kept</>}>
        <p className="help">Everything lives in one plain JSON file on this Mac. The app automatically backs it up into <code>backups/</code> once a day and keeps the last 7 days.</p>
        <code className="path">{status.file || '—'}</code>
        <div className="inline-form end">
          <button className="btn" onClick={exportCsv} title="Every day as a spreadsheet row, for Excel or Google Sheets">Export CSV</button>
          <button className="btn" onClick={exportJson} title="Your whole data file, for Restore Data">Export JSON</button>
        </div>
        <ReportExport data={data} now={now} onSave={saveFile} />
      </SetCard>

      <SetCard id="restore-data" title={<>Restore Data</>} meta={<>Replace or delete everything · {MOD}Z to undo</>}>
        <BackupList onImport={(name) => readBackup(name).then((d) => importData(d, name)).catch((e) => toast(`Restore failed: ${e.message || e}`))}
          before={<DeleteAll data={data} toast={toast} />}>
          <button className="btn" onClick={() => fileRef.current.click()}>Import From File</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = '' }} />
        </BackupList>
      </SetCard>
    </div>
    </OpenCard.Provider>
  )
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// ReportExport — pick a year, then a month or quarter, and save that report as Markdown
function ReportExport({ data, now, onSave }) {
  const thisYear = now.today.slice(0, 4)
  const years = [...new Set([...data.rows.map((r) => r.date.slice(0, 4)), thisYear])].sort().reverse()
  const [year, setYear] = useState(thisYear)
  const has = new Set(data.rows.filter((r) => r.date.startsWith(year) && Object.keys(r.cells).length).map((r) => +r.date.slice(5, 7)))
  const months = [...has].sort((a, b) => b - a)
  const quarters = [4, 3, 2, 1].filter((q) => [1, 2, 3].some((i) => has.has((q - 1) * 3 + i)))
  const [kind, setKind] = useState('m')
  const list = kind === 'm' ? months : quarters
  const [pick, setPick] = useState(null)
  const n = list.includes(pick) ? pick : list[0] ?? null
  const value = n == null ? '' : `${kind}${n}`
  const run = () => {
    if (!value) return
    const n = +value.slice(1)
    if (value.startsWith('m')) {
      const m = `${year}-${String(n).padStart(2, '0')}`
      onSave(monthMarkdown(data, m, now), `hayati-log-${m}-monthly-report.md`)
    } else onSave(quarterMarkdown(data, year, n, now), `hayati-log-${year}-q${n}-quarterly-report.md`)
  }
  return (
    <>
      <div className="mini-head">Markdown reports</div>
      <p className="help">Save a Monthly or Quarterly Report as a Markdown file, the same numbers you see on the report pages.</p>
      <div className="inline-form">
        <select className="select" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="select" value={kind} onChange={(e) => { setKind(e.target.value); setPick(null) }} aria-label="Report type">
          <option value="m">Monthly</option>
          <option value="q">Quarterly</option>
        </select>
        <select className="select" value={n ?? ''} onChange={(e) => setPick(+e.target.value)} aria-label={kind === 'm' ? 'Month' : 'Quarter'} disabled={n == null}>
          {n == null && <option value="">No data this year</option>}
          {kind === 'm'
            ? months.map((m) => <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>)
            : quarters.map((q) => <option key={q} value={q}>Q{q} · {MONTH_NAMES[(q - 1) * 3].slice(0, 3)} – {MONTH_NAMES[(q - 1) * 3 + 2].slice(0, 3)}</option>)}
        </select>
        <div className="grow" />
        <button className="btn" disabled={!value} onClick={run}>Export Markdown</button>
      </div>
    </>
  )
}

const fmtSize = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)

function BackupList({ onImport, before, children }) {
  const [list, setList] = useState(null)
  const [sel, setSel] = useState(null)
  useEffect(() => { listBackups().then((l) => setList([...l].sort((a, b) => b.modified - a.modified))).catch(() => setList([])) }, [])
  return (
    <>
      <p className="help">Pick a backup to restore. Each one holds your data as it was at the time shown.</p>
      <div className="backup-list">
        {list?.map((b) => {
          const d = new Date(b.modified)
          return (
            <button key={b.name} className={`backup-row ${sel === b.name ? 'on' : ''}`} onClick={() => setSel(b.name)} onDoubleClick={() => onImport(b.name)}>
              <Icon name="calendar" size={14} />
              <span className="backup-date">{longDate(isoOf(d))}</span>
              <span className="backup-time num">{fmtClock(d.getHours() * 60 + d.getMinutes())}</span>
              <span className="backup-name">{b.name}</span>
              <span className="backup-size num">{fmtSize(b.size)}</span>
            </button>
          )
        })}
        {list && !list.length && <div className="empty-note">No backups yet. The first one is made the first time the app saves on a new day.</div>}
      </div>
      <div className="inline-form end">
        {before}
        {children}
        <button className="btn" disabled={!sel} onClick={() => onImport(sel)}>Restore</button>
      </div>
    </>
  )
}

// DeleteAll — clears days, notes, memos, plans and chores; keeps columns, categories, colours and settings
function DeleteAll({ data, toast }) {
  const [armed, setArmed] = useState(false)
  const run = () => {
    if (!armed) return setArmed(true)
    setArmed(false)
    const { cycleStarts, periodEnds, routines, ...settings } = data.settings
    replaceData({ ...data, sample: false, settings: { ...settings, cycleStarts: [] }, rows: [], notes: [], noteGroups: [], memos: [], chores: [], weeks: {}, weekMonths: [], months: [], monthGoals: {} })
    toast(`Deleted all data · ${MOD}Z to undo`)
  }
  return <button className={`btn danger-outline ${armed ? 'on' : ''}`} onBlur={() => setArmed(false)} onClick={run}>{armed ? 'Click again to delete everything' : 'Delete All Data'}</button>
}

// MarksCard — Stuck day is fixed; other marks are the user's own and show under Patterns
function MarksCard({ data }) {
  const marks = marksList(data.settings)
  const cols = data.fields.filter((f) => ['text', 'todo', 'mixed'].includes(f.type))
  const save = (fn) => update((d) => { const list = marksList(d.settings).map((m) => ({ ...m })); fn(list); d.settings.marks = list })
  const patch = (id, p) => save((l) => { Object.assign(l.find((m) => m.id === id), p) })
  return (
    <SetCard id="pattern-marks" title={<>Pattern Marks</>} meta={<>Count anything on Daily Log by emoji, like headaches or holidays</>}>
      {marks.map((m) => (
        <div key={m.id} className="set-row mark-row">
          {m.id === 'stuck'
            ? <span className="grow mark-fixed">{m.label}</span>
            : <input className="inline-edit grow" defaultValue={m.label} placeholder="Label" onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== m.label) patch(m.id, { label: v }) }} />}
          <select className="select" value={m.field || ''} onChange={(e) => patch(m.id, { field: e.target.value })} aria-label="Column">
            <option value="">Any column</option>
            {cols.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <EmojiList list={m.emojis || []} set={(emojis) => patch(m.id, { emojis })} />
          {m.id === 'stuck'
            ? <span className="mark-spacer" />
            : <button className="icon-btn" title="Remove mark" onClick={() => save((l) => { l.splice(l.findIndex((x) => x.id === m.id), 1) })}>✕</button>}
        </div>
      ))}
      <div className="btn-row"><button className="btn add-cat" onClick={() => save((l) => { l.push({ id: `mk-${Math.random().toString(36).slice(2, 8)}`, label: 'New mark', field: '', emojis: [] }) })}>Add Mark</button></div>
    </SetCard>
  )
}

function EmojiList({ list, set }) {
  const [adding, setAdding] = useState(false)
  const commit = (v) => { const e = v.trim(); setAdding(false); if (e && !list.includes(e)) set([...list, e]) }
  return (
    <span className="mark-list">
      {list.map((e) => (
        <span key={e} className="mark-chip">{e}<button className="chip-x" title="Remove" onClick={() => set(list.filter((x) => x !== e))}><Icon name="x" size={11} /></button></span>
      ))}
      {adding
        ? <input autoFocus className="inline-edit mark-add" maxLength={8} placeholder="emoji"
            onKeyDown={(e) => { if (e.key === 'Enter') commit(e.currentTarget.value); if (e.key === 'Escape') setAdding(false) }} onBlur={(e) => commit(e.target.value)} />
        : <button className="icon-btn" title="Add emoji" onClick={() => setAdding(true)}><Icon name="plus" size={14} /></button>}
    </span>
  )
}

const ordinal = (n) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`

// RoutineWhen — pick Day or Date first, then the weekdays or the day of month
function RoutineWhen({ routine: r, set }) {
  const kind = r.kind ?? (r.days?.length ? 'day' : null)
  if (!kind) return (
    <span className="routine-days">
      <button className="btn tiny ghost" onClick={() => set({ kind: 'day', days: [] })}>Day</button>
      <button className="btn tiny ghost" onClick={() => set({ kind: 'date', date: 1 })}>Date</button>
    </span>
  )
  if (kind === 'date') return (
    <span className="routine-days">
      <span className="muted">Every</span>
      <select className="select" value={r.date ?? 1} onChange={(e) => set({ date: e.target.value === 'last' ? 'last' : +e.target.value })}>
        {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{ordinal(i + 1)}</option>)}
        <option value="last">last day</option>
      </select>
      <span className="muted">of the month</span>
    </span>
  )
  return (
    <span className="routine-days">
      {[1, 2, 3, 4, 5, 6, 0].map((day) => (
        <button key={day} className={`routine-day ${r.days?.includes(day) ? 'on' : ''}`} title={DAY_NAMES[day]}
          onClick={() => set({ days: r.days?.includes(day) ? r.days.filter((y) => y !== day) : [...(r.days || []), day] })}>
          {DAY_NAMES[day].slice(0, 2)}
        </button>
      ))}
    </span>
  )
}

function MenuBarCard() {
  const [login, setLogin] = useState(null)
  useEffect(() => { if (isTauri) import('@tauri-apps/api/core').then(({ invoke }) => invoke('get_launch_at_login').then(setLogin)) }, [])
  if (login == null) return null
  const change = (on) => { setLogin(on); import('@tauri-apps/api/core').then(({ invoke }) => invoke('set_launch_at_login', { on })) }
  return (
    <SetCard id="menu-bar" title={<>Menu Bar</>} meta={<>Note, stopwatch and timer</>}>
      <p className="help">The menu bar stopwatch starts, pauses and stops today's Time Blocks. Closing this window keeps the menu bar running. Quit from any menu bar item.</p>
      <div className="inline-form">
        <Toggle on={login} onChange={change} />
        <span className="set-label">Open at login</span>
      </div>
    </SetCard>
  )
}

export function Toggle({ on, onChange }) {
  return (
    <button role="switch" aria-checked={on} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <span className="toggle-knob" />
    </button>
  )
}

function CategoryIcon({ cat }) {
  const [el, setEl] = useState(null)
  const set = (v) => update((d) => {
    const c = d.categories.find((x) => x.id === cat.id)
    c.emoji = isEmoji(v) ? v : ''
    if (v && !isEmoji(v)) c.icon = v
    else delete c.icon
  })
  return (
    <>
      <button className="icon-btn cat-icon-btn" title="Change icon" onClick={(e) => setEl(e.currentTarget)}>
        {cat.icon || cat.emoji ? <CatIcon c={cat} size={15} /> : <Icon name="smile" size={15} />}
      </button>
      {el && <IconPicker anchor={el} value={cat.icon || cat.emoji} onClose={() => setEl(null)} onPick={set} />}
    </>
  )
}
