import { addDays } from './time.js'

// sleepOn — minutes between the previous day's End and this day's Start, null if missing or implausible
export function sleepOn(rowOf, d) {
  const p = rowOf[addDays(d, -1)]?.cells
  const c = rowOf[d]?.cells
  if (p?.end == null || c?.start == null) return null
  const from = p.start != null && p.end < p.start ? p.end + 1440 : p.end
  const m = c.start + 1440 - from
  return m > 0 && m < 20 * 60 ? { m, from, to: c.start } : null
}

export const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
