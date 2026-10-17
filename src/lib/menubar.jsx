import { useEffect, useRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Icon } from '../components/icons.jsx'
import { catMeta, elapsedSec, pauseRunning, resumePaused, startBlock, stopRunning } from '../components/TimeBlocks.jsx'
import { getData } from './store.js'
import { DEFAULT_PALETTE, rolloverMinute } from './schema.js'
import { logicalToday, nowMinutes } from './time.js'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const TRAY_ICONS = ['hourglass', 'stopwatch', 'pause']

// rasterize — pool icon → RGBA template image, glyph trimmed and scaled to system icon height
async function rasterize(name, px = 54, glyph = 0.76, pad = 4) {
  const big = 128
  const svg = renderToStaticMarkup(<Icon name={name} size={big} weight={1.85} />).replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" color="#000"')
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()
  const src = document.createElement('canvas')
  src.width = src.height = big
  src.getContext('2d').drawImage(img, 0, 0, big, big)
  const a = src.getContext('2d').getImageData(0, 0, big, big).data
  let [l, t, r, b] = [big, big, -1, -1]
  for (let y = 0; y < big; y++) for (let x = 0; x < big; x++) if (a[(y * big + x) * 4 + 3] > 8) { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y) }
  const scale = (px * glyph) / (b - t + 1)
  const gw = Math.max(1, Math.round((r - l + 1) * scale))
  const w = gw + pad * 2
  const c = document.createElement('canvas')
  c.width = w
  c.height = px
  const ctx = c.getContext('2d')
  ctx.drawImage(src, l, t, r - l + 1, b - t + 1, pad, Math.round((px - (b - t + 1) * scale) / 2), gw, (b - t + 1) * scale)
  return { name, w, h: px, rgba: Array.from(ctx.getImageData(0, 0, w, px).data) }
}

const clip = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)

function watchOf(d) {
  const day = logicalToday(rolloverMinute(d))
  const row = d.rows.find((r) => r.date === day)
  const b = row?.blocks.find((x) => x.end == null) || row?.blocks.find((x) => x.paused)
  if (!b) return null
  const label = b.cats.length ? b.cats.map((c) => { const m = catMeta(d, c); return `${m.emoji} ${m.name}`.trim() }).join(' · ') : b.text || 'Untitled block'
  return { label: clip(label, 28), elapsed_sec: elapsedSec(row.date, b), at_ms: Date.now(), paused: !!b.paused }
}

const groupsOf = (d) => d.groups
  .map((g) => ({ name: g.name, cats: d.categories.filter((c) => c.group === g.id && !c.archived).map((c) => ({ id: c.id, label: `${c.emoji} ${c.name}`.trim() })) }))
  .filter((g) => g.cats.length)

// useMenubar — main window feeds the menu bar stopwatch and runs its actions on Time Blocks
export function useMenubar(data, onView) {
  const viewRef = useRef(onView)
  viewRef.current = onView

  useEffect(() => {
    if (!isTauri) return
    let off
    Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')]).then(async ([{ invoke }, { listen }]) => {
      off = await listen('tray-action', ({ payload: a }) => {
        const d = getData()
        const day = logicalToday(rolloverMinute(d))
        const row = d.rows.find((r) => r.date === day)
        const min = nowMinutes(day)
        if (a.type === 'start') startBlock(row?.id || `r-${day}`, a.cat || null, min, a.text || '')
        else if (a.type === 'view') viewRef.current(a.view)
        else if (row && a.type === 'pause') pauseRunning(row.id, min)
        else if (row && a.type === 'resume') resumePaused(row.id, min)
        else if (row && a.type === 'stop') stopRunning(row.id, min)
      })
      invoke('tray_icons', { icons: await Promise.all(TRAY_ICONS.map((n) => rasterize(n))) })
    })
    return () => off?.()
  }, [])

  useEffect(() => {
    if (!isTauri) return
    const push = () => import('@tauri-apps/api/core').then(({ invoke }) => { const d = getData(); const m = d.settings.menubarColors || {}; invoke('tray_watch', { watch: watchOf(d), groups: groupsOf(d), colors: { green: m.stopwatch || DEFAULT_PALETTE.green, orange: m.timer || DEFAULT_PALETTE.orange } }) })
    push()
    const t = setInterval(push, 30000)
    return () => clearInterval(t)
  }, [data])
}
