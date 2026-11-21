import { useSyncExternalStore } from 'react'
import { isoOf } from './time.js'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const sandbox = !isTauri && typeof location !== 'undefined' && new URLSearchParams(location.search).has('sandbox')
const KEEP = 10
const cache = new Map()
const core = () => import('@tauri-apps/api/core')
const url = (id, day) => `/api/note?id=${encodeURIComponent(id)}${sandbox ? '&sandbox=1' : ''}${day ? `&day=${day}` : ''}`

let epoch = 0
const listeners = new Set()
export const useNotesEpoch = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => epoch)
export const bumpNotes = () => { epoch++; listeners.forEach((l) => l()) }

const remember = (id, blocks) => {
  cache.delete(id)
  cache.set(id, blocks)
  while (cache.size > KEEP) cache.delete(cache.keys().next().value)
}

export const peekNote = (id) => (cache.has(id) ? cache.get(id) : undefined)

async function readFile(id) {
  const raw = isTauri ? await (await core()).invoke('load_note', { id }) : await fetch(url(id)).then((r) => (r.ok ? r.text() : r.status === 404 ? null : Promise.reject(new Error(`Could not load note (${r.status})`))))
  return raw ? JSON.parse(raw) : null
}

// loadNote — blocks array, or null when the note has no file yet
export async function loadNote(id) {
  if (cache.has(id)) { const b = cache.get(id); remember(id, b); return b }
  const blocks = await readFile(id)
  remember(id, blocks)
  return blocks
}

export const readNoteUncached = (id) => (cache.has(id) ? Promise.resolve(cache.get(id)) : readFile(id))

export async function saveNote(id, blocks) {
  remember(id, blocks)
  const json = JSON.stringify(blocks)
  const day = isoOf(new Date())
  if (isTauri) return (await core()).invoke('save_note', { id, json, day })
  const res = await fetch(url(id, day), { method: 'PUT', body: json, headers: { 'Content-Type': 'application/json' } })
  if (!res.ok) throw new Error(await res.text())
}
