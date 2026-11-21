import { useEffect, useRef, useState } from 'react'
import { DAY_NAMES, MONTHS, fmtClock } from '../lib/time.js'
import { deleteNote, moveNote, patchNote } from '../lib/notes.js'
import { Popover, Menu } from './Popover.jsx'
import { Icon } from './icons.jsx'
import { NoteEditor, blocksToText } from './NoteEditor.jsx'
import { RichInput } from './FormatBar.jsx'
import { VideoAutoplay, hasVideo } from './VideoBlock.jsx'
import { update, MOD } from '../lib/store.js'
import { loadNote, peekNote, saveNote } from '../lib/noteFiles.js'
import { Toggle } from './Settings.jsx'

const fmtDate = (ts) => {
  const d = new Date(ts)
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
const countWords = (t) => (t?.trim() ? t.trim().split(/\s+/).length : 0)
const FS_DEFAULT = 15
const FS_MIN = 12
const FS_MAX = 22
const fmtTime = (ts) => { const d = new Date(ts); return fmtClock(d.getHours() * 60 + d.getMinutes()) }

export function NotePanel({ data, noteId, onClose, focusTitle, width, setWidth, toast, full, setFull }) {
  const note = data.notes.find((n) => n.id === noteId)
  const [title, setTitle] = useState(note?.title || '')
  const [words, setWords] = useState(() => countWords(note?.body))
  const [menu, setMenu] = useState(null)
  const [blocks, setBlocks] = useState(() => note?.blocks ?? peekNote(noteId))
  const [loadError, setLoadError] = useState(null)
  const [videos, setVideos] = useState(() => hasVideo(blocks))
  const editorRef = useRef(null)
  const titleRef = useRef(null)
  const timer = useRef(null)
  const pending = useRef(null)

  const flush = () => {
    clearTimeout(timer.current)
    if (!pending.current) return
    const { id, patch: { blocks: b, ...rest } } = pending.current
    pending.current = null
    if (b) saveNote(id, b).catch((e) => toast?.(`Note save failed: ${e.message || e}`))
    if (Object.keys(rest).length) patchNote(id, rest, { fromEditor: true })
  }

  useEffect(() => {
    setTitle(note?.title || '')
    setWords(countWords(note?.body))
    if (blocks === undefined) loadNote(noteId).then((b) => { setBlocks(b); setVideos(hasVideo(b)) }).catch((e) => setLoadError(String(e.message || e)))
    if (focusTitle) setTimeout(() => titleRef.current?.focus(), 0)
    return flush
  }, [noteId])

  if (!note) return null

  const queue = (patch) => {
    pending.current = { id: note.id, patch: { ...(pending.current?.id === note.id ? pending.current.patch : {}), ...patch } }
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 600)
  }

  const startResize = (e) => {
    e.preventDefault()
    const x0 = e.clientX
    const w0 = width
    const move = (ev) => setWidth(Math.max(360, Math.min(window.innerWidth - 520, w0 - (ev.clientX - x0))))
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const fs = note.fontSize || FS_DEFAULT
  const setFs = (v) => update((d) => { const n = d.notes.find((x) => x.id === note.id); if (!n) return; if (v === FS_DEFAULT) delete n.fontSize; else n.fontSize = v })

  const group = data.noteGroups.find((g) => g.id === note.group)

  return (
    <aside className={`note-panel ${full ? 'full' : ''}`} style={full ? undefined : { width }}>
      {!full && <div className="note-resize" onPointerDown={startResize} />}
      <div className="note-top">
        <span className="note-crumb">{group ? group.name : 'Notes'}</span>
        <div className="grow" />
        {videos && (
          <label className="video-auto" title="Play all videos without hovering">
            Autoplay
            <Toggle on={!!note.autoplay} onChange={(on) => update((d) => { const n = d.notes.find((x) => x.id === note.id); if (n) n.autoplay = on })} />
          </label>
        )}
        <span className="note-meta num">{words} words</span>
        <button className="icon-btn" onClick={(e) => setMenu(e.currentTarget)}>⋯</button>
        <button className="icon-btn" title={full ? 'Exit full width' : 'Full width'} onClick={() => setFull(!full)}><Icon name={full ? 'collapse' : 'expand'} size={14} weight={1.1} /></button>
        <button className="icon-btn" title="Close" onClick={() => { flush(); onClose() }}>✕</button>
      </div>
      <div className="note-scroll">
        <article className="journal" style={{ '--note-fs': `${fs}px` }}>
          <div className="journal-date">{fmtDate(note.created)}</div>
          <RichInput
            inputRef={titleRef}
            className="journal-title"
            placeholder="Untitled"
            value={title}
            onChange={(v) => { setTitle(v); queue({ title: v }) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editorRef.current?.focus() } }}
          />
          <VideoAutoplay.Provider value={!!(videos && note.autoplay)}>
            {loadError && <div className="note-empty">Could not open this note: {loadError}</div>}
            {blocks !== undefined && <NoteEditor
              note={{ ...note, blocks }}
              editorRef={editorRef}
              onChange={(blocks) => {
                const body = blocksToText(blocks)
                setWords(countWords(body))
                setVideos(hasVideo(blocks))
                queue({ blocks, body })
              }}
            />}
          </VideoAutoplay.Provider>
          <div className="journal-foot">Written {fmtTime(note.created)} · last edited {fmtDate(note.updated)}, {fmtTime(note.updated)}</div>
        </article>
      </div>
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)} align="right" width={210}>
          <div className="note-fs-row">
            <span className="grow">Text size</span>
            <button className="icon-btn" title="Smaller" disabled={fs <= FS_MIN} onClick={() => setFs(Math.max(FS_MIN, fs - 0.5))}>−</button>
            <button className="note-fs-val num" title="Reset to default" onClick={() => setFs(FS_DEFAULT)}>{fs}</button>
            <button className="icon-btn" title="Larger" disabled={fs >= FS_MAX} onClick={() => setFs(Math.min(FS_MAX, fs + 0.5))}>+</button>
          </div>
          <div className="menu-sep" />
          <Menu onPick={() => setMenu(null)} items={[
            ...(data.noteGroups.some((g) => g.id !== note.group) ? [{ icon: 'arrow-right', label: 'Move to', sub: data.noteGroups.filter((g) => g.id !== note.group).map((g) => ({ label: g.name, run: () => { flush(); moveNote(note.id, { group: g.id }) } })) }] : []),
            ...(note.group ? [{ icon: 'arrow-out', label: 'Remove from group', run: () => { flush(); moveNote(note.id, { group: null }) } }] : []),
            '-',
            { icon: 'x', label: 'Delete note', danger: true, run: () => { pending.current = null; clearTimeout(timer.current); deleteNote(note.id); onClose(); toast?.(`Note deleted · ${MOD}Z to undo`) } },
          ]} />
        </Popover>
      )}
    </aside>
  )
}
