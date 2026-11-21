import { addDays, diffDays, weekday, weekOfMonth, DAY_SHORT } from './time.js'
import { plainText } from './richText.js'

export const DEFAULT_PALETTE = {
  gray: '#8a8a8a',
  light: '#e6db9f',
  cyan: '#027571',
  blue: '#1e7cb3',
  green: '#9563b3',
  orange: '#b3541e',
  red: '#a13333',
  pink: '#7d8dee',
}
export const DEFAULT_MENUBAR_COLORS = { timer: '#ffa41c', stopwatch: '#71ff19' }
const PALETTE = { ...DEFAULT_PALETTE }

export const ACCENT_USES = {
  gray: 'Proliferative cycle days, uncategorised time',
  light: 'Tag and group colour option, Q3 lines',
  cyan: 'Today in date pickers, running time block, current quarter, sort arrow, ticks, ovulation, Week 1, Q1 lines',
  blue: 'Text selection, switches, picked date, luteal phase, End (bedtime) dots, Week 2',
  green: 'On-time cycle status, Q2 lines',
  orange: 'Note header date, weekends, late cycle, carried to-dos, Start (wake) dots, Week 3, today\'s daily log row, this week\'s Weekly Plan box',
  red: 'Period days, delete actions, errors, Week 4',
  pink: 'Tag and group colour option, Q4 lines',
}
export const NOTE_COLOR_NAMES = ['gray', 'red', 'orange', 'yellow', 'green', 'blue']
const RETIRED_NOTE_COLORS = ['brown', 'purple', 'pink']
export const rgb = (hex) => {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6)
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16))
}
const hsl = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (!d) return { h: null, s: 0, l }
  const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (hue * 60 + 360) % 360, s: d / (1 - Math.abs(2 * l - 1)), l }
}
// hueName — plain colour name for a hex, e.g. 'Dark green'
export function hueName(hex) {
  const { h, s: sat, l } = hsl(hex)
  if (h == null || sat < 0.12) return l > 0.85 ? 'White' : l < 0.22 ? 'Charcoal' : l < 0.45 ? 'Dark grey' : 'Grey'
  const base = h < 15 || h >= 345 ? 'Red' : h < 40 ? (l < 0.45 ? 'Brown' : 'Orange') : h < 65 ? 'Yellow' : h < 165 ? 'Green' : h < 200 ? 'Cyan' : h < 255 ? 'Blue' : h < 290 ? 'Purple' : h < 320 ? 'Magenta' : 'Pink'
  return l < 0.3 && base !== 'Brown' ? `Dark ${base.toLowerCase()}` : l > 0.68 ? `Light ${base.toLowerCase()}` : base
}

export const DEFAULT_NOTE_COLORS = {
  gray: '#9a9a9a', brown: '#c08a5b', red: '#a13333', orange: '#b3541e', yellow: '#fff4b7',
  green: '#006a67', blue: '#b8c2ff', purple: '#a66bff', pink: '#f30058',
}
export const DEFAULT_NOTE_BG_COLORS = { gray: '#2b2b2b', red: '#461111', orange: '#4a2410', yellow: '#4a4630', green: '#00302e', blue: '#003161' }
// nearestNoteColor — retired note colours render as the closest kept one
const nearestNoteColor = (hex, notes) => {
  const a = hsl(hex)
  const score = (n) => {
    const b = hsl(notes[n])
    const dh = a.h == null || b.h == null ? 0.5 : Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h)) / 180
    return dh + Math.abs(a.s - b.s) + Math.abs(a.l - b.l) / 2
  }
  return NOTE_COLOR_NAMES.reduce((best, n) => (score(n) < score(best) ? n : best))
}

