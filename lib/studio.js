/** Core studio: config resolution, project state persistence, and tool definitions. */
import { promises as fs } from 'node:fs'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { expandEnv, expandHome, clamp, run } from './util.js'
import { bindBinaries, downloadVendorBinaries } from './binaries.js'
import * as media from './media.js'
import { ASR_MODEL } from './ai.js'
import * as pipeline from './pipeline.js'
import { renderOutputPath, render } from './render.js'
import { parseSubtitle } from './srt.js'

const DEFAULT_BURN_STYLE = 'FontName=Noto Sans CJK SC,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1,Shadow=0,MarginV=20'

const DEFAULTS = {
  workdir: '~/.powerful-subtitle-studio',
  ffmpegPath: 'ffmpeg',
  ffprobePath: 'ffprobe',
  asr: { baseUrl: 'https://dashscope.aliyuncs.com', apiKey: '', model: ASR_MODEL },
  render: { defaultMode: 'srt', burnStyle: DEFAULT_BURN_STYLE },
}

function section(def, cfg) { return { ...def, ...(cfg ?? {}) } }

function userConfigPath(workdir) { return path.join(workdir, 'config.json') }

export function loadUserConfig(workdir) {
  try { return JSON.parse(readFileSync(userConfigPath(workdir), 'utf8')) }
  catch { return {} }
}

export function saveUserConfig(workdir, cfg) {
  mkdirSync(workdir, { recursive: true })
  writeFileSync(userConfigPath(workdir), JSON.stringify(cfg, null, 2) + '\n', 'utf8')
  return cfg
}

export function maskKey(k) {
  const s = String(k ?? '')
  if (!s) return ''
  if (s.length <= 8) return '****'
  return `${s.slice(0, 4)}…${s.slice(-4)}`
}

function resolveConfig(raw) {
  const r = raw ?? {}
  const workdir = expandHome(expandEnv(r.workdir ?? DEFAULTS.workdir))
  // 用户在页面上保存的配置（config.json）优先级最高
  const user = loadUserConfig(workdir)
  return {
    workdir,
    ffmpegPath: expandEnv(r.ffmpegPath ?? DEFAULTS.ffmpegPath),
    ffprobePath: expandEnv(r.ffprobePath ?? DEFAULTS.ffprobePath),
    asr: { ...section(DEFAULTS.asr, r.asr), ...(user.asr ?? {}), model: ASR_MODEL },
    render: section(DEFAULTS.render, r.render),
  }
}

function sanitizeId(id) {
  const s = String(id || 'default').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/^\.+/, '')
  return s || 'default'
}

