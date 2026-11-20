import assert from 'node:assert'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseSubtitle, serializeSrt, msToSrt } from '../lib/srt.js'
import { cuesFromWords } from '../lib/ai.js'
import { createStudio, buildToolDefinitions, upsertProject, listProjects, deleteProject, projectSubtitles, projectVideoFile } from '../lib/studio.js'
import { binaryAsset, NPM_REGISTRY, BINARY_MIRROR } from '../lib/binaries.js'

// --- SRT / VTT parsing & serialization ---
const srt = '1\n00:00:01,000 --> 00:00:03,500\nHello world\n\n2\n00:00:04,000 --> 00:00:05,000\nSecond line\n'
const cues = parseSubtitle(srt)
assert.strictEqual(cues.length, 2)
assert.strictEqual(cues[0].start, 1000)
assert.strictEqual(cues[0].end, 3500)
assert.strictEqual(cues[0].text, 'Hello world')
assert.ok(serializeSrt(cues).includes('00:00:01,000 --> 00:00:03,500'))
assert.strictEqual(msToSrt(3723000), '01:02:03,000')

const vtt = 'WEBVTT\n\n00:01.000 --> 00:03.500\nHi\n'
const vcues = parseSubtitle(vtt)
assert.strictEqual(vcues.length, 1)
assert.strictEqual(vcues[0].start, 1000)

// tolerant: missing blank separators + BOM
const messy = '\uFEFF1\n00:00:01,000 --> 00:00:02,000\nA\n2\n00:00:03,000 --> 00:00:04,000\nB\n'
assert.strictEqual(parseSubtitle(messy).length, 2)

const wordCues = cuesFromWords([
  { start: 0, end: 0.3, text: '你', punctuation: '' },
  { start: 0.3, end: 0.6, text: '好', punctuation: '，' },
  { start: 0.7, end: 1.1, text: '世界', punctuation: '。' },
  { start: 2.0, end: 2.4, text: '再见', punctuation: '。' },
  { start: 3.0, end: 3.4, text: 'Hello', punctuation: '' },
  { start: 3.5, end: 3.9, text: 'there', punctuation: '.' },
])
assert.deepStrictEqual(wordCues.map((c) => c.text), ['你好，世界。', '再见。', 'Hello there.'])
assert.strictEqual(wordCues[1].start, 2000)
assert.strictEqual(wordCues[1].end, 2400)
const longRun = []
for (let i = 0; i < 20; i++) longRun.push({ start: i * 0.5, end: i * 0.5 + 0.4, text: '词', punctuation: '' })
const splitRun = cuesFromWords(longRun)
assert.ok(splitRun.length > 1)
assert.ok(splitRun.every((c) => c.end - c.start <= 7000))
assert.ok(splitRun.every((c) => c.text.length <= 40))

// --- tool definitions shape ---
const { studio, cfg } = createStudio({}, {})
const defs = buildToolDefinitions({ studio, cfg })
assert.strictEqual(defs.length, 3)
const names = defs.map((d) => d.name)
for (const n of ['subtitle_transcribe', 'subtitle_frames', 'subtitle_render']) {
  assert.ok(names.includes(n), `missing tool ${n}`)
}
for (const d of defs) {
  assert.strictEqual(typeof d.name, 'string')
  assert.strictEqual(typeof d.description, 'string')
  assert.ok(d.parameters && typeof d.parameters === 'object' && d.parameters.type === 'object', `${d.name} parameters`)
  assert.ok(d.output && d.output.schema && typeof d.output.schema === 'object', `${d.name} output.schema`)
  assert.strictEqual(typeof d.output.render, 'function', `${d.name} render`)
  assert.strictEqual(typeof d.execute, 'function', `${d.name} execute`)
  const blocks = d.output.render({}, {})
  assert.ok(Array.isArray(blocks) && blocks[0]?.type === 'text', `${d.name} render shape`)
}

// schema subset sanity: every output schema node uses only supported keywords.
// Note: the keys of a `properties` map are property names, not keywords, so they
// are exempt from the keyword check; their values are walked as schema nodes.
const ALLOWED = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'description', 'title', 'default', 'examples'])
function checkSchema(node, path) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach((n, i) => checkSchema(n, `${path}[${i}]`)); return }
  for (const key of Object.keys(node)) {
    assert.ok(ALLOWED.has(key), `unsupported keyword "${key}" at ${path}`)
    const val = node[key]
    if (key === 'properties') {
      for (const [propName, schema] of Object.entries(val)) checkSchema(schema, `${path}.properties.${propName}`)
    } else {
      checkSchema(val, `${path}.${key}`)
    }
  }
}
for (const d of defs) checkSchema(d.output.schema, d.name)

assert.strictEqual(binaryAsset('ffmpeg', 'darwin', 'arm64'), 'ffmpeg-darwin-arm64.gz')
assert.strictEqual(binaryAsset('ffprobe', 'win32', 'x64'), 'ffprobe-win32-x64.gz')
assert.strictEqual(NPM_REGISTRY, 'https://registry.npmmirror.com')
assert.strictEqual(BINARY_MIRROR, 'https://cdn.npmmirror.com/binaries/ffmpeg-static')
assert.strictEqual(cfg.ffmpegPath, 'ffmpeg')
assert.strictEqual(cfg.ffprobePath, 'ffprobe')

const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'pss-del-'))
const marker = path.join(workdir, 'keep.txt')
await fs.writeFile(marker, 'keep')
const local = { workdir }
await upsertProject(local, { id: '隐私测试', name: '隐私测试', videos: ['/secret/a.mp4'] })
assert.strictEqual((await listProjects(local)).projects.length, 1)
assert.strictEqual((await deleteProject(local, { id: '隐私测试' })).deleted, '隐私测试')
assert.strictEqual((await listProjects(local)).projects.length, 0)
await assert.rejects(() => deleteProject(local, { id: '' }))
await assert.rejects(() => deleteProject(local, { id: '../../keep.txt' }))
assert.strictEqual(await fs.readFile(marker, 'utf8'), 'keep')
await fs.rm(workdir, { recursive: true, force: true })

const mediaDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pss-media-'))
const showDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pss-show-'))
const video = path.join(mediaDir, 'ep.mp4')
const other = path.join(mediaDir, 'other.mp4')
await fs.writeFile(video, 'video')
await fs.writeFile(other, 'video')
await fs.writeFile(path.join(mediaDir, 'ep.srt'), '1\n00:00:01,000 --> 00:00:02,000\n原文\n')
await fs.writeFile(path.join(mediaDir, 'ep.rendered.srt'), '1\n00:00:01,000 --> 00:00:02,500\n译文\n')
const show = { workdir: showDir }
await upsertProject(show, { id: 'show', name: 'show', videos: [video] })
const loaded = await projectSubtitles(show, { video })
assert.strictEqual(loaded.cues.length, 1)
assert.strictEqual(loaded.cues[0].text, '译文')
assert.strictEqual(loaded.cues[0].end, 2500)
await assert.rejects(() => projectVideoFile(show, other))
await assert.rejects(() => projectSubtitles(show, { video: path.join(mediaDir, 'ep.rendered.srt') }))
await fs.rm(mediaDir, { recursive: true, force: true })
await fs.rm(showDir, { recursive: true, force: true })

console.log('ALL SMOKE TESTS PASSED')
