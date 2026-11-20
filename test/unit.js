import assert from 'node:assert'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseBailianResult, cuesFromWords, ASR_MODEL } from '../lib/ai.js'
import { detectMode } from '../lib/pipeline.js'
import { composeCues, parseSubtitle, serializeSrt } from '../lib/srt.js'
import { composeSubtitle, createStudio, buildToolDefinitions, projectSubtitles, upsertProject, noteAsrCues, embedSubtitle } from '../lib/studio.js'
import { renderOutputPath, isOutsideDirectory } from '../lib/render.js'
import { expandEnv, expandHome, clamp, parseJson } from '../lib/util.js'
import { durationSeconds, isVideoFile, isTextSubtitleCodec, isImageSubtitleCodec } from '../lib/media.js'

const parsed = parseBailianResult({
  transcripts: [{
    sentences: [{
      begin_time: 13700,
      end_time: 18260,
      text: '跳起来吧。',
      words: [
        { begin_time: 13700, end_time: 15000, text: '跳', punctuation: '' },
        { begin_time: 15000, end_time: 18260, text: '起来吧', punctuation: '。' },
      ],
    }],
  }],
})
assert.strictEqual(parsed.words[0].start, 13.7)
assert.strictEqual(parsed.words[1].end, 18.26)
assert.strictEqual(parsed.segments[0].text, '跳起来吧。')
const fromAsr = cuesFromWords(parsed.words)
assert.strictEqual(fromAsr[0].start, 13700)
assert.strictEqual(fromAsr[0].end, 18260)
assert.strictEqual(fromAsr[0].text, '跳起来吧。')

const spoken = parseBailianResult({
  transcripts: [{
    sentences: [
      { begin_time: 1000, end_time: 1800, text: '你好。', speaker_id: 0, words: [{ begin_time: 1000, end_time: 1800, text: '你好', punctuation: '。' }] },
      { begin_time: 1800, end_time: 2600, text: '再见。', speaker_id: 1, words: [{ begin_time: 1800, end_time: 2600, text: '再见', punctuation: '。' }] },
    ],
  }],
})
const splitSpeakers = cuesFromWords(spoken.words)
assert.deepStrictEqual(splitSpeakers.map((c) => [c.text, c.speaker, c.start]), [['你好。', 0, 1000], ['再见。', 1, 1800]])
const painted = serializeSrt(splitSpeakers)
assert.ok(painted.includes('<font color="#7dd3fc">你好。</font>'))
assert.ok(painted.includes('<font color="#fde68a">再见。</font>'))
const roundTrip = parseSubtitle(painted)
assert.strictEqual(roundTrip[0].text, '你好。')
assert.strictEqual(roundTrip[0].color, '#7dd3fc')
assert.strictEqual(roundTrip[1].color, '#fde68a')
assert.ok(!serializeSrt([{ start: 0, end: 1000, text: '一个人', speaker: 0 }]).includes('<font'))
const glued = cuesFromWords([{ start: 1, end: 1.8, text: '什么？——没什么', punctuation: '。' }])
assert.deepStrictEqual(glued.map((cue) => [cue.text, cue.start, cue.end]), [['什么？', 1000, 1343], ['没什么。', 1343, 1800]])
const splitLine = composeCues([{
  start: 1000, end: 1800, text: '什么？——没什么。',
  words: [{ start: 1000, end: 1400, text: '什么？' }, { start: 1400, end: 1800, text: '——没什么。' }],
}], [['你来了？', '没什么。']])
assert.deepStrictEqual(splitLine.map((cue) => [cue.start, cue.end, cue.text]), [[1000, 1400, '你来了？'], [1400, 1800, '没什么。']])

const gapped = cuesFromWords([
  { start: 1, end: 1.2, text: '甲', punctuation: '' },
  { start: 1.7, end: 1.9, text: '乙', punctuation: '' },
])
assert.deepStrictEqual(gapped.map((c) => [c.start, c.end, c.text]), [[1000, 1200, '甲'], [1700, 1900, '乙']])

const overSeven = []
for (let i = 0; i < 16; i++) overSeven.push({ start: i * 0.5, end: i * 0.5 + 0.4, text: '啊', punctuation: '' })
assert.ok(cuesFromWords(overSeven).every((c) => c.end - c.start <= 7000))

assert.strictEqual(detectMode({ streams: [] }, []), 'asr')
assert.strictEqual(detectMode({ streams: [] }, ['/show/ep.srt']), 'translate')
assert.strictEqual(detectMode({ streams: [{ codec_type: 'subtitle', codec_name: 'ass' }] }, []), 'translate')
assert.strictEqual(detectMode({ streams: [{ codec_type: 'subtitle', codec_name: 'hdmv_pgs_subtitle' }] }, []), 'asr')
assert.strictEqual(isTextSubtitleCodec('mov_text'), true)
assert.strictEqual(isImageSubtitleCodec('pgssub'), true)
assert.strictEqual(isVideoFile('clip.MP4'), true)
assert.strictEqual(durationSeconds({ format: { duration: '12.5' } }), 12.5)
assert.strictEqual(durationSeconds({ format: {} }), null)