function textRender(_args, value) {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

function framesRender(_args, value) {
  const frames = Array.isArray(value?.frames) ? value.frames : []
  const blocks = [{
    type: 'text',
    text: JSON.stringify({
      video: value?.video ?? '',
      frames: frames.map((frame) => ({ time: frame.time })),
      ...(value?.omitted ? { omitted: value.omitted } : {}),
    }, null, 2),
  }]
  for (const frame of frames) {
    if (frame?.attachment) blocks.push({ type: 'image', attachment: frame.attachment })
  }
  return blocks
}

async function assertSessionCanSeeImages(ctx, exec) {
  const routed = exec.agent?.session?.requestHeader?.()?.config
  const provider = routed?.provider ?? exec.agent?.options?.provider
  const model = routed?.model ?? exec.agent?.options?.model
  if (!provider || !model || typeof ctx.llm?.resolveModelInfo !== 'function') return
  const info = await ctx.llm.resolveModelInfo(provider, model, exec.signal)
  if (!info.inputModalities?.includes('image')) {
    throw new Error(`当前模型 ${model} 不接收图片。请把这个会话换成支持看图的模型，再调用 subtitle_frames。`)
  }
}

export function createStudio(ctx, rawConfig) {
  const cfg = resolveConfig(rawConfig)
  const studio = {
    ctx,
    cfg,
    async mkTemp() {
      return fs.mkdtemp(path.join(os.tmpdir(), 'pss-'))
    },
  }
  return { studio, cfg }
}

/** 提交前配置体检：检查 ffmpeg/ffprobe 和百炼 API Key。 */
export async function binaryStatus(cfg) {
  return bindBinaries(cfg)
}

export async function installBinaries(cfg) {
  return downloadVendorBinaries(cfg)
}

export async function preflight(studio) {
  const cfg = studio.cfg
  await bindBinaries(cfg)
  const checks = []
  const add = (name, ok, message) => checks.push({ name, ok, ...(message ? { message } : {}) })

  try { await run(cfg.ffmpegPath, ['-version']); add('ffmpeg', true) }
  catch { add('ffmpeg', false, '找不到 ffmpeg。系统里没有可用的程序，请在字幕工作室面板点「下载依赖」。') }
  try { await run(cfg.ffprobePath, ['-version']); add('ffprobe', true) }
  catch { add('ffprobe', false, '找不到 ffprobe。系统里没有可用的程序，请在字幕工作室面板点「下载依赖」。') }

  // 翻译由主对话模型直接完成，无需单独的翻译 API/Key。
  add('translate', true, '翻译由主对话模型直接完成（无需单独 API）')

  const asrKey = expandEnv(cfg.asr.apiKey ?? '')
  add('asr', Boolean(asrKey), asrKey ? undefined : '百炼（DashScope）API Key 未设置（asr.apiKey 或环境变量 DASHSCOPE_API_KEY）')

  const missing = checks.filter((c) => !c.ok).map((c) => c.message ?? c.name)
  return { ok: missing.length === 0, checks, missing }
}

/** 预处理：检查配置并为每个无字幕视频提取音频，返回音频路径（供大模型后续转写）。 */
export async function preprocessForStudio(studio, cfg, paths, signal) {
  const check = await preflight(studio)
  const tmp = await studio.mkTemp()
  const videos = []
  for (const p of paths) {
    const info = await media.ffprobeJson(cfg.ffprobePath, p)
    const sidecars = await media.sidecarSubs(p)
    const mode = pipeline.detectMode(info, sidecars)
    let audioPath = null
    if (mode === 'asr') {
      audioPath = path.join(tmp, `audio-${videos.length}.wav`)
      await media.extractAudio(cfg.ffmpegPath, p, audioPath, { signal })
    }
    videos.push({ path: p, mode, durationSec: media.durationSeconds(info), sidecarSubs: sidecars, audioPath })
  }
  return { check, videos }
}

/** 列出所有项目（每个项目 = 一部番/一季），带 name/sessionId/videos 元数据。 */
export async function listProjects(cfg) {
  const root = path.join(expandHome(expandEnv(cfg.workdir)), 'projects')
  const out = []
  let entries = []
  try { entries = await fs.readdir(root, { withFileTypes: true }) } catch { return { projects: out } }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const id = e.name
    const sp = path.join(root, id, 'state.json')
    let st = {}
    try { st = JSON.parse(await fs.readFile(sp, 'utf8')) } catch { st = {} }
    out.push({
      id,
      name: st.name ?? id,
      sessionId: st.sessionId ?? '',
      videos: Array.isArray(st.videos) ? st.videos : [],
      updatedAt: st.updatedAt ?? st.created ?? '',
    })
  }
  out.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
  return { projects: out }
}

/** 创建或更新一个项目：记录 name/sessionId/videos 到 state.json。 */
export async function upsertProject(cfg, { id, name, sessionId, videos }) {
  const sid = sanitizeId(id ?? name ?? 'default')
  const root = path.join(expandHome(expandEnv(cfg.workdir)), 'projects')
  const dir = path.join(root, sid)
  await fs.mkdir(dir, { recursive: true })
  const sp = path.join(dir, 'state.json')
  let st = { created: new Date().toISOString(), runs: [] }
  try { st = JSON.parse(await fs.readFile(sp, 'utf8')) } catch { /* ignore */ }
  if (name !== undefined) st.name = name
  if (sessionId !== undefined) st.sessionId = sessionId
  if (videos !== undefined) st.videos = videos
  st.updatedAt = new Date().toISOString()
  await fs.writeFile(sp, JSON.stringify(st, null, 2) + '\n', 'utf8')
  return { project: { id: sid, name: st.name ?? sid, sessionId: st.sessionId ?? '', videos: st.videos ?? [], updatedAt: st.updatedAt } }
}

async function savedVideoPaths(cfg) {
  const { projects } = await listProjects(cfg)
  const paths = []
  for (const project of projects) {
    for (const item of project.videos ?? []) paths.push(item)
  }
  return paths
}

/** 只允许读取已经写进项目里的视频，避免这条接口变成任意读文件。 */
export async function projectVideoFile(cfg, video) {
  const requested = path.resolve(String(video ?? ''))
  let real
  try { real = await fs.realpath(requested) } catch { throw new Error('视频文件不存在') }
  if (!media.isVideoFile(real)) throw new Error('不是视频文件')
  for (const item of await savedVideoPaths(cfg)) {
    let itemReal
    try { itemReal = await fs.realpath(path.resolve(item)) } catch { continue }
    if (itemReal === real) return real
  }
  throw new Error('这个视频不在已保存的项目里')
}

