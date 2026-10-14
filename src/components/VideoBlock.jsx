import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { mediaUrl, saveMedia } from '../lib/media.js'

export const VideoAutoplay = createContext(false)

export const hasVideo = (blocks) => (blocks || []).some((b) => b.type === 'video' || hasVideo(b.children))

const fmtTime = (s) => {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export const videoBlock = createReactBlockSpec(
  { type: 'video', propSchema: { src: { default: '' }, name: { default: '' } }, content: 'none' },
  { render: ({ block, editor }) => (block.props.src ? <HoverVideo block={block} /> : <VideoPicker block={block} editor={editor} />) },
)

// VideoPicker — empty video block: upload a file or paste a link
function VideoPicker({ block, editor }) {
  const fileRef = useRef(null)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (props) => editor.updateBlock(block, { props })
  const upload = async (file) => {
    if (!file) return
    setBusy(true)
    setError('')
    try { set({ src: await saveMedia(file), name: file.name }) } catch (e) { setError(`Upload failed: ${e}`); setBusy(false) }
  }
  return (
    <div className="vid-picker" contentEditable={false} onMouseDown={(e) => e.stopPropagation()}>
      <span className="vid-picker-title">{busy ? 'Saving video…' : 'Add a video'}</span>
      <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>Upload</button>
      <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
      <input className="vid-link" placeholder="or paste a video link" value={link} disabled={busy}
        onChange={(e) => setLink(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && /^https?:\/\//.test(link.trim())) set({ src: link.trim(), name: link.trim().split('/').pop() }) }} />
      {error && <span className="vid-error">{error}</span>}
    </div>
  )
}

// HoverVideo — plays muted on hover, scrub bar at the bottom
function HoverVideo({ block }) {
  const ref = useRef(null)
  const [url, setUrl] = useState(null)
  const [hover, setHover] = useState(false)
  const [scrub, setScrub] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [muted, setMuted] = useState(true)
  const [failed, setFailed] = useState(false)
  const auto = useContext(VideoAutoplay)
  const playing = (auto || hover) && !scrub

  useEffect(() => { let live = true; mediaUrl(block.props.src).then((u) => live && setUrl(u)); return () => { live = false } }, [block.props.src])
  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (playing) v.play().catch(() => {})
    else v.pause()
  }, [playing, url])
  useEffect(() => {
    if (!playing && !hover) return
    let raf
    const tick = () => { if (ref.current) setT(ref.current.currentTime); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, hover])

  const seek = (e, bar) => {
    const v = ref.current
    if (!v || !dur) return
    const r = bar.getBoundingClientRect()
    v.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur
    setT(v.currentTime)
  }

  return (
    <div className={`vid ${hover || scrub ? 'hover' : ''}`} contentEditable={false}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {failed ? <div className="vid-failed">Can't play {block.props.name || 'this video'}</div> : (
        <video ref={ref} src={url || undefined} muted={muted} loop playsInline preload="metadata"
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration)} onError={() => url && setFailed(true)} />
      )}
      {!failed && (
        <div className="vid-controls" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}>
          <div className="vid-bar"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setScrub(true); seek(e, e.currentTarget) }}
            onPointerMove={(e) => { if (scrub) seek(e, e.currentTarget) }}
            onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); setScrub(false) }}>
            <div className="vid-fill" style={{ width: `${dur ? (t / dur) * 100 : 0}%` }} />
          </div>
          <div className="vid-row">
            <span className="vid-time num">{fmtTime(t)} / {fmtTime(dur)}</span>
            <button className="vid-mute" title={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 6h2.5L8.5 3v10L5 10H2.5Z" />
                {muted ? <path d="m11 6 3.5 4M14.5 6 11 10" /> : <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.5a6.3 6.3 0 0 1 0 9" />}
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
