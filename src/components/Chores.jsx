import { useEffect, useRef, useState } from 'react'
import { update } from '../lib/store.js'
import { BlockEditor } from './NoteEditor.jsx'
import { Popover, Menu } from './Popover.jsx'
import { Icon } from './icons.jsx'

const seed = () => []

export function Chores({ data }) {
  const sections = data.chores
  const [drag, setDrag] = useState(null)
  const [drop, setDrop] = useState(null)
  const [fresh, setFresh] = useState(null)
  useEffect(() => { if (!data.chores) update((d) => { d.chores = seed() }, { history: false }) }, [])
  if (!sections) return null

  const endDrag = () => { setDrag(null); setDrop(null) }
  const doDrop = (e) => {
    e.preventDefault()
    if (drag && drop && drag !== drop.id) update((d) => {
      const from = d.chores.findIndex((c) => c.id === drag)
      const [moved] = d.chores.splice(from, 1)
      const to = d.chores.findIndex((c) => c.id === drop.id)
      d.chores.splice(drop.pos === 'after' ? to + 1 : to, 0, moved)
    })
    endDrag()
  }
  const addSection = () => {
    const id = `c-${Date.now().toString(36)}`
    update((d) => { d.chores = [...(d.chores || []), { id, title: '', blocks: [{ type: 'checkListItem' }] }] })
    setFresh(id)
  }

  return (
    <div className="chores">
      <div className="view-head">
        <h1 className="view-title">Chores, DIY</h1>
        <div className="grow" />
        <button className="btn primary" onClick={addSection}>+ Section</button>
      </div>
      <div className="chores-grid">
        {sections.map((s) => (
          <ChoreCard key={s.id} section={s} autoFocus={s.id === fresh}
            dragging={drag === s.id} dropPos={drop?.id === s.id ? drop.pos : null}
            onDragStart={() => setDrag(s.id)} onDragEnd={endDrag} onDrop={doDrop}
            onDragOver={(e) => {
              if (!drag || drag === s.id) return
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              setDrop({ id: s.id, pos: e.clientX < r.left + r.width / 2 ? 'before' : 'after' })
            }} />
        ))}
      </div>
    </div>
  )
}

function ChoreCard({ section, autoFocus, dragging, dropPos, onDragStart, onDragEnd, onDragOver, onDrop }) {
  const [menu, setMenu] = useState(null)
  const timer = useRef(null)
  const pending = useRef(null)
  const initial = useRef(section.blocks?.length ? section.blocks : undefined).current
  const patch = (fn) => update((d) => { const c = (d.chores || []).find((x) => x.id === section.id); if (c) fn(c) })
  const flush = () => {
    clearTimeout(timer.current)
    if (!pending.current) return
    const blocks = pending.current
    pending.current = null
    update((d) => { const c = (d.chores || []).find((x) => x.id === section.id); if (c) c.blocks = blocks }, { fromEditor: true })
  }
  useEffect(() => flush, [])

  return (
    <section className={`chore-card ${dragging ? 'dragging' : ''} ${dropPos ? `drop-${dropPos}` : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
      <div className="chore-head" draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', section.title); onDragStart() }} onDragEnd={onDragEnd}>
        <span className="chore-grip" title="Drag to move"><Icon name="grip" size={14} /></span>
        <input
          className="chore-title"
          placeholder="Untitled"
          defaultValue={section.title}
          autoFocus={autoFocus}
          onBlur={(e) => { if (e.target.value !== section.title) patch((c) => { c.title = e.target.value }) }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
        <button className="row-more chore-more" onClick={(e) => setMenu(e.currentTarget)}>⋯</button>
      </div>
      <BlockEditor
        docId={`chores-${section.id}`}
        initial={initial}
        className="note-blocks chore-blocks"
        placeholder="To-do — type '@' for a date"
        onChange={(blocks) => { pending.current = blocks; clearTimeout(timer.current); timer.current = setTimeout(flush, 500) }}
      />
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)} align="right" width={180}>
          <Menu onPick={() => setMenu(null)} items={[
            { icon: 'x', label: 'Delete section', danger: true, run: () => { pending.current = null; clearTimeout(timer.current); update((d) => { d.chores = d.chores.filter((x) => x.id !== section.id) }) } },
          ]} />
        </Popover>
      )}
    </section>
  )
}
