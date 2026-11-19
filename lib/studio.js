/** Core studio: config resolution, project/glossary/state persistence, and tool definitions. */
import { promises as fs } from 'node:fs'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { expandEnv, expandHome, clamp, parseJson, run } from './util.js'
import { emptyGlossary, loadGlossary, saveGlossary, applyTerms, removeTerms } from './glossary.js'
import * as media from './media.js'
import { vision, findVisionModel } from './ai.js'
import * as pipeline from './pipeline.js'
import { renderOutputPath, render } from './render.js'

const DEFAULT_BURN_STYLE = 'FontName=Noto Sans CJK SC,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1,Shadow=0,MarginV=20'

const DEFAULTS = {
  workdir: '~/.powerful-subtitle-studio',
  ffmpegPath: 'ffmpeg',
  ffprobePath: 'ffprobe',
  translate: {
    provider: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    sourceLang: 'ja',
    targetLang: 'zh-CN',
    temperature: 0.2,
    maxTokens: 4000,
    chunkChars: 3500,
    dshProvider: '',
    dshModel: '',
  },
  asr: { baseUrl: 'https://dashscope.aliyuncs.com', apiKey: '', model: 'sensevoice-v1', format: 'dashscope', language: 'ja', prompt: '' },
  vision: { provider: 'dsh', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', dshProvider: '', dshModel: '', maxTokens: 1000, maxFramesPerVideo: 12 },
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
    translate: { ...section(DEFAULTS.translate, r.translate), ...(user.translate ?? {}) },
    asr: { ...section(DEFAULTS.asr, r.asr), ...(user.asr ?? {}) },
    vision: { ...section(DEFAULTS.vision, r.vision), ...(user.vision ?? {}) },
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

export function createStudio(ctx, rawConfig) {
  const cfg = resolveConfig(rawConfig)

  async function projectDir(id) {
    const dir = path.join(expandHome(expandEnv(cfg.workdir)), 'projects', sanitizeId(id))
    await fs.mkdir(dir, { recursive: true })
    return dir
  }
  function glossaryPathFor(dir) { return path.join(dir, 'glossary.json') }
  function statePathFor(dir) { return path.join(dir, 'state.json') }

  async function ensureProject(id) {
    const dir = await projectDir(id)
    const gPath = glossaryPathFor(dir)
    const sPath = statePathFor(dir)
    try { await fs.access(gPath) } catch {
      await saveGlossary(gPath, emptyGlossary(id))
    }
    try { await fs.access(sPath) } catch {
      await fs.writeFile(sPath, JSON.stringify({ created: new Date().toISOString(), runs: [] }, null, 2) + '\n', 'utf8')
    }
    return { dir, glossaryPath: gPath, statePath: sPath }
  }

  async function recordRun(id, summary) {
    const { dir, statePath } = await ensureProject(id)
    let state = { runs: [] }
    try { state = JSON.parse(await fs.readFile(statePath, 'utf8')) } catch { /* ignore */ }
    state.runs = Array.isArray(state.runs) ? state.runs : []
    state.runs.unshift({ at: new Date().toISOString(), ...summary })
    state.runs = state.runs.slice(0, 20)
    await fs.writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8')
    return dir
  }

  const studio = {
    ctx,
    cfg,

    async loadGlossary(id = 'default') {
      const dir = await projectDir(id)
      return loadGlossary(glossaryPathFor(dir))
    },
    async saveGlossary(id = 'default', glossary) {
      const dir = await projectDir(id)
      await saveGlossary(glossaryPathFor(dir), glossary)
      return glossaryPathFor(dir)
    },
    async mkTemp() {
      return fs.mkdtemp(path.join(os.tmpdir(), 'pss-'))
    },
  }

  return { studio, cfg, ensureProject, recordRun }
}

/** 提交前配置体检：检查 ffmpeg/ffprobe 与翻译/ASR/视觉的 API Key 是否就绪。 */
export async function preflight(studio) {
  const cfg = studio.cfg
  const checks = []
  const add = (name, ok, message) => checks.push({ name, ok, ...(message ? { message } : {}) })

  try { await run(cfg.ffmpegPath, ['-version']); add('ffmpeg', true) }
  catch { add('ffmpeg', false, `找不到 ffmpeg（${cfg.ffmpegPath} 不在 PATH）`) }
  try { await run(cfg.ffprobePath, ['-version']); add('ffprobe', true) }
  catch { add('ffprobe', false, `找不到 ffprobe（${cfg.ffprobePath} 不在 PATH）`) }

  // 翻译由主对话模型直接完成，无需单独的翻译 API/Key。
  add('translate', true, '翻译由主对话模型直接完成（无需单独 API）')

  const asrKey = expandEnv(cfg.asr.apiKey ?? '')
  add('asr', Boolean(asrKey), asrKey ? undefined : '百炼（DashScope）API Key 未设置（asr.apiKey 或环境变量 DASHSCOPE_API_KEY）')
  const visionProvider = expandEnv(cfg.vision.provider ?? 'dsh')
  if (visionProvider === 'dsh') {
    try {
      const vm = await findVisionModel(studio.ctx)
      add('vision', Boolean(vm), vm ? `使用 DSH 视觉模型 ${vm.provider}/${vm.model}` : 'DSH 未配置支持图片的多模态模型（请在 DSH 模型设置里添加，如 qwen3-vl-plus / glm-4v）')
    } catch { add('vision', false, '无法访问 DSH LLM 服务（视觉）') }
  } else {
    const visionKey = expandEnv(cfg.vision.apiKey ?? '')
    add('vision', Boolean(visionKey), visionKey ? undefined : '视觉 API Key 未设置（vision.apiKey 或环境变量）')
  }

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

/** Build the ToolDefinition array registered by the bundle. */
export function buildToolDefinitions({ studio, cfg, ensureProject, recordRun }) {
  const str = (p, desc) => ({ type: 'string', ...(desc ? { description: desc } : {}) })
  const optStr = (p, desc) => ({ type: 'string', description: desc })
  const optBool = (p, desc) => ({ type: 'boolean', description: desc })
  const optInt = (p, desc) => ({ type: 'integer', description: desc })

  const outSchema = (props) => ({ type: 'object', properties: props, additionalProperties: true })

  return [
    {
      name: 'subtitle_project_init',
      description: 'Initialize (or return) a subtitle project: a shared work directory holding the cross-video terminology glossary and run state. Use one project id for a whole series so character/term names stay consistent.',
      parameters: {
        type: 'object',
        properties: {
          project: optStr('project', 'Project id (defaults to "default"). Use the same id across videos of one series.'),
        },
      },
      output: { schema: outSchema({ project: str(), dir: str(), glossaryPath: str(), statePath: str(), glossaryCount: { type: 'integer' } }), render: textRender },
      async execute(args) {
        const id = args.project ?? 'default'
        const { dir, glossaryPath, statePath } = await ensureProject(id)
        const glossary = await loadGlossary(glossaryPath)
        return { project: sanitizeId(id), dir, glossaryPath, statePath, glossaryCount: glossary.terms.length }
      },
    },

    {
      name: 'subtitle_glossary',
      description: 'Manage the project terminology glossary that keeps character names and proper nouns consistent across all videos. Actions: list, add (upsert), set (replace all), remove (by source), import (merge a JSON file of terms), reset (clear).',
      parameters: {
        type: 'object',
        properties: {
          project: optStr('project', 'Project id (defaults to "default").'),
          action: { type: 'string', enum: ['list', 'add', 'set', 'remove', 'import', 'reset'], description: 'Operation to perform.' },
          terms: { type: 'array', description: 'Terms for add/set: [{source, target, note?, scope?}].' },
          sources: { type: 'array', description: 'Source strings to remove (action: remove).' },
          path: optStr('path', 'JSON file path to import (action: import).'),
        },
        required: ['action'],
      },
      output: { schema: outSchema({ project: str(), count: { type: 'integer' }, terms: { type: 'array' }, glossaryPath: str() }), render: textRender },
      async execute(args) {
        const id = args.project ?? 'default'
        const glossary = await studio.loadGlossary(id)
        const action = args.action
        let next = glossary
        if (action === 'add') next = applyTerms(glossary, args.terms ?? [])
        else if (action === 'set') next = applyTerms({ ...glossary, terms: [] }, args.terms ?? [])
        else if (action === 'remove') next = removeTerms(glossary, args.sources ?? [])
        else if (action === 'reset') next = { ...glossary, terms: [] }
        else if (action === 'import') {
          const raw = await fs.readFile(args.path, 'utf8')
          const parsed = JSON.parse(raw)
          const terms = Array.isArray(parsed) ? parsed : (parsed.terms ?? [])
          next = applyTerms(glossary, terms)
        }
        const glossaryPath = await studio.saveGlossary(id, next)
        return { project: sanitizeId(id), count: next.terms.length, terms: next.terms, glossaryPath }
      },
    },

    {
      name: 'subtitle_scan',
      description: 'Scan a video file or a directory of videos and report, for each, whether it already has subtitles (embedded text/image streams or sidecar .srt/.ass/.vtt) and which processing mode will be used (translate existing vs transcribe audio).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Video file or directory to scan.' },
          project: optStr('project', 'Project id (defaults to "default").'),
        },
        required: ['path'],
      },
      output: { schema: outSchema({ videos: { type: 'array' } }), render: textRender },
      async execute(args, exec) {
        const videos = await media.listFiles(args.path, { signal: exec.signal })
        const out = []
        for (const v of videos) {
          const info = await media.ffprobeJson(cfg.ffprobePath, v)
          const subs = media.streamsOf(info, 'subtitle')
          const sidecars = await media.sidecarSubs(v)
          out.push({
            video: v,
            mode: pipeline.detectMode(info, sidecars),
            durationSec: media.durationSeconds(info),
            textSubtitleStreams: subs.filter((s) => media.isTextSubtitleCodec(s.codec_name)).map((s) => ({ index: s.index, codec: s.codec_name, language: s.tags?.language ?? null })),
            imageSubtitleStreams: subs.filter((s) => media.isImageSubtitleCodec(s.codec_name)).map((s) => ({ index: s.index, codec: s.codec_name })),
            sidecarSubs: sidecars,
          })
        }
        return { videos: out }
      },
    },

    {
      name: 'subtitle_preprocess',
      description: '预处理视频：检查配置（ffmpeg/ASR key）并为每个视频提取音频，供后续语音转写使用。返回每个视频的模式与音频路径。',
      parameters: {
        type: 'object',
        properties: {
          project: optStr('project', 'Project id (defaults to "default").'),
          path: { type: 'string', description: '视频文件或目录路径。' },
        },
        required: ['path'],
      },
      output: { schema: outSchema({ check: { type: 'object' }, videos: { type: 'array' } }), render: textRender },
      async execute(args, exec) {
        const check = await preflight(studio)
        const videos = await media.listFiles(args.path, { signal: exec.signal })
        const tmp = await studio.mkTemp()
        const out = []
        for (const v of videos) {
          const info = await media.ffprobeJson(cfg.ffprobePath, v)
          const sidecars = await media.sidecarSubs(v)
          const mode = pipeline.detectMode(info, sidecars)
          let audioPath = null
          if (mode === 'asr') {
            audioPath = path.join(tmp, `audio-${out.length}.wav`)
            await media.extractAudio(cfg.ffmpegPath, v, audioPath, { signal: exec.signal })
          }
          out.push({ path: v, mode, durationSec: media.durationSeconds(info), audioPath })
        }
        return { check, videos: out }
      },
    },

    {
      name: 'subtitle_transcribe',
      description: '语音转文字（ASR）：把音频文件转写为带时间轴的文本。走百炼（DashScope）SenseVoice 文件转写，模型自带句子时间戳并抗 BGM。',
      parameters: {
        type: 'object',
        properties: {
          project: optStr('project', 'Project id (defaults to "default").'),
          audio: { type: 'string', description: '音频文件绝对路径（WAV/MP3）。' },
          language: optStr('language', '源语言（默认取配置，如 ja）。'),
          durationSec: { type: 'number', description: '音频时长（秒），用于无分段时兜底。' },
        },
        required: ['audio'],
      },
      output: { schema: outSchema({ text: str(), cues: { type: 'array' } }), render: textRender },
      async execute(args, exec) {
        const sourceLang = expandEnv(args.language ?? cfg.asr.language ?? 'ja')
        const cues = await pipeline.transcribeToCues(studio, args.audio, args.durationSec ?? 0, { sourceLang, signal: exec.signal })
        return { text: cues.map((c) => c.text).join(' '), cues }
      },
    },

    {
      name: 'subtitle_visual_check',
      description: 'Extract video frames at specific times (or a sampled set) and use a vision model to describe who is speaking and any on-screen text, to verify transcriptions and improve translation precision.',
      parameters: {
        type: 'object',
        properties: {
          project: optStr('project', 'Project id (defaults to "default").'),
          video: { type: 'string', description: 'Absolute path to the video file.' },
          times: { type: 'array', description: 'Timestamps in seconds to inspect (e.g. [120, 300]).' },
          count: optInt('count', 'If times omitted, sample this many evenly spaced frames.'),
          prompt: optStr('prompt', 'Optional custom instruction appended to the analysis prompt.'),
        },
        required: ['video'],
      },
      output: { schema: outSchema({ video: str(), analyses: { type: 'array' } }), render: textRender },
      async execute(args, exec) {
        const info = await media.ffprobeJson(cfg.ffprobePath, args.video)
        const dur = media.durationSeconds(info)
        let times = (args.times ?? []).map(Number)
        if (times.length === 0) {
          const n = clamp(args.count ?? 8, 1, 60)
          times = Array.from({ length: n }, (_, i) => (i / n) * (dur ?? 0))
        }
        const vcfg = cfg.vision
        const tmp = await studio.mkTemp()
        const analyses = []
        for (const t of times) {
          const frame = path.join(tmp, `check-${Math.round(t)}.jpg`)
          await media.extractFrame(cfg.ffmpegPath, args.video, t, frame, { signal: exec.signal })
          const prompt = [
            'Analyze this anime frame to help proofread subtitles.',
            'Return a JSON object with: "speaker", "onScreenText", "notes".',
            args.prompt ? `Additional instruction: ${args.prompt}` : '',
          ].filter(Boolean).join('\n')
          const raw = await vision(vcfg, { imagePath: frame, prompt, json: true, maxTokens: vcfg.maxTokens, signal: exec.signal, ctx: studio.ctx })
          analyses.push({ time: t, frame, ...parseJson(raw) })
        }
        return { video: args.video, analyses }
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
        const mode = args.mode ?? cfg.render.defaultMode ?? 'srt'
        const outPath = args.output ?? renderOutputPath(args.video, mode)
        const style = args.style ?? expandEnv(cfg.render.burnStyle ?? DEFAULT_BURN_STYLE)
        await render(cfg.ffmpegPath, args.video, args.subtitle, mode, outPath, style, { signal: exec.signal })
        return { output: outPath, mode }
      },
    },

    {
      name: 'subtitle_status',
      description: 'Report a project\'s state: glossary size, recent run history, and the project directory.',
      parameters: {
        type: 'object',
        properties: {
          project: optStr('project', 'Project id (defaults to "default").'),
        },
      },
      output: { schema: outSchema({ project: str(), dir: str(), glossaryCount: { type: 'integer' }, glossaryPath: str(), statePath: str(), recentRuns: { type: 'array' } }), render: textRender },
      async execute(args) {
        const id = args.project ?? 'default'
        const { dir, glossaryPath, statePath } = await ensureProject(id)
        const glossary = await loadGlossary(glossaryPath)
        let state = { runs: [] }
        try { state = JSON.parse(await fs.readFile(statePath, 'utf8')) } catch { /* ignore */ }
        return { project: sanitizeId(id), dir, glossaryCount: glossary.terms.length, glossaryPath, statePath, recentRuns: (state.runs ?? []).slice(0, 10) }
      },
    },

    {
      name: 'subtitle_check',
      description: '提交任务前做配置体检：检查 ffmpeg/ffprobe 是否可用，以及翻译、语音识别、视觉的 API Key 是否已配置。返回逐项结果与修复提示；未通过项会明确指出缺哪个 key。',
      parameters: {
        type: 'object',
        properties: {},
      },
      output: { schema: outSchema({ ok: { type: 'boolean' }, checks: { type: 'array' }, missing: { type: 'array' } }), render: textRender },
      async execute() {
        return preflight(studio)
      },
    },

    {
      name: 'subtitle_config',
      description: '查看或设置字幕插件配置（API Key、模型、接口地址）。set 会把值持久化到 ~/.powerful-subtitle-studio/config.json 并立即生效；get 返回当前有效配置（API Key 打码）。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set'], description: 'get = 查看当前配置；set = 保存配置。' },
          asrApiKey: optStr('asrApiKey', '语音识别 API Key'),
          visionApiKey: optStr('visionApiKey', '视觉 API Key'),
          asrModel: optStr('asrModel', '语音识别模型名'),
          asrBaseUrl: optStr('asrBaseUrl', '语音识别接口地址'),
          visionBaseUrl: optStr('visionBaseUrl', '视觉接口地址'),
          visionProvider: optStr('visionProvider', '视觉走 DSH 时的供应商（provider）'),
          visionModel: optStr('visionModel', '视觉走 DSH 时的模型名'),
        },
        required: ['action'],
      },
      output: { schema: outSchema({ saved: { type: 'boolean' }, asr: { type: 'object' }, vision: { type: 'object' } }), render: textRender },
      async execute(args) {
        const workdir = expandHome(expandEnv(cfg.workdir))
        if (args.action === 'set') {
          const current = loadUserConfig(workdir)
          const next = { ...current }
          if (args.asrApiKey !== undefined) next.asr = { ...(next.asr ?? {}), apiKey: args.asrApiKey }
          if (args.visionApiKey !== undefined) next.vision = { ...(next.vision ?? {}), apiKey: args.visionApiKey }
          if (args.asrModel !== undefined) next.asr = { ...(next.asr ?? {}), model: args.asrModel }
          if (args.visionModel !== undefined) next.vision = { ...(next.vision ?? {}), dshModel: args.visionModel }
          if (args.asrBaseUrl !== undefined) next.asr = { ...(next.asr ?? {}), baseUrl: args.asrBaseUrl }
          if (args.visionBaseUrl !== undefined) next.vision = { ...(next.vision ?? {}), baseUrl: args.visionBaseUrl }
          if (args.visionProvider !== undefined) next.vision = { ...(next.vision ?? {}), provider: 'dsh', dshProvider: args.visionProvider }
          saveUserConfig(workdir, next)
          Object.assign(cfg.asr, next.asr ?? {})
          Object.assign(cfg.vision, next.vision ?? {})
        }
        return {
          saved: args.action === 'set',
          asr: { ...cfg.asr, apiKey: maskKey(cfg.asr.apiKey) },
          vision: { ...cfg.vision, apiKey: maskKey(cfg.vision.apiKey) },
        }
      },
    },

    {
      name: 'subtitle_models',
      description: '列出 DSH 当前可用的 LLM 模型（按供应商分组），并标注哪些支持图片输入（可用于视觉翻译）。用于在设置里选择翻译/视觉模型，复用 DSH 已配置的凭据。',
      parameters: {
        type: 'object',
        properties: {},
      },
      output: { schema: outSchema({ providers: { type: 'array' } }), render: textRender },
      async execute() {
        const providers = []
        for (const p of studio.ctx.llm.listProviders()) {
          const models = await studio.ctx.llm.listModels(p.id)
          const items = []
          for (const m of models) {
            let vision = false
            try {
              const info = await studio.ctx.llm.resolveModelInfo(p.id, m.id)
              vision = info.inputModalities?.includes('image') === true
            } catch { /* 忽略无法解析的模型 */ }
            items.push({ id: m.id, name: m.name ?? m.id, vision })
          }
          providers.push({ provider: p.id, name: p.name, models: items })
        }
        return { providers }
      },
    },
  ]
}
