import { emptyData, newRow, todoId } from './schema.js'
import { addDays, diffDays, isoOf, monthKey, toDate } from './time.js'

const opt = (id, name, color) => ({ id, name, color })
const todo = (text, done = false, extra = {}) => ({ id: todoId(), text, done, ...extra })
const line = (text) => ({ id: todoId(), kind: 'text', text })
const rich = (s) => (typeof s === 'string' && s.includes('**') ? s.split(/\*\*(.+?)\*\*/).map((text, i) => ({ type: 'text', text, styles: i % 2 ? { bold: true } : {} })).filter((x) => x.text) : s)
const styled = (text, styles) => [{ type: 'text', text, styles }]
const p = (content, props) => ({ type: 'paragraph', content: rich(content), ...(props ? { props } : {}) })
const h = (level, content) => ({ type: 'heading', props: { level }, content })
const li = (content, children = []) => ({ type: 'bulletListItem', content: rich(content), children })
const ol = (content) => ({ type: 'numberedListItem', content: rich(content) })
const ck = (content, checked = false, props = {}) => ({ type: 'checkListItem', props: { checked, ...props }, content: rich(content) })
const toggle = (content, children = []) => ({ type: 'toggleListItem', content, children })
const hm = (h_, m = 0) => h_ * 60 + m
const round5 = (n) => Math.round(n / 5) * 5

