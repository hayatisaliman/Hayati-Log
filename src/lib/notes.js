import { update } from './store.js'
import { plainText } from './richText.js'

const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

export function createNote(group = null) {
  const id = uid('n')
  const now = Date.now()
  update((d) => { d.notes.push({ id, title: '', body: '', group, created: now, updated: now }) })
  return id
}

export function patchNote(id, patch, opts) {
  update((d) => {
    const n = d.notes.find((x) => x.id === id)
    if (n) Object.assign(n, patch, { updated: Date.now() })
  }, opts)
}

export function deleteNote(id) {
  update((d) => { d.notes = d.notes.filter((x) => x.id !== id) })
}

export function createGroup() {
  const id = uid('ng')
  update((d) => { d.noteGroups.push({ id, name: 'New group', collapsed: false }) })
  return id
}

export function patchGroup(id, patch) {
  update((d) => { Object.assign(d.noteGroups.find((x) => x.id === id), patch) })
}

export function deleteGroup(id) {
  update((d) => {
    d.noteGroups = d.noteGroups.filter((x) => x.id !== id)
    for (const n of d.notes) if (n.group === id) n.group = null
  })
}

// moveNote — target: { group } to append, or { noteId, pos: 'before' | 'after' }
export function moveNote(id, target) {
  update((d) => {
    const i = d.notes.findIndex((x) => x.id === id)
    if (i < 0) return
    const [n] = d.notes.splice(i, 1)
    if (target.noteId) {
      const t = d.notes.findIndex((x) => x.id === target.noteId)
      n.group = d.notes[t]?.group ?? null
      d.notes.splice(target.pos === 'after' ? t + 1 : t, 0, n)
    } else {
      n.group = target.group ?? null
      d.notes.push(n)
    }
    const g = d.noteGroups.find((x) => x.id === n.group)
    if (g) g.collapsed = false
  })
}

export function moveGroup(id, targetId, pos) {
  update((d) => {
    const i = d.noteGroups.findIndex((x) => x.id === id)
    const [g] = d.noteGroups.splice(i, 1)
    const t = d.noteGroups.findIndex((x) => x.id === targetId)
    d.noteGroups.splice(pos === 'after' ? t + 1 : t, 0, g)
  })
}

export const noteTitle = (n) => plainText(n.title).trim() || 'Untitled'
