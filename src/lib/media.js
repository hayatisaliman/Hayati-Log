const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
let tauriDir = null

const core = () => import('@tauri-apps/api/core')

// saveMedia — writes the file into the data folder's media/, returns a "media:<name>" reference
export async function saveMedia(file) {
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4'
  const name = `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (isTauri) await (await core()).invoke('save_media', bytes, { headers: { 'x-name': name } })
  else {
    const res = await fetch(`/api/media/${name}`, { method: 'PUT', body: bytes })
    if (!res.ok) throw new Error(await res.text())
  }
  return `media:${name}`
}

export async function dataUrlToMedia(url) {
  const blob = await (await fetch(url)).blob()
  const ext = (blob.type.split('/')[1] || 'png').replace(/[^a-z0-9]/g, '') || 'png'
  return saveMedia(new File([blob], `image.${ext}`))
}

export async function mediaUrl(src) {
  if (!src?.startsWith('media:')) return src
  const name = src.slice(6)
  if (!isTauri) return `/api/media/${encodeURIComponent(name)}`
  const { invoke, convertFileSrc } = await core()
  tauriDir = tauriDir || invoke('media_dir')
  const dir = await tauriDir
  return convertFileSrc(`${dir}${dir.includes('\\') ? '\\' : '/'}${name}`)
}
