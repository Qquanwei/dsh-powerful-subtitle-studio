/** Processing pipeline: detect mode, transcribe, vision assist. */
import path from 'node:path'
import { transcribe, vision } from './ai.js'
import * as media from './media.js'
import { clamp, expandEnv, parseJson } from './util.js'

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
  const language = expandEnv(cfg.language ?? sourceLang ?? '')
  const { text, segments } = await transcribe(cfg, { file: audioPath, language, prompt: expandEnv(cfg.prompt ?? ''), signal })
  if (segments && segments.length > 0) {
    return segments
      .map((s) => ({ start: Math.round((s.start ?? 0) * 1000), end: Math.round((s.end ?? 0) * 1000), text: (s.text ?? '').trim() }))
      .filter((c) => c.text)
  }
  // 无分段时间戳（如 DashScope 实时接口）：先静音切片，再逐片识别，用音频切片时间定字幕时间。
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
      const { text } = await transcribe(cfg, { file: chunk, language, signal })
      const t = String(text ?? '').trim()
      if (t) cues.push({ start: Math.round(seg.start * 1000), end: Math.round(seg.end * 1000), text: t })
    } catch { /* 某片识别失败跳过 */ }
  }
  return cues
}

/** Frame-level vision assist: sample cues, describe frames, optionally refine translations. */
export async function visualAssist(studio, videoPath, cues, { signal }) {
  const cfg = studio.cfg.vision
  const maxFrames = clamp(cfg.maxFramesPerVideo ?? 12, 1, 200)
  const indices = sampleIndices(cues.length, maxFrames)
  const analyses = []
  const tmpDir = await studio.mkTemp()
  for (const idx of indices) {
    const cue = cues[idx]
    if (!cue || !cue.text) continue
    const t = cue.start / 1000 + 0.3
    const frame = path.join(tmpDir, `frame-${idx}.jpg`)
    await media.extractFrame(studio.cfg.ffmpegPath, videoPath, t, frame, { signal })
    const prompt = [
      'You are helping proofread anime subtitles. Analyze the attached frame.',
      `Auto-transcribed source line: ${JSON.stringify(cue.text)}`,
      `Draft ${studio.cfg.translate.targetLang} translation: ${JSON.stringify(cue.translation ?? '')}`,
      'Return a JSON object with: "speaker" (who is speaking, if visible), "onScreenText" (any readable text/signs/names in the frame), "transcriptionCorrection" (corrected source line if the transcription is wrong given the visuals, else empty string), "refinedTranslation" (improved translation using visual context, else empty string), "notes" (one short line).',
    ].join('\n')
    const raw = await vision(cfg, { imagePath: frame, prompt, json: true, maxTokens: cfg.maxTokens, signal, ctx: studio.ctx })
    const result = parseJson(raw)
    analyses.push({ index: idx, start: cue.start, frame, ...result })
    if (typeof result?.refinedTranslation === 'string' && result.refinedTranslation.trim()) {
      cue.translation = result.refinedTranslation.trim()
    }
  }
  return analyses
}

function sampleIndices(total, max) {
  if (total <= max) return Array.from({ length: total }, (_, i) => i)
  const out = []
  for (let i = 0; i < max; i++) out.push(Math.floor((i / max) * total))
  return out
}