// noteBgDefault — 22% tint over the editor background, as a hex for display
export function noteBgDefault(hex) {
  const a = rgb(hex)
  const b = rgb('#111111')
  return `#${a.map((v, i) => Math.round(v * 0.22 + b[i] * 0.78).toString(16).padStart(2, '0')).join('')}`
}
export const DEFAULT_CHECK_COLOR = '#1e7cb3'
export const MEMO_COLOR_NAMES = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']
export const DEFAULT_MEMO_COLORS = { m1: '#2b2b2b', m2: '#461111', m3: '#00302e', m4: '#003161', m5: '#000b58', m6: '#fff4b7' }
const isLight = (hex) => { const [r, g, b] = rgb(hex); return 0.299 * r + 0.587 * g + 0.114 * b > 150 }

let applied = ''
export function applyPalette(settings) {
  const key = JSON.stringify([settings.palette, settings.noteColors, settings.noteBgColors, settings.checkColor, settings.memoColors, settings.menubarColors])
  if (key === applied) return
  applied = key
  Object.assign(PALETTE, DEFAULT_PALETTE, settings.palette || {})
  if (typeof document === 'undefined') return
  const root = document.documentElement.style
  for (const n of ['cyan', 'blue', 'green', 'orange', 'red', 'pink']) root.setProperty(`--${n}`, PALETTE[n])
  const notes = { ...DEFAULT_NOTE_COLORS, ...(settings.noteColors || {}) }
  const bg = (n) => settings.noteBgColors?.[n] || (settings.noteColors?.[n] || !DEFAULT_NOTE_BG_COLORS[n] ? `color-mix(in srgb, ${notes[n]} 22%, transparent)` : DEFAULT_NOTE_BG_COLORS[n])
  for (const n of NOTE_COLOR_NAMES) {
    root.setProperty(`--hl-${n}`, notes[n])
    root.setProperty(`--hlbg-${n}`, bg(n))
  }
  for (const n of RETIRED_NOTE_COLORS) {
    const to = nearestNoteColor(notes[n], notes)
    root.setProperty(`--hl-${n}`, notes[to])
    root.setProperty(`--hlbg-${n}`, bg(to))
  }
  root.setProperty('--check', settings.checkColor || DEFAULT_CHECK_COLOR)
  root.setProperty('--watch', settings.menubarColors?.stopwatch || DEFAULT_MENUBAR_COLORS.stopwatch)
  root.setProperty('--timer', settings.menubarColors?.timer || DEFAULT_MENUBAR_COLORS.timer)
  const memos = { ...DEFAULT_MEMO_COLORS, ...(settings.memoColors || {}) }
  for (const n of MEMO_COLOR_NAMES) {
    root.setProperty(`--memo-${n}`, memos[n])
    root.setProperty(`--memo-${n}-text`, isLight(memos[n]) ? '#111111' : '#f2f0f0')
  }
}
export const COLOR_NAMES = Object.keys(PALETTE)
export const COLORS = new Proxy(PALETTE, {
  get: (t, k) => t[k] ?? (typeof k === 'string' && /^#[0-9a-f]{3,8}$/i.test(k) ? k : undefined),
})

export const FIELD_TYPES = {
  date: { label: 'Date' },
  text: { label: 'Text' },
  number: { label: 'Number' },
  select: { label: 'Select' },
  multi: { label: 'Multi-select' },
  checkbox: { label: 'Checkbox' },
  todo: { label: 'Checklist' },
  mixed: { label: 'Text + checklist' },
  time: { label: 'Time' },
  weekday: { label: 'Weekday', computed: true },
  week: { label: 'Week of month', computed: true },
  cycle: { label: 'Cycle day', computed: true },
  tracked: { label: 'Time tracked', computed: true },
}
export const EDITABLE_TYPES = ['text', 'number', 'select', 'multi', 'checkbox', 'time', 'todo', 'mixed']

export const todoId = () => `t-${Math.random().toString(36).slice(2, 9)}`

// routinesDue — routines for a date not yet added to its row
export function routinesDue(data, date) {
  const d = new Date(`${date}T12:00:00`)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const row = data.rows.find((r) => r.date === date)
  const hits = (x) => (x.kind === 'date' ? x.date === d.getDate() || (x.date === 'last' && d.getDate() === last) : x.days?.includes(d.getDay()))
  return (data.settings.routines || []).filter((x) => x.text?.trim() && hits(x) && !row?.routineDone?.includes(x.id))
}

const todoIndexes = new WeakMap()
const todoIndex = (rows) => {
  let m = todoIndexes.get(rows)
  if (m) return m
  m = new Map()
  for (const r of rows) for (const v of Object.values(r.cells || {})) if (Array.isArray(v)) for (const t of v) if (t && typeof t === 'object' && t.id) m.set(t.id, { date: r.date, t })
  todoIndexes.set(rows, m)
  return m
}

// todoAge — days since a carried to-do first appeared, following ↓ and → copies back
export function todoAge(data, date, t) {
  const idx = todoIndex(data.rows)
  let first = date
  let cur = t
  for (let i = 0; i < 400 && cur; i++) {
    const src = cur.from || cur.sentFrom
    const hit = src && idx.get(src)
    if (!hit) break
    first = hit.date
    cur = hit.t
  }
  return diffDays(date, first) + 1
}

export function addRoutines(d, date, due) {
  let r = d.rows.find((x) => x.date === date)
  if (!r) { r = newRow(date); d.rows.push(r) }
  r.routineDone = [...(r.routineDone || []), ...due.map((x) => x.id)]
  r.cells.plan = [...(Array.isArray(r.cells.plan) ? r.cells.plan : []), ...due.map((x) => ({ id: todoId(), text: x.text.trim(), done: false, routine: x.id }))]
}
// textToMixed — each line becomes a plain text row
export const textToMixed = (s) => String(s || '').split('\n').map((l) => l.trim()).filter(Boolean).map((text) => ({ id: todoId(), kind: 'text', text }))

export function todosFromText(s) {
  return String(s || '').split('\n').map((line) => {
    let text = line.replace(/^[\s·ᐧ•\-*]+/, '').trim()
    const carried = /↓\s*$/.test(text)
    text = text.replace(/[\s↓]+$/, '').trim()
    return text ? { id: todoId(), text, done: /✅/.test(text), ...(carried ? { carried: true } : {}) } : null
  }).filter(Boolean)
}
export const cellText = (v) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? plainText(x.text) : String(x))).join('\n') : v == null ? '' : plainText(v))

