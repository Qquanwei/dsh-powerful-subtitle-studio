/** powerful-subtitle-studio — Host entry: tools, commands, and HTTP routes for client-direct calls. */
import { createStudio, buildToolDefinitions, preflight, preprocessForStudio, listProjects, upsertProject, loadUserConfig, saveUserConfig, maskKey } from './lib/studio.js'
import { expandEnv, expandHome } from './lib/util.js'

export const inject = ['tools', 'llm', 'commands', 'connection']

const jsonRes = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

async function listDshModels(ctx) {
  const providers = []
  for (const p of ctx.llm.listProviders()) {
    let models = []
    try { models = (await ctx.llm.listModels(p.id)) ?? [] } catch { models = [] }
    providers.push({ provider: p.id, name: p.name, models: models.map((m) => ({ id: m.id, name: m.name ?? m.id, vision: (m.inputModalities ?? []).includes('image') })) })
  }
  return { providers }
}

function applyConfig(cfg, opts) {
  const workdir = expandHome(expandEnv(cfg.workdir))
  const current = loadUserConfig(workdir)
  const next = { ...current }
  const put = (s, o) => { next[s] = { ...(next[s] ?? {}), ...o } }
  if (opts.asrApiKey !== undefined) put('asr', { apiKey: opts.asrApiKey })
  if (opts.visionApiKey !== undefined) put('vision', { apiKey: opts.visionApiKey })
  if (opts.asrModel !== undefined) put('asr', { model: opts.asrModel })
  if (opts.visionModel !== undefined) put('vision', { dshModel: opts.visionModel })
  if (opts.asrBaseUrl !== undefined) put('asr', { baseUrl: opts.asrBaseUrl })
  if (opts.visionBaseUrl !== undefined) put('vision', { baseUrl: opts.visionBaseUrl })
  if (opts.visionProvider !== undefined) put('vision', { provider: 'dsh', dshProvider: opts.visionProvider })
  saveUserConfig(workdir, next)
  Object.assign(cfg.asr, next.asr ?? {})
  Object.assign(cfg.vision, next.vision ?? {})
  return { saved: true, asr: { ...cfg.asr, apiKey: maskKey(cfg.asr.apiKey) }, vision: { ...cfg.vision, apiKey: maskKey(cfg.vision.apiKey) } }
}

export function apply(ctx, config) {
  const { studio, cfg, ensureProject, recordRun } = createStudio(ctx, config ?? {})
  const defs = buildToolDefinitions({ studio, cfg, ensureProject, recordRun })
  const disposers = []
  for (const def of defs) {
    disposers.push(ctx.tools.register(def))
  }

  // HTTP 接口（传统接口调用，面板直连，不经 agent）
  try {
    ctx.effect(() => {
      const d1 = ctx.connection.fetch.register({ path: '/api/subtitle/models', methods: ['GET'], fetch: async () => jsonRes(await listDshModels(ctx)) })
      const d2 = ctx.connection.fetch.register({ path: '/api/subtitle/check', methods: ['GET'], fetch: async () => jsonRes(await preflight(studio)) })
      const d3 = ctx.connection.fetch.register({ path: '/api/subtitle/config', methods: ['POST'], requestBody: 'buffered', fetch: async (request) => {
        let opts = {}
        try { opts = JSON.parse((await request.text()) || '{}') } catch { /* ignore */ }
        return jsonRes(applyConfig(cfg, opts))
      } })
      const d4 = ctx.connection.fetch.register({ path: '/api/subtitle/preprocess', methods: ['POST'], requestBody: 'buffered', fetch: async (request) => {
        let opts = {}
        try { opts = JSON.parse((await request.text()) || '{}') } catch { /* ignore */ }
        const paths = Array.isArray(opts.paths) ? opts.paths : []
        return jsonRes(await preprocessForStudio(studio, cfg, paths))
      } })
      const d5 = ctx.connection.fetch.register({ path: '/api/subtitle/projects', methods: ['GET'], fetch: async () => jsonRes(await listProjects(cfg)) })
      const d6 = ctx.connection.fetch.register({ path: '/api/subtitle/project', methods: ['POST'], requestBody: 'buffered', fetch: async (request) => {
        let opts = {}
        try { opts = JSON.parse((await request.text()) || '{}') } catch { /* ignore */ }
        return jsonRes(await upsertProject(cfg, opts))
      } })
      return () => { d1(); d2(); d3(); d4(); d5(); d6() }
    }, 'subtitle: http routes')
  } catch { /* HTTP 路由注册失败不影响工具 */ }

  // 命令（agent 兜底）
  try {
    ctx.commands.register({
      name: 'subtitle-list-models',
      description: 'List DSH models with vision capability',
      handler: async () => ({ kind: 'success', text: JSON.stringify(await listDshModels(ctx)) }),
    })
    ctx.commands.register({
      name: 'subtitle-check',
      description: 'Run subtitle config preflight',
      handler: async () => ({ kind: 'success', text: JSON.stringify(await preflight(studio)) }),
    })
    ctx.commands.register({
      name: 'subtitle-save-config',
      description: 'Save subtitle config from JSON args',
      handler: async (inv) => {
        let opts = {}
        try { opts = JSON.parse((inv.rawInput || '').trim() || '{}') } catch { /* ignore */ }
        return { kind: 'success', text: JSON.stringify(applyConfig(cfg, opts)) }
      },
    })
  } catch { /* 命令注册失败不影响工具 */ }

  return () => { for (const d of disposers) d() }
}
