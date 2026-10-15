import { COLORS } from '../lib/schema.js'
import { MONTHS, toDate } from '../lib/time.js'
import { procrastination } from '../lib/procrastination.js'

const short = (iso) => `${toDate(iso).getDate()} ${MONTHS[toDate(iso).getMonth()].slice(0, 3)}`
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—')
const STATUS = { done: ['Done', 'green'], open: ['Still open', 'orange'], dropped: ['Dropped', 'gray'] }

const PHASE_NAME = { 'Prolif.': 'Proliferative phase', Ovulation: 'Ovulation', Luteal: 'Luteal phase', Late: 'Late cycle', Period: 'Period' }
const pc = (v) => `${Math.round(v * 100)}%`

// standOut — one sentence per value that is clearly more common on slip days than on other days
function standOut(x) {
  const vs = `${pc(x.slip)} of slip days vs ${pc(x.other)} of other days`
  if (x.kind === 'state') return `${x.name} on ${vs}.`
  if (x.kind === 'phase') return `${PHASE_NAME[x.name] || x.name} on ${vs}.`
  return `Friction "${x.name}" on ${x.n} slip day${x.n > 1 ? 's' : ''}${x.otherN ? ` vs ${x.otherN} other day${x.otherN > 1 ? 's' : ''}` : ` and never on other days`}.`
}

// insights — longest slip, stuck days, then what stands out against normal days
export function insights(p) {
  const out = []
  const top = p.pushed[0]
  if (top) out.push(`Longest slip: "${top.text}" sat ${top.days} days${top.status === 'done' ? ' before it got done' : top.status === 'dropped' ? ' and was dropped' : ' and is still open'}.`)
  if (p.stuck.length) out.push(`${p.stuck.length} stuck day${p.stuck.length > 1 ? 's' : ''} marked ☠️${p.diverts ? `, with ${p.diverts} diversions logged on them` : ''}.`)
  if (p.slipDays && p.otherDays) {
    p.stands.slice(0, 3).forEach((x) => out.push(standOut(x)))
    if (!p.stands.length) out.push(`No state, cycle phase or friction stood out: slip days (${p.slipDays}) looked like the other ${p.otherDays} days.`)
  } else if (p.slipDays) out.push(`Every logged day was a slip day, so there's nothing to compare against.`)
  if (p.tasks && !p.pushed.length && !p.stuck.length) out.push('Nothing slipped this month. Everything planned got done on the day.')
  return out
}

export function ProcrastinationCard({ rows, data, today, onOpen }) {
  const p = procrastination(rows, data, today)
  if (!p.tasks && !p.stuck.length) return null
  const notes = insights(p)
  return (
    <section className="card wide procrast">
      <div className="card-head"><h3>Procrastination</h3><span className="section-meta">Slip day: ↓ carried, → moved to Pending, ✅ ☑️ ‼️ ☠️ marks, and lines that keep coming back</span></div>
      <div className="tiles procrast-tiles">
        <div className="tile">
          <div className="tile-label">Done on the day</div>
          <div className="tile-value num">{pct(p.firstTry, p.tasks)}</div>
          <div className="tile-sub">{p.firstTry} of {p.tasks} tasks · {p.done} done in the end</div>
        </div>
        <div className="tile">
          <div className="tile-label">Pushed</div>
          <div className="tile-value num">{p.pushed.length}</div>
          <div className="tile-sub">{p.sent ? `${p.sent} moved to Pending · ` : ''}{p.open ? `${p.open} still open` : 'none still open'}{p.dropped ? ` · ${p.dropped} dropped` : ''}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Avg delay</div>
          <div className="tile-value num">{p.avgDelay == null ? '—' : `${Math.round(p.avgDelay * 10) / 10}d`}</div>
          <div className="tile-sub">first planned → ✅</div>
        </div>
        <div className="tile">
          <div className="tile-label">Stuck days</div>
          <div className="tile-value num">{p.stuck.length}</div>
          <div className="tile-sub">days marked ☠️</div>
        </div>
      </div>
      <div className="procrast-body">
        <div className="procrast-col">
          <div className="mini-head">Kept pushing</div>
          {p.pushed.length ? (
            <div className="mini-list">
              {p.pushed.slice(0, 6).map((x) => (
                <div key={x.first + x.text} className="procrast-row" onClick={() => onOpen(x.rowId)}>
                  <span className="procrast-text">{x.text}</span>
                  <span className="muted num">{short(x.first)} → {short(x.last)} · {x.days}d</span>
                  <span className="procrast-status" style={{ color: COLORS[STATUS[x.status][1]] }}>{STATUS[x.status][0]}</span>
                </div>
              ))}
            </div>
          ) : <div className="empty-note">Nothing was pushed to another day.</div>}
        </div>
        <div className="procrast-col">
          <div className="mini-head">Patterns</div>
          <ul className="procrast-notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      </div>
    </section>
  )
}