assert.strictEqual(expandEnv('key ${MISSING_PSS_VAR}'), 'key ')
process.env.PSS_UNIT_TOKEN = 'abc'
assert.strictEqual(expandEnv('${PSS_UNIT_TOKEN}'), 'abc')
delete process.env.PSS_UNIT_TOKEN
assert.strictEqual(expandHome('~'), os.homedir())
assert.strictEqual(clamp('nope', 1, 8), 1)
assert.strictEqual(clamp(99, 1, 8), 8)
assert.deepStrictEqual(parseJson('```json\n{"ok":true}\n```'), { ok: true })

assert.strictEqual(renderOutputPath('/tmp/alien.mp4', 'mkv-soft'), path.join('/tmp', 'alien.subbed.mkv'))
assert.strictEqual(renderOutputPath('/tmp/alien.mp4', 'mp4-burn'), path.join('/tmp', 'alien.subbed.mp4'))
assert.strictEqual(isOutsideDirectory('/work/anime', '/work/anime-extra/a.srt'), true)

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pss-unit-'))
await fs.writeFile(path.join(dir, 'config.json'), JSON.stringify({ asr: { model: 'sensevoice-v1', apiKey: 'sk-test' } }))
const { cfg } = createStudio({}, { workdir: dir })
assert.strictEqual(cfg.asr.model, ASR_MODEL)
assert.strictEqual(cfg.asr.apiKey, 'sk-test')

const defs = buildToolDefinitions({ studio: { cfg, ctx: {}, mkTemp: async () => dir }, cfg })
const renderTool = defs.find((d) => d.name === 'subtitle_render')
assert.ok(renderTool.parameters.properties.lang)
assert.ok(!renderTool.parameters.required.includes('output'))
const composeTool = defs.find((d) => d.name === 'subtitle_compose')
assert.ok(composeTool.parameters.properties.texts)
assert.ok(composeTool.parameters.properties.lines)

const video = path.join(dir, 'ep.mp4')
await fs.writeFile(video, 'video')
const cues = [
  { start: 1000, end: 2000, text: 'こんばんは' },
  { start: 3000, end: 4000, text: '店長' },
]
await assert.rejects(() => composeSubtitle(cfg, { video, cues, texts: ['只有一条'] }), /条数必须一致/)
const bilingual = await composeSubtitle(cfg, { project: 'show', video, cues, texts: ['晚上好', '老板娘'], bilingual: true })
assert.strictEqual((await composeCues(cues, ['晚上好', '老板娘'], { bilingual: true }))[0].text, 'こんばんは\n晚上好')
const patched = await composeSubtitle(cfg, { project: 'show', video, lines: { 0: '晚安' } })
const written = (await fs.readFile(patched.srt, 'utf8'))
assert.ok(written.includes('こんばんは\n晚安'))
assert.strictEqual(bilingual.cues, 2)

await upsertProject(cfg, { id: 'show', name: 'show', videos: [video] })
await fs.writeFile(path.join(dir, 'ep.srt'), '1\n00:00:01,000 --> 00:00:02,000\n原文\n')
await fs.writeFile(path.join(dir, 'ep.zh-CN.srt'), '1\n00:00:01,200 --> 00:00:02,200\n译文\n')
const loaded = await projectSubtitles(cfg, { video })
assert.strictEqual(loaded.cues[0].text, '译文')
assert.strictEqual(loaded.cues[0].start, 1200)

await noteAsrCues(cfg, 'show', [
  { start: 1000, end: 2000, speaker: 0 },
  { start: 3000, end: 4000, speaker: 1 },
])
const colored = await composeSubtitle(cfg, {
  project: 'show',
  video,
  cues: [
    { start: 1000, end: 2000, text: '你好' },
    { start: 3000, end: 4000, text: '再见' },
  ],
  texts: ['甲', '乙'],
  bilingual: false,
})
const coloredSrt = await fs.readFile(colored.srt, 'utf8')
assert.ok(coloredSrt.includes('<font color="#7dd3fc">甲</font>'))
assert.ok(coloredSrt.includes('<font color="#fde68a">乙</font>'))
const shown = parseSubtitle(coloredSrt)
assert.strictEqual(shown[0].color, '#7dd3fc')
assert.strictEqual(shown[1].text, '乙')

const bare = path.join(dir, 'bare.mp4')
await fs.writeFile(bare, 'video')
await upsertProject(cfg, { id: 'show', videos: [video, bare] })
await assert.rejects(() => embedSubtitle(cfg, { video: bare }), /还没有字幕/)

await fs.rm(dir, { recursive: true, force: true })
console.log('ALL UNIT TESTS PASSED')
