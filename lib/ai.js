/** AI backends: OpenAI-compatible chat/transcription, vision, and the DSH ctx.llm seam. */
import { promises as fs } from 'node:fs'
import { expandEnv, parseJson } from './util.js'

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 解析百炼文件转写结果：句子时间戳（ms → 秒）。 */
function parseBailianResult(data) {
  const segments = []
  for (const tr of (data?.transcripts ?? [])) {
    for (const s of (tr?.sentences ?? [])) {
      const start = (s.begin_time ?? 0) / 1000
      const end = (s.end_time ?? 0) / 1000
      const text = String(s.text ?? '').trim()
      if (text) segments.push({ start, end, text })
    }
  }
  return { text: segments.map((s) => s.text).join(' '), segments }
}

/**
 * 百炼（DashScope）文件转写（SenseVoice）：上传 → 提交 → 轮询 → 下载。
 * SenseVoice 内建 VAD，不依赖「静音」——即使有 BGM 也能切出人声区间，并返回句子/词级时间戳。
 */
async function transcribeBailian(cfg, { file, language, signal }) {
  const { apiKey, model } = resolveEndpoint(cfg)
  if (!apiKey) throw new Error('未配置百炼 API Key（请在「字幕工作室」设置里填写百炼 key）')
  const rawModel = model ?? ''
  const modelId = /^(paraformer|sensevoice)/.test(rawModel) ? rawModel : 'sensevoice-v1'

  // 1. 获取上传凭证
  const policy = await httpJson(`${BAILIAN_ROOT}/api/v1/uploads?action=getPolicy&model=${encodeURIComponent(modelId)}`, { method: 'GET', apiKey, signal })
  const p = policy?.data
  if (!p?.upload_host || !p?.upload_dir) throw new Error('百炼上传凭证获取失败：' + JSON.stringify(policy).slice(0, 300))

  // 2. 上传音频到临时 OSS
  const fileName = file.split('/').pop() || 'audio.wav'
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
    body: { model: modelId, input: { file_urls: [ossUrl] }, parameters: {} },
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
 * 语音转写：走百炼（DashScope）SenseVoice 文件转写，返回句子级时间戳（不依赖静音检测，抗 BGM）。
 */
export async function transcribe(cfg, { file, language, prompt, signal }) {
  return transcribeBailian(cfg, { file, language, signal })
}

/**
 * Vision: describe a frame and return a parsed JSON object. When `cfg.provider`
 * is "dsh" (or a DSH context is supplied), the image is sent through DSH's own
 * LLM (no separate key); otherwise it is sent inline as a data URL to the
 * configured OpenAI-compatible endpoint.
 */
export async function vision(cfg, { imagePath, prompt, temperature, maxTokens, json, signal, ctx }) {
  const provider = expandEnv(cfg.provider ?? 'openai')
  if (provider === 'dsh' && ctx) {
    return visionViaDsh(ctx, {
      provider: expandEnv(cfg.dshProvider ?? ''),
      model: expandEnv(cfg.dshModel ?? ''),
      imagePath, prompt, maxTokens, signal,
    })
  }
  const { baseUrl, apiKey, model } = resolveEndpoint(cfg)
  const bytes = await fs.readFile(imagePath)
  const mime = /\.png$/i.test(imagePath) ? 'image/png' : 'image/jpeg'
  const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`
  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: dataUrl } },
    ],
  }]
  const body = {
    model,
    messages,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
  }
  if (json) body.response_format = { type: 'json_object' }
  const data = await httpJson(`${baseUrl}/chat/completions`, { apiKey, body, signal })
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('vision call returned no content')
  return content
}

/** 在 DSH 的模型列表里找一个支持图片输入的模型（provider + model）。 */
export async function findVisionModel(ctx) {
  for (const p of ctx.llm.listProviders()) {
    const models = await ctx.llm.listModels(p.id)
    for (const m of models) {
      try {
        const info = await ctx.llm.resolveModelInfo(p.id, m.id)
        if (info.inputModalities?.includes('image')) return { provider: p.id, model: m.id }
      } catch { /* 跳过无法解析的模型 */ }
    }
  }
  return null
}

/** 通过 DSH 自己的 LLM（ctx.llm）做视觉描述，复用 DSH 已配置的多模态模型与凭据。 */
export async function visionViaDsh(ctx, { provider, model, imagePath, prompt, maxTokens, signal }) {
  let providerId = provider
  let modelId = model
  if (!providerId || !modelId) {
    const found = await findVisionModel(ctx)
    if (!found) throw new Error('DSH 未配置支持图片的模型；请在 DSH 模型设置里添加一个多模态模型（如 qwen3-vl-plus / glm-4v）')
    providerId = providerId || found.provider
    modelId = modelId || found.model
  }
  const bytes = await fs.readFile(imagePath)
  const mediaType = /\.png$/i.test(imagePath) ? 'image/png' : 'image/jpeg'
  const refs = await ctx.attachments.saveImages([{ data: bytes, mediaType, name: imagePath.split('/').pop() }])
  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      { type: 'image', attachment: refs[0] },
    ],
  }]
  const config = { provider: providerId, model: modelId }
  if (maxTokens !== undefined) config.maxTokens = maxTokens
  const prepared = await ctx.llm.prepareCall(config, signal)
  const stream = prepared.stream({
    provider: providerId,
    model: modelId,
    messages,
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    signal,
  })
  let text = ''
  let finish = null
  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') text += chunk.text
    else if (chunk.type === 'finish') finish = chunk.reason
  }
  if (finish && finish.kind !== 'stop') {
    throw new Error(`DSH vision finished with ${finish.kind}: ${finish.failure?.message ?? ''}`.trim())
  }
  return text
}
