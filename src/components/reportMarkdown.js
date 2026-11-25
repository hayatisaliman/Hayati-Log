import { cellText, blockEnd, marksList } from '../lib/schema.js'
import { MONTHS, daysInMonth, fmtClock, fmtDuration, monthLabel, pad, toDate } from '../lib/time.js'
import { avg, sleepOn, clockWindow, inWindow } from '../lib/report.js'
import { procrastination, markedOn } from '../lib/procrastination.js'
import { cycleSummary } from './MonthReport.jsx'
import { quarterStats, qRange } from './QuarterReport.jsx'
import { insights } from './Procrastination.jsx'
import { groupShares } from './TimeBlocks.jsx'

const short = (iso) => `${toDate(iso).getDate()} ${MONTHS[toDate(iso).getMonth()].slice(0, 3)}`
const textOf = (row, id) => cellText(row.cells[id]).trim()
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const hrs = (m) => (m == null ? '—' : `${Math.round(m / 6) / 10}h`)

// clockAvg — average time of day, averaged inside one 24h window so 11 PM and 1 AM stay close
const clockAvg = (values) => {
  if (!values.length) return null
  const w0 = clockWindow(values)
  return avg(values.map((v) => inWindow(v, w0)))
}

// monthMarkdown — the Monthly Report as Markdown
export function monthMarkdown(data, month, now) {
  const rows = data.rows.filter((r) => r.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date))
  const n = daysInMonth(month)
  const dates = Array.from({ length: n }, (_, i) => `${month}-${pad(i + 1)}`)
  const rowOf = Object.fromEntries(data.rows.map((r) => [r.date, r]))
  const logged = rows.filter((r) => Object.keys(r.cells).length || r.blocks.length || r.notes)
  const starts = rows.map((r) => r.cells.start).filter((v) => v != null)
  const ends = rows.map((r) => r.cells.end).filter((v) => v != null)
  const awake = rows.filter((r) => r.cells.start != null && r.cells.end != null).map((r) => r.cells.end - r.cells.start)
  const sleeps = dates.map((d) => sleepOn(rowOf, d)?.m).filter((v) => v != null)
  const checkFields = data.fields.filter((f) => f.type === 'checkbox' && !f.hidden)
  const stateField = data.fields.find((f) => f.id === 'state')
  const stateCounts = (stateField?.options || []).map((o) => ({ o, n: rows.filter((r) => (r.cells.state || []).includes(o.id)).length })).filter((x) => x.n).sort((a, b) => b.n - a.n)
  const groups = {}
  let tracked = 0
  for (const r of rows) for (const b of r.blocks) {
    const e = blockEnd(b, r.date === now.today, now.minutesFor(r.date))
    const d = e == null ? 0 : Math.max(0, e - b.start)
    tracked += d
    for (const [g, v] of Object.entries(groupShares(data, b, d))) groups[g] = (groups[g] || 0) + v
  }
  const cyc = cycleSummary(data.settings, dates, now.today)

  const L = [`# ${monthLabel(month)} report`, '']
  if (data.monthGoals?.[month]) L.push(`Goal: ${data.monthGoals[month]}`, '')
  L.push('## Summary')
  L.push(`- Days logged: ${logged.length}/${n}`)
  if (starts.length) L.push(`- Average start: ${fmtClock(clockAvg(starts))}`)
  if (ends.length) L.push(`- Average end: ${fmtClock(clockAvg(ends))}`)
  if (awake.length) L.push(`- Average day length: ${fmtDuration(Math.round(avg(awake)))}`)
  if (sleeps.length) L.push(`- Average sleep: ${fmtDuration(Math.round(avg(sleeps)))} · ${sleeps.filter((m) => m < 6 * 60).length} nights under 6h`)
  for (const f of checkFields) L.push(`- ${f.name}: ${rows.filter((r) => r.cells[f.id]).length} days`)
  if (tracked) {
    L.push(`- Time tracked: ${fmtDuration(tracked)}`)
    for (const [g, v] of Object.entries(groups).sort((a, b) => b[1] - a[1])) L.push(`  - ${data.groups.find((x) => x.id === g)?.name || 'Uncategorised'}: ${fmtDuration(v)}`)
  }

  L.push('', '## State & cycle')
  if (stateCounts.length) L.push(`- State: ${stateCounts.map((s) => `${s.o.name} ×${s.n}`).join(', ')}`)
  for (const e of cyc.events) L.push(`- Period started ${short(e.start)}${e.status ? ` — ${e.status}${e.diff ? ` (${e.diff > 0 ? '+' : ''}${e.diff}d, cycle ${e.length} days)` : ` (cycle ${e.length} days)`}` : ''}`)
  if (cyc.lateNow) L.push(`- Period late by ${cyc.lateNow.late} days (D${cyc.lateNow.day})`)
  L.push(`- Period days: ${cyc.periodDays}${cyc.ranges.length ? ` (${cyc.ranges.join(', ')})` : ''}`)

  const p = procrastination(rows, data, now.today)
  if (p.tasks || p.stuck.length) {
    L.push('', '## Task Patterns')
    L.push(`- Done on the day: ${p.firstTry}/${p.tasks} tasks (${pct(p.tasks ? p.firstTry / p.tasks : null)}) · ${p.done} done in the end`)
    L.push(`- Pushed: ${p.pushed.length}${p.sent ? ` · ${p.sent} moved to Pending` : ''}${p.open ? ` · ${p.open} still open` : ''}${p.dropped ? ` · ${p.dropped} dropped` : ''}`)
    if (p.avgDelay != null) L.push(`- Average delay: ${Math.round(p.avgDelay * 10) / 10} days`)
    L.push(`- Stuck days${p.stuckLabel ? ` (${p.stuckLabel} in ${data.fields.find((f) => f.id === p.stuckField)?.name || 'any column'})` : ''}: ${p.stuck.length}`)
    if (p.pushed.length) {
      L.push('', '### Procrastination')
      for (const x of p.pushed.slice(0, 10)) L.push(`- ${x.text} — ${short(x.first)} → ${short(x.last)}, ${x.days} days, ${x.status}`)
    }
    const notes = insights(p)
    if (notes.length) {
      L.push('', '### Patterns')
      for (const t of notes) L.push(`- ${t}`)
    }
  }

  for (const id of ['learn']) {
    const f = data.fields.find((x) => x.id === id)
    const items = f ? rows.filter((r) => textOf(r, id)) : []
    if (!items.length) continue
    L.push('', `## ${f.name}`)
    for (const r of items) L.push(`- ${toDate(r.date).getDate()}: ${textOf(r, id).replace(/\n/g, ' · ')}`)
  }
  return L.join('\n') + '\n'
}