const opt = (name, color) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, color })

function defaultFields() {
  return [
    { id: 'date', name: 'Date', type: 'date', width: 150, primary: true },
    { id: 'week', name: 'Week', type: 'week', width: 74 },
    { id: 'cycle', name: 'Cycle', type: 'cycle', width: 128 },
    {
      id: 'state', name: 'State', type: 'multi', width: 150,
      options: [opt('High Dopa', 'green'), opt('Mid Dopa', 'cyan'), opt('Low Dopa', 'blue'), opt('Brainfog', 'gray'), opt('Impulsive', 'orange')],
    },
    { id: 'start', name: 'Start', type: 'time', width: 92 },
    { id: 'end', name: 'End', type: 'time', width: 92 },
    { id: 'plan', name: 'Day Plan', type: 'mixed', width: 180 },
    { id: 'pending', name: 'Pending', type: 'todo', width: 220 },
    { id: 'focus', name: 'Work Focus', type: 'mixed', width: 180 },
    { id: 'done', name: 'Work Done', type: 'mixed', width: 240 },
    { id: 'notes', name: 'Work Notes', type: 'mixed', width: 220 },
    { id: 'tracked', name: 'Tracked', type: 'tracked', width: 92 },
    { id: 'ai', name: 'AI', type: 'checkbox', width: 56, calc: 'checked' },
    { id: 'exercise', name: 'Exercise', type: 'checkbox', width: 80, calc: 'checked' },
    { id: 'read', name: 'Read', type: 'checkbox', width: 64, calc: 'checked' },
    { id: 'learn', name: 'Learn', type: 'text', width: 160 },
    { id: 'friction', name: 'Friction', type: 'text', width: 160 },
    { id: 'rest', name: 'Divert / Rest', type: 'text', width: 170 },
  ]
}

