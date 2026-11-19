import assert from 'node:assert'
import { parseSubtitle, serializeSrt, msToSrt } from '../lib/srt.js'
import { emptyGlossary, applyTerms, removeTerms, glossaryPrompt } from '../lib/glossary.js'
import { createStudio, buildToolDefinitions } from '../lib/studio.js'

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

// --- glossary ---
let g = emptyGlossary('t')
g = applyTerms(g, [{ source: '黒鉄', target: '黑铁', note: '角色名' }])
assert.strictEqual(g.terms.length, 1)
g = applyTerms(g, [{ source: '黒鉄', target: '黑铁', note: 'updated' }])
assert.strictEqual(g.terms.length, 1)
assert.strictEqual(g.terms[0].note, 'updated')
assert.ok(glossaryPrompt(g.terms, 'ja', 'zh-CN').includes('黑铁'))
g = removeTerms(g, ['黒鉄'])
assert.strictEqual(g.terms.length, 0)
assert.strictEqual(glossaryPrompt([], 'ja', 'zh-CN'), '')

// --- tool definitions shape ---
const { studio, cfg } = createStudio({}, {})
const defs = buildToolDefinitions({ studio, cfg, ensureProject: async () => ({}), recordRun: async () => {} })
assert.ok(defs.length >= 7)
const names = defs.map((d) => d.name)
for (const n of ['subtitle_project_init', 'subtitle_glossary', 'subtitle_scan', 'subtitle_preprocess', 'subtitle_transcribe', 'subtitle_visual_check', 'subtitle_render', 'subtitle_status', 'subtitle_check', 'subtitle_config', 'subtitle_models']) {
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

console.log('ALL SMOKE TESTS PASSED')
