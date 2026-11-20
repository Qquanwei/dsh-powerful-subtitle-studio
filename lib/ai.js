/** AI backends: 百炼文件转写。画面由主模型自己看截图，这里不再调用视觉模型。 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { expandEnv } from './util.js'
import { expandMixedCue } from './srt.js'

function apiRoot(baseUrl) {
  return String(baseUrl).replace(/\/+$/, '')
}

async function httpJson(url, { method = 'POST', apiKey, body, signal, rawBody, extraHeaders }) {
  const headers = { Accept: 'application/json', ...(extraHeaders ?? {}) }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  let payload
  if (rawBody !== undefined) {
    payload = rawBody
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(url, { method, headers, body: payload, signal })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 600)}`)
  if (!text) return {}
  try { return JSON.parse(text) } catch { return { _raw: text } }
}

/** Resolve a translated/vision config to concrete { baseUrl, apiKey, model }. */
export function resolveEndpoint(cfg) {
  return {
    baseUrl: apiRoot(expandEnv(cfg.baseUrl)),
    apiKey: expandEnv(cfg.apiKey ?? ''),
    model: expandEnv(cfg.model ?? ''),
  }
}

/** 阿里云百炼（DashScope）Qwen3-ASR 实时接口：POST /chat/completions + input_audio（base64 Data URI）。返回纯文本。 */
async function transcribeDashscope(cfg, { file, language, signal }) {
  const { baseUrl, apiKey, model } = resolveEndpoint(cfg)
  const bytes = await fs.readFile(file)
  const mime = /\.mp3$/i.test(file) ? 'audio/mpeg' : 'audio/wav'
  const dataUri = `data:${mime};base64,${bytes.toString('base64')}`
  const body = {
    model,
    messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: dataUri } }] }],
    stream: false,
    asr_options: { enable_itn: false, ...(language ? { language } : {}) },
  }
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify(body),
    signal,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} from DashScope ASR: ${text.slice(0, 600)}`)
  const data = JSON.parse(text)
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('DashScope ASR returned no content')
  return { text: content, segments: [] }
}

/** 百炼（DashScope）文件转写根域名。 */
const BAILIAN_ROOT = 'https://dashscope.aliyuncs.com'

/** 语音转写模型。写死为百炼 Paraformer-v2，不读配置。 */
export const ASR_MODEL = 'paraformer-v2'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function speakerField(value) {
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? { speaker: n } : {}
}

/** 解析百炼文件转写结果：保留句子，并抽出词级时间戳（ms → 秒）。 */
export function parseBailianResult(data) {
  const segments = []
  const words = []
  for (const tr of (data?.transcripts ?? [])) {
    for (const s of (tr?.sentences ?? [])) {
      const start = (s.begin_time ?? 0) / 1000
      const end = (s.end_time ?? 0) / 1000
      const text = String(s.text ?? '').trim()
      if (text) segments.push({ start, end, text, ...speakerField(s.speaker_id) })
      for (const w of (s.words ?? [])) {
        const token = String(w.text ?? '').trim()
        const punctuation = String(w.punctuation ?? '')
        if (!token && !punctuation) continue
        words.push({
          start: (w.begin_time ?? s.begin_time ?? 0) / 1000,
          end: (w.end_time ?? s.end_time ?? 0) / 1000,
          text: token,
          punctuation,
          ...speakerField(w.speaker_id ?? s.speaker_id),
        })
      }
    }
  }
  return { text: segments.map((s) => s.text).join(' '), segments, words }
}

const CUE_GAP_SEC = 0.45
const CUE_MAX_SEC = 7
const STRONG_PUNCT = /[。！？!?；;]/

function cueCharLimit(text) {
  const compact = String(text).replace(/\s/g, '')
  const cjk = (compact.match(/[\u3400-\u9fff]/g) || []).length
  return cjk * 2 >= compact.length ? 40 : 80
}

function joinAsrWords(words) {
  let out = ''
  for (const w of words) {
    const piece = `${w.text || ''}${w.punctuation || ''}`
    if (!piece) continue
    const prev = out.slice(-1)
    const next = piece[0]
    if (out && /[A-Za-z0-9]/.test(prev) && /[A-Za-z0-9]/.test(next)) out += ' '
    out += piece
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * 用词级时间戳组成字幕。句末标点、词间空隙、7 秒和字数上限都会断开。
 * 输入词的时间是秒，返回字幕的时间是毫秒。
 */
export function cuesFromWords(words) {
  const cues = []
  let buf = []
  const speakerOf = (w) => {
    const n = Number(w?.speaker)
    return Number.isInteger(n) && n >= 0 ? n : null
  }
  const flush = () => {
    const text = joinAsrWords(buf)
    if (text) {
      const cue = {
        start: Math.round(buf[0].start * 1000),
        end: Math.round(buf[buf.length - 1].end * 1000),
        text,
        words: buf.map((word) => ({
          start: Math.round(word.start * 1000),
          end: Math.round(word.end * 1000),
          text: `${word.text || ''}${word.punctuation || ''}`.trim(),
        })),
      }
      const speaker = speakerOf(buf[0])
      if (speaker !== null) cue.speaker = speaker
      cues.push(...expandMixedCue(cue))
    }
    buf = []
  }
  for (const w of words ?? []) {
    if (buf.length) {
      const gap = w.start - buf[buf.length - 1].end
      const duration = w.end - buf[0].start
      const nextText = joinAsrWords([...buf, w])
      if (speakerOf(w) !== speakerOf(buf[0]) || gap >= CUE_GAP_SEC || duration > CUE_MAX_SEC || nextText.length > cueCharLimit(nextText)) flush()
    }
    buf.push(w)
    if (STRONG_PUNCT.test(w.punctuation || '') || STRONG_PUNCT.test(w.text || '')) flush()
  }
  flush()
  return cues
}

/**
 * 百炼（DashScope）文件转写（paraformer-v2）：上传 → 提交 → 轮询 → 下载。
 * 返回句子文本和词级时间戳。
 */
async function transcribeBailian(cfg, { file, language, signal }) {
  const { apiKey } = resolveEndpoint(cfg)
  if (!apiKey) throw new Error('未配置百炼 API Key（请在「字幕工作室」设置里填写百炼 key）')
  const modelId = ASR_MODEL

  // 1. 获取上传凭证
  const policy = await httpJson(`${BAILIAN_ROOT}/api/v1/uploads?action=getPolicy&model=${encodeURIComponent(modelId)}`, { method: 'GET', apiKey, signal })
  const p = policy?.data
  if (!p?.upload_host || !p?.upload_dir) throw new Error('百炼上传凭证获取失败：' + JSON.stringify(policy).slice(0, 300))

  // 2. 上传音频到临时 OSS
  const fileName = path.basename(file) || 'audio.wav'
  const key = `${p.upload_dir}/${fileName}`
  const bytes = await fs.readFile(file)
  const fd = new FormData()
  fd.append('OSSAccessKeyId', p.oss_access_key_id)
  fd.append('Signature', p.signature)
  fd.append('policy', p.policy)
  fd.append('x-oss-object-acl', p.x_oss_object_acl)
  fd.append('x-oss-forbid-overwrite', p.x_oss_forbid_overwrite)
  fd.append('key', key)
  fd.append('success_action_status', '200')
  fd.append('file', new Blob([bytes], { type: 'audio/wav' }), fileName)
  const upRes = await fetch(p.upload_host, { method: 'POST', body: fd, signal })
  const upText = await upRes.text()
  if (!upRes.ok) throw new Error(`百炼音频上传失败 HTTP ${upRes.status}: ${upText.slice(0, 300)}`)
  const ossUrl = `oss://${key}`

  // 3. 提交转写任务
  const submit = await httpJson(`${BAILIAN_ROOT}/api/v1/services/audio/asr/transcription`, {
    method: 'POST', apiKey, signal,
    body: { model: modelId, input: { file_urls: [ossUrl] }, parameters: { diarization_enabled: true } },
    extraHeaders: { 'X-DashScope-Async': 'enable', 'X-DashScope-OssResourceResolve': 'enable' },
  })
  const taskId = submit?.output?.task_id
  if (!taskId) throw new Error('百炼转写提交失败：' + JSON.stringify(submit).slice(0, 300))

  // 4. 轮询任务
  let finalJob = null
  for (let i = 0; i < 300; i++) {
    await sleep(2000)
    const q = await httpJson(`${BAILIAN_ROOT}/api/v1/tasks/${taskId}`, { method: 'GET', apiKey, signal })
    const status = q?.output?.task_status
    if (status === 'SUCCEEDED') { finalJob = q; break }
    if (status === 'FAILED') throw new Error('百炼转写任务失败：' + JSON.stringify(q?.output).slice(0, 300))
  }
  if (!finalJob) throw new Error('百炼转写任务超时（10 分钟）')

  // 5. 下载结果并解析（transcription_url 为签名 URL，无需额外鉴权）
  const resultUrl = finalJob?.output?.results?.[0]?.transcription_url
  if (!resultUrl) throw new Error('百炼转写结果缺少 transcription_url')
  const data = await httpJson(resultUrl, { method: 'GET', signal })
  return parseBailianResult(data)
}

/**
 * 语音转写：走百炼（DashScope）paraformer-v2 文件转写，返回句子级时间戳。
 */
export async function transcribe(cfg, { file, language, prompt, signal }) {
  return transcribeBailian(cfg, { file, language, signal })
}