export const DEFAULT_ICONS = {
  date: 'calendar', week: 'calendar-check', cycle: 'drop', state: 'sliders', start: 'bolt', end: 'bed',
  plan: 'star', pending: 'progress', focus: 'target', done: 'clipboard-check', notes: 'command',
  tracked: 'stopwatch', ai: 'invader', exercise: 'dumbbell', read: 'book-open', learn: 'search',
  friction: 'waves', rest: 'shuffle',
}

function defaultGroups() {
  return [
    { id: 'work', name: 'Work', color: '#1e7cb3' },
    { id: 'self', name: 'Self-care', color: '#006a67' },
    { id: 'home', name: 'Home', color: '#b3541e' },
    { id: 'rest', name: 'Rest', color: '#b8c2ff' },
    { id: 'out', name: 'Out', color: '#fff4b7' },
  ]
}

function defaultCategories() {
  const c = (id, emoji, name, group) => ({ id, emoji, name, group })
  return [
    c('work', '🖥️', 'Work', 'work'),
    c('meetings', '💬', 'Meetings', 'work'),
    c('email', '📧', 'Email', 'work'),
    c('learning', '📚', 'Learning', 'work'),
    c('meals', '🍽️', 'Meals', 'self'),
    c('exercise', '🏃', 'Exercise', 'self'),
    c('selfcare', '🧴', 'Self-care', 'self'),
    c('chores', '🏠', 'Chores', 'home'),
    c('errands', '🛒', 'Errands', 'home'),
    c('break', '☕', 'Break', 'rest'),
    c('entertainment', '🍿', 'Entertainment', 'rest'),
    c('sleep', '🛏️', 'Sleep', 'rest'),
    c('social', '👥', 'Social', 'out'),
    c('travel', '🚗', 'Travel', 'out'),
  ]
}

export function emptyData() {
  return {
    version: 1,
    settings: { cycleStarts: [], wrap: true },
    months: [],
    monthGoals: {},
    weeks: {},
    weekMonths: [],
    notes: [],
    noteGroups: [],
    groups: defaultGroups(),
    categories: defaultCategories(),
    fields: defaultFields(),
    rows: [],
  }
}

export function newRow(date) {
  return { id: `r-${date}-${Math.random().toString(36).slice(2, 7)}`, date, cells: {}, notes: '', blocks: [] }
}

export const cycleLen = (settings) => settings.cycleLength || 28
export const periodLen = (settings) => settings.periodLength || 5

function periodEndFor(start, settings) {
  return (settings.periodEnds || []).filter((e) => e >= start && diffDays(e, start) < 15).sort()[0] || null
}

export function cycleInfo(date, settings) {
  const prior = (settings.cycleStarts || []).filter((s) => s <= date).sort()
  if (!prior.length) return null
  const start = prior[prior.length - 1]
  const day = diffDays(date, start) + 1
  const len = cycleLen(settings)
  if (day > len + 30) return null
  const end = periodEndFor(start, settings)
  const inPeriod = end ? date <= end : day <= periodLen(settings)
  const base = { day, start, periodEnd: end }
  if (inPeriod) return { ...base, phase: 'Period', color: 'red' }
  if (day <= periodLen(settings) && end) return { ...base, phase: 'Prolif.', color: 'gray' }
  if (day <= len - 16) return { ...base, phase: 'Prolif.', color: 'gray' }
  if (day <= len - 13) return { ...base, phase: 'Ovulation', color: 'cyan' }
  if (day <= len) return { ...base, phase: 'Luteal', color: 'blue' }
  return { ...base, phase: 'Late', color: 'orange', late: day - len }
}

export function setCycleDay(settings, date, n) {
  const start = addDays(date, -(n - 1))
  const keep = (settings.cycleStarts || []).filter((s) => Math.abs(diffDays(s, start)) >= 15)
  settings.cycleStarts = [...keep, start].sort()
  settings.periodEnds = (settings.periodEnds || []).filter((e) => e < start || diffDays(e, start) >= 15 || e >= date)
}

