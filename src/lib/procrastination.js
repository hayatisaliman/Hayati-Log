import { cycleInfo, cellText, marksList } from './schema.js'
import { diffDays } from './time.js'

// bare — variation selectors dropped so ☠ and ☠️ match
const bare = (s) => String(s).replace(/\uFE0F/g, '')
const hasMark = (text, list) => { const t = bare(text); return list.some((e) => t.includes(e)) }
const markText = (r, field) => (field ? cellText(r.cells[field]) : Object.values(r.cells || {}).filter((v) => typeof v === 'string' || Array.isArray(v)).map(cellText).join('\n'))
const onDay = (r, m) => m.emojis.length > 0 && hasMark(markText(r, m.field), m.emojis)
// markedOn — whether a Pattern Mark from Settings shows up in a row
export const markedOn = (r, m) => onDay(r, { ...m, emojis: (m.emojis || []).map(bare).filter(Boolean) })
const GAP = 3
const keyOf = (s) => s.toLowerCase().replace(/✅\s*\d+\/\d+/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const cleanText = (s) => s.replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s*✅\s*\d+\/\d+\s*$/, '').trim()

// taskLines — plan and pending lines, plus focus lines that were moved with ↓ / →
function taskLines(row, links) {
  const out = []
  for (const fid of ['plan', 'pending', 'focus']) {
    const v = row.cells[fid]
    if (!Array.isArray(v)) continue
    for (const t of v) {
      if (!t || typeof t !== 'object' || t.routine) continue
      const text = String(t.text || '')
      const todo = t.kind !== 'text'
      const moved = !!(t.carried || t.sent)
      const src = links.get(t.from || t.sentFrom)
      if (fid === 'focus' && !todo && !moved && !src) continue
      const key = src || keyOf(text)
      if (key.length < 3) continue
      if (t.id) links.set(t.id, key)
      out.push({ key, text: cleanText(text), done: !!t.done, counts: todo || moved || !!src, moved, sent: !!t.sent })
    }
  }
  return out
}

const MIN_GAP = 0.15
const MIN_RATIO = 1.5

// contrast — values clearly more common on slip days than on other logged days
function contrast(kind, slipRows, otherRows, valuesOf) {
  const count = (rs) => rs.reduce((m, r) => { for (const v of new Set(valuesOf(r))) m[v] = (m[v] || 0) + 1; return m }, {})
  const a = count(slipRows)
  const b = count(otherRows)
  return Object.entries(a).map(([name, n]) => {
    const slip = n / slipRows.length
    const other = (b[name] || 0) / otherRows.length
    return { kind, name, n, slip, other, otherN: b[name] || 0 }
  }).filter((x) => x.n >= 2 && x.slip - x.other >= MIN_GAP && (x.other === 0 || x.slip / x.other >= MIN_RATIO))
}

// procrastination — follow-through, pushed tasks and stuck days for one month
export function procrastination(rows, data, today) {
  const [stuckMark, ...custom] = marksList(data.settings).map((m) => ({ ...m, emojis: (m.emojis || []).map(bare).filter(Boolean), shown: (m.emojis || []).join(' ') }))
  const byKey = new Map()
  const links = new Map()
  let sent = 0
  for (const r of rows) {
    for (const t of taskLines(r, links)) {
      if (t.sent) sent++
      const list = byKey.get(t.key) || []
      const same = list.find((x) => x.date === r.date)
      if (same) { same.done ||= t.done; same.counts ||= t.counts; same.moved ||= t.moved }
      else list.push({ ...t, date: r.date, rowId: r.id })
      byKey.set(t.key, list)
    }
  }
  const lastDate = rows.length ? rows[rows.length - 1].date : today
  const runs = []
  for (const list of byKey.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date))
    let run = [list[0]]
    for (const x of list.slice(1)) {
      if (diffDays(x.date, run[run.length - 1].date) <= GAP && !run[run.length - 1].done) run.push(x)
      else { runs.push(run); run = [x] }
    }
    runs.push(run)
  }
  const tasks = runs.filter((r) => r.some((x) => x.counts))
  const pushed = tasks.filter((r) => r.length > 1 || r.some((x) => x.moved && !x.done)).map((r) => {
    const first = r[0]
    const last = r[r.length - 1]
    const status = last.done ? 'done' : diffDays(lastDate, last.date) <= GAP || last.date >= today ? 'open' : 'dropped'
    return { text: last.text || first.text, first: first.date, last: last.date, days: diffDays(last.date, first.date) + 1, times: r.length, status, rowId: first.rowId }
  }).sort((a, b) => b.days - a.days || b.times - a.times)
  const doneTasks = tasks.filter((r) => r[r.length - 1].done)
  const delays = pushed.filter((p) => p.status === 'done').map((p) => p.days - 1)

  const stateOpts = data.fields.find((f) => f.id === 'state')?.options || []
  const stuck = rows.filter((r) => onDay(r, stuckMark))
  const slipDays = new Set([...stuck.map((r) => r.date), ...pushed.flatMap((p) => rows.filter((r) => r.date >= p.first && r.date < p.last).map((r) => r.date))])
  const slipRows = rows.filter((r) => slipDays.has(r.date))
  const otherRows = rows.filter((r) => !slipDays.has(r.date) && Object.keys(r.cells).length)
  const stateOf = (r) => (r.cells.state || []).map((id) => stateOpts.find((o) => o.id === id)?.name).filter(Boolean)
  const phaseOf = (r) => { const c = cycleInfo(r.date, data.settings); return c ? [c.phase] : [] }
  const frictionOf = (r) => cellText(r.cells.friction).split('\n').map((s) => s.trim()).filter(Boolean)
  const markOf = (r) => custom.filter((m) => onDay(r, m)).map((m) => `${m.label} ${m.shown}`.trim())
  const stands = slipRows.length && otherRows.length
    ? [...contrast('state', slipRows, otherRows, stateOf), ...contrast('phase', slipRows, otherRows, phaseOf), ...contrast('friction', slipRows, otherRows, frictionOf), ...contrast('mark', slipRows, otherRows, markOf)]
      .sort((x, y) => (y.slip - y.other) - (x.slip - x.other))
    : []
  const diverts = stuck.reduce((n, r) => n + cellText(r.cells.rest).split('\n').filter((s) => s.trim()).length, 0)

  return {
    tasks: tasks.length,
    done: doneTasks.length,
    firstTry: doneTasks.filter((r) => r.length === 1).length,
    pushed,
    sent,
    open: pushed.filter((p) => p.status === 'open').length,
    dropped: pushed.filter((p) => p.status === 'dropped').length,
    avgDelay: delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : null,
    stuck: stuck.map((r) => r.date),
    slipDays: slipRows.length,
    otherDays: otherRows.length,
    stands, diverts,
    stuckLabel: stuckMark.shown,
    stuckField: stuckMark.field,
    marks: custom.map((m) => { const days = rows.filter((r) => onDay(r, m)); return { label: m.label, emojis: m.shown, n: days.length, slip: days.filter((r) => slipDays.has(r.date)).length } }).filter((m) => m.n),
  }
}
