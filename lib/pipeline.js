/** Processing pipeline: detect mode and transcribe. */
import path from 'node:path'
import { transcribe, cuesFromWords } from './ai.js'
import * as media from './media.js'
import { expandEnv } from './util.js'

const CUE_MAX_MS = 7000
/** 超过这段时长就切开转写，避免整段上传和轮询超时。 */
export const ASR_CHUNK_SEC = 10 * 60

/**
 * 把 [0, durationSec) 分成不超过 chunkSec 的片段。
 * silences 为 { start, end }（秒）。靠近切点的静音优先，避免把一句话切开。
 */
export function planAudioChunks(durationSec, silences = [], chunkSec = ASR_CHUNK_SEC) {
  const duration = Number(durationSec)
  if (!Number.isFinite(duration) || duration <= 0) return []
  if (duration <= chunkSec + 1) return [{ start: 0, end: duration }]
  const out = []
  let cursor = 0
  while (duration - cursor > chunkSec + 1) {
    const target = cursor + chunkSec
    const windowStart = target - 30
    let cut = target
    let best = null
    for (const s of silences) {
      const start = Number(s?.start)
      const end = Number(s?.end)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
      const overlapStart = Math.max(start, windowStart)
      const overlapEnd = Math.min(end, target)
      if (overlapEnd - overlapStart < 0.25) continue
      const span = end - start
      if (!best || span > best.span) best = { span, mid: (overlapStart + overlapEnd) / 2 }
    }
    if (best && best.mid > cursor + 30) cut = best.mid
    out.push({ start: cursor, end: cut })
    cursor = cut
  }
  out.push({ start: cursor, end: duration })
  return out
}

