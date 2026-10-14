import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from './icons.jsx'
import { NOTE_COLOR_NAMES } from '../lib/schema.js'
import { CODE_COLOR, TOKEN } from '../lib/richText.js'


// RichText — renders **b** *i* __u__ ~~s~~ `code` {color}text{/}
export function RichText({ text }) {
  return <>{parse(String(text ?? ''))}</>
}

function parse(s, key = 'r') {
  const out = []
  const re = new RegExp(TOKEN.source, 'g')
  let last = 0
  let n = 0
  let m
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    const k = `${key}-${n++}`
    if (m[1] != null) { const cc = m[1].match(CODE_COLOR); out.push(cc ? <span key={k} style={{ color: `var(--hl-${cc[1]})` }}><code className="rt-code">{cc[2]}</code></span> : <code key={k} className="rt-code">{m[1]}</code>) }
    else if (m[2] != null) out.push(<b key={k}>{parse(m[2], k)}</b>)
    else if (m[3] != null) out.push(<u key={k}>{parse(m[3], k)}</u>)
    else if (m[4] != null) out.push(<s key={k}>{parse(m[4], k)}</s>)
    else if (m[5] != null) out.push(<i key={k}>{parse(m[5], k)}</i>)
    else out.push(<span key={k} style={{ color: `var(--hl-${m[6]})` }}>{parse(m[7], k)}</span>)
    last = re.lastIndex
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')

function toHtml(s) {
  const re = new RegExp(TOKEN.source, 'g')
  let out = ''
  let last = 0
  let m
  while ((m = re.exec(s))) {
    out += esc(s.slice(last, m.index))
    if (m[1] != null) { const cc = m[1].match(CODE_COLOR); out += cc ? `<span data-c="${cc[1]}" style="color: var(--hl-${cc[1]})"><code class="rt-code">${esc(cc[2])}</code></span>` : `<code class="rt-code">${esc(m[1])}</code>` }
    else if (m[2] != null) out += `<b>${toHtml(m[2])}</b>`
    else if (m[3] != null) out += `<u>${toHtml(m[3])}</u>`
    else if (m[4] != null) out += `<s>${toHtml(m[4])}</s>`
    else if (m[5] != null) out += `<i>${toHtml(m[5])}</i>`
    else out += `<span data-c="${m[6]}" style="color: var(--hl-${m[6]})">${toHtml(m[7])}</span>`
    last = re.lastIndex
  }
  return out + esc(s.slice(last))
}

function marksOf(n) {
  const t = n.nodeName
  const st = n.style || {}
  const m = []
  if (n.dataset?.c) m.push([`{${n.dataset.c}}`, '{/}'])
  if (t === 'CODE') return [['`', '`']]
  if (t === 'B' || t === 'STRONG' || st.fontWeight === 'bold' || +st.fontWeight >= 600) m.push(['**', '**'])
  if (t === 'I' || t === 'EM' || st.fontStyle === 'italic') m.push(['*', '*'])
  if (t === 'U' || /underline/.test(st.textDecoration || st.textDecorationLine || '')) m.push(['__', '__'])
  if (t === 'S' || t === 'STRIKE' || t === 'DEL' || /line-through/.test(st.textDecoration || st.textDecorationLine || '')) m.push(['~~', '~~'])
  return m
}

function serialize(node) {
  let out = ''
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { out += n.nodeValue.replace(/ /g, ' '); continue }
    if (n.nodeName === 'BR') { out += '\n'; continue }
    if (n.nodeType !== 1) continue
    const block = n.nodeName === 'DIV' || n.nodeName === 'P'
    if (block && out && !out.endsWith('\n')) out += '\n'
    if (n.nodeName === 'CODE') {
      const c = n.querySelector('[data-c]')?.dataset.c
      const t = n.textContent.replace(/\u00a0/g, ' ')
      out += t.trim() ? (c ? `{${c}}\`${t}\`{/}` : `\`${t}\``) : t
      continue
    }
    let inner = serialize(n)
    if (inner.trim()) for (const [a, b] of marksOf(n)) inner = a + inner + b
    out += inner
  }
  return out
}

