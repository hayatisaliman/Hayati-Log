import { useEffect, useMemo, useRef } from 'react'
import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs, defaultInlineContentSpecs, filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import { codeBlockOptions, syntaxHighlighter } from '@blocknote/code-block'
import {
  BasicTextStyleButton, BlockColorsItem, ColorStyleButton, CreateLinkButton, DragHandleMenu, FormattingToolbar,
  FormattingToolbarController, NestBlockButton, RemoveBlockItem, SideMenu, SideMenuController, TextAlignButton,
  UnnestBlockButton, blockTypeSelectItems, useBlockNoteEditor, useComponentsContext, useCreateBlockNote,
  useDictionary, useExtensionState, usePortalElement, SuggestionMenuController, getDefaultReactSlashMenuItems,
} from '@blocknote/react'
import { SideMenuExtension } from '@blocknote/core/extensions'
import { en } from '@blocknote/core/locales'
import { Plugin } from 'prosemirror-state'
import { detectEdgePosition, locales as columnLocales, multiColumnDropCursor, withMultiColumn } from '@blocknote/xl-multi-column'
import { DEFAULT_NOTE_COLORS, NOTE_COLOR_NAMES, hueName } from '../lib/schema.js'
import { getData, releaseEditor, setEditor } from '../lib/store.js'
import { shortDate } from '../lib/time.js'
import { Icon } from './icons.jsx'
import { videoBlock } from './VideoBlock.jsx'
import { dateInline, dateMenuItems, insertDate } from './DateChip.jsx'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'

const noteDictionary = () => {
  const custom = getData()?.settings.noteColors || {}
  const names = Object.fromEntries(NOTE_COLOR_NAMES.map((n) => [n, hueName(custom[n] || DEFAULT_NOTE_COLORS[n])]))
  return { ...en, color_picker: { ...en.color_picker, colors: { ...en.color_picker.colors, ...names } } }
}

const { audio, video, file, ...blockSpecs } = defaultBlockSpecs
const noteBlockSpecs = { ...blockSpecs, video: videoBlock(), codeBlock: createCodeBlockSpec({ ...codeBlockOptions, defaultLanguage: 'text' }) }

const schema = BlockNoteSchema.create({ blockSpecs: noteBlockSpecs, inlineContentSpecs: { ...defaultInlineContentSpecs, date: dateInline } })
const columnSchema = withMultiColumn(schema)

// triggerOf — character that opened the current suggestion menu ('/' or '@')
const triggerOf = (editor, q) => {
  const { $from } = editor._tiptapEditor.state.selection
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  return before[before.length - q.length - 1]
}

const MAX_COLUMNS = 4
const columnLimitFor = (view) => Math.max(2, Math.min(MAX_COLUMNS, Math.floor(view.dom.getBoundingClientRect().width / 130)))

// fullColumns — an edge drop past the column limit (4 at full width, fewer when narrow)
const fullColumns = (event, view) => {
  const edge = detectEdgePosition(event, view, view.state)
  if (!edge || edge.position === 'regular') return false
  const $p = view.state.doc.resolve(edge.posBeforeNode)
  const limit = columnLimitFor(view)
  for (let d = $p.depth; d >= 0; d--) if ($p.node(d).type.name === 'columnList') return $p.node(d).childCount >= limit
  return false
}

const columnDropCursor = { hooks: { computeDropPosition: (ctx) => (fullColumns(ctx.event, ctx.view) ? ctx.defaultPosition : multiColumnDropCursor.hooks.computeDropPosition(ctx)) } }
const columnLimit = new Plugin({ props: { handleDrop: (view, event) => fullColumns(event, view) } })

