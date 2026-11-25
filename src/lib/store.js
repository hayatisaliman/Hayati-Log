import { useSyncExternalStore } from 'react'
import { produce, setAutoFreeze } from 'immer'
import { emptyData, DEFAULT_ICONS, todosFromText, textToMixed } from './schema.js'
import { isoOf } from './time.js'
import { bumpNotes, peekNote, readNoteUncached, saveNote } from './noteFiles.js'
import { sampleData } from './sample.js'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const sandbox = !isTauri && typeof location !== 'undefined' && new URLSearchParams(location.search).has('sandbox')
export const demo = !isTauri && typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo')
const api = (q = '') => `/api/data${sandbox ? `?sandbox=1${q ? `&${q}` : ''}` : q ? `?${q}` : ''}`
let invoke = null
export const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+'

setAutoFreeze(false)

let data = null
let status = { saving: false, savedAt: null, error: null, file: '' }
const past = []
const future = []
const listeners = new Set()
const statusListeners = new Set()
let saveTimer = null
let editor = null
const editorMade = new WeakSet()
const fileStates = new WeakMap()

const emit = () => listeners.forEach((l) => l())
const emitStatus = () => statusListeners.forEach((l) => l())
const setStatus = (patch) => { status = { ...status, ...patch }; emitStatus() }

export const useData = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => data)
export const useStatus = () => useSyncExternalStore((l) => (statusListeners.add(l), () => statusListeners.delete(l)), () => status)
export const getData = () => data

function migrate(d) {
  const base = emptyData()
  if (d._stateField) {
    d.fields = base.fields.map((f) => (f.id === 'state' ? d._stateField : f))
    delete d._stateField
  }
  if (d.fields && !d.dayColumnRemoved) {
    d.fields = d.fields.filter((f) => f.id !== 'day')
    d.dayColumnRemoved = true
  }
  if (!d.todoMigrated) {
    const f = (d.fields || []).find((x) => x.id === 'pending')
    if (f && f.type === 'text') {
      f.type = 'todo'
      for (const r of d.rows || []) if (typeof r.cells?.pending === 'string') { const t = todosFromText(r.cells.pending); if (t.length) r.cells.pending = t; else delete r.cells.pending }
    }
    d.todoMigrated = true
  }
  if (!d.todoCleaned) {
    for (const r of d.rows || []) if (Array.isArray(r.cells?.pending)) {
      r.cells.pending = r.cells.pending.filter((t) => !/^[\s↓]*$/.test(t.text || ''))
      if (!r.cells.pending.length) delete r.cells.pending
    }
    d.todoCleaned = true
  }
  if (!d.iconsAssigned) {
    for (const f of d.fields || base.fields) if (!f.icon && DEFAULT_ICONS[f.id]) f.icon = DEFAULT_ICONS[f.id]
    if (!d.fields) d.fields = base.fields
    d.iconsAssigned = true
  }
  if (!d.mixedType) {
    for (const f of d.fields || []) {
      if (f.id === 'plan' || f.checklist || ((f.id === 'focus' || f.id === 'done') && f.type === 'text')) { f.type = 'mixed'; delete f.checklist }
    }
    for (const r of d.rows || []) {
      for (const id of ['plan', 'focus', 'done']) {
        const v = r.cells?.[id]
        const extra = Array.isArray(r.cells?.[`${id}:todos`]) ? r.cells[`${id}:todos`] : []
        const list = [...(typeof v === 'string' ? textToMixed(v) : Array.isArray(v) ? v : []), ...extra]
        delete r.cells[`${id}:todos`]
        if (list.length) r.cells[id] = list
        else delete r.cells[id]
      }
    }
    d.mixedType = true
  }
  if (!d.mixedNotes) {
    const f = (d.fields || []).find((x) => x.id === 'notes')
    if (f && f.type === 'text') {
      f.type = 'mixed'
      for (const r of d.rows || []) {
        const v = r.cells?.notes
        if (typeof v !== 'string') continue
        const list = textToMixed(v)
        if (list.length) r.cells.notes = list
        else delete r.cells.notes
      }
    }
    d.mixedNotes = true
  }
  return {
    ...base,
    ...d,
    settings: { ...base.settings, ...(d.settings || {}) },
    rows: (d.rows || []).map((r) => ({ cells: {}, notes: '', blocks: [], ...r })),
  }
}

export async function loadData() {
  try {
    if (demo) {
      status.file = 'Demo · changes are not saved'
      data = migrate(sampleData())
    } else if (isTauri) {
      invoke = (await import('@tauri-apps/api/core')).invoke
      const raw = await invoke('load_data')
      status.file = await invoke('data_path')
      data = migrate(raw ? JSON.parse(raw) : sampleData())
    } else {
      const info = await fetch('/api/info').then((r) => r.json()).catch(() => ({}))
      status.file = info.file || ''
      const res = await fetch(api())
      data = res.ok ? migrate(await res.json()) : res.status === 404 ? migrate(sampleData()) : emptyData()
    }
  } catch (e) {
    status.error = `Could not load data: ${e}`
    data = emptyData()
  }
  status.savedAt = data.savedAt || null
  emit()
  emitStatus()
  if (!demo) extractImages().then(() => splitNotes())
}

