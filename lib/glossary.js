/** Project glossary: the cross-video terminology consistency mechanism. */
import { promises as fs } from 'node:fs'
import path from 'node:path'

export function emptyGlossary(name = '') {
  return { name, terms: [] }
}

export async function loadGlossary(file) {
  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.terms)) return { name: parsed?.name ?? '', terms: [] }
    return parsed
  } catch (err) {
    if (err.code === 'ENOENT') return emptyGlossary()
    throw err
  }
}

export async function saveGlossary(file, glossary) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(glossary, null, 2) + '\n', 'utf8')
}

/** Normalize a term: lowercase id, required source + target, optional note/scope. */
function normalizeTerm(term) {
  if (!term || typeof term.source !== 'string' || typeof term.target !== 'string') return null
  if (!term.source.trim() || !term.target.trim()) return null
  return {
    source: term.source.trim(),
    target: term.target.trim(),
    ...(term.note ? { note: String(term.note).trim() } : {}),
    ...(term.scope ? { scope: String(term.scope).trim() } : {}),
  }
}

/** Upsert or add terms by (source, target, scope) identity. */
export function applyTerms(glossary, incoming) {
  const terms = [...glossary.terms]
  for (const raw of incoming) {
    const t = normalizeTerm(raw)
    if (!t) continue
    const key = `${t.source}\u0000${t.target}\u0000${t.scope ?? ''}`
    const idx = terms.findIndex((x) => `${x.source}\u0000${x.target}\u0000${x.scope ?? ''}` === key)
    if (idx >= 0) terms[idx] = t
    else terms.push(t)
  }
  return { ...glossary, terms }
}

/** Remove terms whose source matches any of the given sources. */
export function removeTerms(glossary, sources) {
  const set = new Set(sources.map((s) => String(s).trim()))
  return { ...glossary, terms: glossary.terms.filter((t) => !set.has(t.source)) }
}

/** Render a glossary as the "must use these exact translations" prompt fragment. */
export function glossaryPrompt(terms, sourceLang = '', targetLang = '') {
  if (!terms || terms.length === 0) return ''
  const applicable = terms.filter((t) => !t.scope || t.scope === '' || t.scope === `${sourceLang}->${targetLang}` || t.scope === targetLang)
  if (applicable.length === 0) return ''
  const lines = applicable
    .map((t) => `- ${t.source} -> ${t.target}${t.note ? `（${t.note}）` : ''}`)
    .join('\n')
  return `\n\n术语表（必须严格使用以下统一译名，保证所有视频中人物与专有名词一致）：\n${lines}`
}