function clock(sec) {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const body = `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return h ? `${h}:${body}` : body
}

/** Detect the processing mode for a probed video. */
export function detectMode(info, sidecars) {
  const subs = media.streamsOf(info, 'subtitle')
  const textEmbedded = subs.some((s) => media.isTextSubtitleCodec(s.codec_name))
  const imageEmbedded = subs.some((s) => media.isImageSubtitleCodec(s.codec_name))
  if (sidecars.length > 0 || textEmbedded) return 'translate'
  if (imageEmbedded) return 'asr' // image-based subs need OCR; fall back to ASR
  return 'asr'
}

/** Transcribe audio to cues (ms timings) via the configured ASR endpoint. */
export async function transcribeToCues(studio, audioPath, durationSec, { sourceLang, signal }) {
  const cfg = studio.cfg.asr
  const explicit = sourceLang === undefined ? expandEnv(cfg.language ?? '') : sourceLang
  const language = explicit === 'auto' ? '' : expandEnv(explicit ?? '')
  const duration = await resolveDuration(studio, audioPath, durationSec, signal)
  if (duration > ASR_CHUNK_SEC + 1) return transcribeInChunks(studio, audioPath, duration, { language, signal })
  const { text, segments, words } = await transcribe(cfg, { file: audioPath, language, prompt: expandEnv(cfg.prompt ?? ''), signal })
  if (words && words.length > 0) return cuesFromWords(words)
  if (segments && segments.length > 0) {
    const cues = segments
      .map((s) => ({ start: Math.round((s.start ?? 0) * 1000), end: Math.round((s.end ?? 0) * 1000), text: (s.text ?? '').trim(), ...(Number.isInteger(s.speaker) ? { speaker: s.speaker } : {}) }))
      .filter((c) => c.text)
    if (cues.length > 0 && cues.every((c) => c.end - c.start <= CUE_MAX_MS)) return cues
  }
  if (!text && !(segments && segments.length)) return []
  // 没有词级时间戳，或句子长到不能当字幕：按静音把音频切开再逐片识别。
  return transcribeBySilenceSlices(studio, audioPath, duration, { language, signal })
}

async function resolveDuration(studio, audioPath, durationSec, signal) {
  const given = Number(durationSec)
  if (Number.isFinite(given) && given > 0) return given
  try {
    const info = await media.ffprobeJson(studio.cfg.ffprobePath, audioPath)
    if (signal?.aborted) throw new Error('aborted')
    return media.durationSeconds(info) ?? 0
  } catch (err) {
    if (signal?.aborted || err?.message === 'aborted') throw err
    return 0
  }
}

function cuesFromChunk(result, startSec, endSec) {
  const offset = startSec
  if (result.words?.length) {
    const shifted = result.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset }))
    return cuesFromWords(shifted)
  }
  if (result.segments?.length) {
    return result.segments
      .map((s) => ({
        start: Math.round(((s.start ?? 0) + offset) * 1000),
        end: Math.round(((s.end ?? 0) + offset) * 1000),
        text: (s.text ?? '').trim(),
        ...(Number.isInteger(s.speaker) ? { speaker: s.speaker } : {}),
      }))
      .filter((c) => c.text)
  }
  const text = String(result.text ?? '').trim()
  return text ? [{ start: Math.round(startSec * 1000), end: Math.round(endSec * 1000), text }] : []
}

/** 长音频按约 10 分钟切开转写，时间轴加回切点后拼成一条。 */
async function transcribeInChunks(studio, audioPath, durationSec, { language, signal }) {
  const cfg = studio.cfg.asr
  let silences = []
  try {
    silences = await media.detectSilence(studio.cfg.ffmpegPath, audioPath, { noise: -35, duration: 0.35, signal })
  } catch (err) {
    if (signal?.aborted) throw err
    silences = []
  }
  const chunks = planAudioChunks(durationSec, silences)
  const tmp = await studio.mkTemp()
  const cues = []
  for (let i = 0; i < chunks.length; i++) {
    const seg = chunks[i]
    if (seg.end - seg.start < 0.25) continue
    const chunk = path.join(tmp, `part-${i}.wav`)
    await media.extractAudioChunk(studio.cfg.ffmpegPath, audioPath, seg.start, seg.end, chunk, { signal })
    let result = null
    let lastErr = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = await transcribe(cfg, { file: chunk, language, signal })
        lastErr = null
        break
      } catch (err) {
        if (signal?.aborted) throw err
        lastErr = err
      }
    }
    if (lastErr) throw new Error(`第 ${i + 1}/${chunks.length} 段转写失败（${clock(seg.start)}–${clock(seg.end)}）：${lastErr.message || lastErr}`)
    cues.push(...cuesFromChunk(result, seg.start, seg.end))
  }
  return cues
}

/** 先静音切片、再逐片 ASR，让每个字幕的时间轴来自对应音频切片。 */
async function transcribeBySilenceSlices(studio, audioPath, durationSec, { language, signal }) {
  const cfg = studio.cfg.asr
  let segs = []
  try {
    // 自适应噪声底 VAD（带通 + 10 分位能量 + 6dB，最小静音 0.15s），抗全程 BGM。
    segs = await media.detectSpeechAdaptive(studio.cfg.ffmpegPath, audioPath, durationSec ?? 0, { signal })
  } catch { segs = [] }
  if (segs.length === 0) {
    const { text } = await transcribe(cfg, { file: audioPath, language, signal })
    const t = String(text ?? '').trim()
    return t ? [{ start: 0, end: Math.round((durationSec ?? 0) * 1000), text: t }] : []
  }
  const tmp = await studio.mkTemp()
  const cues = []
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]
    if ((seg.end - seg.start) < 0.25) continue
    const chunk = path.join(tmp, `chunk-${i}.wav`)
    try {
      await media.extractAudioChunk(studio.cfg.ffmpegPath, audioPath, seg.start, seg.end, chunk, { signal })
      const result = await transcribe(cfg, { file: chunk, language, signal })
      if (result.words?.length) {
        const offset = Math.round(seg.start * 1000)
        for (const cue of cuesFromWords(result.words)) {
          cues.push({ start: cue.start + offset, end: cue.end + offset, text: cue.text, ...(cue.speaker !== undefined ? { speaker: cue.speaker } : {}) })
        }
        continue
      }
      const t = String(result.text ?? '').trim()
      if (t) cues.push({ start: Math.round(seg.start * 1000), end: Math.round(seg.end * 1000), text: t })
    } catch { /* 某片识别失败跳过 */ }
  }
  return cues
}
