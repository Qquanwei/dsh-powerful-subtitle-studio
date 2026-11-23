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

/** 这些文件共同的父目录。会话工作区用它，字幕写在视频旁边就不会落到工作区外。 */
export function commonParentDirectory(paths) {
  const dirs = []
  for (const raw of paths ?? []) {
    const text = String(raw ?? '')
    const idx = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'))
    if (idx > 0) dirs.push(text.slice(0, idx))
    else if (idx === 0) dirs.push(text.slice(0, 1))
  }
  if (!dirs.length) return ''
  const sep = dirs[0].includes('\\') && !dirs[0].includes('/') ? '\\' : '/'
  let parts = dirs[0].split(/[/\\]/)
  for (const dir of dirs.slice(1)) {
    const next = dir.split(/[/\\]/)
    let i = 0
    const limit = Math.min(parts.length, next.length)
    while (i < limit && parts[i].toLowerCase() === next[i].toLowerCase()) i++
    parts = parts.slice(0, i)
  }
  if (sep === '/') {
    const body = parts.filter(Boolean).join('/')
    return body ? `/${body}` : '/'
  }
  return parts.join('\\')
}

export async function render(ffmpegPath, videoPath, srtPath, mode, outPath, style, { signal } = {}) {
  return renderSubtitle(ffmpegPath, videoPath, srtPath, mode, outPath, style, { signal })
}
