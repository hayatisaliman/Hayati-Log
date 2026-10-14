export const pad = (n) => String(n).padStart(2, '0')

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function toDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isoOf(dt) {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

export function addDays(iso, n) {
  const d = toDate(iso)
  d.setDate(d.getDate() + n)
  return isoOf(d)
}

export function diffDays(a, b) {
  return Math.round((toDate(a) - toDate(b)) / 86400000)
}

export const monthKey = (iso) => iso.slice(0, 7)

export function monthLabel(key, short) {
  const [y, m] = key.split('-').map(Number)
  const name = MONTHS[m - 1]
  return `${short ? name.slice(0, 3) : name} ${y}`
}

export function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function shortDate(iso) {
  const d = toDate(iso)
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${pad(d.getDate())}, ${d.getFullYear()}`
}

export function longDate(iso) {
  const d = toDate(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export const weekday = (iso) => toDate(iso).getDay()

// weekOfMonth — Monday weeks; a first week with <4 days of the month is Week 0
export function weekOfMonth(iso) {
  const d = toDate(iso)
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const firstDow = (first.getDay() + 6) % 7
  const daysInFirstWeek = 7 - firstDow
  const offset = daysInFirstWeek >= 4 ? 1 : 0
  return Math.floor((d.getDate() - 1 + firstDow) / 7) + offset
}

export function logicalToday(rolloverMin, now = new Date()) {
  const d = new Date(now.getTime() - rolloverMin * 60000)
  return isoOf(d)
}

export function nowMinutes(dateIso, now = new Date()) {
  return Math.round((now - toDate(dateIso)) / 60000)
}

export function parseClock(input) {
  const s = String(input ?? '').trim().toLowerCase().replace(/(\d)\s+(?=\d)/g, '$1:').replace(/[^\d:apm.]/g, '')
  if (!s) return null
  const m = s.match(/^(\d{1,2})(?:[:.]?(\d{2}))?(a|p)?m?$/)
  if (!m) return null
  let h = +m[1]
  const mi = m[2] ? +m[2] : 0
  if (m[3]) {
    if (h < 1 || h > 12) return null
    if (h === 12) h = 0
    if (m[3] === 'p') h += 12
  }
  if (h > 24 || mi > 59) return null
  return (h % 24) * 60 + mi
}

export const normalizeClock = (min, fromMin) => (min < fromMin ? min + 1440 : min)

export function fmtClock(min, { compact } = {}) {
  if (min == null || Number.isNaN(min)) return ''
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const mm = m % 60
  const h12 = h % 12 === 0 ? 12 : h % 12
  const ap = h < 12 ? 'AM' : 'PM'
  if (compact && mm === 0) return `${h12} ${ap}`
  return `${h12}:${pad(mm)} ${ap}`
}

export const isNight = (min) => {
  const m = ((min % 1440) + 1440) % 1440
  return m < 360 || m >= 1140
}

export function parseDuration(input) {
  const s = String(input ?? '').trim().toLowerCase().replace(/(\d)\s+(?=\d)/g, '$1:').replace(/\s+/g, '')
  if (!s) return null
  let m = s.match(/^(\d+):(\d{1,2})$/)
  if (m) return +m[1] * 60 + +m[2]
  m = s.match(/^(\d+(?:\.\d+)?)h(?:ours?|rs?)?(?:(\d+)m?(?:in|ins)?)?$/)
  if (m) return Math.round(+m[1] * 60 + (m[2] ? +m[2] : 0))
  m = s.match(/^(\d+)m?(?:in|ins)?$/)
  if (m) return +m[1]
  return null
}

export function fmtDuration(min) {
  if (min == null || Number.isNaN(min)) return ''
  const neg = min < 0
  const a = Math.abs(Math.round(min))
  const h = Math.floor(a / 60)
  const m = a % 60
  const s = h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`
  return neg ? `−${s}` : s
}