// detectLanguage — best guess for an untagged code block
function detectLanguage(code) {
  const t = code.trim()
  if (t.length < 4) return null
  if (/^[[{]/.test(t)) { try { JSON.parse(t); return 'json' } catch { /* not json */ } }
  if (/^<!doctype|^<(html|head|body|div|span|p|a|ul|li|section|main|header|footer|button|img|form|input|svg|script|style|template)\b/i.test(t) || /<\/[a-z]+>/i.test(t) && !/\b(return|const|function)\b/.test(t)) return 'html'
  if (/^(#!\/|\$ )|^\s*(npm|npx|yarn|pnpm|git|cd|ls|brew|curl|sudo|echo|export|mkdir|rm|cp|mv|chmod|cargo|python3?|pip3?)\s/m.test(t)) return 'shellscript'
  if (/\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE)\b/.test(t)) return 'sql'
  if (/^\s*(def |class \w+(\(.*\))?:|from \w+ import|import \w+\s*$|print\()/m.test(t)) return 'python'
  if (/^\s*fn \w+\(|let mut |impl \w+/m.test(t)) return 'rust'
  if (/<[A-Z]\w*[\s/>]|return\s*\(?\s*<\w/.test(t)) return /:\s*(string|number|boolean)\b|interface \w+/.test(t) ? 'tsx' : 'jsx'
  if (/:\s*(string|number|boolean|void)\b|\binterface \w+|\btype \w+\s*=/.test(t)) return 'typescript'
  if (/\b(const|let|var|function|=>|console\.|import .+ from|export (default|const|function)|document\.|window\.)\b/.test(t) || /=>/.test(t)) return 'javascript'
  if (/^[\w.#:\-\[\]=*>~+\s,"']+\{[^}]*:[^}]*;?[^}]*\}/m.test(t)) return t.includes('$') || t.includes('@include') ? 'scss' : 'css'
  if (/^#{1,6} |^\s*[-*] \[[ x]\]/m.test(t)) return 'markdown'
  if (/^[\w-]+:\s.+$/m.test(t) && t.split('\n').length > 1 && !/[{};]/.test(t)) return 'yaml'
  return null
}

const hl = (n) => ({ text: `var(--hl-${n})`, background: `var(--hlbg-${n})` })

const theme = {
  colors: {
    editor: { text: '#f2f0f0', background: '#111111' },
    menu: { text: '#f2f0f0', background: '#1d1d1d' },
    tooltip: { text: '#f2f0f0', background: '#262626' },
    hovered: { text: '#f2f0f0', background: '#2a2a2a' },
    selected: { text: '#ffffff', background: '#3084ff' },
    disabled: { text: '#666666', background: '#1d1d1d' },
    shadow: 'rgba(0, 0, 0, 0.6)',
    border: '#333333',
    sideMenu: '#666666',
    highlights: {
      gray: hl('gray'),
      brown: hl('brown'),
      red: hl('red'),
      orange: hl('orange'),
      yellow: hl('yellow'),
      green: hl('green'),
      blue: hl('blue'),
      purple: hl('purple'),
      pink: hl('pink'),
    },
  },
  borderRadius: 6,
  fontFamily: "'Nanum Myeongjo', Georgia, serif",
}

const fileToDataUrl = (f) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = reject
  r.readAsDataURL(f)
})

export function blocksToText(blocks) {
  const out = []
  const walk = (bs) => {
    for (const b of bs || []) {
      if (Array.isArray(b.content)) out.push(b.content.map((c) => c.text || (c.type === 'date' ? shortDate(c.props.date) : (c.content || []).map((x) => x.text || '').join(''))).join(''))
      else if (b.content?.rows) for (const row of b.content.rows) out.push(row.cells.map((c) => (Array.isArray(c) ? c : c.content || []).map((x) => x.text || '').join('')).join(' '))
      walk(b.children)
    }
  }
  walk(blocks)
  return out.filter(Boolean).join('\n')
}

export function NoteEditor({ note, onChange, editorRef }) {
  const initial = useMemo(() => {
    if (note.blocks?.length) return note.blocks
    if (note.body?.trim()) return note.body.split('\n').map((line) => ({ type: 'paragraph', content: line }))
    return undefined
  }, [note.id])
  return <BlockEditor docId={note.id} initial={initial} onChange={onChange} editorRef={editorRef} className="note-blocks" columns />
}

export function BlockEditor({ docId, initial, onChange, editorRef, className, menuExtra: MenuExtra, onEditor, placeholder, noSideMenu, columns }) {
  const editor = useCreateBlockNote({ schema: columns ? columnSchema : schema, ...(columns ? { dropCursor: columnDropCursor } : {}), dictionary: columns ? { ...noteDictionary(), multi_column: columnLocales.en } : noteDictionary(), initialContent: initial, uploadFile: fileToDataUrl, extensions: [syntaxHighlighter], placeholders: { ...en.placeholders, default: '', emptyDocument: placeholder || en.placeholders.emptyDocument } }, [docId])
  const detected = useRef(new Set())
  const cb = useRef(onChange)
  cb.current = onChange
  const handleMenu = useMemo(() => function HandleMenu() {
    return (
      <DragHandleMenu>
        <TurnIntoItem />
        {MenuExtra && <MenuExtra />}
        <BlockColorsItem>Colors</BlockColorsItem>
        <DuplicateItem />
        <RemoveBlockItem>Delete</RemoveBlockItem>
      </DragHandleMenu>
    )
  }, [MenuExtra])

  useEffect(() => { if (editorRef) editorRef.current = editor }, [editor, editorRef])
  useEffect(() => { if (columns) editor._tiptapEditor?.registerPlugin(columnLimit, (p, ps) => [p, ...ps]) }, [editor])
  useEffect(() => { onEditor?.(editor); return () => onEditor?.(null) }, [editor])
  useEffect(() => () => releaseEditor(editor), [editor])

  const onKeyDown = (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'd') return
    e.preventDefault()
    duplicateBlock(editor, editor.getTextCursorPosition().block)
  }

  return (
    <BlockNoteView
      onKeyDownCapture={onKeyDown}
      editor={editor}
      theme={theme}
      onChange={() => {
        const walk = (bs) => {
          for (const b of bs) {
            if (b.type === 'codeBlock' && b.props.language === 'text' && !detected.current.has(b.id)) {
              const code = (b.content || []).map((c) => c.text || '').join('')
              const lang = detectLanguage(code)
              if (lang) { detected.current.add(b.id); editor.updateBlock(b, { props: { language: lang } }) }
            }
            if (b.children?.length) walk(b.children)
          }
        }
        walk(editor.document)
        setEditor(editor)
        cb.current(editor.document)
      }}
      className={className}
      formattingToolbar={false}
      sideMenu={false}
      slashMenu={false}
    >
      <SuggestionMenuController triggerCharacter="/" getItems={async (q) => (triggerOf(editor, q) !== '@' ? filterSuggestionItems(slashItems(editor), q) : [])} />
      <SuggestionMenuController triggerCharacter="@" getItems={async (q) => (triggerOf(editor, q) === '@' ? filterSuggestionItems(dateMenuItems(editor), q) : [])} />
      <FormattingToolbarController formattingToolbar={NoteToolbar} />
      {!noSideMenu && <SideMenuController sideMenu={() => <SideMenu dragHandleMenu={handleMenu} />} />}
    </BlockNoteView>
  )
}

function slashItems(editor) {
  const items = getDefaultReactSlashMenuItems(editor)
  const labelBox = {
    title: 'Label Box',
    subtext: 'Coloured box for goals and labels',
    aliases: ['label', 'box', 'callout', 'goal', 'tag'],
    group: items.find((i) => i.key === 'quote')?.group || 'Basic blocks',
    icon: <LabelBoxIcon />,
    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'paragraph', props: { backgroundColor: 'gray' } }),
  }
  const date = {
    title: 'Date',
    subtext: 'Date with a calendar',
    aliases: ['date', 'calendar', 'today', 'day'],
    group: labelBox.group,
    icon: <Icon name="calendar" size={18} />,
    onItemClick: () => insertDate(editor),
  }
  const video = {
    title: 'Video',
    subtext: 'Plays on hover, scrub along the bottom',
    aliases: ['video', 'movie', 'clip', 'mp4'],
    group: items.find((i) => i.key === 'image')?.group || 'Media',
    icon: <VideoIcon />,
    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'video' }),
  }
  return insertAt(insertAt(items, 'image', 1, video), 'quote', 0, labelBox, date)
}

// insertAt — adds items before (offset 0) or after (offset 1) the item with that key, or at the end
const insertAt = (items, key, offset, ...added) => {
  const i = items.findIndex((x) => x.key === key)
  return i < 0 ? [...items, ...added] : [...items.slice(0, i + offset), ...added, ...items.slice(i + offset)]
}

function VideoIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <rect x="1.5" y="3" width="13" height="10" rx="2" />
      <path d="M6.5 6v4l3.5-2Z" fill="currentColor" />
    </svg>
  )
}

function LabelBoxIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="2" y="4" width="12" height="8" rx="2" />
      <path d="M2.8 4.6v6.8" strokeWidth="2.2" />
      <path d="M5.5 8h5.5" />
    </svg>
  )
}

function duplicateBlock(editor, block) {
  const [copy] = editor.insertBlocks([stripIds(block)], block, 'after')
  if (copy) editor.setTextCursorPosition(copy, 'end')
  editor.focus()
}

function DuplicateItem() {
  const C = useComponentsContext()
  const editor = useBlockNoteEditor()
  const block = useExtensionState(SideMenuExtension, { editor, selector: (st) => st?.block })
  if (!block) return null
  return (
    <C.Generic.Menu.Item className="bn-menu-item" onClick={() => duplicateBlock(editor, block)}>
      <span className="move-item">Duplicate<span className="move-chev">⌘D</span></span>
    </C.Generic.Menu.Item>
  )
}

function NoteToolbar() {
  return (
    <FormattingToolbar>
      <BasicTextStyleButton basicTextStyle="bold" />
      <BasicTextStyleButton basicTextStyle="italic" />
      <BasicTextStyleButton basicTextStyle="underline" />
      <BasicTextStyleButton basicTextStyle="strike" />
      <BasicTextStyleButton basicTextStyle="code" />
      <TextAlignButton textAlignment="left" />
      <TextAlignButton textAlignment="center" />
      <TextAlignButton textAlignment="right" />
      <ColorStyleButton />
      <NestBlockButton />
      <UnnestBlockButton />
      <CreateLinkButton />
    </FormattingToolbar>
  )
}

