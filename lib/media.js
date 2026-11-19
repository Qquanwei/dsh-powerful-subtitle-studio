/** ffmpeg/ffprobe helpers: probing, audio/frame extraction, subtitle detection, rendering. */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { runOk } from './util.js'

export const VIDEO_EXT = new Set(['.mp4', '.mkv', '.mov', '.webm', '.avi', '.m4v', '.ts', '.flv', '.wmv'])
export const SUB_EXT = new Set(['.srt', '.ass', '.ssa', '.vtt'])

const TEXT_SUB_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text'])
const IMAGE_SUB_CODECS = new Set(['hdmv_pgs_subtitle', 'pgssub', 'dvd_subtitle', 'dvdsub', 'dvb_subtitle'])

export function isVideoFile(p) { return VIDEO_EXT.has(path.extname(p).toLowerCase()) }
export function isSubtitleFile(p) { return SUB_EXT.has(path.extname(p).toLowerCase()) }
export function isTextSubtitleCodec(codec) { return TEXT_SUB_CODECS.has(String(codec).toLowerCase()) }
export function isImageSubtitleCodec(codec) { return IMAGE_SUB_CODECS.has(String(codec).toLowerCase()) }

export async function ffprobeJson(ffprobePath, file) {
  const r = await runOk(ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { note: 'ffprobe' })
  return JSON.parse(r.stdout)
}

export function streamsOf(info, type) {
  return (info?.streams ?? []).filter((s) => s.codec_type === type)
}

export function durationSeconds(info) {
  const d = Number(info?.format?.duration)
  return Number.isFinite(d) ? d : null
}

/** Collect sidecar subtitle files next to a video, ordered by preference. */
export async function sidecarSubs(videoPath) {
  const dir = path.dirname(videoPath)
  const base = path.basename(videoPath, path.extname(videoPath))
  const found = []
  for (const ext of ['.srt', '.ass', '.ssa', '.vtt']) {
    const cand = path.join(dir, base + ext)
    try {
      const st = await fs.stat(cand)
      if (st.isFile()) found.push(cand)
    } catch { /* absent */ }
  }
  return found
}

export async function listFiles(inputPath, { signal } = {}) {
  const stat = await fs.stat(inputPath)
  if (stat.isFile()) return [inputPath]
  const out = []
  const stack = [inputPath]
  while (stack.length) {
    if (signal?.aborted) throw new Error('aborted')
    const dir = stack.pop()
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) stack.push(full)
      else if (e.isFile() && isVideoFile(full)) out.push(full)
    }
  }
  return out.sort()
}

/** Extract a mono 16 kHz WAV for ASR. Returns the temp path. */
export async function extractAudio(ffmpegPath, videoPath, outWav, { signal } = {}) {
  await runOk(ffmpegPath, ['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', outWav], { signal, note: 'ffmpeg extract audio' })
  return outWav
}

