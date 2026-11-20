/** Tolerant SRT / WebVTT parsing and SRT/VTT serialization. All times are integer milliseconds. */

/** Parse `HH:MM:SS,mmm` / `HH:MM:SS.mmm` / `MM:SS.mmm` into milliseconds, or null. */
export function parseTimecode(tc) {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/.exec(String(tc).trim())
  if (!m) return null
  const h = m[1] ? parseInt(m[1], 10) : 0
  const mm = parseInt(m[2], 10)
  const ss = parseInt(m[3], 10)
  const frac = parseInt((m[4] + '000').slice(0, 3), 10)
  return (h * 3600 + mm * 60 + ss) * 1000 + frac
}

export function msToSrt(ms) {
  const total = Math.max(0, Math.round(ms))
  const h = Math.floor(total / 3600000)
  const m = Math.floor((total % 3600000) / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const f = total % 1000
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(f, 3)}`
}

export function msToVtt(ms) {
  return msToSrt(ms).replace(',', '.')
}

/**
 * Parse SRT or WebVTT text into `[{ start, end, text }]` (ms). Tolerant of
 * missing sequence numbers, missing blank separators, CRLF, and a UTF BOM.
 */
export function parseSubtitle(text) {
  const clean = String(text).replace(/^\uFEFF/, '')
  const isVtt = /^WEBVTT/m.test(clean)
  const lines = clean.split(/\r?\n/)
  const cues = []
  let i = 0
  if (isVtt) {
    while (i < lines.length && !lines[i].includes('-->')) i++
  }
  for (; i < lines.length; i++) {
    const line = lines[i]
    const arrow = line.indexOf('-->')
    if (arrow === -1) continue
    const left = line.slice(0, arrow).trim()
    const rightRaw = line.slice(arrow + 3).trim()
    const right = rightRaw.split(/\s+/)[0] ?? ''
    const start = parseTimecode(left)
    const end = parseTimecode(right)
    if (start === null || end === null) continue
    const textLines = []
    let j = i + 1
    while (j < lines.length && lines[j].trim() !== '' && !lines[j].includes('-->')) {
      textLines.push(lines[j])
      j++
    }
    i = j - 1
    cues.push({ start, end, text: textLines.join('\n').trim() })
  }
  return cues
}

/**
 * Pair translations with ASR cues by index. start/end are copied, never recomputed.
 * `texts[i]` is the translation for `cues[i]`. Counts must match and no line may be empty.
 */
export function composeCues(cues, texts, { bilingual = false } = {}) {
  if (!Array.isArray(cues) || cues.length === 0) throw new Error('没有 ASR cues')
  if (!Array.isArray(texts) || texts.length !== cues.length) {
    throw new Error(`译文 ${Array.isArray(texts) ? texts.length : 0} 条，ASR cues ${cues.length} 条，条数必须一致`)
  }
  return cues.map((cue, i) => {
    const start = Number(cue.start)
    const end = Number(cue.end)
    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error(`第 ${i} 条时间无效`)
    const translated = String(texts[i] ?? '').trim()
    if (!translated) throw new Error(`第 ${i} 条译文为空`)
    const source = String(cue.text ?? '').trim()
    const text = bilingual && source ? `${source}\n${translated}` : translated
    return { start, end, text }
  })
}

export function serializeSrt(cues) {
  const parts = []
  cues.forEach((cue, idx) => {
    parts.push(`${idx + 1}`)
    parts.push(`${msToSrt(cue.start)} --> ${msToSrt(cue.end)}`)
    parts.push(String(cue.text ?? '').replace(/\r?\n/g, '\n'))
    parts.push('')
  })
  return parts.join('\n')
}

export function serializeVtt(cues) {
  const parts = ['WEBVTT', '']
  cues.forEach((cue) => {
    parts.push(`${msToVtt(cue.start)} --> ${msToVtt(cue.end)}`)
    parts.push(String(cue.text ?? '').replace(/\r?\n/g, '\n'))
    parts.push('')
  })
  return parts.join('\n')
}
