import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Icon } from './icons.jsx'
import { parseDuration } from '../lib/time.js'

const ICON = { note: 'pen-line', timer: 'hourglass', 'timer-done': 'hourglass', activity: 'stopwatch' }
const WIDTH = { note: 400, 'timer-done': 360 }

// Popup — menu bar dialogs, shown by menubar.rs above every app and Space
export function Popup() {
  const [info, setInfo] = useState(null)
  const [seq, setSeq] = useState(0)
  const card = useRef(null)

  useEffect(() => {
    const open = (i) => { setInfo(i); setSeq((n) => n + 1) }
    invoke('popup_info').then((i) => i && open(i))
    const un = listen('popup', (e) => open(e.payload))
    const refocus = () => card.current?.querySelector('[data-autofocus]')?.focus()
    window.addEventListener('focus', refocus)
    return () => { un.then((f) => f()); window.removeEventListener('focus', refocus) }
  }, [])

  useLayoutEffect(() => {
    if (!info || !card.current) return
    const r = card.current.getBoundingClientRect()
    invoke('popup_ready', { width: Math.ceil(r.width), height: Math.ceil(r.height) })
    card.current.querySelector('[data-autofocus]')?.focus()
  }, [seq])

  if (!info) return null
  const finish = (value) => { invoke('popup_result', { value: value ?? null }); setInfo(null) }

  return (
    <div ref={card} key={seq} className="popup-card" style={{ width: WIDTH[info.kind] || 340 }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); finish(null) } }}>
      <div className="popup-head" data-tauri-drag-region>
        <Icon name={ICON[info.kind] || 'bell'} size={14} />
        <span data-tauri-drag-region>{info.title}</span>
      </div>
      {info.kind === 'note' && <NoteForm info={info} finish={finish} />}
      {info.kind === 'timer' && <TimerForm finish={finish} />}
      {info.kind === 'activity' && <TextForm label="What do you want to do?" action="Start" finish={finish} />}
      {info.kind === 'timer-done' && (
        <>
          <p className="popup-message">{info.message}</p>
          <div className="popup-actions">
            <button className="btn" onClick={() => finish('more')}>Need more time</button>
            <button className="btn primary" data-autofocus onClick={() => finish('done')}>It's done</button>
          </div>
        </>
      )}
    </div>
  )
}

function Actions({ action, finish, disabled }) {
  return (
    <div className="popup-actions">
      <button type="button" className="btn ghost" onClick={() => finish(null)}>Cancel</button>
      <button type="submit" className="btn primary" disabled={disabled}>{action}</button>
    </div>
  )
}

function TextForm({ label, action, finish, initial = '', children }) {
  const [v, setV] = useState(initial)
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) finish(v.trim()) }}>
      <label className="popup-label">{label}</label>
      <input className="popup-input" data-autofocus value={v} onChange={(e) => setV(e.target.value)} onFocus={(e) => e.target.select()} />
      {children?.(setV)}
      <Actions action={action} finish={finish} disabled={!v.trim()} />
    </form>
  )
}

function NoteForm({ info, finish }) {
  const [saved, setSaved] = useState(info.saved || [])
  const remove = (i) => { const next = saved.filter((_, j) => j !== i); setSaved(next); invoke('note_saved', { saved: next }) }
  return (
    <TextForm label="Text to show in the menu bar" action="Save" initial={info.note} finish={finish}>
      {() => saved.length > 0 && (
        <div className="popup-saved">
          <div className="popup-label">Saved notes</div>
          {saved.map((n, i) => (
            <div key={n} className="popup-saved-row">
              <button type="button" className="popup-saved-text" onClick={() => finish(n)}>{n}</button>
              <button type="button" className="chip-x" title="Delete" onClick={() => remove(i)}><Icon name="x" size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </TextForm>
  )
}

function TimerForm({ finish }) {
  const [v, setV] = useState('20')
  const min = parseDuration(v)
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (min > 0) finish(min * 60) }}>
      <label className="popup-label">Duration</label>
      <input className="popup-input num" data-autofocus value={v} onChange={(e) => setV(e.target.value)} onFocus={(e) => e.target.select()} />
      <div className="popup-hint">Minutes, or something like 1h 30m</div>
      <Actions action="Start" finish={finish} disabled={!(min > 0)} />
    </form>
  )
}
