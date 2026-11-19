/** Render helpers: output path naming and dispatch to media.renderSubtitle. */
import path from 'node:path'
import { renderSubtitle } from './media.js'

export function renderOutputPath(videoPath, mode) {
  const dir = path.dirname(videoPath)
  const stem = path.basename(videoPath, path.extname(videoPath))
  if (mode === 'srt') return path.join(dir, `${stem}.rendered.srt`)
  const ext = mode === 'mkv-soft' ? '.mkv' : '.mp4'
  return path.join(dir, `${stem}.subbed${ext}`)
}

export async function render(ffmpegPath, videoPath, srtPath, mode, outPath, style, { signal } = {}) {
  return renderSubtitle(ffmpegPath, videoPath, srtPath, mode, outPath, style, { signal })
}