// splitNotes — moves note blocks out of report.json into notes/<id>.json; prev makes a restore undoable
async function splitNotes(prev) {
  const own = data.notes.filter((n) => Array.isArray(n.blocks))
  if (!own.length) return
  const before = new Map()
  const after = new Map()
  try {
    for (const n of own) {
      if (prev) before.set(n.id, await readNoteUncached(n.id))
      else if (peekNote(n.id) !== undefined) continue
      await saveNote(n.id, n.blocks)
      after.set(n.id, n.blocks)
    }
  } catch (e) {
    console.warn('Note split skipped:', e)
    return
  }
  const ids = new Set(own.map((n) => n.id))
  update((d) => { for (const n of d.notes) if (ids.has(n.id)) delete n.blocks }, { history: false })
  if (prev) { fileStates.set(prev, before); fileStates.set(data, after) }
  bumpNotes()
}

function applyFiles(d) {
  const m = fileStates.get(d)
  if (!m) return
  for (const [id, blocks] of m) if (blocks) saveNote(id, blocks).catch((e) => setStatus({ error: `Save failed: ${e}` }))
  bumpNotes()
}

// fullData — data with every note's blocks filled in from its file, for export
export async function fullData() {
  const notes = []
  for (const n of data.notes) notes.push(n.blocks ? n : { ...n, blocks: (await readNoteUncached(n.id)) || [] })
  return { ...data, notes }
}

// extractImages — moves pasted base64 images out of the data into media/ files
async function extractImages() {
  const found = new Map()
  const walk = (v) => {
    if (typeof v === 'string') { if (v.startsWith('data:image/')) found.set(v, null) }
    else if (v && typeof v === 'object') for (const k in v) walk(v[k])
  }
  walk(data)
  if (!found.size) return
  try {
    const { dataUrlToMedia } = await import('./media.js')
    for (const u of found.keys()) found.set(u, await dataUrlToMedia(u))
  } catch (e) {
    console.warn('Image extraction skipped:', e)
    return
  }
  const swap = (o) => {
    for (const k in o) {
      const v = o[k]
      if (typeof v === 'string') { if (found.has(v)) o[k] = found.get(v) }
      else if (v && typeof v === 'object') swap(v)
    }
  }
  update(swap, { history: false })
}

async function persist() {
  clearTimeout(saveTimer)
  saveTimer = null
  if (demo) return
  const savedAt = Date.now()
  const json = JSON.stringify({ ...data, savedAt }, null, 1)
  const day = isoOf(new Date())
  setStatus({ saving: true })
  try {
    if (isTauri) await invoke('save_data', { json, day })
    else {
      const res = await fetch(api(`day=${day}`), { method: 'PUT', body: json, headers: { 'Content-Type': 'application/json' } })
      if (!res.ok) throw new Error(await res.text())
    }
    setStatus({ saving: false, savedAt, error: null })
  } catch (e) {
    setStatus({ saving: false, error: `Save failed: ${e}` })
  }
}

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(persist, 350)
}

// setEditor — last-changed BlockNote editor; ⌘Z goes to it first
export const setEditor = (ed) => { editor = ed }
export const releaseEditor = (ed) => { if (editor === ed) editor = null }

export function update(fn, { history = true, fromEditor = false } = {}) {
  const next = produce(data, (draft) => { fn(draft) })
  if (next === data) return
  if (fromEditor) editorMade.add(next)
  else editor = null
  if (history) {
    past.push(data)
    if (past.length > 200) past.shift()
    future.length = 0
  }
  data = next
  emit()
  scheduleSave()
}

export function replaceData(next) {
  editor = null
  const prev = data
  past.push(prev)
  future.length = 0
  data = migrate(next)
  emit()
  scheduleSave()
  if (!demo) extractImages().then(() => splitNotes(prev))
}

export function undo() {
  if (editor) {
    if (editor.undo()) return
    editor = null
    while (past.length && editorMade.has(data)) data = past.pop()
  }
  if (!past.length) { emit(); scheduleSave(); return }
  future.push(data)
  data = past.pop()
  applyFiles(data)
  emit()
  scheduleSave()
}

export function redo() {
  if (editor?.redo()) return
  if (!future.length) return
  past.push(data)
  data = future.pop()
  applyFiles(data)
  emit()
  scheduleSave()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { if (saveTimer != null) persist() })
}

export async function listBackups() {
  if (demo) return []
  if (isTauri) return invoke('list_backups')
  const res = await fetch('/api/backups')
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function readBackup(name) {
  const raw = isTauri ? await invoke('read_backup', { name }) : await fetch(`/api/backups?name=${encodeURIComponent(name)}`).then((r) => (r.ok ? r.text() : Promise.reject(new Error('Could not read backup'))))
  return JSON.parse(raw)
}

// exportData — Tauri asks where to save and returns the path (null if cancelled); the browser downloads and returns the file name
export async function exportData(text, name) {
  if (isTauri) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const ext = name.split('.').pop()
    const path = await save({ defaultPath: name, filters: [{ name: { md: 'Markdown', csv: 'CSV' }[ext] || 'JSON', extensions: [ext] }] })
    if (!path) return null
    await invoke('write_export', { path, text })
    return path
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: name.endsWith('.md') ? 'text/markdown' : name.endsWith('.csv') ? 'text/csv' : 'application/json' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  return name
}

export const findRow = (d, id) => d.rows.find((r) => r.id === id)
export const findField = (d, id) => d.fields.find((f) => f.id === id)
