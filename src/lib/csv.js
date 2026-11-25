import { computedValue } from './schema.js'
import { plainText } from './richText.js'
import { fmtClock, fmtDuration } from './time.js'

const quote = (v) => {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// cellCsv — one cell as plain text; checklist lines get [x] / [ ], ↓ and → stay visible
function cellCsv(field, row, data, now) {
  if (field.type === 'tracked') { const m = now.tracked(row); return m ? fmtDuration(m) : '' }
  const v = computedValue(field, row, data)
  if (v == null || v === '') return ''
  switch (field.type) {
    case 'cycle': return v ? `D${v.day} · ${v.phase}` : ''
    case 'time': return fmtClock(v)
    case 'checkbox': return v ? 'yes' : ''
    case 'select': return field.options?.find((o) => o.id === v)?.name || v
    case 'multi': return (Array.isArray(v) ? v : [v]).map((id) => field.options?.find((o) => o.id === id)?.name || id).join(', ')
    case 'todo':
    case 'mixed':
      if (!Array.isArray(v)) return plainText(v)
      return v.map((t) => {
        const text = plainText(t.text)
        if (t.kind === 'text') return text
        return `[${t.done ? 'x' : ' '}] ${text}${t.carried ? ' ↓' : ''}${t.sent ? ' →' : ''}`
      }).join('\n')
    default: return Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? plainText(x.text) : x)).join('\n') : plainText(v)
  }
}

// dailyLogCsv — every day as a row, every visible column as a column; BOM so Excel reads emoji
export function dailyLogCsv(data, now) {
  const fields = data.fields.filter((f) => !f.hidden)
  const rows = [...data.rows].sort((a, b) => a.date.localeCompare(b.date))
  const lines = [fields.map((f) => quote(f.name)).join(',')]
  for (const r of rows) lines.push(fields.map((f) => quote(f.type === 'date' ? r.date : cellCsv(f, r, data, now))).join(','))
  return `﻿${lines.join('\r\n')}\r\n`
}