function parseAssCues(text) {
  const cues = []
  for (const line of String(text).split(/\r?\n/)) {
    if (!/^Dialogue:/i.test(line)) continue
    const body = line.replace(/^Dialogue:\s*/i, '')
    const parts = body.split(',')
    if (parts.length < 10) continue
    const start = parseAssTime(parts[1])
    const end = parseAssTime(parts[2])
    const caption = parts.slice(9).join(',').replace(/\{[^}]*\}/g, '').replace(/\\[Nn]/g, '\n').trim()
    if (start === null || end === null || !caption) continue
    cues.push({ start, end, text: caption })
  }
  return cues
}

function parseAssTime(tc) {
  const m = /(\d+):(\d{2}):(\d{2})\.(\d{2})/.exec(String(tc).trim())
  if (!m) return null
  return (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 + Number(m[4]) * 10
}

async function findSubtitleFile(videoPath) {
  const dir = path.dirname(videoPath)
  const stem = path.basename(videoPath, path.extname(videoPath))
  const preferred = path.join(dir, `${stem}.rendered.srt`)
  try { await fs.access(preferred); return preferred } catch { /* keep looking */ }
  let names = []
  try { names = await fs.readdir(dir) } catch { return '' }
  const hits = names.filter((name) => {
    const ext = path.extname(name).toLowerCase()
    if (!media.isSubtitleFile(name)) return false
    return name === `${stem}${ext}` || name.startsWith(`${stem}.`) || name.startsWith(`${stem} `)
  })
  const rank = (name) => (/rendered/i.test(name) ? 0 : path.extname(name).toLowerCase() === '.srt' ? 1 : 2)
  hits.sort((a, b) => rank(a) - rank(b))
  return hits[0] ? path.join(dir, hits[0]) : ''
}

/** 读取项目视频旁边已经生成的字幕，供详情页预览。 */
export async function projectSubtitles(cfg, { video } = {}) {
  const file = await projectVideoFile(cfg, video)
  const sub = await findSubtitleFile(file)
  if (!sub) return { video: file, file: '', cues: [] }
  const text = await fs.readFile(sub, 'utf8')
  const ext = path.extname(sub).toLowerCase()
  const cues = (ext === '.ass' || ext === '.ssa' ? parseAssCues(text) : parseSubtitle(text)).slice(0, 5000)
  return { video: file, file: sub, cues }
}

/** 删除项目目录，清掉名称、视频路径和会话编号。只删除 workdir/projects 里面的那一层。 */
export async function deleteProject(cfg, { id } = {}) {
  const raw = String(id ?? '').trim()
  if (!raw) throw new Error('缺少项目编号')
  const sid = sanitizeId(raw)
  const root = path.resolve(path.join(expandHome(expandEnv(cfg.workdir)), 'projects'))
  const dir = path.resolve(root, sid)
  if (!dir.startsWith(root + path.sep)) throw new Error('无效的项目')
  let st
  try { st = await fs.stat(dir) } catch { throw new Error('项目不存在') }
  if (!st.isDirectory()) throw new Error('项目不存在')
  await fs.rm(dir, { recursive: true, force: false })
  return { deleted: sid }
}

/** Build the ToolDefinition array registered by the bundle. */
export function buildToolDefinitions({ studio, cfg }) {
  const str = (p, desc) => ({ type: 'string', ...(desc ? { description: desc } : {}) })
  const optStr = (p, desc) => ({ type: 'string', description: desc })
  const optInt = (p, desc) => ({ type: 'integer', description: desc })

  const outSchema = (props) => ({ type: 'object', properties: props, additionalProperties: true })

  return [
    {
      name: 'subtitle_transcribe',
      description: '语音转文字（ASR）：把音频文件转写为带时间轴的短字幕。走百炼 paraformer-v2，用词级时间戳切分，每条一般不超过 7 秒。调用方直接使用返回的 cues，不要再按静音切开音频或重新转写更短的片段。',
      parameters: {
        type: 'object',
        properties: {
          project: optStr('project', 'Project id (defaults to "default").'),
          audio: { type: 'string', description: '音频文件绝对路径（WAV/MP3）。' },
          language: optStr('language', '源语言。省略或 auto 时由语音识别自动判断，不要默认写成 ja。'),
          durationSec: { type: 'number', description: '音频时长（秒），用于无分段时兜底。' },
        },
        required: ['audio'],
      },
      output: { schema: outSchema({ text: str(), cues: { type: 'array' } }), render: textRender },
      async execute(args, exec) {
        await bindBinaries(cfg)
        const requested = args.language
        const sourceLang = requested === undefined || requested === '' || requested === 'auto'
          ? ''
          : expandEnv(requested)
        const cues = await pipeline.transcribeToCues(studio, args.audio, args.durationSec ?? 0, { sourceLang, signal: exec.signal })
        return { text: cues.map((c) => c.text).join(' '), cues }
      },
    },

    {
      name: 'subtitle_frames',
      description: '从视频按时间点截取画面，把 JPEG 直接交回当前模型。只截图，不描述、不分析。看图、核对说话人和画面文字由调用方自己完成。',
      parameters: {
        type: 'object',
        properties: {
          project: optStr('project', 'Project id (defaults to "default").'),
          video: { type: 'string', description: '视频文件绝对路径。' },
          times: { type: 'array', description: '要截取的时间点（秒），例如 [12.5, 40]。' },
          count: optInt('count', '未给 times 时，沿时间轴均匀截这么多帧，最多 8。'),
        },
        required: ['video'],
      },
      output: {
        schema: outSchema({
          video: str(),
          frames: { type: 'array', items: { type: 'object', additionalProperties: true } },
          omitted: { type: 'integer' },
        }),
        render: framesRender,
      },
      async execute(args, exec) {
        await bindBinaries(cfg)
        await assertSessionCanSeeImages(studio.ctx, exec)
        const attachments = studio.ctx.attachments
        if (typeof attachments?.saveImages !== 'function') throw new Error('附件服务不可用，无法把截图交给当前模型')
        const info = await media.ffprobeJson(cfg.ffprobePath, args.video)
        const dur = media.durationSeconds(info) ?? 0
        let times = (args.times ?? []).map(Number).filter((t) => Number.isFinite(t) && t >= 0)
        if (times.length === 0) {
          const n = clamp(args.count ?? 4, 1, 8)
          times = Array.from({ length: n }, (_, i) => (dur <= 0 ? 0 : ((i + 0.5) / n) * dur))
        }
        const limit = Math.max(1, Number(attachments.imageLimits?.maxImagesPerMessage) || 8)
        const capped = times.slice(0, limit)
        const tmp = await studio.mkTemp()
        const shots = []
        for (let i = 0; i < capped.length; i++) {
          const file = path.join(tmp, `frame-${i}.jpg`)
          await media.extractFrame(cfg.ffmpegPath, args.video, capped[i], file, { signal: exec.signal })
          shots.push({ time: capped[i], data: await fs.readFile(file), name: `frame-${Math.round(capped[i])}.jpg` })
        }
        const refs = await attachments.saveImages(shots.map((shot) => ({ data: shot.data, mediaType: 'image/jpeg', name: shot.name })))
        return {
          video: args.video,
          frames: shots.map((shot, i) => ({ time: shot.time, attachment: refs[i] })),
          omitted: times.length - capped.length,
        }
      },
    },

    {
      name: 'subtitle_render',
      description: 'Write a translated subtitle onto the video: mode srt exports a sidecar .srt; mkv-soft / mp4-soft mux a subtitle track (video/audio copied losslessly); mp4-burn hard-burns subtitles into the picture (re-encodes video).',
      parameters: {
        type: 'object',
        properties: {
          project: optStr('project', 'Project id (defaults to "default").'),
          video: { type: 'string', description: 'Absolute path to the source video.' },
          subtitle: { type: 'string', description: 'Absolute path to the SRT subtitle to embed.' },
          mode: { type: 'string', enum: ['srt', 'mkv-soft', 'mp4-soft', 'mp4-burn'], description: 'Output kind.' },
          output: optStr('output', 'Optional explicit output path (otherwise derived next to the video).'),
          style: optStr('style', 'ASS style string for burn mode (force_style).'),
        },
        required: ['video', 'subtitle'],
      },
      output: { schema: outSchema({ output: str(), mode: str() }), render: textRender },
      async execute(args, exec) {
        await bindBinaries(cfg)
        const mode = args.mode ?? cfg.render.defaultMode ?? 'srt'
        const outPath = args.output ?? renderOutputPath(args.video, mode)
        const style = args.style ?? expandEnv(cfg.render.burnStyle ?? DEFAULT_BURN_STYLE)
        await render(cfg.ffmpegPath, args.video, args.subtitle, mode, outPath, style, { signal: exec.signal })
        return { output: outPath, mode }
      },
    },
  ]
}
