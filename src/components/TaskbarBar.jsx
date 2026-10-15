import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Icon } from './icons.jsx'

// TaskbarBar — Windows taskbar widget with the note, stopwatch and timer
export function TaskbarBar() {
  const [s, setS] = useState(null)
  const row = useRef(null)
  const width = useRef(0)

  useEffect(() => {
    invoke('bar_state').then(setS)
    const un = listen('bar', (e) => setS(e.payload))
    return () => { un.then((f) => f()) }
  }, [])

  useLayoutEffect(() => {
    if (!row.current) return
    const w = Math.ceil(row.current.scrollWidth)
    if (w !== width.current) { width.current = w; invoke('bar_size', { width: w }) }
  }, [s])

  if (!s) return null
  const menu = (id) => invoke('bar_menu', { id })
  return (
    <div ref={row} className={`tbar ${s.light ? 'light' : ''}`}>
      <button className="tbar-item" onClick={() => menu('note')}>{s.note}</button>
      <button className="tbar-item" onClick={() => menu('watch')}>
        <Icon name={s.watch_icon || 'stopwatch'} size={16} weight={1.6} />
        {s.watch && <span className="num" style={{ color: s.watch_color || undefined }}>{s.watch}</span>}
      </button>
      <button className="tbar-item" onClick={() => menu('timer')}>
        <Icon name="hourglass" size={16} weight={1.6} />
        {s.timer && <span className="num" style={{ color: s.timer_color || undefined }}>{s.timer}</span>}
      </button>
    </div>
  )
}
