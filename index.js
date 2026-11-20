/** powerful-subtitle-studio — Host entry: tools, commands, and HTTP routes for client-direct calls. */
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { promises as fs } from 'node:fs'
import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import { createStudio, buildToolDefinitions, preflight, preprocessForStudio, listProjects, upsertProject, deleteProject, projectVideoFile, projectSubtitles, embedSubtitle, loadUserConfig, saveUserConfig, maskKey, hasAsrKey, binaryStatus, installBinaries } from './lib/studio.js'
import { ASR_MODEL } from './lib/ai.js'
import { expandEnv, expandHome } from './lib/util.js'

const VIDEO_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
}

async function streamVideo(request, file) {
  const stat = await fs.stat(file)
  const size = stat.size
  const headers = {
    'content-type': VIDEO_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
  }
  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers: { ...headers, 'content-length': String(size) } })
  }
  const range = request.headers.get('range')
  if (!range) {
    return new Response(Readable.toWeb(createReadStream(file)), {
      status: 200,
      headers: { ...headers, 'content-length': String(size) },
    })
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  if (!match) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
  let start
  let end
  if (match[1] === '') {
    const suffix = Number(match[2])
    start = Number.isFinite(suffix) ? Math.max(0, size - suffix) : size
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] === '' ? size - 1 : Number(match[2])
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
  }
  end = Math.min(end, size - 1)
  return new Response(Readable.toWeb(createReadStream(file, { start, end })), {
    status: 206,
    headers: {
      ...headers,
      'content-range': `bytes ${start}-${end}/${size}`,
      'content-length': String(end - start + 1),
    },
  })
}

function sameToken(given, expected) {
  const a = Buffer.from(String(given))
  const b = Buffer.from(String(expected))
  return a.length === b.length && timingSafeEqual(a, b)
}

// 详情页在 dsh-app:// 里。壳会把这个源的请求转发到本机，并丢掉 Content-Length。
// 播放器因此拿不到可拖动的分段，一点进度条就把文件从头再打开。
// 预览走单独的 127.0.0.1，Range 和长度都留在响应里。
function startMediaServer(cfg) {
  const token = randomBytes(24).toString('base64url')
  const server = createServer(async (req, res) => {
    const fail = (status) => {
      if (res.writableEnded) return
      if (!res.headersSent) res.writeHead(status)
      res.end()
    }
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405)
      if (url.pathname !== '/media') return fail(404)
      if (!sameToken(url.searchParams.get('token'), token)) return fail(403)
      const file = await projectVideoFile(cfg, url.searchParams.get('path'))
      const range = Array.isArray(req.headers.range) ? req.headers.range[0] : req.headers.range
      const request = new Request('http://127.0.0.1/media', {
        method: req.method,
        headers: range ? { range } : {},
      })
      const response = await streamVideo(request, file)
      const headers = {}
      response.headers.forEach((value, key) => { headers[key] = value })
      res.writeHead(response.status, headers)
      if (req.method === 'HEAD' || response.body == null) {
        res.end()
        return
      }
      const reader = response.body.getReader()
      const cancel = () => { reader.cancel().catch(() => {}) }
      res.on('close', cancel)
      try {
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done || res.destroyed) break
          if (!res.write(chunk.value)) await new Promise((resolve) => res.once('drain', resolve))
        }
      } finally {
        res.off('close', cancel)
        if (!res.writableEnded) res.end()
      }
    } catch {
      fail(404)
    }
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({
        server,
        origin: `http://127.0.0.1:${address.port}`,
        token,
      })
    })
  })
}

export const name = 'powerful-subtitle-studio'

export const inject = ['tools', 'llm', 'connection', 'attachments', 'workingDirectory']

function applyConfig(cfg, opts) {
  const workdir = expandHome(expandEnv(cfg.workdir))
  const current = loadUserConfig(workdir)
  const next = { ...current }
  const put = (s, o) => { next[s] = { ...(next[s] ?? {}), ...o } }
  if (opts.asrApiKey !== undefined) put('asr', { apiKey: opts.asrApiKey })
  if (opts.asrBaseUrl !== undefined) put('asr', { baseUrl: opts.asrBaseUrl })
  saveUserConfig(workdir, next)
  Object.assign(cfg.asr, next.asr ?? {})
  cfg.asr.model = ASR_MODEL
  return { saved: true, asr: { ...cfg.asr, apiKey: maskKey(cfg.asr.apiKey) } }
}

