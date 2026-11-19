/** Shared helpers: env expansion, path resolution, subprocess execution, JSON parsing. */
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

/** Expand `${VAR}` references in a string using process.env. Non-strings pass through. */
export function expandEnv(value) {
  if (typeof value !== 'string') return value
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => process.env[name] ?? '')
}

/** Expand a leading `~` to the user home directory. */
export function expandHome(p) {
  if (typeof p !== 'string') return p
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

/**
 * Run a command and collect stdout/stderr. Resolves (never rejects on non-zero
 * exit) with `{ code, stdout, stderr }`; rejects only when the process cannot
 * spawn. Honors `signal` for cooperative cancellation.
 */
export function run(cmd, args, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    const onAbort = () => { child.kill('SIGKILL') }
    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
    child.on('error', (err) => {
      if (signal) signal.removeEventListener('abort', onAbort)
      reject(err)
    })
    child.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve({ code: code ?? 0, stdout, stderr })
    })
  })
}

/** Like `run`, but throws when the command exits non-zero. */
export async function runOk(cmd, args, { signal, note } = {}) {
  const r = await run(cmd, args, { signal })
  if (r.code !== 0) {
    const label = note ?? cmd
    throw new Error(`${label} failed (exit ${r.code}): ${(r.stderr || '').slice(-2000)}`)
  }
  return r
}

/** Parse JSON defensively: first as-is, then from the first fenced block. */
export function parseJson(text) {
  if (typeof text !== 'string') return text
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) } catch { /* fall through */ }
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed)
  if (fence) {
    try { return JSON.parse(fence[1].trim()) } catch { /* fall through */ }
  }
  // Last resort: isolate the outermost balanced object/array.
  const start = trimmed.search(/[[{]/)
  if (start >= 0) {
    const slice = trimmed.slice(start)
    try { return JSON.parse(slice) } catch { /* fall through */ }
  }
  throw new Error('could not parse JSON from model response')
}

/** Clamp a number to a safe finite range. */
export function clamp(n, min, max) {
  const v = Number(n)
  if (!Number.isFinite(v)) return min
  return Math.min(max, Math.max(min, v))
}
