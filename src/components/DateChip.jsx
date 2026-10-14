import { useState } from 'react'
import { createReactInlineContentSpec } from '@blocknote/react'
import { addDays, isoOf, shortDate } from '../lib/time.js'
import { Popover } from './Popover.jsx'
import { Calendar } from './DatePicker.jsx'
import { Icon } from './icons.jsx'

const today = () => isoOf(new Date())

export const insertDate = (editor, date = today()) => editor.insertInlineContent([{ type: 'date', props: { date } }, ' '])

// DateChip — inline date, click opens the calendar
function DateChip({ inlineContent, updateInlineContent }) {
  const [el, setEl] = useState(null)
  const date = inlineContent.props.date || today()
  return (
    <span className="date-chip" contentEditable={false}>
      <button className="date-chip-btn" title="Change date" onMouseDown={(e) => e.preventDefault()} onClick={(e) => setEl(e.currentTarget)}>
        <Icon name="calendar" size={13} />{shortDate(date)}
      </button>
      {el && (
        <Popover anchor={el} onClose={() => setEl(null)} width={260}>
          <Calendar value={date} onPick={(d) => { updateInlineContent({ type: 'date', props: { date: d } }); setEl(null) }} />
        </Popover>
      )}
    </span>
  )
}

export const dateInline = createReactInlineContentSpec({ type: 'date', propSchema: { date: { default: '' } }, content: 'none' }, { render: DateChip })

export const dateMenuItems = (editor) => [['Today', 0], ['Yesterday', -1], ['Tomorrow', 1]].map(([title, n]) => {
  const date = addDays(today(), n)
  return { title, subtext: shortDate(date), onItemClick: () => insertDate(editor, date) }
})
