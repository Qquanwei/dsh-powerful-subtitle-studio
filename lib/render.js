/** Render helpers: output path naming and dispatch to media.renderSubtitle. */
import path from 'node:path'
import { renderSubtitle } from './media.js'

export function subtitleLang(lang) {
  const text = String(lang ?? '').trim()
  if (!text) return ''
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(text)) throw new Error(`语言标记无效: ${lang}`)
  return text
}

export function renderOutputPath(videoPath, mode, { lang } = {}) {
  const dir = path.dirname(videoPath)
  const stem = path.basename(videoPath, path.extname(videoPath))
  if (mode === 'srt') {
    const tag = subtitleLang(lang)
    return path.join(dir, tag ? `${stem}.${tag}.srt` : `${stem}.srt`)
  }
  const ext = mode === 'mkv-soft' ? '.mkv' : '.mp4'
  return path.join(dir, `${stem}.subbed${ext}`)
}

/** True when `file` is not the directory `root` and not inside it. */
export function isOutsideDirectory(root, file) {
  if (!root) return false
  const base = path.resolve(root)
  const target = path.resolve(file)
  return target !== base && !target.startsWith(base + path.sep)
}

export async function render(ffmpegPath, videoPath, srtPath, mode, outPath, style, { signal } = {}) {
  return renderSubtitle(ffmpegPath, videoPath, srtPath, mode, outPath, style, { signal })
}
