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
    const spoken = unwrapSpeakerText(textLines.join('\n').trim())
    cues.push({ start, end, text: spoken.text, ...(spoken.color ? { color: spoken.color } : {}) })
  }
  return cues
}

const SPEAKER_COLORS = ['#7dd3fc', '#fde68a', '#86efac', '#f9a8d4', '#fdba74', '#c4b5fd']

export function speakerColor(speaker, enabled) {
  if (!enabled) return ''
  const n = Number(speaker)
  if (!Number.isInteger(n) || n < 0) return ''
  return SPEAKER_COLORS[n % SPEAKER_COLORS.length]
}

function unwrapSpeakerText(text) {
  const color = /<font color="(#[0-9a-fA-F]{6})">/i.exec(text)?.[1] ?? ''
  return { text: String(text).replace(/<\/?font[^>]*>/gi, ''), color }
}

function paintSpeakerText(text, color) {
  if (!color) return text
  return String(text).split('\n').map((line) => `<font color="${color}">${line}</font>`).join('\n')
}

const TURN_SPLIT = /(?<=[？！?!。…])\s*(?:——|—{1,2}|–|―)+\s*/

/** 一句原文里用破折号接上另一个人时，拆成多句。 */
export function splitSourceTurns(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return []
  const parts = raw.split(TURN_SPLIT).map((part) => part.trim()).filter(Boolean)
  return parts.length > 1 ? parts : [raw]
}

function wordText(word) {
  return `${word?.text ?? ''}${word?.punctuation ?? ''}`.trim()
}

function cueWords(cue) {
  if (!Array.isArray(cue?.words)) return []
  return cue.words.filter((word) => Number.isFinite(Number(word?.start)) && Number.isFinite(Number(word?.end)) && wordText(word))
}

function groupWords(words, count) {
  const cuts = []
  for (let i = 0; i < words.length - 1; i++) {
    const piece = wordText(words[i])
    if (/[？！?!。…]/.test(piece) || /——|—/.test(piece)) cuts.push(i + 1)
  }
  const starts = cuts.length >= count - 1 ? [0, ...cuts.slice(0, count - 1)] : evenStarts(words, count)
  const bounds = [...starts, words.length]
  return bounds.slice(0, -1).map((start, index) => words.slice(start, bounds[index + 1])).filter((group) => group.length > 0)
}

function evenStarts(words, count) {
  const weights = words.map((word) => Math.max(1, wordText(word).replace(/\s/g, '').length))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const starts = [0]
  let covered = 0
  for (let i = 0; i < words.length && starts.length < count; i++) {
    covered += weights[i]
    const need = total * starts.length / count
    const left = words.length - (i + 1)
    if (covered >= need && left >= count - starts.length) starts.push(i + 1)
  }
  return starts
}

/** 把一条 cue 切成 count 段。优先用词级时间，没有词边界时在原 start/end 里按字数切。 */
export function sliceCue(cue, count) {
  const start = Number(cue.start)
  const end = Number(cue.end)
  const pieces = splitSourceTurns(cue.text)
  const words = cueWords(cue)
  if (words.length >= count) {
    const groups = groupWords(words, count)
    if (groups.length === count) {
      return groups.map((group, index) => ({
        start: Number(group[0].start),
        end: Number(group[group.length - 1].end),
        text: pieces.length === count ? pieces[index] : group.map(wordText).join(''),
        words: group,
      }))
    }
  }
  const weights = (pieces.length === count ? pieces : Array.from({ length: count }, () => 'x'))
    .map((piece) => Math.max(1, String(piece).replace(/\s/g, '').length))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const span = Math.max(0, end - start)
  let cursor = start
  return weights.map((weight, index) => {
    const next = index === weights.length - 1 ? end : Math.round(cursor + span * weight / total)
    const slice = {
      start: cursor,
      end: Math.max(next, cursor),
      text: pieces.length === count ? pieces[index] : '',
    }
    cursor = slice.end
    return slice
  })
}

/** 转写结果里已经把两个人写进同一条时，按词时间拆开。 */
export function expandMixedCue(cue) {
  const pieces = splitSourceTurns(cue?.text)
  if (pieces.length < 2) return [cue]
  const slices = sliceCue(cue, pieces.length)
  if (slices.length < 2) return [cue]
  return slices.map((slice) => ({
    ...cue,
    start: slice.start,
    end: slice.end,
    text: slice.text,
    ...(slice.words ? { words: slice.words } : {}),
  }))
}

function translationParts(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter((item) => item)
  const text = String(value ?? '').trim()
  return text ? [text] : []
}

/**
 * Pair translations with ASR cues by index. start/end are copied, never recomputed.
 * `texts[i]` is the translation for `cues[i]`, or an array when that one cue mixes two speakers.
 * Counts of the outer array must match. An inner array is split on this cue's word times.
 */
export function composeCues(cues, texts, { bilingual = false } = {}) {
  if (!Array.isArray(cues) || cues.length === 0) throw new Error('没有 ASR cues')
  if (!Array.isArray(texts) || texts.length !== cues.length) {
    throw new Error(`译文 ${Array.isArray(texts) ? texts.length : 0} 条，ASR cues ${cues.length} 条，条数必须一致`)
  }
  const out = []
  cues.forEach((cue, i) => {
    const start = Number(cue.start)
    const end = Number(cue.end)
    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error(`第 ${i} 条时间无效`)
    const parts = translationParts(texts[i])
    if (parts.length === 0) throw new Error(`第 ${i} 条译文为空`)
    if (Array.isArray(texts[i]) && parts.length !== texts[i].length) throw new Error(`第 ${i} 条拆开的译文不能有空行`)
    const slices = parts.length === 1 ? [{ start, end, text: String(cue.text ?? '').trim() }] : sliceCue(cue, parts.length)
    parts.forEach((translated, index) => {
      const slice = slices[index] ?? slices[slices.length - 1]
      const source = String(slice.text ?? '').trim()
      const text = bilingual && source ? `${source}\n${translated}` : translated
      const speaker = Number(cue.speaker)
      out.push({ start: slice.start, end: slice.end, text, ...(Number.isInteger(speaker) && speaker >= 0 ? { speaker } : {}) })
    })
  })
  return out
}

export function serializeSrt(cues) {
  const speakers = new Set((cues ?? []).map((cue) => cue.speaker).filter((speaker) => Number.isInteger(Number(speaker)) && Number(speaker) >= 0))
  const colored = speakers.size > 1
  const parts = []
  cues.forEach((cue, idx) => {
    parts.push(`${idx + 1}`)
    parts.push(`${msToSrt(cue.start)} --> ${msToSrt(cue.end)}`)
    parts.push(paintSpeakerText(String(cue.text ?? '').replace(/\r?\n/g, '\n'), speakerColor(cue.speaker, colored)))
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
