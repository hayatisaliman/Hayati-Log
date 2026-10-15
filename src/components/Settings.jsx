import { useEffect, useRef, useState } from 'react'
import { FieldIcon, Icon, IconPicker } from './icons.jsx'
import { COLORS, COLOR_NAMES, FIELD_TYPES, averageCycle, cycleHistory, cycleLen, periodLen, DEFAULT_PALETTE, NOTE_COLOR_NAMES, DEFAULT_NOTE_COLORS, hueName, ACCENT_USES, noteBgDefault, DEFAULT_CHECK_COLOR, MEMO_COLOR_NAMES, DEFAULT_MEMO_COLORS } from '../lib/schema.js'
import { ColorSwatch } from './ColorPicker.jsx'
import { Chip } from './cells.jsx'
import { DatePicker } from './DatePicker.jsx'
import { DAY_NAMES, fmtClock, isoOf, longDate } from '../lib/time.js'
import { update, replaceData, useStatus, findField, listBackups, readBackup, exportData, MOD } from '../lib/store.js'
import { monthMarkdown, quarterMarkdown } from './reportMarkdown.js'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export function Settings({ data, toast, now }) {
  const status = useStatus()
  const fileRef = useRef(null)
  const [newStart, setNewStart] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
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

  const saveFile = async (text, name) => {
    try {
      const where = await exportData(text, name)
      if (where) toast(`Exported to ${where.replace(/^\/Users\/[^/]+/, '~')}`)
    } catch (e) { toast(`Export failed: ${e.message || e}`) }
  }
  const exportJson = () => saveFile(JSON.stringify(data, null, 1), `hayati-log-${new Date().toISOString().slice(0, 10)}.json`)

  const importData = (next, label) => {
    if (!Array.isArray(next?.rows)) throw new Error('Not a Hayati Log file')
    replaceData(next)
    toast(`${label ? `Restored ${label}` : 'Imported'} · ${next.rows.length} days · ${MOD}Z to undo`)
  }

  const importJson = async (file) => {
    try { importData(JSON.parse(await file.text())) } catch (e) { toast(`Import failed: ${e.message || e}`) }
  }

  return (
    <div className="settings">
      <div className="view-head"><h1 className="view-title">Settings</h1></div>

      <section className="card">
        <div className="card-head"><h3>Cycle</h3><span className="section-meta">The Cycle column counts days from the latest start</span></div>
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
        <div className="inline-form">
          <DatePicker value={newStart} onChange={setNewStart} placeholder="Choose a start date" />
          <button className="btn" disabled={!newStart} onClick={() => { update((x) => { if (!x.settings.cycleStarts.includes(newStart)) x.settings.cycleStarts = [...x.settings.cycleStarts, newStart].sort() }); setNewStart('') }}>Add Start</button>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h3>Colours</h3></div>
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
        <div className="mini-head">Notes &amp; Weekly Plan · text</div>
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
        <div className="mini-head">Notes &amp; Weekly Plan · text background</div>
        <div className="palette-grid">
          {NOTE_COLOR_NAMES.map((n) => {
            const v = s.noteBgColors?.[n] || noteBgDefault(s.noteColors?.[n] || DEFAULT_NOTE_COLORS[n])
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
        <div className="mini-head">Sidebar memos · background</div>
        <div className="palette-grid">
          {MEMO_COLOR_NAMES.map((n) => {
            const v = s.memoColors?.[n] || DEFAULT_MEMO_COLORS[n]
            return (
              <label key={n} className="palette-item">
                <ColorSwatch value={v} onChange={(c) => update((d) => { d.settings.memoColors = { ...(d.settings.memoColors || {}), [n]: COLORS[c] || c } })} />
                <span className="palette-label"><b>{hueName(v)}</b></span><span className="hex">{v}</span>
              </label>
            )
          })}
        </div>
        <div className="mini-head">Time-block groups · ribbon and reports</div>
        <div className="palette-grid">
          {data.groups.map((g) => {
            const used = data.categories.some((c) => c.group === g.id)
            return (
              <div key={g.id} className="palette-item group-item">
                <ColorSwatch value={g.color} onChange={(c) => update((d) => { d.groups.find((x) => x.id === g.id).color = c })} />
                <input className="inline-edit grow" defaultValue={g.name} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== g.name && update((d) => { d.groups.find((x) => x.id === g.id).name = e.target.value.trim() })} />
                <span className="hex">{COLORS[g.color] || g.color}</span>
                <button className="group-x" title={used ? 'Move its categories to another group first' : 'Delete group'} disabled={used}
                  onClick={() => update((d) => { d.groups = d.groups.filter((x) => x.id !== g.id) })}><Icon name="x" size={12} /></button>
              </div>
            )
          })}
          <button className="palette-item group-add" onClick={() => update((d) => { d.groups.push({ id: `g-${Math.random().toString(36).slice(2, 7)}`, name: 'New group', color: '#8a8a8a' }) })}>
            <span className="group-add-ico"><Icon name="plus" size={12} /></span>Add group
          </button>
        </div>
        <button className="btn" onClick={() => update((d) => { delete d.settings.palette; delete d.settings.noteColors; delete d.settings.noteBgColors; delete d.settings.checkColor; delete d.settings.memoColors })}>Reset All Colours</button>
      </section>

      <section className="card">
        <div className="card-head"><h3>Routine</h3><span className="section-meta">Added to Day Plan's checklist</span></div>
        {(s.routines || []).map((r) => (
          <div key={r.id} className="set-row routine-row">
            <input className="inline-edit grow" defaultValue={r.text} placeholder="e.g. Trash out" onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              onBlur={(e) => e.target.value !== r.text && update((d) => { d.settings.routines.find((x) => x.id === r.id).text = e.target.value.trim() })} />
            <RoutineWhen routine={r} set={(patch) => update((d) => { Object.assign(d.settings.routines.find((y) => y.id === r.id), patch) })} />
            <button className="icon-btn" title="Delete routine" onClick={() => update((d) => { d.settings.routines = d.settings.routines.filter((x) => x.id !== r.id) })}><Icon name="x" size={14} /></button>
          </div>
        ))}
        <button className="btn add-cat" onClick={() => update((d) => { d.settings.routines = [...(d.settings.routines || []), { id: `rt-${Math.random().toString(36).slice(2, 8)}`, text: '', kind: null, days: [] }] })}>Add Routine</button>
      </section>

      <section className="card">
        <div className="card-head"><h3>Time-Block Categories</h3><span className="section-meta">The quick-start buttons on the Time blocks page</span></div>
        <div className="set-row start-label-row">
          <span className="set-label">Sidebar start text</span>
          <input className="inline-edit grow" defaultValue={s.startLabel || 'Bismillah'} placeholder="Bismillah" onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            onBlur={(e) => { const v = e.target.value.trim(); if (v !== (s.startLabel || 'Bismillah')) update((d) => { d.settings.startLabel = v || undefined }) }} />
        </div>
        {active.map((c) => (
          <div key={c.id} className="set-row">
            <span className="swatch" style={{ background: COLORS[data.groups.find((g) => g.id === c.group)?.color] || COLORS.gray }} />
            <input className="inline-edit emoji" defaultValue={c.emoji} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} onBlur={(e) => update((d) => { d.categories.find((x) => x.id === c.id).emoji = e.target.value.trim() })} />
            <input className="inline-edit grow" defaultValue={c.name} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} onBlur={(e) => e.target.value.trim() && update((d) => { d.categories.find((x) => x.id === c.id).name = e.target.value.trim() })} />
            <select className="select" value={c.group} onChange={(e) => update((d) => { d.categories.find((x) => x.id === c.id).group = e.target.value })}>
              {data.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <span className="muted cat-uses">{uses[c.id] ? `${uses[c.id]} blocks` : 'unused'}</span>
            <button className="icon-btn" title="Remove category" onClick={() => removeCategory(c)}>✕</button>
          </div>
        ))}
        <button className="btn add-cat" onClick={() => update((d) => { d.categories.push({ id: `c-${Math.random().toString(36).slice(2, 7)}`, emoji: '•', name: 'New category', group: d.groups[0]?.id }) })}>Add Category</button>
        {archived.length > 0 && (
          <>
            <button className={`mini-head archived-toggle ${showArchived ? 'open' : ''}`} onClick={() => setShowArchived(!showArchived)}>
              <Icon name="chevron" size={12} />Archived ({archived.length}) · kept so old time blocks keep their names and colours
            </button>
            {showArchived && archived.map((c) => (
              <div key={c.id} className="set-row archived">
                <span className="swatch" style={{ background: COLORS[data.groups.find((g) => g.id === c.group)?.color] || COLORS.gray }} />
                <span className="grow">{c.emoji} {c.name}</span>
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
      </section>

      <section className="card">
        <div className="card-head"><h3>Properties</h3><span className="section-meta">Show or hide columns. Drag headers in the table to reorder.</span></div>
        {data.fields.map((f) => (
          <div key={f.id} className="set-row prop-row">
            <IconButton field={f} />
            <span className="grow">{f.name} <span className="muted">· {FIELD_TYPES[f.type]?.label}</span></span>
            {!f.primary && <Toggle on={!f.hidden} onChange={(on) => update((d) => { findField(d, f.id).hidden = !on })} />}
          </div>
        ))}
      </section>

      <MenuBarCard />

      <section className="card">
        <div className="card-head"><h3>Export Data</h3><span className="section-meta">Auto backup daily · last 14 kept</span></div>
        <p className="help">Everything lives in one plain JSON file on this Mac. The app automatically backs it up into <code>backups/</code> once a day and keeps the last 14 days.</p>
        <code className="path">{status.file || '—'}</code>
        <div className="inline-form">
          <button className="btn" onClick={exportJson}>Export JSON</button>
        </div>
        <ReportExport data={data} now={now} onSave={saveFile} />
      </section>

      <section className="card">
        <div className="card-head"><h3>Restore Data</h3><span className="section-meta">Replaces everything · {MOD}Z to undo</span></div>
        <BackupList onImport={(name) => readBackup(name).then((d) => importData(d, name)).catch((e) => toast(`Restore failed: ${e.message || e}`))}>
          <button className="btn" onClick={() => fileRef.current.click()}>Import From File</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = '' }} />
        </BackupList>
      </section>
    </div>
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
  const first = months[0] ? `m${months[0]}` : quarters[0] ? `q${quarters[0]}` : ''
  const [pick, setPick] = useState(first)
  const value = (pick.startsWith('m') ? has.has(+pick.slice(1)) : quarters.includes(+pick.slice(1))) ? pick : first
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
        <select className="select" value={value} onChange={(e) => setPick(e.target.value)} aria-label="Report" disabled={!first}>
          {!first && <option value="">No data this year</option>}
          {months.length > 0 && <optgroup label="Monthly report">{months.map((m) => <option key={m} value={`m${m}`}>{MONTH_NAMES[m - 1]}</option>)}</optgroup>}
          {quarters.length > 0 && <optgroup label="Quarterly report">{quarters.map((q) => <option key={q} value={`q${q}`}>Q{q} · {MONTH_NAMES[(q - 1) * 3].slice(0, 3)} – {MONTH_NAMES[(q - 1) * 3 + 2].slice(0, 3)}</option>)}</optgroup>}
        </select>
        <button className="btn" disabled={!value} onClick={run}>Export Markdown</button>
      </div>
    </>
  )
}

const fmtSize = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)

function BackupList({ onImport, children }) {
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
      <div className="inline-form">
        <button className="btn" disabled={!sel} onClick={() => onImport(sel)}>Restore</button>
        {children}
      </div>
    </>
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
    <section className="card">
      <div className="card-head"><h3>Menu Bar</h3><span className="section-meta">Note, stopwatch and timer</span></div>
      <p className="help">The menu bar stopwatch starts, pauses and stops today's Time Blocks. Closing this window keeps the menu bar running. Quit from any menu bar item.</p>
      <div className="inline-form">
        <Toggle on={login} onChange={change} />
        <span className="set-label">Open at login</span>
      </div>
    </section>
  )
}

export function Toggle({ on, onChange }) {
  return (
    <button role="switch" aria-checked={on} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <span className="toggle-knob" />
    </button>
  )
}

function IconButton({ field }) {
  const [el, setEl] = useState(null)
  return (
    <>
      <button className="icon-btn" title="Change icon" onClick={(e) => setEl(e.currentTarget)}><FieldIcon type={field.type} icon={field.icon} /></button>
      {el && <IconPicker anchor={el} value={field.icon} onClose={() => setEl(null)} onPick={(icon) => update((d) => { const f = findField(d, field.id); if (icon) f.icon = icon; else delete f.icon })} />}
    </>
  )
}
