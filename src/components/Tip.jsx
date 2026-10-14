import { useState } from 'react'

export function useTip() {
  const [tip, setTip] = useState(null)
  const bind = (content) => ({
    onMouseMove: (e) => setTip({ x: e.clientX, y: e.clientY, content }),
    onMouseLeave: () => setTip(null),
  })
  const el = tip && (
    <div className="tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 260), top: tip.y + 14 }}>{tip.content}</div>
  )
  return [bind, el]
}
