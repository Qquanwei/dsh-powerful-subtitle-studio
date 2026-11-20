/** Probe system ffmpeg/ffprobe, or download the current platform build from the npmmirror. */
import { createWriteStream } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { expandEnv, run } from './util.js'

export const NPM_REGISTRY = 'https://registry.npmmirror.com'
export const BINARY_MIRROR = 'https://cdn.npmmirror.com/binaries/ffmpeg-static'
const PACKAGE_NAME = 'ffmpeg-static'
const PACKAGE_VERSION = '5.3.0'

const SUPPORTED = {
  darwin: ['x64', 'arm64'],
  win32: ['x64', 'ia32'],
  linux: ['x64', 'ia32', 'arm64', 'arm'],
  freebsd: ['x64'],
}

function vendorDir(workdir) {
  return path.join(workdir, 'vendor')
}

function vendorFile(workdir, command) {
  const ext = process.platform === 'win32' ? '.exe' : ''
  return path.join(vendorDir(workdir), command + ext)
}

export function binaryAsset(command, platform = process.platform, arch = process.arch) {
  return `${command}-${platform}-${arch}.gz`
}

async function commandWorks(cmd) {
  if (!cmd) return false
  try {
    const r = await run(cmd, ['-version'])
    return r.code === 0
  } catch {
    return false
  }
}

async function pick(command, configured, workdir) {
  const value = expandEnv(String(configured ?? '')).trim()
  if (value && value !== command && await commandWorks(value)) return { path: value, source: 'config' }
  if (await commandWorks(command)) return { path: command, source: 'system' }
  const local = vendorFile(workdir, command)
  if (await commandWorks(local)) return { path: local, source: 'vendor' }
  return { path: '', source: 'missing' }
}

/** Point cfg at a working binary: custom path, then the system command, then a downloaded copy. */
export async function bindBinaries(cfg) {
  const ffmpeg = await pick('ffmpeg', cfg.ffmpegPath, cfg.workdir)
  const ffprobe = await pick('ffprobe', cfg.ffprobePath, cfg.workdir)
  if (ffmpeg.path) cfg.ffmpegPath = ffmpeg.path
  if (ffprobe.path) cfg.ffprobePath = ffprobe.path
  return {
    ok: Boolean(ffmpeg.path && ffprobe.path),
    ffmpeg,
    ffprobe,
    registry: NPM_REGISTRY,
    mirror: BINARY_MIRROR,
    package: `${PACKAGE_NAME}@${PACKAGE_VERSION}`,
  }
}

async function downloadTo(url, dest) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180000) })
  if (!res.ok || !res.body) throw new Error(`下载失败（HTTP ${res.status}）：${url}`)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  const tmp = `${dest}.download`
  try {
    await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp))
    await fs.rename(tmp, dest)
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}

async function downloadGunzip(url, dest) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180000) })
  if (!res.ok || !res.body) throw new Error(`下载失败（HTTP ${res.status}）：${url}`)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  const tmp = `${dest}.download`
  try {
    await pipeline(Readable.fromWeb(res.body), createGunzip(), createWriteStream(tmp))
    if (process.platform !== 'win32') await fs.chmod(tmp, 0o755)
    await fs.rename(tmp, dest)
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}

/** Download ffmpeg-static from the China npm mirror, then the matching ffmpeg and ffprobe binaries. */
export async function downloadVendorBinaries(cfg) {
  const platform = process.platform
  const arch = process.arch
  const arches = SUPPORTED[platform]
  if (!arches?.includes(arch)) {
    throw new Error(`没有 ${platform}/${arch} 的 ffmpeg 安装包。请自行安装 ffmpeg 和 ffprobe 并加入 PATH。`)
  }

  const metaUrl = `${NPM_REGISTRY}/${PACKAGE_NAME}/${PACKAGE_VERSION}`
  const metaRes = await fetch(metaUrl, { signal: AbortSignal.timeout(30000) })
  if (!metaRes.ok) throw new Error(`镜像没有返回 ${PACKAGE_NAME}@${PACKAGE_VERSION}（HTTP ${metaRes.status}）`)
  const meta = await metaRes.json()
  const release = meta?.[PACKAGE_NAME]?.['binary-release-tag'] || 'b6.1.1'
  const tarball = String(meta?.dist?.tarball || '').replace('https://registry.npmjs.org/', `${NPM_REGISTRY}/`)
  if (!tarball.startsWith(NPM_REGISTRY)) throw new Error(`安装包地址不在国内镜像上：${tarball || metaUrl}`)

  const cache = path.join(vendorDir(cfg.workdir), 'cache')
  await downloadTo(tarball, path.join(cache, `${PACKAGE_NAME}-${PACKAGE_VERSION}.tgz`))

  const base = `${BINARY_MIRROR}/${release}`
  const ffmpegDest = vendorFile(cfg.workdir, 'ffmpeg')
  const ffprobeDest = vendorFile(cfg.workdir, 'ffprobe')
  await downloadGunzip(`${base}/${binaryAsset('ffmpeg', platform, arch)}`, ffmpegDest)
  await downloadGunzip(`${base}/${binaryAsset('ffprobe', platform, arch)}`, ffprobeDest)

  const status = await bindBinaries(cfg)
  if (!status.ok) throw new Error('安装包已下载，但 ffmpeg 或 ffprobe 仍无法运行。')
  await fs.writeFile(path.join(vendorDir(cfg.workdir), 'ffmpeg-static.json'), JSON.stringify({
    package: `${PACKAGE_NAME}@${PACKAGE_VERSION}`,
    release,
    registry: NPM_REGISTRY,
    mirror: BINARY_MIRROR,
    ffmpeg: status.ffmpeg.path,
    ffprobe: status.ffprobe.path,
    installedAt: new Date().toISOString(),
  }, null, 2) + '\n')
  return status
}
