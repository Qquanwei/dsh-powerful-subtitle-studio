/** Host-side Remote service: the panel calls these directly, without routing through the agent. */
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import * as media from './media.js'
import { detectMode } from './pipeline.js'
import { expandEnv, expandHome } from './util.js'
import { loadUserConfig, saveUserConfig, maskKey, preflight } from './studio.js'

const REMOTE_METHODS = ['saveConfig', 'check', 'preprocess', 'listModels']

/** 手工施加 Remote 标记（纯 JS 等价于 @Remote 装饰器）。 */
function decorateRemote(cls) {
  const inits = []
  for (const name of REMOTE_METHODS) {
    Remote(cls.prototype[name], {
      kind: 'method', name, static: false, private: false,
      addInitializer: (fn) => inits.push(fn),
    })
  }
  const dummy = Object.create(cls.prototype)
  for (const fn of inits) fn.call(dummy)
}

export function createSubtitleService(ctx, studio, cfg) {
  class SubtitleStudioService extends TypertRemoteService {
    constructor() {
      super(ctx, 'subtitleStudio', { namespace: 'subtitleStudio' })
    }

    async saveConfig(opts = {}) {
      const workdir = expandHome(expandEnv(cfg.workdir))
      const current = loadUserConfig(workdir)
      const next = { ...current }
      const put = (section, obj) => { next[section] = { ...(next[section] ?? {}), ...obj } }
      if (opts.asrApiKey !== undefined) put('asr', { apiKey: opts.asrApiKey })
      if (opts.visionApiKey !== undefined) put('vision', { apiKey: opts.visionApiKey })
      if (opts.asrModel !== undefined) put('asr', { model: opts.asrModel })
      if (opts.visionModel !== undefined) put('vision', { model: opts.visionModel })
      if (opts.asrBaseUrl !== undefined) put('asr', { baseUrl: opts.asrBaseUrl })
      if (opts.visionBaseUrl !== undefined) put('vision', { baseUrl: opts.visionBaseUrl })
      if (opts.visionProvider !== undefined) put('vision', { provider: 'dsh', dshProvider: opts.visionProvider })
      if (opts.visionModel !== undefined) put('vision', { dshModel: opts.visionModel })
      saveUserConfig(workdir, next)
      Object.assign(cfg.asr, next.asr ?? {})
      Object.assign(cfg.vision, next.vision ?? {})
      return {
        saved: true,
        asr: { ...cfg.asr, apiKey: maskKey(cfg.asr.apiKey) },
        vision: { ...cfg.vision, apiKey: maskKey(cfg.vision.apiKey) },
      }
    }

    async check() {
      return preflight(studio)
    }

    async listModels() {
      const providers = []
      for (const p of ctx.llm.listProviders()) {
        const models = await ctx.llm.listModels(p.id)
        const items = []
        for (const m of models) {
          let vision = false
          try { vision = (await ctx.llm.resolveModelInfo(p.id, m.id)).inputModalities?.includes('image') === true } catch { /* 忽略 */ }
          items.push({ id: m.id, name: m.name ?? m.id, vision })
        }
        providers.push({ provider: p.id, name: p.name, models: items })
      }
      return { providers }
    }

    async preprocess(opts = {}) {
      const paths = Array.isArray(opts.paths) ? opts.paths : [opts.paths].filter(Boolean)
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pss-'))
      const videos = []
      for (const p of paths) {
        const info = await media.ffprobeJson(cfg.ffprobePath, p)
        const sidecars = await media.sidecarSubs(p)
        const mode = detectMode(info, sidecars)
        let audioPath = null
        if (mode === 'asr') {
          audioPath = path.join(tmp, `audio-${videos.length}.wav`)
          await media.extractAudio(cfg.ffmpegPath, p, audioPath)
        }
        videos.push({ path: p, mode, durationSec: media.durationSeconds(info), sidecarSubs: sidecars, audioPath })
      }
      return { tmpDir: tmp, videos }
    }
  }
  decorateRemote(SubtitleStudioService)
  return SubtitleStudioService
}
