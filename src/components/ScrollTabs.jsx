import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from './icons.jsx'

// ScrollTabs — tab row that scrolls sideways; ‹ › appear only once the tabs overflow
export function ScrollTabs({ items, value, onPick, label = (x) => x }) {
  const ref = useRef(null)
  const [edge, setEdge] = useState({ over: false, start: true, end: true })
  const measure = () => {
    const el = ref.current
    if (!el) return
    const over = el.scrollWidth > el.clientWidth + 1
    setEdge({ over, start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 })
  }
  useLayoutEffect(measure, [items.length])
  useEffect(() => {
    const ro = new ResizeObserver(measure)
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  useEffect(() => { ref.current?.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [value])
  const page = (dir) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' })
  return (
    <div className={`scroll-tabs ${edge.over ? 'over' : ''}`}>
      {edge.over && <button className="icon-btn scroll-tabs-btn prev" title="Scroll left" disabled={edge.start} onClick={() => page(-1)}><Icon name="chevron" size={13} /></button>}
      <div className="tabs" ref={ref} onScroll={measure}>
        {items.map((x) => <button key={x} className={`tab ${x === value ? 'on' : ''}`} onClick={() => onPick(x)}>{label(x)}</button>)}
      </div>
      {edge.over && <button className="icon-btn scroll-tabs-btn" title="Scroll right" disabled={edge.end} onClick={() => page(1)}><Icon name="chevron" size={13} /></button>}
    </div>
  )
}