// RichInput — contenteditable that edits marker text as formatted text
export function RichInput({ value, onChange, onKeyDown, onBlur, placeholder, className = '', multiline, inputRef, autoFocus }) {
  const own = useRef(null)
  const ref = inputRef || own
  const last = useRef(null)
  useLayoutEffect(() => {
    if (value === last.current) return
    last.current = value
    ref.current.innerHTML = toHtml(value || '')
  }, [value])
  useEffect(() => {
    if (!autoFocus) return
    const el = ref.current
    el.focus()
    const r = document.createRange()
    r.selectNodeContents(el)
    r.collapse(false)
    const sel = getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
  }, [])
  const input = () => {
    const el = ref.current
    let v = serialize(el)
    if (!multiline) v = v.replace(/\n/g, ' ')
    if (!v.trim() && el.innerHTML) el.innerHTML = ''
    last.current = v
    onChange(v)
  }
  return (
    <div
      ref={ref}
      className={`rich-input ${className}`}
      contentEditable="true"
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={input}
      onBlur={onBlur}
      onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.shiftKey && multiline) { e.preventDefault(); document.execCommand('insertLineBreak') }
        onKeyDown?.(e)
      }}
    />
  )
}

const target = () => {
  const el = document.activeElement
  if (!el?.closest?.('.td, .journal') || !el.classList.contains('rich-input')) return null
  const sel = getSelection()
  if (!sel.rangeCount || sel.isCollapsed || !el.contains(sel.anchorNode)) return null
  return el
}

const changed = (el) => el.dispatchEvent(new Event('input', { bubbles: true }))

function closest(el, test) {
  let n = getSelection().getRangeAt(0).commonAncestorContainer
  while (n && n !== el) { if (n.nodeType === 1 && test(n)) return n; n = n.parentNode }
  return null
}

function unwrap(n) {
  const p = n.parentNode
  while (n.firstChild) p.insertBefore(n.firstChild, n)
  p.removeChild(n)
}

function surround(el, make) {
  const sel = getSelection()
  const r = sel.getRangeAt(0)
  const node = make()
  node.appendChild(r.extractContents())
  r.insertNode(node)
  const nr = document.createRange()
  nr.selectNodeContents(node)
  sel.removeAllRanges()
  sel.addRange(nr)
}

function code(el) {
  const c = closest(el, (n) => n.nodeName === 'CODE')
  if (c) unwrap(c)
  else surround(el, () => Object.assign(document.createElement('code'), { className: 'rt-code' }))
  changed(el)
}

function color(el, name) {
  const code = closest(el, (n) => n.nodeName === 'CODE')
  if (code) {
    for (const s of code.querySelectorAll('[data-c]')) unwrap(s)
    const wrap = code.parentNode?.dataset?.c ? code.parentNode : null
    if (wrap && !name) unwrap(wrap)
    else if (wrap) { wrap.dataset.c = name; wrap.style.color = `var(--hl-${name})` }
    else if (name) { const s = document.createElement('span'); s.dataset.c = name; s.style.color = `var(--hl-${name})`; code.parentNode.insertBefore(s, code); s.appendChild(code) }
    return changed(el)
  }
  const c = closest(el, (n) => n.dataset?.c)
  if (c && !name) unwrap(c)
  else if (c) { c.dataset.c = name; c.style.color = `var(--hl-${name})` }
  else if (name) surround(el, () => { const s = document.createElement('span'); s.dataset.c = name; s.style.color = `var(--hl-${name})`; return s })
  changed(el)
}

const exec = (cmd) => { document.execCommand('styleWithCSS', false, false); document.execCommand(cmd) }

// FormatBar — floating toolbar for text selected in a table cell or note title
export function FormatBar() {
  const [el, setEl] = useState(null)
  const [, tick] = useState(0)
  useEffect(() => {
    const check = () => { setEl(target()); tick((n) => n + 1) }
    document.addEventListener('selectionchange', check)
    return () => document.removeEventListener('selectionchange', check)
  }, [])
  if (!el) return null
  const r = getSelection().getRangeAt(0).getBoundingClientRect()
  const top = r.top > 48 ? r.top - 40 : r.bottom + 6
  const btns = [
    ...(el.classList.contains('journal-title') ? [] : [{ title: 'Bold', label: <b>B</b>, run: () => exec('bold') }]),
    { title: 'Italic', label: <i>i</i>, run: () => exec('italic') },
    { title: 'Underline', label: <u>U</u>, run: () => exec('underline') },
    { title: 'Strike', label: <s>S</s>, run: () => exec('strikeThrough') },
    { title: 'Code', label: <Icon name="code" size={13} />, run: () => code(el) },
  ]
  return (
    <div className="format-bar" style={{ top, left: Math.max(8, Math.min(r.left, window.innerWidth - 330)) }} onMouseDown={(e) => e.preventDefault()}>
      {btns.map((b) => <button key={b.title} title={b.title} onClick={b.run}>{b.label}</button>)}
      <span className="format-sep" />
      {NOTE_COLOR_NAMES.map((n) => <button key={n} title={n} className="format-color" onClick={() => color(el, n)}><span style={{ background: `var(--hl-${n})` }} /></button>)}
      <button title="Default colour" className="format-color" onClick={() => color(el, null)}><span className="none" /></button>
    </div>
  )
}
