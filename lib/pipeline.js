/** Processing pipeline: detect mode and transcribe. */
import path from 'node:path'
import { transcribe, cuesFromWords } from './ai.js'
import * as media from './media.js'
import { expandEnv } from './util.js'

const CUE_MAX_MS = 7000

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
  return transcribeBySilenceSlices(studio, audioPath, durationSec, { language, signal })
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