function TurnIntoItem() {
  const C = useComponentsContext()
  const editor = useBlockNoteEditor()
  const portal = usePortalElement()
  const dict = useDictionary()
  const block = useExtensionState(SideMenuExtension, { editor, selector: (st) => st?.block })
  if (!block) return null
  const items = [...blockTypeSelectItems(dict).filter((it) => it.type in editor.schema.blockSchema && !(it.props?.level > 3)), { name: 'Code Block', type: 'codeBlock', icon: CodeIcon }]
  return (
    <C.Generic.Menu.Root position="right" sub portalElement={portal}>
      <C.Generic.Menu.Trigger sub>
        <C.Generic.Menu.Item className="bn-menu-item" subTrigger>Turn into</C.Generic.Menu.Item>
      </C.Generic.Menu.Trigger>
      <C.Generic.Menu.Dropdown sub className="bn-menu-dropdown">
        {items.map((it) => {
          const Ic = it.icon
          const on = block.type === it.type && Object.entries(it.props || {}).every(([k, v]) => block.props[k] === v)
          return (
            <C.Generic.Menu.Item key={it.name} className="bn-menu-item" checked={on} icon={<Ic size={16} />}
              onClick={() => editor.updateBlock(block, { type: it.type, props: it.props || {} })}>
              {it.name}
            </C.Generic.Menu.Item>
          )
        })}
      </C.Generic.Menu.Dropdown>
    </C.Generic.Menu.Root>
  )
}

function CodeIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" />
    </svg>
  )
}

export const isDoneToggle = (b) => b.type === 'toggleListItem' && (b.content || []).map((c) => c.text || '').join('').trim().toLowerCase() === 'done'

const stripIds = (b) => ({ ...b, id: undefined, children: (b.children || []).map(stripIds) })

export function moveBlockTo(editor, block, target) {
  const copy = stripIds(block)
  if (target.editor) {
    const doc = target.editor.document
    const done = doc.find(isDoneToggle)
    if (done) target.editor.insertBlocks([copy], done, 'before')
    else target.editor.insertBlocks([copy], doc[doc.length - 1], 'after')
  } else target.append(copy)
  editor.removeBlocks([block])
}

export function MoveToItem({ targets, current }) {
  const C = useComponentsContext()
  const editor = useBlockNoteEditor()
  const block = useExtensionState(SideMenuExtension, { editor, selector: (st) => st?.block })
  if (!block || !targets.length) return null
  return (
    <C.Generic.Menu.Item className="bn-menu-item" onClick={() => {
      const el = editor.domElement?.querySelector(`[data-id="${block.id}"]`)
      const r = el?.getBoundingClientRect()
      window.dispatchEvent(new CustomEvent('hr-move-to', { detail: { rect: r, editor, block, targets, current } }))
    }}>
      <span className="move-item">Move to<span className="move-chev">›</span></span>
    </C.Generic.Menu.Item>
  )
}