function rng(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sampleFields() {
  return [
    { id: 'date', name: 'Date', type: 'date', width: 120, primary: true, icon: 'calendar' },
    { id: 'week', name: 'Week', type: 'week', width: 74, icon: 'calendar-check' },
    { id: 'cycle', name: 'Cycle', type: 'cycle', width: 110, icon: 'drop' },
    {
      id: 'state', name: 'Mood', type: 'multi', width: 130, icon: 'smile',
      options: [opt('great', 'Great', 'green'), opt('okay', 'Okay', 'cyan'), opt('tired', 'Tired', 'blue'), opt('stressed', 'Stressed', 'orange'), opt('sick', 'Sick', 'gray')],
    },
    { id: 'start', name: 'Wake up', type: 'time', width: 92, icon: 'sun' },
    { id: 'plan', name: 'Day Plan', type: 'mixed', width: 220, icon: 'star' },
    { id: 'pending', name: 'Pending', type: 'todo', width: 210, icon: 'progress' },
    { id: 'focus', name: 'Work Focus', type: 'mixed', width: 200, icon: 'target' },
    { id: 'done', name: 'Wins', type: 'mixed', width: 220, icon: 'trophy' },
    { id: 'notes', name: 'Notes', type: 'mixed', width: 220, icon: 'pen-line' },
    { id: 'tracked', name: 'Tracked', type: 'tracked', width: 92, icon: 'stopwatch' },
    { id: 'exercise', name: 'Workout', type: 'checkbox', width: 84, calc: 'checked', icon: 'dumbbell' },
    { id: 'read', name: 'Read', type: 'checkbox', width: 64, calc: 'checked', icon: 'book-open' },
    { id: 'water', name: 'Water', type: 'checkbox', width: 70, calc: 'checked', icon: 'drop' },
    { id: 'learn', name: 'Learned', type: 'text', width: 180, icon: 'bulb' },
    { id: 'friction', name: 'Got in the way', type: 'text', width: 170, icon: 'waves' },
    { id: 'rest', name: 'Unwind', type: 'text', width: 150, icon: 'coffee' },
    { id: 'end', name: 'Bedtime', type: 'time', width: 92, icon: 'moon' },
  ]
}

const ROUTINES = [
  { id: 'r-vitamins', text: 'Take vitamins', days: [0, 1, 2, 3, 4, 5, 6] },
  { id: 'r-plants', text: 'Water plants', days: [0, 3] },
  { id: 'r-bins', text: 'Take out the bins', days: [2] },
  { id: 'r-rent', text: 'Pay rent', kind: 'date', date: 1 },
]
const routinesOn = (date) => {
  const d = toDate(date)
  return ROUTINES.filter((x) => (x.kind === 'date' ? x.date === d.getDate() : x.days.includes(d.getDay())))
}

const WORK = [
  ['Draft newsletter for next week', 'Reply to client feedback', 'Update project timeline'],
  ['Prep slides for Thursday review', 'Review designs with Priya', 'Clear inbox'],
  ['Write Q4 campaign brief', 'Check analytics dashboard', 'Book room for workshop'],
  ['Finish landing page copy', 'Send invoice to vendor', 'Plan team lunch'],
  ['Outline case study', 'Fix broken links on blog', 'Prep for 1:1'],
  ['Social posts for the launch', 'Interview a customer', 'Write meeting notes'],
]
const PLAN_WORKDAY = ['30 min walk', 'Pick up dry cleaning', 'Spanish lesson (Duolingo)', 'Call Mum', 'Buy birthday card for Alex', 'Meal prep for tomorrow', 'Book a haircut', 'Pay credit card bill', 'Post the parcel']
const PLAN_WEEKEND = ['Groceries', 'Laundry', 'Clean the bathroom', 'Call grandma', 'Farmers market', 'Clean the fridge', 'Bike ride', 'Change bed sheets']
const PENDING = ['Call insurance about the claim', 'Renew gym membership', 'Return the online order', 'Schedule car service', 'Reply to landlord', 'Cancel unused subscription', 'Update CV']
const WINS = ['Sent the newsletter on time', 'Client approved the new layout', 'Finished the brief in one sitting', 'Inbox zero before lunch', 'Good feedback in the review', 'Helped a teammate get unblocked', 'Closed 6 tickets', 'Presented without notes', 'Said no to a meeting I didn’t need']
const LEARNED = ['⌘⇧V pastes without formatting', 'Spanish: “ojalá” = I hope', 'Batching email twice a day saves time', 'Stretching before runs helps my knees', '40 min focus blocks suit me better than 25', 'Figma auto-layout shortcuts', 'How to read a P&L', 'Spanish: “tengo ganas de” = I feel like']
const FRICTION = ['Too many meetings', 'Slept badly', 'Notifications on', 'Unclear brief', 'Noisy office', 'Skipped lunch', 'Phone in the bedroom']
const UNWIND = ['Walk in the park', 'Cooked dinner', 'Watched a movie', 'Called Mum', 'Board games', 'Long bath', 'Read in bed', 'Yoga stretch', 'Podcast + tea']
const NOTES = [['Ask IT about the VPN issue'], ['Priya out Friday — move design review'], ['Idea: monthly customer story series'], ['Remember: dentist reminder card on the fridge']]

function sampleRows(today, nowMin) {
  const r = rng(11)
  const pick = (a) => a[Math.floor(r() * a.length)]
  const chance = (x) => r() < x
  const first = `${today.slice(0, 4)}-01-01`
  const mon = mondayOf(today)
  const year = today.slice(0, 4)
  const TRIPS = [
    { from: `${year}-01-01`, days: 6, stay: true, sleep: () => [hm(10) + r() * 90, hm(24, 40) + r() * 90] },
    { from: `${year}-02-16`, days: 5, sleep: () => [hm(5, 50) + r() * 30, hm(20, 50) + r() * 40], plans: ['First lift at 8', 'Ski lesson', 'Black run with Alex', 'Hot chocolate break'], rest: 'Sauna' },
    { from: `${year}-04-13`, days: 6, stay: true, sleep: () => [hm(5, 40) + r() * 30, hm(24, 30) + r() * 70] },
    { from: `${year}-07-13`, days: 8, sleep: (i) => (i < 3 ? [hm(4) + r() * 50, hm(19, 45) + r() * 45] : [hm(7, 30) + r() * 60, hm(23) + r() * 60]), plans: ['Ubud rice terraces', 'Surf lesson', 'Temple visit', 'Snorkelling trip'], rest: 'Beach sunset' },
    { from: `${year}-10-12`, days: 7, stay: true, sleep: () => [hm(5, 15) + r() * 30, hm(21, 40) + r() * 40] },
    { from: `${year}-05-15`, days: 9, sleep: (i) => (i < 3 ? [hm(4) + r() * 60, hm(20) + r() * 60] : [hm(7) + r() * 100, hm(22, 30) + r() * 100]), plans: ['Tsukiji market breakfast', 'Day trip to Nikko', 'Shibuya at night', 'TeamLab museum', 'Ramen hunt'], rest: 'Onsen' },
    { from: `${year}-08-03`, days: 6, sleep: () => [hm(10, 30) + r() * 70, hm(25) + r() * 70], plans: ['Central Park walk', 'Broadway show', 'Brooklyn Bridge at sunset', 'Client visit downtown'], rest: 'Rooftop bar' },
    { from: addDays(mon, -21), days: 5, sleep: () => [hm(9, 30) + r() * 80, hm(24, 30) + r() * 70], plans: ['Explore Alfama', 'Day trip to Sintra', 'Beach day in Cascais', 'Food tour', 'Museum + Tram 28'], rest: 'Sunset by the river' },
  ]
  const tripOf = (date) => { for (const t of TRIPS) { const i = diffDays(date, t.from); if (i >= 0 && i < t.days) return { ...t, i } } return null }
  const sick = new Set([addDays(first, 38), addDays(first, 39), addDays(first, 190), addDays(first, 191), addDays(first, 192)])
  const PROFILE = [
    { workout: 0.5, read: 0.6, water: 0.6, wake: 5, skip: 0.1, mood: ['great', 'okay', 'okay', 'tired'] },
    { workout: 0.3, read: 0.35, water: 0.45, wake: 25, skip: 0.3, mood: ['okay', 'tired', 'tired', 'stressed', 'stressed'] },
    { workout: 0.55, read: 0.25, water: 0.75, wake: 10, skip: 0.2, mood: ['great', 'great', 'okay', 'tired'] },
    { workout: 0.65, read: 0.6, water: 0.8, wake: -10, skip: 0.04, mood: ['great', 'okay', 'okay', 'okay', 'tired', 'stressed'] },
  ]
  const rows = []
  for (let date = first; date <= today; date = addDays(date, 1)) {
    const k = diffDays(today, date)
    const isToday = k === 0
    const pf = PROFILE[Math.floor(toDate(date).getMonth() / 3)]
    const trip = tripOf(date)
    if (k > 3 && !trip && chance(pf.skip)) continue
    const dow = toDate(date).getDay()
    const kind = trip && !trip.stay ? 'trip' : sick.has(date) ? 'sick' : dow === 0 || dow === 6 ? 'weekend' : 'work'
    const row = newRow(date)
    const c = row.cells
    const past = !isToday
    const done = (p_) => past && chance(p_)

    c.start = round5(kind === 'work' ? hm(6, 30) + r() * 50 + pf.wake : kind === 'weekend' ? hm(8) + r() * 100 : kind === 'trip' ? hm(7, 30) + r() * 60 : hm(9) + r() * 60)
    if (past) c.end = round5(kind === 'weekend' && chance(0.2) ? hm(24, 15) + r() * 90 : Math.min(hm(23, 55), hm(22, 10) + r() * 80 + (kind === 'weekend' ? 25 : 0)))
    if (kind === 'weekend' && c.end > hm(24)) c.start = round5(hm(9, 30) + r() * 90)
    if (trip) { const [w, b] = trip.sleep(trip.i); c.start = round5(w); if (past) c.end = round5(b) }
    if (trip?.stay && trip.from.endsWith('-04-13')) c.state = ['stressed', 'tired']
    c.state = kind === 'trip' ? (c.start < hm(6) ? ['tired'] : [pick(['great', 'great', 'okay'])]) : kind === 'sick' ? ['sick', ...(chance(0.5) ? ['tired'] : [])] : kind === 'weekend' ? [pick(['great', 'great', 'okay', 'tired'])] : [pick(pf.mood)]
    if (kind === 'work' && chance(0.12)) c.state = [...new Set([...c.state, pick(['tired', 'stressed'])])]

    const due = routinesOn(date)
    row.routineDone = due.map((x) => x.id)
    const plan = due.map((x) => todo(x.text, done(0.85), { routine: x.id }))
    if (kind === 'work') for (const t of new Set([pick(PLAN_WORKDAY), pick(PLAN_WORKDAY)])) plan.push(todo(t, done(0.7)))
    if (kind === 'weekend') { for (const t of new Set([pick(PLAN_WEEKEND), pick(PLAN_WEEKEND), pick(PLAN_WEEKEND)])) plan.push(todo(t, done(0.75))); if (chance(0.3)) plan.push(line('Lazy morning, no screens till 10')) }
    if (kind === 'trip') plan.push(line(`🏝️ ${pick(trip.plans)}`))
    if (kind === 'sick') plan.push(line('Rest. Cancelled everything.'))
    if (trip?.stay && trip.from.endsWith('-10-12')) plan.push(todo(trip.i ? 'Puppy walk at 6' : 'Pick up Milo 🐶', done(0.9)))
    if (trip?.stay && trip.from.endsWith('-04-13') && kind === 'work') plan.push(line('Deadline week. Late nights.'))

    const w = pick(WORK)
    const focusTodo = todo(w[1], done(0.8))
    if (kind === 'work') {
      c.focus = [line(`**${w[0]}**`), focusTodo, todo(w[2], done(0.6))]
      if (past && chance(0.06)) c.focus.push(line(`☠️ Couldn’t get into ${w[0].toLowerCase()}`))
      if (past && chance(0.8)) c.done = [line(pick(WINS)), ...(chance(0.25) ? [line(pick(WINS))] : [])]
      if (chance(0.15)) c.notes = pick(NOTES).map(line)
      if (chance(0.09)) c.notes = [...(c.notes || []), line('🤕 Headache after lunch')]
      if (chance(0.15)) c.pending = [todo(pick(PENDING), done(0.5))]
    }
    if (past && kind !== 'sick') {
      if (chance(kind === 'trip' ? 0.2 : pf.workout)) c.exercise = true
      if (chance(pf.read)) c.read = true
      if (chance(pf.water)) c.water = true
      if (chance(0.45)) c.learn = pick(LEARNED)
      if (kind === 'work' && chance(0.4)) c.friction = pick(FRICTION)
      if (chance(0.8)) c.rest = kind === 'trip' ? trip.rest : pick(UNWIND)
    }

    const seq = kind === 'work' ? [
      ...(c.exercise || chance(0.3) ? [['exercise', 30, pick(['Morning walk', 'Gym', 'Run']), 'move']] : []),
      ['meals', 25, 'Breakfast'],
      ...(chance(0.4) ? [['travel', 30, 'Commute']] : []),
      ['email', 20 + r() * 25, 'Inbox'],
      ['work', 110 + r() * 70, w[0], 'target'],
      ['meals', 40 + r() * 20, 'Lunch'],
      ['meetings', 30 + r() * 90, pick(['Team standup + sync', 'Client call', 'Design review', 'Workshop prep'])],
      ['work', 80 + r() * 60, w[1], 'sync'],
      ...(chance(0.6) ? [['break', 15, 'Tea break']] : []),
      ...(chance(0.7) ? [['work', 40 + r() * 50, w[2], 'target']] : []),
      ['meals', 40, 'Dinner'],
      ...(chance(0.5) ? [['learning', 25, 'Spanish practice']] : []),
      ...(chance(0.7) ? [['entertainment', 45 + r() * 60, pick(['TV show', 'YouTube', 'Video games'])]] : []),
      ...(chance(0.4) ? [['selfcare', 20, 'Skincare + wind down']] : []),
    ] : kind === 'weekend' ? [
      ['meals', 40, 'Slow breakfast'],
      ...(c.exercise ? [['exercise', 60 + r() * 30, pick(['Long run', 'Yoga class', 'Swim']), 'move']] : []),
      ['errands', 60 + r() * 40, 'Groceries + errands'],
      ['chores', 45 + r() * 45, 'Laundry & tidy up'],
      ...(chance(0.6) ? [['social', 90 + r() * 90, pick(['Coffee with friends', 'Lunch with family', 'Picnic'])]] : []),
      ['meals', 45, 'Dinner'],
      ['entertainment', 90 + r() * 50, pick(['Movie night', 'Board games', 'Series binge'])],
    ] : kind === 'trip' ? [
      ['meals', 45, 'Breakfast at the café'],
      ['social', 180 + r() * 60, 'Sightseeing'],
      ['meals', 75, 'Long lunch'],
      ['travel', 60, 'Train + tram'],
      ['social', 120, 'Wandering around'],
      ['meals', 90, 'Dinner out'],
    ] : [
      ['sleep', 120, 'Nap'],
      ['meals', 30, 'Soup'],
      ['entertainment', 120, 'Couch + Netflix'],
      ['sleep', 90, 'Nap'],
    ]
    let cur = c.start + 10 + r() * 15
    const blocks = []
    for (const [cat, len, text, tag] of seq) {
      const start = round5(cur + r() * 10)
      const end = start + round5(len * (0.85 + r() * 0.35))
      if (end > hm(23, 50)) break
      cur = end
      const b = { id: `b-${date}-${start}`, start, end, cats: [cat], text, plan: null }
      if (tag === 'target' && chance(0.6)) b.plan = Math.max(30, Math.round((end - start) * (0.8 + r() * 0.35) / 15) * 15)
      if (tag === 'sync' && chance(0.6)) {
        b.plan = Math.round((end - start) / 30) * 30 || 30
        Object.assign(focusTodo, { cats: [cat], plan: b.plan })
        b.todo = b.syncItem = focusTodo.id
      }
      if (tag === 'move' && chance(0.5)) {
        const t = todo(text, true, { cats: [cat], plan: 30 })
        plan.push(t)
        b.plan = 30
        b.todo = b.syncItem = t.id
      }
      blocks.push(b)
    }
    row.blocks = isToday ? blocks.filter((b) => b.end <= nowMin) : blocks
    c.plan = plan
    rows.push(row)
  }

  const at = (n) => rows.find((x) => x.date === addDays(today, -n))
  let prev = null
  for (const n of [3, 2, 1, 0]) {
    const t = todo('Call insurance about the claim', false, { ...(n ? { carried: true } : {}), ...(prev ? { from: prev.id } : {}) })
    at(n).cells.pending = [...(at(n).cells.pending || []).filter((x) => x.text !== t.text), t]
    prev = t
  }
  const y = at(1)
  const t = at(0)
  const carried = todo('Renew passport online', false, { carried: true })
  const sent = todo('Return library books', false, { sent: true })
  y.cells.plan = [...y.cells.plan, carried, sent]
  t.cells.plan = [...t.cells.plan, todo('Renew passport online', false, { from: carried.id })]
  t.cells.pending = [...t.cells.pending, todo('Return library books', false, { sentFrom: sent.id }), todo('Book dentist appointment'), todo('Fix squeaky door')]
  y.cells.pending = [...y.cells.pending, todo('Order new running shoes', true)]

  const workdays = rows.filter((x) => x.date.startsWith(monthKey(today)) && x.date < today && x.cells.focus)
  workdays.forEach((x, i) => {
    if (i % 4 === 1) x.cells.notes = [...(x.cells.notes || []), line('🤕 Headache after lunch')]
    if (i % 7 === 3) x.cells.focus = [...x.cells.focus, line('☠️ Couldn’t get started, too foggy')]
  })

  const early = rows.filter((x) => x.date.startsWith(monthKey(today))).slice(0, 4)
  if (early.length === 4 && early[3].date < addDays(today, -3)) {
    const [a, b, c, e] = early
    const car1 = todo('Book car service', false, { carried: true })
    const car2 = todo('Book car service', false, { carried: true, from: car1.id })
    const card = todo('Send thank-you card', false, { sent: true })
    a.cells.plan = [...a.cells.plan, card]
    a.cells.pending = [car1, todo('Reply to landlord', true), todo('Cancel unused subscription', true)]
    b.cells.pending = [car2, todo('Send thank-you card', true, { sentFrom: card.id }), todo('Renew gym membership', true)]
    c.cells.pending = [todo('Book car service', true, { from: car2.id }), todo('Pick up parcel from the post office', true)]
    e.cells.pending = [todo('Return the online order'), todo('Update CV', true)]
  }
  return { rows, first }
}

function mondayOf(iso) {
  const d = toDate(iso).getDay()
  return addDays(iso, d === 0 ? -6 : 1 - d)
}

function sampleWeeks(today) {
  const mon = mondayOf(today)
  return {
    [addDays(mon, -21)]: { blocks: [
      p('Lisbon trip ✈️ — rest and explore', { backgroundColor: 'blue' }),
      ck('Send postcards'),
      p(styled('Out of office all week', { textColor: 'blue' })),
      toggle('Done', [ck('Day trip to Sintra', true), ck('Tram 28', true), ck('Pastéis de nata', true)]),
    ] },
    [addDays(mon, -14)]: { blocks: [
      p('Get back into a routine', { backgroundColor: 'gray' }),
      ck('Doctor follow-up', false, { backgroundColor: 'red' }),
      ck('Gym 3×'),
      p(styled('Busy week — keep evenings free', { textColor: 'orange' })),
      toggle('Done', [ck('Unpack and do laundry', true), ck('Meal prep Sunday', true)]),
    ] },
    [addDays(mon, -7)]: { blocks: [
      p('Finish the campaign brief · run 3×', { backgroundColor: 'green' }),
      ck('Book flights for the holidays', false, { backgroundColor: 'yellow' }),
      toggle('Done', [ck('Write Q4 campaign brief', true), ck('Run Mon / Wed / Sat', true), ck('Dinner with Alex', true)]),
    ] },
    [mon]: { blocks: [
      p('Ship the landing page · read 2 chapters', { backgroundColor: 'orange' }),
      { type: 'checkListItem', props: { checked: false }, content: [{ type: 'text', text: 'Landing page copy final — ', styles: {} }, { type: 'text', text: 'due Thursday', styles: { textColor: 'red', bold: true } }] },
      ck('Review designs with Priya', false, { backgroundColor: 'blue' }),
      ck('Book dentist appointment'),
      ck('Read 2 chapters of current book', false, { backgroundColor: 'green' }),
      toggle('Done', [ck('Plan team lunch', true)]),
    ] },
  }
}

function sampleNotes(now) {
  const n = (id, title, group, blocks, body, ago = 0) => ({ id, title, group, blocks, body, created: now - ago - 86400000 * 3, updated: now - ago })
  return [
    n('n-welcome', 'Welcome to Hayati Log 👋', null, [
      p('This is example data. When you’re done looking around, click **Delete All Data** in Settings ⚙️ to start fresh.', { backgroundColor: 'orange' }),
      h(2, 'Writing in Notes'),
      li('Type **/** on an empty line to open the block menu: headings, lists, checklists, toggles, Label Box, Date, images, video and more. Keep typing to filter it, e.g. /check.'),
      li('Type **@** to drop in a date.'),
      li('Select text to make it bold, italic, underlined, struck through, code or coloured.'),
      li('Hover a block and drag the ⋮⋮ handle on its left to move it. Click the handle for colours, or to move the block to another note.'),
      li('Notes sit in folders in the sidebar. Drag them to reorder, or use ⋯ to rename, move or delete.'),
      li('Memos are the coloured sticky notes at the top of the sidebar, for quick lists.'),
      h(2, 'Daily log'),
      li('One row per day. Click a cell to edit it. Add, rename, hide or reorder columns from a column header.'),
      li('In checklist cells, ↓ carries an unfinished task to tomorrow and → moves it to tomorrow’s Pending. The orange number shows how many days it has been waiting.'),
      li('Routines from Settings are added to Day Plan on the days they are due.'),
      h(2, 'Stopwatch & time blocks'),
      p('There is **one stopwatch**. You can start, pause and stop it from three places, and they all show the same clock:'),
      li('**Mac menu bar → Stopwatch:** pick a category, or Specify… to type what you are doing.'),
      li('**Bottom of the sidebar:** the Start Time Log button. While it runs, click the clock to pause or stop.'),
      li('**Daily log:** hover a to-do and click its ⏱ to time that task.'),
      p('Whatever you start becomes a **time block** for today:'),
      li('The **Time Blocks** page lists each block with its time, length, category and activity. Edit any of them, or add blocks by hand afterwards.'),
      li('A block started from a to-do stays linked to that line. Its time shows next to the line, and the line’s 🏷 Category / Target carry over to the block.'),
      li('Set a **Target** to see whether a block ran over (✓ or +time).'),
      li('**Sync log** writes a block into that day’s Day Plan as a line. Blocks started from a to-do are already synced.'),
      li('The **Tracked** column adds up each day’s blocks, and the Monthly and Quarterly reports roll them up by category and group.'),
      h(3, 'Menu bar (Mac app)'),
      li('Three menu bar items: **Timer** (a countdown that asks “It’s done / Need more time”), **Stopwatch** and **Note** (a short text in the menu bar, e.g. today’s one thing).'),
      li('Closing the window keeps the menu bar running. Turn on Open at login in Settings → Menu Bar.'),
      li('The menu bar only exists in the installed Mac app, not in a browser.'),
      h(2, 'Report: Task Patterns'),
      p('This card on the Monthly Report shows how your to-dos went. It works from checkboxes alone, no setup needed.'),
      li('A checklist item in Day Plan, Pending or Work Focus counts as a task. Ticked on the same day means done on the day. Routines are left out.'),
      li('↓ or → on a task, or writing it again within 3 days, counts it as pushed. Those tasks are listed under **Procrastination**.'),
      li('**Stuck day:** put ☠️ in Work Focus on a day you just couldn’t get going.'),
      li('**Your own marks:** in Settings ⚙️ → Pattern Marks, add a label, a column and an emoji, e.g. Headache 🤕 in Notes. They’re counted under **Patterns**.'),
      p('Patterns also compares slip days with your other days using Mood, Cycle, Got in the way and your marks, so the more you fill in, the sharper it gets.'),
    ], 'Welcome to Hayati Log. Type / for the block menu, @ for a date. Daily log, stopwatch, time blocks, task patterns.'),
  ]
}

function sampleChores(today) {
  const last = (text, daysAgo, checked = false) => ({ type: 'checkListItem', props: { checked }, content: [{ type: 'text', text: `${text} `, styles: {} }, { type: 'date', props: { date: addDays(today, -daysAgo) } }] })
  return [
    { id: 'c-car', title: '🚗 Car', blocks: [last('Oil change', 96), last('Tyre rotation', 204), last('Car wash', 12), last('Wiper blades', 330)] },
    { id: 'c-house', title: '🏠 House', blocks: [last('Air-con service', 142), last('Deep clean kitchen', 31), last('Replace water filter', 77), last('Clean gutters', 213), last('Smoke alarm batteries', 301)] },
    { id: 'c-pet', title: '🐶 Milo', blocks: [last('Vet check-up', 158), last('Flea & tick drops', 26), last('Grooming', 41), last('Nail trim', 9)] },
    { id: 'c-health', title: '🩺 Health', blocks: [last('Dentist', 183), last('Eye test', 402), last('Haircut', 36), last('Blood test', 251)] },
    { id: 'c-diy', title: '🔧 DIY', blocks: [ck('Fix squeaky door'), ck('Hang shelves in the hallway'), ck('Repaint the balcony chair', true)] },
  ]
}

function sampleMemos() {
  const memo = (id, color, blocks, text) => ({ id, color, blocks, text })
  return [
    memo('m-fresh', 'm2', [p('This is example data. When you’re done, click **Delete All Data** in Settings ⚙️')], 'This is example data. When you’re done, click Delete All Data in Settings ⚙️'),
    memo('m-groceries', 'm3', [p('**Groceries**'), li('Oat milk'), li('Coffee beans')], 'Groceries\nOat milk\nCoffee beans'),
    memo('m-quote', 'm6', [p('“Small steps every day.”')], '“Small steps every day.”'),
  ]
}

function sampleCycle(today, first) {
  const lens = [28, 31, 27, 29, 26, 30, 28, 33, 27, 28, 29, 27, 30]
  const starts = []
  for (let d = addDays(today, -2), i = 0; d >= first; d = addDays(d, -lens[i++ % lens.length])) starts.unshift(d)
  return { cycleStarts: starts, periodEnds: starts.slice(0, -1).map((s, i) => addDays(s, i % 2 ? 4 : 5)) }
}

// sampleData — demo persona shown on first launch
export function sampleData(now = new Date()) {
  const today = isoOf(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const { rows, first } = sampleRows(today, nowMin)
  const ms = [monthKey(today)]
  for (let i = 1; i < 6; i++) ms.push(monthKey(addDays(`${ms[i - 1]}-01`, -1)))
  const base = emptyData()
  return {
    ...base,
    sample: true,
    welcomePending: true,
    dayColumnRemoved: true, todoMigrated: true, todoCleaned: true, iconsAssigned: true, mixedType: true, mixedNotes: true,
    settings: {
      ...base.settings,
      ...sampleCycle(today, first),
      routines: ROUTINES,
      marks: [
        { id: 'stuck', label: 'Stuck day', field: 'focus', emojis: ['☠️'] },
        { id: 'mk-holiday', label: 'Holiday', field: 'plan', emojis: ['🏝️'] },
        { id: 'mk-headache', label: 'Headache', field: 'notes', emojis: ['🤕'] },
      ],
      choresTitle: 'Home',
      choresIcon: 'home',
    },
    months: [monthKey(today)],
    monthGoals: {
      [ms[0]]: 'Launch the campaign · run 12 times · finish 2 books',
      [ms[1]]: 'Lisbon trip, then back to routine',
      [ms[2]]: 'Settle into the new role · cook at home more',
      [ms[3]]: 'Start running again · drink more water',
      [ms[4]]: 'Summer: less screen time, more outside',
      [ms[5]]: 'Get through the busy season · sleep by 11',
    },
    weeks: sampleWeeks(today),
    noteGroups: [],
    notes: sampleNotes(now.getTime()),
    memos: sampleMemos(),
    chores: sampleChores(today),
    fields: sampleFields(),
    rows,
  }
}