export function apply(ctx, config) {
  const { studio, cfg } = createStudio(ctx, config ?? {})
  const defs = buildToolDefinitions({ studio, cfg })
  const disposers = []
  const mediaReady = startMediaServer(cfg).catch((err) => {
    console.error('[powerful-subtitle-studio] media server failed:', err)
    return null
  })
  disposers.push(() => { mediaReady.then((auth) => auth?.server.close()) })
  for (const def of defs) {
    disposers.push(ctx.tools.register(def))
  }

  // /api 上只能有一个拦截器，而且已经被网关占用。再 intercept 会把
  // settings/describe 顶掉，欢迎页就会报 Web request failed。
  // 精确路径走 fetch.register，由已经在跑的 /api 先匹配这些地址。
  const rpcOk = (value) => ({ ok: true, value })
  const rpcFail = (message) => ({ ok: false, error: { code: 'bad-request', message: String(message), details: { issues: [] } } })
  const dispatch = async (endpoint, payload) => {
    const name = String(endpoint || '').replace(/^subtitle\//, '')
    const body = payload && typeof payload === 'object' ? payload : {}
    try {
      if (name === 'projects/list') return rpcOk(await listProjects(cfg))
      if (name === 'projects/save') return rpcOk(await upsertProject(cfg, body))
      if (name === 'projects/delete') return rpcOk(await deleteProject(cfg, body))
      if (name === 'config/status') return rpcOk({ asr: hasAsrKey(cfg) })
      if (name === 'config/save') return rpcOk(applyConfig(cfg, body))
      if (name === 'preprocess') return rpcOk(await preprocessForStudio(studio, cfg, Array.isArray(body.paths) ? body.paths : []))
      if (name === 'check') return rpcOk(await preflight(studio))
      if (name === 'binaries/status') return rpcOk(await binaryStatus(cfg))
      if (name === 'binaries/download') return rpcOk(await installBinaries(cfg))
      if (name === 'subtitles') return rpcOk(await projectSubtitles(cfg, body))
      if (name === 'embed') return rpcOk(await embedSubtitle(cfg, body))
      if (name === 'media/ticket') {
        const auth = await mediaReady
        if (!auth) return rpcFail('media server unavailable')
        return rpcOk({ origin: auth.origin, token: auth.token })
      }
      return rpcFail(`unknown endpoint ${name}`)
    } catch (err) {
      return rpcFail(err?.message || err)
    }
  }
  ctx.effect(() => {
    const stops = []
    const register = ctx.connection?.fetch?.register
    if (typeof register === 'function') {
      for (const name of ['projects/list', 'projects/save', 'projects/delete', 'config/status', 'config/save', 'preprocess', 'check', 'binaries/status', 'binaries/download', 'subtitles', 'embed', 'media/ticket']) {
        try {
          stops.push(register({
            path: `/api/subtitle/${name}`,
            methods: ['POST'],
            requestBody: 'buffered',
            async fetch(request) {
              let rpcId = 'invalid-request'
              let payload = {}
              try {
                const message = await request.json()
                if (message && typeof message.rpcId === 'string') rpcId = message.rpcId
                payload = message?.payload ?? {}
              } catch {
                return Response.json({
                  type: 'server-response',
                  rpcId,
                  result: rpcFail('body is not JSON'),
                })
              }
              return Response.json({ type: 'server-response', rpcId, result: await dispatch(name, payload) })
            },
          }))
        } catch (err) {
          console.error(`[powerful-subtitle-studio] route /api/subtitle/${name} failed:`, err)
        }
      }
      try {
        stops.push(register({
          path: '/api/subtitle/media',
          methods: ['GET', 'HEAD'],
          requestBody: 'buffered',
          async fetch(request) {
            try {
              const file = await projectVideoFile(cfg, new URL(request.url).searchParams.get('path'))
              return await streamVideo(request, file)
            } catch {
              return new Response('not found', { status: 404 })
            }
          },
        }))
      } catch (err) {
        console.error('[powerful-subtitle-studio] route /api/subtitle/media failed:', err)
      }
    }
    return () => { for (const stop of stops) void stop() }
  }, 'subtitle: rpc')

  return () => { for (const d of disposers) d() }
}