/** 从音频里切出 [startSec, endSec) 一段，用于逐片识别。 */
export async function extractAudioChunk(ffmpegPath, audioPath, startSec, endSec, outWav, { signal } = {}) {
  await runOk(ffmpegPath, ['-y', '-ss', String(startSec), '-to', String(endSec), '-i', audioPath, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', outWav], { signal, note: 'ffmpeg extract chunk' })
  return outWav
}

/** 用 ffmpeg silencedetect 找静音区间（秒），支持自定义噪声阈值、最短静音时长和带通滤波。 */
export async function detectSilence(ffmpegPath, audioPath, { noise = -35, duration = 0.4, bandpass = false, signal } = {}) {
  const filters = []
  if (bandpass) filters.push('highpass=f=300', 'lowpass=f=3400')
  filters.push(`silencedetect=noise=${noise}dB:d=${duration}`)
  const af = filters.join(',')
  const r = await runOk(ffmpegPath, ['-i', audioPath, '-af', af, '-f', 'null', '-'], { signal, note: 'ffmpeg silencedetect' })
  const silences = []
  const reStart = /silence_start:\s*([\d.]+)/
  const reEnd = /silence_end:\s*([\d.]+)/
  let cur = null
  for (const line of (r.stderr || '').split('\n')) {
    const s = reStart.exec(line)
    if (s) { cur = { start: parseFloat(s[1]) }; continue }
    const e = reEnd.exec(line)
    if (e && cur) { cur.end = parseFloat(e[1]); silences.push(cur); cur = null }
  }
  return silences
}

/** 自适应噪声底 VAD：带通（300–3400Hz）→ 逐帧 RMS → 10 分位能量 + 6dB 阈值 → silencedetect（最短静音 0.15s）→ 语音区间。 */
export async function detectSpeechAdaptive(ffmpegPath, audioPath, durationSec, { signal } = {}) {
  // 1. 带通滤波后逐帧能量（astats 每帧重置并打印 RMS 电平）
  const stats = await runOk(ffmpegPath, ['-i', audioPath, '-af', 'highpass=f=300,lowpass=f=3400,astats=metadata=1:reset=1', '-f', 'null', '-'], { signal, note: 'ffmpeg vad energy' })
  const energies = []
  const re = /RMS level dB:\s*(-?\d+(?:\.\d+)?)/
  for (const line of (stats.stderr || '').split('\n')) {
    const m = re.exec(line)
    if (m) energies.push(parseFloat(m[1]))
  }
  if (energies.length < 4) return []
  // 2. 10 分位能量作为噪声底，阈值 = 噪声底 + 6dB
  const sorted = [...energies].sort((a, b) => a - b)
  const noiseFloor = sorted[Math.floor(sorted.length * 0.1)]
  const threshold = noiseFloor + 6
  // 3. 用该阈值做 silencedetect（带通 + 最短静音 0.15s），反推语音区间
  const silences = await detectSilence(ffmpegPath, audioPath, { noise: threshold, duration: 0.15, bandpass: true, signal })
  return speechSegmentsFromSilences(silences, durationSec)
}

/** 由静音区间推导语音区间（秒）。 */
export function speechSegmentsFromSilences(silences, durationSec) {
  const segs = []
  let t = 0
  for (const s of silences) {
    if (s.start > t + 0.15) segs.push({ start: t, end: s.start })
    t = s.end ?? s.start
  }
  if (t < (durationSec ?? 0) - 0.15) segs.push({ start: t, end: durationSec ?? t })
  return segs
}

/** Extract one frame at `seconds`. Returns the temp image path. */
export async function extractFrame(ffmpegPath, videoPath, seconds, outImage, { signal } = {}) {
  await runOk(ffmpegPath, ['-y', '-ss', String(seconds), '-i', videoPath, '-frames:v', '1', '-q:v', '2', outImage], { signal, note: 'ffmpeg extract frame' })
  return outImage
}

/** Extract an embedded text subtitle stream to a temp .srt. Returns the path. */
export async function extractSubtitleStream(ffmpegPath, videoPath, streamIndex, outSrt, { signal } = {}) {
  await runOk(ffmpegPath, ['-y', '-i', videoPath, '-map', `0:s:${streamIndex}`, outSrt], { signal, note: 'ffmpeg extract subtitle' })
  return outSrt
}

function sanitizeFilterPath(p) {
  // Escape for the ffmpeg subtitles filter (colon and quote/single-quote).
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

/**
 * Render a subtitle next to a video:
 *  - mode 'srt': copy/export .srt sidecar
 *  - mode 'mkv-soft' / 'mp4-soft': mux subtitle stream (copy video/audio)
 *  - mode 'mp4-burn': hard-burn with the subtitles filter (re-encodes video)
 */
export async function renderSubtitle(ffmpegPath, videoPath, srtPath, mode, outPath, style, { signal } = {}) {
  if (mode === 'srt') {
    await fs.copyFile(srtPath, outPath)
    return outPath
  }
  if (mode === 'mkv-soft' || mode === 'mp4-soft') {
    const codec = mode === 'mkv-soft' ? 'srt' : 'mov_text'
    const args = ['-y', '-i', videoPath, '-i', srtPath, '-map', '0:v', '-map', '0:a?', '-map', '1:0', '-c:v', 'copy', '-c:a', 'copy', `-c:s`, codec]
    // mov_text needs metadata for some players; keep it minimal.
    await runOk(ffmpegPath, args.concat(outPath), { signal, note: 'ffmpeg mux subtitle' })
    return outPath
  }
  if (mode === 'mp4-burn') {
    const styleStr = style ?? 'FontName=Noto Sans CJK SC,FontSize=22'
    const vf = `subtitles='${sanitizeFilterPath(srtPath)}':force_style='${styleStr.replace(/'/g, "\\'")}'`
    await runOk(ffmpegPath, ['-y', '-i', videoPath, '-vf', vf, '-c:a', 'copy', outPath], { signal, note: 'ffmpeg burn subtitle' })
    return outPath
  }
  throw new Error(`unknown render mode "${mode}"`)
}
