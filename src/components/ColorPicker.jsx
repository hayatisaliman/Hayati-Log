import { useEffect, useRef, useState } from 'react'
import { COLORS, COLOR_NAMES, hueName, rgb } from '../lib/schema.js'
import { Popover } from './Popover.jsx'

function hexToHsv(hex) {
  const [r, g, b] = rgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let hue = 0
  if (d) {
    if (max === r) hue = ((g - b) / d) % 6
    else if (max === g) hue = (b - r) / d + 2
    else hue = (r - g) / d + 4
    hue *= 60
    if (hue < 0) hue += 360
  }
  return { h: hue, s: max ? d / max : 0, v: max }
}

function hsvToHex({ h, s, v }) {
  const f = (n) => {
    const k = (n + h / 60) % 6
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255)
  }
  return `#${[f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

const isHex = (s) => /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim())
const norm = (s) => (s.trim().startsWith('#') ? s.trim() : `#${s.trim()}`).toLowerCase()

export function ColorSwatch({ value, onChange, title }) {
  const [el, setEl] = useState(null)
  return (
    <>
      <button className="color-swatch" title={title || 'Pick colour'} style={{ background: COLORS[value] || COLORS.gray }} onClick={(e) => setEl(e.currentTarget)} />
      {el && <ColorPicker anchor={el} value={value} onChange={onChange} onClose={() => setEl(null)} />}
    </>
  )
}

export function ColorPicker({ anchor, value, onChange, onClose }) {
  const [hsv, setHsv] = useState(() => hexToHsv(COLORS[value] || COLORS.gray))
  const [text, setText] = useState(COLORS[value] || COLORS.gray)
  const svRef = useRef(null)
  const hueRef = useRef(null)
  const hex = hsvToHex(hsv)

  useEffect(() => { setText(hex) }, [hex])

  const latest = useRef(hsv)
  const commit = (next, save = true) => { latest.current = next; setHsv(next); if (save) onChange(hsvToHex(next)) }

  const drag = (ref, fn) => (e) => {
    e.preventDefault()
    const move = (ev) => {
      const r = ref.current.getBoundingClientRect()
      fn(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)))
    }
    move(e)
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); onChange(hsvToHex(latest.current)) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <Popover anchor={anchor} onClose={onClose} width={236}>
      <div className="cp">
        <div ref={svRef} className="cp-sv" style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
          onPointerDown={drag(svRef, (x, y) => commit({ ...latest.current, s: x, v: 1 - y }, false))}>
          <span className="cp-sv-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
        </div>
        <div ref={hueRef} className="cp-hue" onPointerDown={drag(hueRef, (x) => commit({ ...latest.current, h: x * 360 }, false))}>
          <span className="cp-hue-knob" style={{ left: `${(hsv.h / 360) * 100}%` }} />
        </div>
        <div className="cp-row">
          <span className="cp-preview" style={{ background: hex }} />
          <input className="line-editor slim cp-hex" value={text} spellCheck={false}
            onChange={(e) => { setText(e.target.value); if (isHex(e.target.value)) commit(hexToHsv(norm(e.target.value))) }} />
        </div>
        <div className="cp-presets">
          {COLOR_NAMES.map((c) => (
            <button key={c} className={`swatch-btn ${value === c ? 'on' : ''}`} style={{ background: COLORS[c] }} title={hueName(COLORS[c])}
              onClick={() => { commit(hexToHsv(COLORS[c]), false); onChange(c) }} />
          ))}
        </div>
      </div>
    </Popover>
  )
}
