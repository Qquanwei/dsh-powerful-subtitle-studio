import assert from 'node:assert'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseBailianResult, cuesFromWords, ASR_MODEL } from '../lib/ai.js'
import { detectMode } from '../lib/pipeline.js'
import { composeCues } from '../lib/srt.js'
import { composeSubtitle, createStudio, buildToolDefinitions, projectSubtitles, upsertProject } from '../lib/studio.js'
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

await fs.rm(dir, { recursive: true, force: true })
console.log('ALL UNIT TESTS PASSED')
