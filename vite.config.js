import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SUPPORT = path.join(os.homedir(), 'Library', 'Application Support')
export const DATA_DIR = [path.join(SUPPORT, 'hayati.log'), path.join(SUPPORT, 'com.hayati.report')].find((d) => fs.existsSync(d)) || path.join(SUPPORT, 'hayati.log')
const DATA_FILE = path.join(DATA_DIR, 'report.json')
const SANDBOX_FILE = path.join(DATA_DIR, 'report.sandbox.json')
const KEEP_BACKUPS = 14

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const hostOf = (h) => String(h || '').replace(/:\d+$/, '').toLowerCase()
function originOk(req) {
  if (!LOOPBACK.has(hostOf(req.headers.host))) return false
  const origin = req.headers.origin
  if (origin == null) return true
  try { return new URL(origin).host === String(req.headers.host) } catch { return false }
}

export function backupAndWrite(json, day) {
  const dir = path.join(DATA_DIR, 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const backup = path.join(dir, `report-${day}.json`)
  if (fs.existsSync(DATA_FILE) && !fs.existsSync(backup)) {
    fs.copyFileSync(DATA_FILE, backup)
    const all = fs.readdirSync(dir).filter((f) => f.startsWith('report-')).sort()
    for (const f of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) fs.unlinkSync(path.join(dir, f))
  }
  const tmp = DATA_FILE + '.tmp'
  fs.writeFileSync(tmp, json, 'utf8')
  fs.renameSync(tmp, DATA_FILE)
}

// pruneMedia — same as prune_media in lib.rs
function pruneMedia() {
  const dir = path.join(DATA_DIR, 'media')
  if (!fs.existsSync(dir) || !fs.existsSync(DATA_FILE)) return
  const backups = path.join(DATA_DIR, 'backups')
  const sources = [DATA_FILE, SANDBOX_FILE, ...(fs.existsSync(backups) ? fs.readdirSync(backups).map((f) => path.join(backups, f)) : [])]
  const refs = new Set()
  for (const f of sources) {
    let text
    try { text = fs.readFileSync(f, 'utf8') } catch { if (f === DATA_FILE) return; continue }
    for (const m of text.matchAll(/media:([\w.-]+)/g)) refs.add(m[1])
  }
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name)
    const st = fs.statSync(file)
    if (st.isFile() && !refs.has(name) && Date.now() - st.mtimeMs > 24 * 60 * 60 * 1000) fs.unlinkSync(file)
  }
}

// dataStorePlugin — /api/data GET/PUT, same file the Tauri app uses
function dataStorePlugin() {
  return {
    name: 'hayati-data-store',
    configureServer(server) {
      const send = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(body) }
      server.middlewares.use('/api/data', (req, res) => {
        if (!originOk(req)) return send(res, 403, '{"error":"forbidden"}')
        const sandbox = new URL(req.url, 'http://x').searchParams.has('sandbox')
        if (req.method === 'GET') {
          if (sandbox && !fs.existsSync(SANDBOX_FILE) && fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, SANDBOX_FILE)
          const file = sandbox ? SANDBOX_FILE : DATA_FILE
          if (!fs.existsSync(file)) return send(res, 404, '{"error":"none"}')
          if (!sandbox) setTimeout(() => { try { pruneMedia() } catch {} })
          return send(res, 200, fs.readFileSync(file, 'utf8'))
        }
        if (req.method === 'PUT') {
          let body = ''
          req.on('data', (c) => { body += c })
          req.on('end', () => {
            try {
              JSON.parse(body)
              const day = new URL(req.url, 'http://x').searchParams.get('day') || new Date().toISOString().slice(0, 10)
              if (sandbox) fs.writeFileSync(SANDBOX_FILE, body, 'utf8')
              else backupAndWrite(body, day.replace(/[^\d-]/g, ''))
              send(res, 200, '{"ok":true}')
            } catch (e) { send(res, 500, JSON.stringify({ error: String(e) })) }
          })
          return
        }
        send(res, 405, '{"error":"method"}')
      })
      server.middlewares.use('/api/backups', (req, res) => {
        if (!originOk(req)) return send(res, 403, '{"error":"forbidden"}')
        const dir = path.join(DATA_DIR, 'backups')
        const name = new URL(req.url, 'http://x').searchParams.get('name')
        if (name) {
          if (!/^[\w.-]+\.json$/.test(name) || !fs.existsSync(path.join(dir, name))) return send(res, 404, '{"error":"none"}')
          return send(res, 200, fs.readFileSync(path.join(dir, name), 'utf8'))
        }
        const list = !fs.existsSync(dir) ? [] : fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
          const st = fs.statSync(path.join(dir, f))
          return { name: f, size: st.size, modified: st.mtimeMs }
        })
        send(res, 200, JSON.stringify(list))
      })
      server.middlewares.use('/api/media', (req, res) => {
        if (!originOk(req)) return send(res, 403, '{"error":"forbidden"}')
        const dir = path.join(DATA_DIR, 'media')
        const name = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1))
        if (!/^[\w-][\w.-]*$/.test(name)) return send(res, 400, '{"error":"name"}')
        const file = path.join(dir, name)
        if (req.method === 'PUT') {
          fs.mkdirSync(dir, { recursive: true })
          const out = fs.createWriteStream(file)
          req.pipe(out)
          out.on('finish', () => send(res, 200, '{"ok":true}'))
          out.on('error', (e) => send(res, 500, JSON.stringify({ error: String(e) })))
          return
        }
        if (req.method !== 'GET' || !fs.existsSync(file)) return send(res, 404, '{"error":"none"}')
        const size = fs.statSync(file).size
        const type = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', ogv: 'video/ogg' }[name.split('.').pop().toLowerCase()] || 'application/octet-stream'
        const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '')
        res.setHeader('Content-Type', type)
        res.setHeader('Accept-Ranges', 'bytes')
        if (!range) { res.setHeader('Content-Length', size); return fs.createReadStream(file).pipe(res) }
        const start = range[1] ? +range[1] : Math.max(0, size - +range[2])
        const end = range[1] && range[2] ? Math.min(+range[2], size - 1) : size - 1
        res.statusCode = 206
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
        res.setHeader('Content-Length', end - start + 1)
        fs.createReadStream(file, { start, end }).pipe(res)
      })
      server.middlewares.use('/api/info', (req, res) => {
        if (!originOk(req)) return send(res, 403, '{"error":"forbidden"}')
        send(res, 200, JSON.stringify({ file: DATA_FILE }))
      })
    },
  }
}

export default defineConfig({
  clearScreen: false,
  server: { port: 5188, strictPort: true, headers: { 'Cache-Control': 'no-store' } },
  plugins: [react(), dataStorePlugin()],
})