export function togglePeriodStart(settings, date) {
  const st = settings.cycleStarts || []
  if (st.includes(date)) settings.cycleStarts = st.filter((x) => x !== date)
  else setCycleDay(settings, date, 1)
}

export function togglePeriodEnd(settings, date) {
  const info = cycleInfo(date, settings)
  const ends = settings.periodEnds || []
  if (ends.includes(date)) { settings.periodEnds = ends.filter((x) => x !== date); return }
  if (!info) return
  settings.periodEnds = [...ends.filter((e) => !(e >= info.start && diffDays(e, info.start) < 15)), date].sort()
}

// cycleStatus — early < len-2 ≤ on time ≤ len < late
function cycleStatus(length, len) {
  const diff = length - len
  if (diff > 0) return { status: 'Late', diff, color: 'orange' }
  if (diff < -2) return { status: 'Early', diff, color: 'cyan' }
  return { status: 'On time', diff, color: 'green' }
}

export function cycleHistory(settings) {
  const starts = [...(settings.cycleStarts || [])].sort()
  const len = cycleLen(settings)
  return starts.map((start, i) => {
    if (!i) return { start, length: null }
    const length = diffDays(start, starts[i - 1])
    return { start, prevStart: starts[i - 1], length, ...cycleStatus(length, len) }
  })
}

export function averageCycle(settings) {
  const lens = cycleHistory(settings).map((c) => c.length).filter((n) => n && n < 60).slice(-6)
  return lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : null
}

const latestClock = (data, fieldId) => {
  let best = null
  for (const r of data.rows) if (r.cells?.[fieldId] != null && (!best || r.date > best.date)) best = r
  return best ? ((best.cells[fieldId] % 1440) + 1440) % 1440 : null
}

// rolloverMinute — today switches at the last End (evening bedtimes at midnight), else the last Start
export function rolloverMinute(data) {
  const end = latestClock(data, 'end')
  if (end != null) return end < 720 ? end : 0
  return latestClock(data, 'start') ?? 240
}

// wakeMinute — times earlier than this count as after midnight
export function wakeMinute(data, row, fieldId) {
  if (fieldId === 'start') return rolloverMinute(data)
  const own = row?.cells?.start
  if (own != null) return ((own % 1440) + 1440) % 1440
  return latestClock(data, 'start') ?? rolloverMinute(data)
}

// blockShares — minutes per category; b.split holds lengths the user typed, the rest share what's left
export function blockShares(b, dur) {
  const cats = b.cats || []
  if (cats.length < 2) return [{ cat: cats[0] ?? null, min: dur }]
  const split = b.split || {}
  let left = dur
  const fixed = {}
  for (const c of cats) if (split[c] != null) { fixed[c] = Math.min(split[c], left); left -= fixed[c] }
  const free = cats.filter((c) => fixed[c] == null)
  if (!free.length) return cats.map((c) => ({ cat: c, min: fixed[c] }))
  const each = Math.floor(left / free.length)
  return cats.map((c) => ({ cat: c, min: fixed[c] ?? (c === free[free.length - 1] ? left - each * (free.length - 1) : each) }))
}

export function blockEnd(b, isToday, nowMin) {
  if (b.end != null) return b.end
  return isToday ? Math.max(b.start, nowMin) : null
}

export function trackedMinutes(row, isToday, nowMin) {
  return (row.blocks || []).reduce((sum, b) => {
    const e = blockEnd(b, isToday, nowMin)
    return e == null ? sum : sum + Math.max(0, e - b.start)
  }, 0)
}

export function computedValue(field, row, data) {
  switch (field.type) {
    case 'weekday': return DAY_SHORT[weekday(row.date)]
    case 'week': return `Week ${weekOfMonth(row.date)}`
    case 'cycle': return cycleInfo(row.date, data.settings)
    default: return row.cells[field.id]
  }
}