// quarterMarkdown — one quarter of the Quarterly Report, compared with the quarter before
export function quarterMarkdown(data, year, q, now) {
  const rowOf = Object.fromEntries(data.rows.map((r) => [r.date, r]))
  const s = quarterStats(data, year, q, now, rowOf)
  const prevYear = q === 1 ? String(+year - 1) : year
  const prevQ = q === 1 ? 4 : q - 1
  const p = quarterStats(data, prevYear, prevQ, now, rowOf)
  const head = `Q${q} ${year}`
  const prevHead = `Q${prevQ} ${prevYear}`
  const row = (label, a, b) => `| ${label} | ${a} | ${b} |`
  const clock = (v) => (v == null ? '—' : fmtClock(v))
  const dur = (v) => (v == null ? '—' : fmtDuration(Math.round(v)))
  const L = [`# ${head} report (${qRange(q)})`, '']
  const goals = [0, 1, 2].map((i) => `${year}-${pad((q - 1) * 3 + i + 1)}`).filter((m) => data.monthGoals?.[m])
  if (goals.length) {
    L.push('## Monthly goals')
    for (const m of goals) L.push(`- ${monthLabel(m)}: ${data.monthGoals[m]}`)
    L.push('')
  }
  L.push(`| | ${head} | ${prevHead} |`, '|---|---|---|')
  L.push(row('Days logged', `${s.logged}/${s.past}`, `${p.logged}/${p.past}`))
  L.push(row('Avg start', clock(s.start), clock(p.start)))
  L.push(row('Avg end', clock(s.end), clock(p.end)))
  L.push(row('Avg day length', dur(s.day), dur(p.day)))
  L.push(row('Avg sleep', dur(s.sleep), dur(p.sleep)))
  L.push(row('Tracked per day', hrs(s.trackedDay), hrs(p.trackedDay)))
  L.push(row('Work per day', hrs(s.workDay), hrs(p.workDay)))
  L.push(row('Rest per day', hrs(s.restDay), hrs(p.restDay)))
  for (const h of s.habits) L.push(row(h.f.name, pct(h.v), pct(p.habits.find((x) => x.f.id === h.f.id)?.v)))
  L.push(row('Avg cycle length', s.cycle == null ? '—' : `${Math.round(s.cycle)} days`, p.cycle == null ? '—' : `${Math.round(p.cycle)} days`))
  L.push(row('Period days', s.periodDays, p.periodDays))
  const tagged = s.states.filter((x) => x.n)
  if (tagged.length) {
    L.push('', '## State mix')
    const total = tagged.reduce((a, x) => a + x.n, 0)
    for (const x of [...tagged].sort((a, b) => b.n - a.n)) L.push(`- ${x.o.name}: ${x.n} days (${pct(x.n / total)} of tags)`)
  }
  const marks = marksList(data.settings).filter((m) => m.emojis?.length)
  if (marks.length) {
    const rowsIn = (st) => st.dates.filter((d) => d <= now.today).map((d) => rowOf[d]).filter(Boolean)
    const a = rowsIn(s)
    const b = rowsIn(p)
    const n = (rs, m) => rs.filter((r) => markedOn(r, m)).length
    L.push('', '## Pattern Marks', '', `| | ${head} | ${prevHead} |`, '|---|---|---|')
    for (const m of marks) L.push(row(`${m.emojis.join(' ')} ${m.label}`, n(a, m), n(b, m)))
  }
  return L.join('\n') + '\n'
}
