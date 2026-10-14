import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons.jsx'

const stack = []

// InlineHost — cover popovers render inside the table cell instead of floating
export const InlineHost = createContext(false)

export function Popover({ anchor, onClose, children, cover, className = '', align = 'left', width }) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [pos, setPos] = useState(null)
  const inline = useContext(InlineHost) && cover

  useLayoutEffect(() => {
    if (inline || !anchor || !ref.current) return
    const r = anchor.getBoundingClientRect()
    const el = ref.current
    const fixed = cover ? Math.max(Math.min(r.width, 360), width || 0) : width
    if (fixed) el.style.width = `${fixed}px`
    const w = fixed || el.offsetWidth
    const h = el.offsetHeight
    let left = align === 'right' ? r.right - w : r.left
    let top = cover ? r.top : r.bottom + 4
    if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w
    if (left < 8) left = 8
    if (top + h > window.innerHeight - 8) top = cover ? Math.max(8, window.innerHeight - 8 - h) : Math.max(8, r.top - 4 - h)
    setPos({ left, top, width: fixed })
  }, [anchor, cover, align, width])

  useEffect(() => {
    const me = ref
    stack.push(me)
    const down = (e) => {
      if (e.target.closest?.('.format-bar')) return
      const i = stack.indexOf(me)
      const inside = stack.slice(i).some((p) => p.current && p.current.contains(e.target))
      if (!inside) closeRef.current?.()
    }
    const key = (e) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === me) {
        e.stopPropagation()
        e.preventDefault()
        closeRef.current?.()
      }
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('keydown', key, true)
    return () => {
      stack.splice(stack.indexOf(me), 1)
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('keydown', key, true)
    }
  }, [])

  if (inline) return <div ref={ref} className={`popover inline-cell ${className}`}>{children}</div>

  return createPortal(
    <div ref={ref} className={`popover ${className}`} style={pos ? pos : { left: 0, top: 0, opacity: 0, pointerEvents: 'none' }}>
      {children}
    </div>,
    document.body,
  )
}

export function Menu({ items, onPick }) {
  const clean = items.filter((it, i, arr) => it !== '-' || (i > 0 && i < arr.length - 1 && arr[i - 1] !== '-'))
  return (
    <div className="menu">
      {clean.map((it, i) =>
        it === '-' ? <div key={i} className="menu-sep" /> : (
          <button key={i} className={`menu-item ${it.danger ? 'danger' : ''} ${it.active ? 'active' : ''}`} onClick={() => { it.run?.(); onPick?.() }}>
            {it.icon && <span className="menu-icon">{typeof it.icon === 'string' ? <Icon name={it.icon} size={15} /> : it.icon}</span>}
            <span>{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
          </button>
        ),
      )}
    </div>
  )
}
