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

// clockWindow — start of the 24h window (on a 4-hour mark) whose edge has the fewest times near it
export function clockWindow(values) {
  const tod = values.map((v) => ((v % 1440) + 1440) % 1440)
  let best = 0
  let bestN = Infinity
  for (let w = 0; w < 1440; w += 240) {
    const n = tod.filter((t) => { const d = Math.abs(t - w); return Math.min(d, 1440 - d) < 120 }).length
    if (n < bestN) { best = w; bestN = n }
  }
  return best
}

export const inWindow = (v, w0) => w0 + ((((v - w0) % 1440) + 1440) % 1440)
