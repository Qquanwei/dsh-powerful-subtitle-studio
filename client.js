/**
 * powerful-subtitle-studio — browser half.
 *
 * Home is a hero plus a drop zone. Opening a project shows the video on the
 * left and the finished subtitle cues on the right.
 */
window.__ModuleLoader__.load({
  id: 'powerful-subtitle-studio',
  factory(require) {
    const React = require('react')
    const { useState, useEffect, useRef } = React
    const h = React.createElement
    const NS = 'powerfulSubtitleStudio'
    const PANEL_ID = 'powerful-subtitle-studio'
    const pathParts = (p) => String(p).split(/[/\\]/).filter(Boolean)
    const commonParentDirectory = (paths) => {
      const dirs = []
      for (const raw of paths ?? []) {
        const text = String(raw ?? '')
        const idx = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'))
        if (idx > 0) dirs.push(text.slice(0, idx))
        else if (idx === 0) dirs.push(text.slice(0, 1))
      }
      if (!dirs.length) return ''
      const sep = dirs[0].includes('\\') && !dirs[0].includes('/') ? '\\' : '/'
      let parts = dirs[0].split(/[/\\]/)
      for (const dir of dirs.slice(1)) {
        const next = dir.split(/[/\\]/)
        let i = 0
        const limit = Math.min(parts.length, next.length)
        while (i < limit && parts[i].toLowerCase() === next[i].toLowerCase()) i++
        parts = parts.slice(0, i)
      }
      if (sep === '/') {
        const body = parts.filter(Boolean).join('/')
        return body ? `/${body}` : '/'
      }
      return parts.join('\\')
    }
    const clock = (ms) => {
      const n = Math.max(0, Math.round(Number(ms) || 0))
      const cs = Math.floor(n / 10) % 100
      const sec = Math.floor(n / 1000) % 60
      const min = Math.floor(n / 60000) % 60
      const hour = Math.floor(n / 3600000)
      const pad = (v) => String(v).padStart(2, '0')
      return hour ? `${hour}:${pad(min)}:${pad(sec)}.${pad(cs)}` : `${pad(min)}:${pad(sec)}.${pad(cs)}`
    }
    const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    const richText = (text) => {
      const nodes = []
      let bold = false
      String(text ?? '').split(/(<\/?b>)/i).forEach((part, index) => {
        if (/^<b>$/i.test(part)) { bold = true; return }
        if (/^<\/b>$/i.test(part)) { bold = false; return }
        if (!part) return
        nodes.push(bold ? h('b', { key: index }, part) : part)
      })
      return nodes
    }
    const VIDEO_STYLE = { width: '100%', height: '100%', objectFit: 'contain', background: '#0b0b0b' }
    const BAILIAN_CONSOLE = 'https://bailian.console.aliyun.com/'
    const HOME_BLACK = '#080808'
    const HERO_LEFT = 'https://img0.selfimg.com.cn/wxnews/2018/01/15/242f5dcf5d1d9e0249fdd7d620947fc9.jpg'
    const HOME_GRAIN = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>')

    const zh = {
      'panel': '字幕工作室',
      'title': '字幕工作室',
      'subtitle': '拖入视频创建项目',
      'drop.hint': '把视频拖到这里，或点击选择',
      'drop.hint2': '支持 mp4、mkv、avi 等视频格式，可多选',
      'drop.add': '把下一集拖到这里，或点击选择',
      'drop.add2': '只加入视频文件',
      'drop.videoOnly': '只能添加视频文件，例如 mp4、mkv、avi。',
      'drop.added': '已加入这个项目。',
      'drop.dragging': '松开以添加',
      'drop.clear': '清空',
      'sourceLang': '源语言',
      'sourceLang.auto': '自动识别',
      'targetLang': '目标语言',
      'mode': '处理方式',
      'mode.auto': '自动检测',
      'mode.translate': '翻译已有字幕',
      'mode.asr': '语音识别 + 翻译',
      'visualCheck': '视频抽帧核验',
      'visualCheck.off': '关闭',
      'visualCheck.auto': '自动抽样',
      'visualCheck.all': '逐句',
      'bilingual': '输出双语字幕',
      'renderMode': '字幕输出方式',
      'render.srt': '仅导出 SRT 字幕',
      'render.mkv': '内挂软字幕 MKV（无损）',
      'render.burn': '烧录进视频 MP4（重编码）',
      'btn.process': '一键处理',
      'btn.working': '处理中…',
      'btn.embed': '渲染到视频里',
      'btn.embedding': '正在嵌入…',
      'embed.working': '正在把字幕嵌进视频。',
      'embed.done': '已生成带内嵌字幕的视频：',
      'embed.failed': '嵌入失败：',
      'hint.working': '正在准备这一集，准备好就发给会话',
      'hint.send': '已交给会话处理这一集。',
      'run.running': '会话处理中',
      'run.idle': '会话已结束',
      'run.done': '这一集的会话已经跑完。',
      'hint.empty': '请先拖入视频或文件夹。',
      'hint.noSession': '当前没有打开的会话，无法发送。',
      'hint.failed': '发送失败：',
      'hint.noHostPath': '无法解析拖入项的本地路径（需桌面版）。',
      'hint.emptyKey': '请先输入 API Key。',
      'key.required': '先填写百炼 API Key',
      'key.requiredHint': '没有 Key 不能转写。保存之后才能拖入视频。',
      'key.checking': '正在确认百炼配置…',
      'hint.saveFailed': '保存失败（接口调用失败，未创建会话）。',
      'hint.preprocessFailed': '预处理失败（接口调用失败，未创建会话）。',
      'bins.missing': '没有检测到 ffmpeg / ffprobe',
      'bins.hint': '将从 npmmirror 下载当前系统的 ffmpeg-static。系统里已经有的话会直接使用，不会再下载。',
      'bins.download': '下载依赖',
      'bins.downloading': '正在从国内镜像下载…',
      'bins.ready': '依赖已就绪。',
      'bins.failed': '下载依赖失败：',
      'bins.blocked': '还没有 ffmpeg / ffprobe。先点「下载依赖」。',
      'settings.title': '设置',
      'settings.key': '百炼 API Key（DashScope）',
      'settings.keyHint': '阿里云百炼的 DASHSCOPE_API_KEY；保存后写入插件配置并立即生效。',
      'settings.save': '保存配置',
      'settings.saved': '配置已保存（直接写入，未创建会话）。',
      'settings.asrNote': '语音识别用百炼 paraformer-v2 文件转写。',
      'settings.console': '打开百炼控制台',
      'project.new': '新建项目',
      'project.namePlaceholder': '例如：葬送的芙莉莲 第一季',
      'project.create': '创建项目',
      'project.createFailed': '创建项目失败',
      'project.hostStale': '项目没有保存成功，字幕服务没有接住这次请求。请再完全退出并重新打开一次 DeepSeek Harness。',
      'project.emptyName': '请输入项目名',
      'project.dropHint': '拖入视频或文件夹后，会用标题自动新建项目并进入。',
      'project.untitled': '未命名项目',
      'project.list': '项目',
      'inspector': '输出',
      'project.episodes': '集',
      'project.saved': '已收录的视频',
      'project.empty': '还没有项目',
      'project.delete': '删除',
      'project.deleteConfirm': '删除这个项目？保存的名称、视频路径和会话关联会被清掉。',
      'project.deleted': '项目已删除。',
      'project.deleteFailed': '删除项目失败',
      'detail.back': '返回',
      'cues.title': '字幕',
      'cues.empty': '还没有字幕。处理完成后，每一句会出现在这里，点一句就能跳到对应画面。',
      'cues.reload': '刷新字幕',
      'player.unsupported': '这个视频格式在预览里播不了，字幕列表仍然可以看。',
      'session.open': '打开会话',
      'session.linked': '会话已保存，可随时打开',
      'session.missing': '还没有会话',
      'session.createFailed': '会话没有建成：',
      'session.openFailed': '无法打开会话：',
    }
    const en = {
      'panel': 'Subtitle studio',
      'title': 'Turn videos into subtitles',
      'subtitle': 'Drop a video to create a project. After processing, the detail page plays the video beside each subtitle cue.',
      'drop.hint': 'Drop videos here, or click to choose',
      'drop.hint2': 'mp4, mkv, avi, and other video formats. Several at once.',
      'drop.add': 'Drop the next episode, or click to choose',
      'drop.add2': 'Video files only',
      'drop.videoOnly': 'Only video files can be added, such as mp4, mkv, and avi.',
      'drop.added': 'Added to this project.',
      'drop.dragging': 'Release to add',
      'drop.clear': 'Clear',
      'sourceLang': 'Source language',
      'sourceLang.auto': 'Detect automatically',
      'targetLang': 'Target language',
      'mode': 'Mode',
      'mode.auto': 'Auto detect',
      'mode.translate': 'Translate existing subtitles',
      'mode.asr': 'Transcribe + translate',
      'visualCheck': 'Vision assist',
      'visualCheck.off': 'Off',
      'visualCheck.auto': 'Auto sample',
      'visualCheck.all': 'Every cue',
      'bilingual': 'Bilingual subtitles',
      'renderMode': 'Subtitle output',
      'render.srt': 'Export SRT only',
      'render.mkv': 'Soft-subbed MKV (lossless)',
      'render.burn': 'Burn into MP4 (re-encode)',
      'btn.process': 'Process',
      'btn.working': 'Working…',
      'btn.embed': 'Render into video',
      'btn.embedding': 'Embedding…',
      'embed.working': 'Embedding subtitles into the video.',
      'embed.done': 'Video with embedded subtitles: ',
      'embed.failed': 'Embed failed: ',
      'hint.working': 'Preparing this episode, then sending it to the conversation.',
      'hint.send': 'This episode was sent to the conversation.',
      'run.running': 'Conversation running',
      'run.idle': 'Conversation finished',
      'run.done': 'The conversation finished this episode.',
      'hint.empty': 'Drop videos or a folder first.',
      'hint.noSession': 'No conversation is open to send to.',
      'hint.failed': 'Send failed: ',
      'hint.noHostPath': 'Cannot resolve the local path of the dropped item (Desktop required).',
      'hint.emptyKey': 'Please enter the API key first.',
      'key.required': 'Enter a Bailian API key first',
      'key.requiredHint': 'Transcription needs this key. You can drop a video after it is saved.',
      'key.checking': 'Checking the Bailian key…',
      'hint.saveFailed': 'Save failed (API call failed; no conversation created).',
      'hint.preprocessFailed': 'Preprocess failed (API call failed; no conversation created).',
      'bins.missing': 'ffmpeg / ffprobe was not found',
      'bins.hint': 'Downloads ffmpeg-static for this system from the npmmirror. An existing system install is used as-is.',
      'bins.download': 'Download dependency',
      'bins.downloading': 'Downloading from the mirror…',
      'bins.ready': 'Dependency is ready.',
      'bins.failed': 'Download failed: ',
      'bins.blocked': 'ffmpeg / ffprobe is missing. Download the dependency first.',
      'settings.title': 'Settings',
      'settings.key': 'Bailian API key (DashScope)',
      'settings.keyHint': 'Alibaba Bailian DASHSCOPE_API_KEY; saving writes it to plugin config.',
      'settings.save': 'Save config',
      'settings.saved': 'Config saved (written directly; no conversation created).',
      'settings.asrNote': 'ASR uses Bailian paraformer-v2 file transcription.',
      'settings.console': 'Open the Bailian console',
      'project.new': 'New project',
      'project.namePlaceholder': 'e.g. Frieren Season 1',
      'project.create': 'Create',
      'project.createFailed': 'Failed to create project',
      'project.hostStale': 'The project was not saved because the subtitle service did not accept the request. Quit DeepSeek Harness completely and open it once more.',
      'project.emptyName': 'Enter a project name',
      'project.dropHint': 'Dropping a video or folder creates a project from its title and opens it.',
      'project.untitled': 'Untitled',
      'project.list': 'Projects',
      'inspector': 'Output',
      'project.episodes': 'eps',
      'project.saved': 'Videos in this project',
      'project.empty': 'No projects yet',
      'project.delete': 'Delete',
      'project.deleteConfirm': 'Delete this project? Its saved name, video paths, and conversation link will be removed.',
      'project.deleted': 'Project deleted.',
      'project.deleteFailed': 'Could not delete the project',
      'detail.back': 'Back',
      'cues.title': 'Subtitles',
      'cues.empty': 'No subtitles yet. After processing, each cue shows up here and jumps the video when clicked.',
      'cues.reload': 'Reload subtitles',
      'player.unsupported': 'This video format cannot play in the preview. The cue list is still available.',
      'session.open': 'Open conversation',
      'session.linked': 'Conversation saved',
      'session.missing': 'No conversation yet',
      'session.createFailed': 'Could not create the conversation: ',
      'session.openFailed': 'Could not open the conversation: ',
    }

    const TOKEN = {
      labelPrimary: 'var(--dsw-alias-label-primary)',
      labelSecondary: 'var(--dsw-alias-label-secondary)',
      labelTertiary: 'var(--dsw-alias-label-tertiary)',
      bgBase: 'var(--dsw-alias-bg-base)',
      bgLayer1: 'var(--dsw-alias-bg-layer-1)',
      cardFill: 'var(--dsw-alias-card-fill)',
      borderL2: 'var(--dsw-alias-border-l2)',
      borderL3: 'var(--dsw-alias-border-l3)',
      brandPrimary: 'var(--dsw-alias-brand-primary)',
      onBrand: 'var(--dsw-alias-bg-base)',
      success: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
      business: 'var(--dsw-alias-state-business-primary)',
    }

    const ACCENT = '#111111'
    const CLIP = ['#14b8a6', '#06b6d4', '#a855f7', '#ec4899', '#f97316']
    const HERO = {
      top: 'https://img1.selfimg.com.cn/wxnews/2018/01/15/10599826fba7b36596e3e9e5ac197e13.jpg',
      bottom: 'https://img1.selfimg.com.cn/uedvoguecms/2018/01/15/1515988652_B2NYvs.jpg',
    }
    // 浅色编辑器底，不跟宿主深色主题走。
    const LIGHT_VARS = {
      '--dsw-alias-label-primary': '#111827',
      '--dsw-alias-label-secondary': '#6b7280',
      '--dsw-alias-label-tertiary': '#9ca3af',
      '--dsw-alias-bg-base': '#f3f4f6',
      '--dsw-alias-bg-layer-1': '#ffffff',
      '--dsw-alias-card-fill': '#ffffff',
      '--dsw-alias-border-l2': '#e5e7eb',
      '--dsw-alias-border-l3': '#eef0f3',
      '--dsw-alias-brand-primary': '#111111',
      '--dsw-alias-state-success-primary': '#047857',
      '--dsw-alias-state-warn-primary': '#b45309',
      '--dsw-alias-state-error-primary': '#be123c',
      '--dsw-alias-state-business-primary': '#7c3aed',
    }

    function Icon({ size = 16 }) {
      return h('svg', {
        viewBox: '0 0 64 64', width: size, height: size,
        fill: 'none', stroke: 'currentColor', strokeWidth: 3.5,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      },
        h('rect', { x: 6, y: 8, width: 52, height: 48, rx: 8 }),
        h('path', { d: 'M18 26h10M18 34h10' }),
        h('path', { d: 'M14 42h36' }),
      )
    }

    function Field({ label, children }) {
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 7 } },
        h('label', { style: { fontSize: 12, fontWeight: 600, color: '#6b7280' } }, label),
        children,
      )
    }

    const inputStyle = {
      width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: 13,
      fontFamily: SANS, color: '#111827', background: '#ffffff',
      border: '1px solid #e5e7eb', borderRadius: 10, outline: 'none',
    }

    function Select({ value, onChange, options }) {
      return h('select', { value, onChange: (e) => onChange(e.target.value), style: inputStyle },
        options.map((o) => h('option', { key: o.value, value: o.value }, o.label)),
      )
    }

    function Checkbox({ checked, onChange, label }) {
      return h('label', { style: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontFamily: SANS, color: TOKEN.labelPrimary, cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked, onChange: (e) => onChange(e.target.checked), style: { accentColor: TOKEN.brandPrimary, width: 15, height: 15, cursor: 'pointer' } }),
        label,
      )
    }

    function GearMark() {
      return h('svg', {
        width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('circle', { cx: 12, cy: 12, r: 3 }),
        h('path', { d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' }),
      )
    }

    function Button({ primary, onClick, children, disabled, block }) {
      return h('button', {
        type: 'button', onClick, disabled,
        style: {
          appearance: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
          padding: '8px 16px', fontSize: 13, fontFamily: SANS, fontWeight: 650,
          borderRadius: 999,
          border: '1px solid ' + (primary ? '#111111' : '#e5e7eb'),
          background: primary ? '#111111' : '#ffffff',
          color: primary ? '#ffffff' : '#111827',
          opacity: disabled ? 0.5 : 1,
          width: block ? '100%' : undefined,
        },
      }, children)
    }

    function Notice({ tone, children }) {
      const color = tone === 'error' ? TOKEN.error : tone === 'success' ? TOKEN.success : TOKEN.labelSecondary
      const bg = tone === 'error' ? '#fff1f2' : tone === 'success' ? '#ecfdf5' : '#f5f3ff'
      return h('div', {
        style: {
          fontSize: 13, fontFamily: SANS, color, lineHeight: 1.5,
          whiteSpace: 'pre-wrap', padding: '10px 12px', borderRadius: 12,
          background: bg,
        },
      }, children)
    }

    const VIDEO_EXT = new Set(['.mp4', '.mkv', '.mov', '.webm', '.avi', '.m4v', '.ts', '.m2ts', '.mts', '.flv', '.wmv', '.mpg', '.mpeg', '.vob', '.ogv', '.3gp', '.3g2', '.f4v', '.asf', '.rm', '.rmvb', '.m2v', '.mxf', '.qt', '.divx'])
    const VIDEO_ACCEPT = 'video/*,' + [...VIDEO_EXT].join(',')

    function isVideoPick(file) {
      const name = String(file?.name || '')
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : ''
      if (VIDEO_EXT.has(ext)) return true
      return /^video\//i.test(String(file?.type || ''))
    }

    function filesToFound(files) {
      const found = []
      const bridge = globalThis.__DSH_HOST_PATHS__
      for (const file of files) {
        if (!isVideoPick(file)) continue
        const hostPath = bridge?.pathFor?.(file) || file.path || ''
        if (hostPath) found.push({ path: hostPath, isDir: false })
        else found.push({ path: file.name, isDir: false, unresolved: true })
      }
      return found
    }

    function entryFile(entry) {
      return new Promise((resolve) => entry.file((file) => resolve(file), () => resolve(null)))
    }

    function readEntries(dir) {
      return new Promise((resolve) => {
        const reader = dir.createReader()
        const all = []
        const next = () => reader.readEntries((batch) => {
          if (!batch?.length) { resolve(all); return }
          all.push(...batch)
          next()
        }, () => resolve(all))
        next()
      })
    }

    async function filesUnder(entry) {
      if (!entry) return []
      if (entry.isFile) {
        const file = await entryFile(entry)
        return file ? [file] : []
      }
      if (!entry.isDirectory) return []
      const nested = await Promise.all((await readEntries(entry)).map(filesUnder))
      return nested.flat()
    }

    async function collectDrop(e) {
      e.preventDefault()
      const dt = e.dataTransfer
      if (!dt) return { found: [], rejected: false }
      const gathered = []
      let sawFile = false
      const items = dt.items?.length ? [...dt.items] : []
      if (items.length) {
        for (const item of items) {
          if (item.kind !== 'file') continue
          sawFile = true
          const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
          if (entry) gathered.push(...await filesUnder(entry))
          else {
            const file = item.getAsFile()
            if (file) gathered.push(file)
          }
        }
      } else {
        for (const file of dt.files ?? []) { sawFile = true; gathered.push(file) }
      }
      const found = filesToFound(gathered)
      return { found, rejected: sawFile && found.length === 0 }
    }

    function DropZone({ items, onAdd, onReject, onClear, t, fill, compact, quiet, hint, hint2 }) {
      const [dragging, setDragging] = useState(false)
      const picker = useRef(null)
      const title = dragging ? t('drop.dragging') : (hint || t('drop.hint'))
      const sub = hint2 || t('drop.hint2')
      const deliver = (result) => {
        if (result.found.length) onAdd(result.found)
        else if (result.rejected) onReject?.()
      }
      const openPicker = () => picker.current?.click()
      return h('div', { style: fill ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : null },
        h('input', {
          ref: picker,
          type: 'file',
          multiple: true,
          accept: VIDEO_ACCEPT,
          tabIndex: -1,
          style: { position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' },
          onChange: (e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            if (!files.length) return
            const found = filesToFound(files)
            deliver({ found, rejected: found.length === 0 })
          },
        }),
        h('div', {
          className: compact ? ('pss-drop' + (dragging ? ' pss-drop-on' : '')) : undefined,
          role: 'button',
          tabIndex: 0,
          onClick: openPicker,
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker() } },
          onDragOver: (e) => { e.preventDefault(); setDragging(true) },
          onDragLeave: () => setDragging(false),
          onDrop: (e) => { setDragging(false); Promise.resolve(collectDrop(e)).then(deliver) },
          style: {
            flex: fill ? 1 : undefined,
            minHeight: quiet ? 64 : (compact ? 96 : (fill ? 220 : undefined)),
            borderRadius: quiet ? 12 : (compact ? 16 : 14),
            padding: quiet ? '10px 12px' : (compact ? '18px 16px' : '22px 16px'),
            textAlign: 'center',
            position: 'relative',
            background: compact ? undefined : (dragging ? '#f5f3ff' : (quiet ? '#f8fafc' : '#f8fafc')),
            border: compact ? 'none' : ((quiet ? '1px dashed ' : '1px solid ') + (dragging ? '#a78bfa' : (quiet ? '#d1d5db' : '#e5e7eb'))),
            cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          },
        },
          h('div', { style: { fontSize: quiet ? 13 : 14, fontWeight: 650, fontFamily: SANS, color: compact ? '#f5f5f5' : '#111827' } }, title),
          h('div', { style: { marginTop: 4, fontSize: 12, fontFamily: SANS, color: compact ? 'rgba(255,255,255,0.62)' : '#6b7280' } }, sub),
        ),
        items.length > 0
          ? h('div', { style: { marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 } },
            items.map((it, i) => h('span', {
              key: i,
              style: {
                display: 'inline-flex', alignItems: 'center', maxWidth: '100%',
                padding: '5px 10px', borderRadius: 8,
                background: CLIP[i % CLIP.length], color: '#ffffff',
                fontSize: 12, fontFamily: SANS, lineHeight: 1.35,
              },
            }, (it.isDir ? '文件夹 · ' : '') + (pathParts(it.path).pop() || it.path))),
            h('div', { style: { width: '100%', marginTop: 4 } },
              h(Button, { onClick: onClear }, t('drop.clear'))),
            items.some((it) => it.unresolved)
              ? h('div', { style: { width: '100%', fontSize: 12, color: TOKEN.error } }, t('hint.noHostPath'))
              : null,
          )
          : null,
      )
    }

    function SubtitleStudioPage({ createNamedSession, openSession, sendToSession, t, remote, sessionList }) {
      const [items, setItems] = useState([])
      const [targetLang, setTargetLang] = useState('zh-CN')
      const [mode, setMode] = useState('auto')
      const [visualCheck, setVisualCheck] = useState('auto')
      const [bilingual, setBilingual] = useState(true)
      const [renderMode, setRenderMode] = useState('srt')
      const [notice, setNotice] = useState(null)
      const [busy, setBusy] = useState(false)
      const [embedding, setEmbedding] = useState(false)
      const [configKey, setConfigKey] = useState('')
      const [showSettings, setShowSettings] = useState(false)
      const [asrReady, setAsrReady] = useState(null)
      const [projects, setProjects] = useState([])
      const [currentProject, setCurrentProject] = useState(null)
      const [deleting, setDeleting] = useState(false)
      const [bins, setBins] = useState(null)
      const [downloading, setDownloading] = useState(false)
      const [videoIndex, setVideoIndex] = useState(0)
      const [cues, setCues] = useState([])
      const [subFile, setSubFile] = useState('')
      const [playhead, setPlayhead] = useState(0)
      const [videoError, setVideoError] = useState(false)
      const [sessionRun, setSessionRun] = useState(null)
      const [mediaAuth, setMediaAuth] = useState(null)
      const videoRef = useRef(null)
      const pendingSeek = useRef(null)
      const applyingSeek = useRef(false)
      const seekTries = useRef(0)

      useEffect(() => {
        let alive = true
        Promise.resolve(remote?.mediaTicket?.() ?? null)
          .then((res) => {
            if (!alive) return
            setMediaAuth(res?.origin && res?.token ? { origin: res.origin, token: res.token } : false)
          })
          .catch(() => { if (alive) setMediaAuth(false) })
        return () => { alive = false }
      }, [remote])

      useEffect(() => {
        let alive = true
        Promise.resolve(remote?.listProjects?.() ?? null)
          .then((res) => { if (alive && res && Array.isArray(res.projects)) setProjects(res.projects) })
          .catch(() => {})
        Promise.resolve(remote?.configStatus?.() ?? null)
          .then((res) => { if (alive) setAsrReady(res?.asr === false ? false : true) })
          .catch(() => { if (alive) setAsrReady(true) })
        Promise.resolve(remote?.binaryStatus?.() ?? null)
          .then((res) => { if (alive && res) setBins(res) })
          .catch(() => {})
        return () => { alive = false }
      }, [remote])

      const videoKey = `${currentProject?.id ?? ''}:${videoIndex}:${(currentProject?.videos ?? []).join('\n')}`
      useEffect(() => {
        const video = currentProject?.videos?.[videoIndex]
        if (!video) { setCues([]); setSubFile(''); return }
        setSubFile('')
        let alive = true
        Promise.resolve(remote?.subtitles?.({ video }) ?? null)
          .then((res) => {
            if (!alive) return
            setCues(Array.isArray(res?.cues) ? res.cues : [])
            setSubFile(res?.file || '')
          })
          .catch((err) => {
            if (!alive) return
            setCues([])
            setSubFile('')
            const msg = err?.message || ''
            if (msg) setNotice({ tone: 'error', text: msg })
          })
        return () => { alive = false }
      }, [remote, videoKey])

      const targetOptions = [
        { value: 'zh-CN', label: '简体中文' },
        { value: 'zh-TW', label: '繁体中文' },
        { value: 'en', label: '英语' },
        { value: 'ja', label: '日语' },
      ]

      const unresolvedCount = items.filter((it) => it.unresolved).length
      const watchRef = useRef({ video: '', remote })
      useEffect(() => {
        const sid = currentProject?.sessionId
        if (!sid || typeof sessionList?.subscribe !== 'function') { setSessionRun(null); return }
        let seen = false
        const read = () => {
          const row = sessionList.getSnapshot()?.byId?.[sid]
          if (!row) { setSessionRun(null); return }
          const running = row.running === true
          setSessionRun(running ? true : (row.blank ? null : false))
          if (running) { seen = true; return }
          if (!seen) return
          seen = false
          setNotice({ tone: 'success', text: watchRef.current.doneText })
          const video = watchRef.current.video
          const load = watchRef.current.remote?.subtitles
          if (!video || typeof load !== 'function') return
          Promise.resolve(load({ video }))
            .then((res) => {
              setCues(Array.isArray(res?.cues) ? res.cues : [])
              setSubFile(res?.file || '')
            })
            .catch(() => {})
        }
        read()
        return sessionList.subscribe(read)
      }, [sessionList, currentProject?.sessionId])

      const refreshProjects = () => {
        Promise.resolve(remote?.listProjects?.() ?? null)
          .then((res) => { if (res && Array.isArray(res.projects)) setProjects(res.projects) })
          .catch(() => {})
      }

      const rememberProject = (project) => {
        if (!project?.id) return
        setProjects((prev) => [project, ...prev.filter((p) => p.id !== project.id)])
      }

      const openProject = (p) => {
        if (currentProject?.id === p.id) return
        setCurrentProject(p)
        pendingSeek.current = null
        setVideoIndex(0)
        setCues([])
        setSubFile('')
        setPlayhead(0)
        setVideoError(false)
        setItems([])
        setNotice(null)
      }
      const backHome = () => {
        setCurrentProject(null)
        pendingSeek.current = null
        setVideoIndex(0)
        setCues([])
        setSubFile('')
        setPlayhead(0)
        setVideoError(false)
        setItems([])
        setNotice(null)
        refreshProjects()
      }

      const removeProject = async (project) => {
        if (!project?.id || deleting) return
        if (typeof confirm === 'function' && !confirm(t('project.deleteConfirm'))) return
        setDeleting(true)
        setNotice(null)
        try {
          const res = await remote?.deleteProject?.({ id: project.id })
          if (!res?.deleted) throw new Error(t('project.deleteFailed'))
          setProjects((prev) => prev.filter((p) => p.id !== project.id))
          if (currentProject?.id === project.id) backHome()
          setNotice({ tone: 'success', text: t('project.deleted') })
        } catch (err) {
          setNotice({ tone: 'error', text: err?.message || t('project.deleteFailed') })
        } finally {
          setDeleting(false)
        }
      }

      // 从拖入的第一个条目自动生成项目标题。
      const deriveProjectName = (found) => {
        const first = found[0]
        if (!first) return ''
        const seg = pathParts(first.path)
        const last = seg[seg.length - 1] || ''
        if (first.isDir) return last
        const parent = seg[seg.length - 2] || ''
        const generic = new Set(['documents', 'downloads', 'desktop', 'movies', 'videos', 'music', 'pictures', 'home', 'users'])
        if (parent && !generic.has(parent.toLowerCase())) return parent
        // 文件在通用目录下：用文件名（去扩展名、去 [] 标签）当项目名
        const base = last.replace(/\.[^.]+$/, '')
        const stripped = base.replace(/[\[【].*?[\]】]/g, '').trim()
        return stripped || base
      }

      // 列表页直接拖视频 → 自动建项目（标题自动生成）并进入详情。
      const createProjectFromDrop = async (found) => {
        if (asrReady === false) return
        if (!found || found.length === 0) return
        const resolved = found.filter((it) => !it.unresolved)
        if (resolved.length === 0) { setNotice({ tone: 'error', text: t('hint.noHostPath') }); return }
        const name = deriveProjectName(resolved) || t('project.untitled')
        setNotice(null)
        let sessionId = ''
        const directory = commonParentDirectory(resolved.map((it) => it.path))
        try { sessionId = await createNamedSession(name, directory) } catch { /* 会话可以进详情后再建 */ }
        try {
          const videos = resolved.map((it) => it.path)
          const res = await remote.saveProject({ id: name, name, videos, ...(sessionId ? { sessionId } : {}) })
          if (!res?.project) throw new Error(t('project.createFailed'))
          setItems(resolved)
          setCurrentProject(res.project)
          pendingSeek.current = null
          setVideoIndex(0)
          setCues([])
          setSubFile('')
          setPlayhead(0)
          setVideoError(false)
          rememberProject(res.project)
          refreshProjects()
        } catch (err) {
          setNotice({ tone: 'error', text: err?.message || t('project.createFailed') })
        }
      }

      // 把消息发到当前项目已有的会话；若无则先建一个并记录到项目。
      const sendToCurrentProject = async (text) => {
        let sid = currentProject?.sessionId || ''
        const remember = async (id) => {
          const res = await (remote?.saveProject?.({ id: currentProject?.id, sessionId: id }) ?? null)
          if (res?.project) { setCurrentProject(res.project); rememberProject(res.project); return res.project.sessionId || id }
          return id
        }
        const deliver = async (id) => {
          await sendToSession(id, text)
          return id
        }
        try {
          if (!sid) sid = await remember(await createNamedSession(currentProject?.name || t('project.untitled'), commonParentDirectory(currentProject?.videos ?? [])))
          return await deliver(sid)
        } catch (err) {
          const msg = err?.message || String(err)
          if (!/unknown session/.test(msg)) throw err
          sid = await remember(await createNamedSession(currentProject?.name || t('project.untitled'), commonParentDirectory(currentProject?.videos ?? [])))
          return deliver(sid)
        }
      }

      const jumpToSession = async () => {
        setNotice(null)
        try {
          let sid = currentProject?.sessionId
          if (!sid) {
            sid = await createNamedSession(currentProject?.name || t('project.untitled'), commonParentDirectory(currentProject?.videos ?? []))
            const res = await (remote?.saveProject?.({ id: currentProject?.id, sessionId: sid }) ?? null)
            if (res?.project) { setCurrentProject(res.project); rememberProject(res.project); sid = res.project.sessionId || sid }
          }
          openSession(sid)
        } catch (err) {
          setNotice({ tone: 'error', text: t('session.openFailed') + (err?.message || String(err)) })
        }
      }

      const embedVideo = async () => {
        if (!subFile || embedding) return
        const episode = (currentProject?.videos ?? [])[videoIndex] || ''
        if (!episode) return
        setEmbedding(true)
        setNotice({ tone: 'info', text: t('embed.working') })
        try {
          const res = await remote?.embed?.({ video: episode })
          if (!res?.output) throw new Error(t('embed.failed'))
          setNotice({ tone: 'success', text: t('embed.done') + res.output })
        } catch (err) {
          const msg = err?.message || String(err)
          setNotice({ tone: 'error', text: msg.startsWith(t('embed.failed')) ? msg : t('embed.failed') + msg })
        } finally {
          setEmbedding(false)
        }
      }

      const process = async () => {
        if (busy || downloading || sessionRun === true) return
        setNotice(null)
        if (bins && bins.ok === false) { setNotice({ tone: 'error', text: t('bins.blocked') }); return }
        const episode = (currentProject?.videos ?? [])[videoIndex] || ''
        if (!episode) { setNotice({ tone: 'error', text: t('hint.empty') }); return }
        setBusy(true)
        setNotice({ tone: 'info', text: t('hint.working') })
        try {
          let prep
          try {
            prep = await (remote?.preprocess?.([episode]) ?? null)
          } catch (err) {
            setNotice({ tone: 'error', text: err?.message || t('hint.preprocessFailed') })
            return
          }
          if (!prep) { setNotice({ tone: 'error', text: t('hint.preprocessFailed') }); return }
          const check = prep.check
          if (!check?.ok) { setNotice({ tone: 'error', text: (check.missing ?? []).join('\n') }); return }

          const v = (prep.videos ?? [])[0] ?? { path: episode }
          const line = v.audioPath
            ? `视频：${v.path}\n音频：${v.audioPath}（约 ${Math.round(v.durationSec ?? 0)} 秒，无字幕，需转写）`
            : `视频：${v.path}\n（已有字幕，直接翻译）`
          const output = renderMode === 'mkv'
            ? '用 subtitle_render 输出内挂软字幕 MKV'
            : renderMode === 'burn'
              ? '用 subtitle_render 烧录进视频 MP4'
              : '用 subtitle_render 输出 SRT'
          const message =
            `项目「${currentProject?.name ?? ''}」（project=${currentProject?.id ?? 'default'}）：\n${line}\n\n` +
            `请继续完成字幕，翻译成 ${targetLang}。人名、地名和专有名词在这个会话里必须前后一致：沿用你已经确定过的译法，不要另起译名。\n` +
            `${bilingual ? '字幕做成双语（原文在上，译文在下）。' : '字幕只保留译文。'}` +
            `${visualCheck === 'off' ? '不要抽帧。' : visualCheck === 'all' ? '翻译前对每句用 subtitle_frames 截取对应时间的画面，你自己看图核对说话人和画面文字。' : '人名或听写不确定时，用 subtitle_frames 抽几帧，你自己看图核对。'}` +
            `${mode === 'asr' ? '按语音转写后再翻译。' : mode === 'translate' ? '只翻译已有字幕，不要转写。' : ''}\n` +
            `1) 对这个音频只调用一次 subtitle_transcribe（不要传 language，源语言自动识别）。返回的 cues 已经按词级时间戳切成短字幕，不同 speaker 不要并成一条。不要检查静音点，不要自己把音频切成更短的片段再转写；很长的音频由工具内部分段识别并接回同一条时间轴。\n` +
            `2) 你自己直接翻译成 ${targetLang}。一句里真正的重点用 <b> 包住，例如 这是<b>重点</b>，不要整句加粗。不要写 Python 或任何生成脚本，也不要手写 SRT 时间轴。\n` +
            `3) 调用 subtitle_compose：video 用上面的视频路径，cues 用刚才返回的 cues，texts 是按序号对齐的译文（双语时 texts 里只放译文）。外层条数必须一致。同一条里如果是两个人的话混在一起，把这一项写成字符串数组拆开，例如 ["你来了？", "嗯。"]，时间由工具按词级时间切开，不要自己写时间轴。改某一句时再调用一次，只传 lines 里有改动的序号。\n` +
            `4) ${output}\n` +
            `完成后报告字幕文件路径。`

          const sid = await sendToCurrentProject(message)
          setNotice({ tone: 'success', text: t('hint.send') })
          if (sid) openSession(sid)
        } catch (err) {
          setNotice({ tone: 'error', text: t('hint.failed') + (err?.message || String(err)) })
        } finally {
          setBusy(false)
        }
      }

      const saveConfig = () => {
        setNotice(null)
        const opts = {}
        if (configKey.trim()) { opts.asrApiKey = configKey.trim() }
        if (Object.keys(opts).length === 0) { setNotice({ tone: 'error', text: t('hint.emptyKey') }); return }

        // 纯接口保存，绝不创建会话
        Promise.resolve(remote?.saveConfig?.(opts) ?? null)
          .then((res) => {
            if (res && res.saved !== false) { setConfigKey(''); setAsrReady(true); setNotice({ tone: 'success', text: t('settings.saved') }) }
            else { setNotice({ tone: 'error', text: t('hint.saveFailed') }) }
          })
          .catch((err) => setNotice({ tone: 'error', text: t('hint.failed') + (err?.message || String(err)) }))
      }

      const downloadBins = async () => {
        if (downloading) return
        setDownloading(true)
        setNotice({ tone: 'info', text: t('bins.downloading') })
        try {
          const res = await remote?.downloadBinaries?.()
          if (!res?.ok) throw new Error(t('bins.blocked'))
          setBins(res)
          setNotice({ tone: 'success', text: t('bins.ready') })
        } catch (err) {
          setNotice({ tone: 'error', text: t('bins.failed') + (err?.message || String(err)) })
        } finally {
          setDownloading(false)
        }
      }

      const onHome = !currentProject
      const savedVideos = currentProject?.videos ?? []
      const activeVideo = savedVideos[videoIndex] || ''
      watchRef.current = { video: activeVideo, remote, doneText: t('run.done') }
      const activeCue = cues.findIndex((cue) => playhead >= cue.start && playhead < cue.end)
      const fileName = (p) => {
        const parts = pathParts(p)
        return parts[parts.length - 1] || String(p)
      }
      const card = {
        background: '#ffffff',
        border: '1px solid #eceff3',
        borderRadius: 16,
        boxShadow: '0 1px 2px rgba(17,24,39,0.04)',
      }
      const mediaSrc = !activeVideo || mediaAuth == null
        ? ''
        : mediaAuth
          ? mediaAuth.origin + '/media?token=' + encodeURIComponent(mediaAuth.token) + '&path=' + encodeURIComponent(activeVideo)
          : (typeof location !== 'undefined'
            ? new URL('/api/subtitle/media?path=' + encodeURIComponent(activeVideo), location.origin).toString()
            : '')
      useEffect(() => {
        const el = videoRef.current
        if (!el || !mediaSrc || el.dataset.mediaSrc === mediaSrc) return
        el.dataset.mediaSrc = mediaSrc
        el.src = mediaSrc
      }, [mediaSrc])
      const applySeek = (el) => {
        const target = pendingSeek.current
        if (!el || target == null || el.readyState < 1) return
        if (Number.isFinite(el.duration) && el.duration > 0 && target > el.duration) {
          pendingSeek.current = null
          applyingSeek.current = false
          return
        }
        if (Math.abs(el.currentTime - target) <= 0.05) {
          applyingSeek.current = false
          return
        }
        applyingSeek.current = true
        el.currentTime = target
      }
      const seek = (ms) => {
        const seconds = Math.max(0, Number(ms) || 0) / 1000
        pendingSeek.current = seconds
        applyingSeek.current = true
        seekTries.current = 0
        setPlayhead(seconds * 1000)
        applySeek(videoRef.current)
      }
      const onUserSeeking = () => {
        if (applyingSeek.current) return
        pendingSeek.current = null
      }
      const finishSeek = (el) => {
        const target = pendingSeek.current
        if (target != null && Math.abs(el.currentTime - target) > 0.4) {
          if (applyingSeek.current && seekTries.current < 2) {
            seekTries.current += 1
            applySeek(el)
            return
          }
          pendingSeek.current = null
          applyingSeek.current = false
        }
        pendingSeek.current = null
        applyingSeek.current = false
        setPlayhead(el.currentTime * 1000)
      }
      const onPlayerTime = (e) => {
        const el = e.currentTarget
        const target = pendingSeek.current
        if (target != null) {
          if (Math.abs(el.currentTime - target) > 0.4) return
          pendingSeek.current = null
          applyingSeek.current = false
        }
        setPlayhead(el.currentTime * 1000)
      }
      const playerHandlers = useRef({})
      playerHandlers.current = { onPlayerTime, onUserSeeking, applySeek, finishSeek, setPlayhead, setVideoError }
      const playerEvents = useRef(null)
      if (playerEvents.current == null) {
        playerEvents.current = {
          onTimeUpdate: (e) => playerHandlers.current.onPlayerTime(e),
          onSeeking: (e) => playerHandlers.current.onUserSeeking(e),
          onLoadedMetadata: (e) => playerHandlers.current.applySeek(e.currentTarget),
          onCanPlay: (e) => playerHandlers.current.applySeek(e.currentTarget),
          onSeeked: (e) => playerHandlers.current.finishSeek(e.currentTarget),
          onError: () => playerHandlers.current.setVideoError(true),
          onLoadedData: () => {
            playerHandlers.current.setVideoError(false)
            playerHandlers.current.applySeek(videoRef.current)
          },
        }
      }

      const binBanner = bins && bins.ok === false
        ? h('div', { style: { ...card, padding: 14, background: '#faf5ff', borderColor: '#e9d5ff' } },
          h('div', { style: { fontSize: 13, fontWeight: 650, color: '#6d28d9' } }, t('bins.missing')),
          h('div', { style: { marginTop: 4, fontSize: 12, lineHeight: 1.55, color: '#6b7280' } }, t('bins.hint')),
          h('div', { style: { marginTop: 10 } }, h(Button, { primary: true, disabled: downloading, onClick: downloadBins }, downloading ? t('bins.downloading') : t('bins.download'))),
        )
        : null

      const consoleLink = (color) => h('a', {
        href: BAILIAN_CONSOLE, target: '_blank', rel: 'noopener noreferrer',
        style: { fontSize: 12, color, textDecoration: 'underline' },
      }, t('settings.console'))

      const settingsPanel = showSettings
        ? h('div', {
          style: {
            position: 'absolute', top: 40, right: 0, width: 280, zIndex: 2,
            display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 12,
            background: '#f8fafc', border: '1px solid #e5e7eb',
            boxShadow: '0 16px 40px rgba(0,0,0,0.28)',
          },
        },
          h('div', { style: { fontSize: 12, fontWeight: 650, color: '#6b7280' } }, t('settings.key')),
          h('input', { type: 'password', value: configKey, onChange: (e) => setConfigKey(e.target.value), placeholder: 'sk-…', style: inputStyle }),
          h('div', { style: { fontSize: 12, color: TOKEN.labelTertiary } }, t('settings.asrNote')),
          consoleLink('#6d28d9'),
          h(Button, { primary: true, onClick: saveConfig }, t('settings.save')),
        )
        : null

      const options = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' } },
        h('div', { style: { minWidth: 148, flex: '1 1 148px' } },
          h(Field, { label: t('targetLang') }, h(Select, { value: targetLang, onChange: setTargetLang, options: targetOptions }))),
        h('div', { style: { minWidth: 148, flex: '1 1 148px' } },
          h(Field, { label: t('mode') }, h(Select, {
            value: mode, onChange: setMode,
            options: [
              { value: 'auto', label: t('mode.auto') },
              { value: 'translate', label: t('mode.translate') },
              { value: 'asr', label: t('mode.asr') },
            ],
          }))),
        h('div', { style: { minWidth: 148, flex: '1 1 148px' } },
          h(Field, { label: t('visualCheck') }, h(Select, {
            value: visualCheck, onChange: setVisualCheck,
            options: [
              { value: 'off', label: t('visualCheck.off') },
              { value: 'auto', label: t('visualCheck.auto') },
              { value: 'all', label: t('visualCheck.all') },
            ],
          }))),
        h('div', { style: { minWidth: 180, flex: '1 1 180px' } },
          h(Field, { label: t('renderMode') }, h(Select, {
            value: renderMode, onChange: setRenderMode,
            options: [
              { value: 'srt', label: t('render.srt') },
              { value: 'mkv', label: t('render.mkv') },
              { value: 'burn', label: t('render.burn') },
            ],
          }))),
        h('div', { style: { paddingBottom: 8 } }, h(Checkbox, { checked: bilingual, onChange: setBilingual, label: t('bilingual') })),
      )

      const homePage = h('div', { className: 'pss-home-body' },
        binBanner,
        notice ? h(Notice, { tone: notice.tone }, notice.text) : null,
        unresolvedCount > 0 ? h(Notice, { tone: 'error' }, t('hint.noHostPath')) : null,
        h('div', { className: 'pss-stage' },
          h('section', { className: 'pss-hero', 'aria-hidden': 'true' },
            h('div', { className: 'pss-hero-left' },
              h('img', { src: HERO_LEFT, alt: '', className: 'pss-shot pss-hero-left-img' }),
            ),
            h('div', { className: 'pss-hero-spacer' }),
            h('div', { className: 'pss-hero-art' },
              h('img', { src: HERO.top, alt: '', className: 'pss-shot pss-shot-b' }),
              h('img', { src: HERO.bottom, alt: '', className: 'pss-shot pss-shot-c' }),
            ),
          ),
          h('div', { className: 'pss-home-split' },
            h('div', { className: 'pss-hero-copy' },
              h('div', { className: 'pss-hero-title' }, t('title')),
              h('div', { className: 'pss-hero-slug' }, 'powerful-subtitle-studio'),
              h('div', { className: 'pss-hero-sub' }, t('subtitle')),
              h(DropZone, { compact: true, fill: true, items: [], t, onAdd: createProjectFromDrop, onReject: () => setNotice({ tone: 'error', text: t('drop.videoOnly') }), onClear: () => {} }),
            ),
            h('div', { className: 'pss-projects-col' },
              h('div', { className: 'pss-projects-title' }, t('project.list')),
              h('div', { className: 'pss-projects' },
                projects.length > 0
                  ? projects.map((p, i) => h('div', { key: p.id, className: 'pss-project' },
                    h('button', {
                      type: 'button',
                      className: 'pss-project-open',
                      onClick: () => openProject(p),
                    },
                      h('span', { className: 'pss-project-mark', style: { background: CLIP[i % CLIP.length] } }),
                      h('span', { className: 'pss-project-copy' },
                        h('span', { className: 'pss-project-name' }, p.name || p.id),
                        h('span', { className: 'pss-project-meta' }, `${(p.videos ?? []).length} ${t('project.episodes')}`),
                      ),
                    ),
                    h('button', {
                      type: 'button',
                      className: 'pss-del',
                      title: t('project.delete'),
                      'aria-label': t('project.delete'),
                      disabled: deleting,
                      onClick: () => removeProject(p),
                    }, t('project.delete')),
                  ))
                  : h('div', { className: 'pss-project-empty' }, t('project.empty')),
              ),
            ),
          ),
        ),
      )

      const addToProject = (found) => {
        if (asrReady === false) return
        const list = found ?? []
        if (list.some((it) => it.unresolved)) setNotice({ tone: 'error', text: t('hint.noHostPath') })
        const added = list.filter((it) => !it.unresolved).map((it) => it.path)
        if (!currentProject || added.length === 0) return
        const videos = [...new Set([...(currentProject.videos ?? []), ...added])]
        Promise.resolve(remote?.saveProject?.({ id: currentProject.id, videos }) ?? null)
          .then((res) => {
            if (!res?.project) return
            setCurrentProject(res.project)
            rememberProject(res.project)
            refreshProjects()
            setNotice({ tone: 'success', text: t('drop.added') })
          })
          .catch((err) => setNotice({ tone: 'error', text: err?.message || t('project.createFailed') }))
      }

      const detailPage = h('div', { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 } },
          h('button', {
            type: 'button',
            onClick: backHome,
            style: {
              appearance: 'none', border: 0, background: 'transparent', cursor: 'pointer',
              fontFamily: SANS, fontSize: 13, color: '#6b7280', padding: '6px 2px', flexShrink: 0,
            },
          }, '← ' + t('detail.back')),
          h('div', {
            style: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
          }, currentProject?.name || t('project.untitled')),
          sessionRun === true
            ? h('div', { style: { flexShrink: 0, fontSize: 12, fontWeight: 650, color: '#b45309' } }, t('run.running'))
            : sessionRun === false
              ? h('div', { style: { flexShrink: 0, fontSize: 12, fontWeight: 650, color: '#047857' } }, t('run.idle'))
              : null,
          h(Button, { onClick: jumpToSession }, t('session.open')),
          h(Button, { disabled: !subFile || embedding || bins?.ok === false, onClick: embedVideo }, embedding ? t('btn.embedding') : t('btn.embed')),
          h(Button, { primary: true, disabled: busy || sessionRun === true || downloading || bins?.ok === false, onClick: process }, (busy || sessionRun === true) ? t('btn.working') : t('btn.process')),
        ),
        h('div', { style: { ...card, padding: 12 } }, options),
        binBanner,
        notice ? h(Notice, { tone: notice.tone }, notice.text) : null,
        h('div', { style: { flex: 1, minHeight: 0, display: 'flex', gap: 12 } },
          h('section', {
            style: { ...card, flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 12, gap: 10, overflowY: 'auto' },
          },
            h('div', { style: { position: 'relative', width: '100%', aspectRatio: '1 / 1', flexShrink: 0, borderRadius: 12, overflow: 'hidden', background: '#0b0b0b' } },
              activeVideo
                ? h('video', {
                  ref: videoRef,
                  controls: true,
                  playsInline: true,
                  preload: 'auto',
                  onTimeUpdate: playerEvents.current.onTimeUpdate,
                  onSeeking: playerEvents.current.onSeeking,
                  onLoadedMetadata: playerEvents.current.onLoadedMetadata,
                  onCanPlay: playerEvents.current.onCanPlay,
                  onSeeked: playerEvents.current.onSeeked,
                  onError: playerEvents.current.onError,
                  onLoadedData: playerEvents.current.onLoadedData,
                  style: VIDEO_STYLE,
                })
                : h('div', { style: { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 } }, t('project.empty')),
              activeCue >= 0
                ? h('div', {
                  style: { position: 'absolute', left: '8%', right: '8%', bottom: 84, textAlign: 'center', pointerEvents: 'none' },
                }, h('span', {
                  style: {
                    display: 'inline-block', maxWidth: '100%', background: 'rgba(0,0,0,0.82)', color: cues[activeCue].color || '#ffffff',
                    borderRadius: 4, padding: '6px 12px', fontSize: 16, lineHeight: 1.45, whiteSpace: 'pre-wrap',
                  },
                }, richText(cues[activeCue].text)))
                : null,
              videoError
                ? h('div', {
                  style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#e5e7eb', fontSize: 13, background: 'rgba(0,0,0,0.55)' },
                }, t('player.unsupported'))
                : null,
            ),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, flex: '1 0 180px', minHeight: 180 } },
              h(DropZone, { quiet: true, hint: t('drop.add'), hint2: t('drop.add2'), items: [], t, onAdd: addToProject, onReject: () => setNotice({ tone: 'error', text: t('drop.videoOnly') }), onClear: () => {} }),
              savedVideos.length > 0
                ? h('div', { style: { flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 } },
                  savedVideos.map((p, i) => h('button', {
                    key: p,
                    type: 'button',
                    onClick: () => { pendingSeek.current = null; setVideoIndex(i); setPlayhead(0); setVideoError(false) },
                    style: {
                      appearance: 'none', cursor: 'pointer', border: 0, borderRadius: 10, padding: '12px 14px',
                      width: '100%', flexShrink: 0, textAlign: 'left', whiteSpace: 'normal', wordBreak: 'break-word',
                      fontFamily: SANS, fontSize: 14, lineHeight: 1.45, color: '#ffffff', background: CLIP[i % CLIP.length],
                      opacity: i === videoIndex ? 1 : 0.55,
                    },
                  }, fileName(p))),
                )
                : null,
            ),
          ),
          h('aside', {
            style: { ...card, width: 340, flexShrink: 0, minHeight: 0, display: 'flex', flexDirection: 'column' },
          },
            h('div', { style: { padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f3f4f6' } },
              h('div', { style: { fontSize: 14, fontWeight: 700, flex: 1 } }, t('cues.title')),
              h('div', { style: { fontSize: 12, color: '#6b7280' } }, cues.length ? String(cues.length) : ''),
              h('button', {
                type: 'button',
                onClick: () => {
                  const video = activeVideo
                  if (!video) return
                  Promise.resolve(remote?.subtitles?.({ video }) ?? null)
                    .then((res) => {
                      setCues(Array.isArray(res?.cues) ? res.cues : [])
                      setSubFile(res?.file || '')
                    })
                    .catch((err) => setNotice({ tone: 'error', text: err?.message || t('project.createFailed') }))
                },
                style: {
                  appearance: 'none', border: 0, background: 'transparent', cursor: 'pointer',
                  fontFamily: SANS, fontSize: 12, color: '#6b7280', padding: 0,
                },
              }, t('cues.reload')),
            ),
            subFile
              ? h('div', { style: { padding: '8px 16px 0', fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, fileName(subFile))
              : null,
            h('div', { style: { flex: 1, minHeight: 0, overflowY: 'auto' } },
              cues.length === 0
                ? h('div', { style: { padding: 16, fontSize: 13, lineHeight: 1.6, color: '#6b7280' } }, t('cues.empty'))
                : cues.map((cue, i) => h('button', {
                  key: cue.start + ':' + i,
                  id: 'pss-cue-' + i,
                  type: 'button',
                  className: 'pss-cue',
                  'aria-current': i === activeCue ? 'true' : undefined,
                  onClick: () => seek(cue.start),
                },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6b7280' } },
                    cue.color ? h('span', { style: { width: 8, height: 8, borderRadius: 99, background: cue.color, flexShrink: 0 } }) : null,
                    clock(cue.start) + '  ' + clock(cue.end),
                  ),
                  h('div', { style: { marginTop: 4, fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap' } }, richText(cue.text)),
                )),
            ),
          ),
        ),
      )

      useEffect(() => {
        if (activeCue < 0) return
        document.getElementById('pss-cue-' + activeCue)?.scrollIntoView({ block: 'nearest' })
      }, [activeCue])

      const keyGate = h('div', {
        style: { flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
      },
        h('div', {
          style: {
            width: 420, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 12,
            padding: 24, borderRadius: 16, background: '#1f1f1f', border: '1px solid #2a2a2a',
          },
        },
          h('div', { style: { fontSize: 22, fontWeight: 720, color: '#ffffff' } }, asrReady === false ? t('key.required') : t('key.checking')),
          asrReady === false
            ? h('div', { style: { fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.72)' } }, t('key.requiredHint'))
            : null,
          asrReady === false
            ? h('input', {
              type: 'password', value: configKey, autoFocus: true,
              onChange: (e) => setConfigKey(e.target.value), placeholder: 'sk-…', style: inputStyle,
            })
            : null,
          asrReady === false ? h('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.5)' } }, t('settings.asrNote')) : null,
          asrReady === false ? consoleLink('#c4b5fd') : null,
          notice ? h(Notice, { tone: notice.tone }, notice.text) : null,
          asrReady === false ? h(Button, { primary: true, onClick: saveConfig }, t('settings.save')) : null,
        ),
      )

      return h('div', {
        className: onHome ? 'pss-home' : undefined,
        style: {
          ...LIGHT_VARS,
          height: '100%', minHeight: '100%', minWidth: 0, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
          color: onHome ? '#ffffff' : '#111827', fontFamily: SANS,
          background: onHome ? HOME_BLACK : '#f3f4f6', padding: 16, gap: 12,
        },
      },
        h('style', null, `
@import url("https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400..700&display=swap");
.pss-home::before, .pss-home::after { content: ''; position: absolute; inset: 0; pointer-events: none; }
.pss-home::before { z-index: 0; background: radial-gradient(90% 70% at 82% 38%, rgba(255,236,214,0.08), transparent 46%), radial-gradient(80% 60% at 0% 100%, rgba(0,0,0,0.55), transparent 50%), radial-gradient(120% 90% at 50% 40%, transparent 40%, rgba(0,0,0,0.55) 100%); }
.pss-home::after { z-index: 2; opacity: 0.16; mix-blend-mode: overlay; background-image: url("${HOME_GRAIN}"); background-size: 180px 180px; }
.pss-home-body { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.pss-stage { position: relative; flex: 1; min-height: 0; min-width: 0; }
.pss-hero { position: absolute; inset: 0; z-index: 0; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(260px, 0.95fr); gap: 28px; align-items: center; padding: 8px 8px 4px; min-width: 0; overflow: hidden; pointer-events: none; color: #fff; background: transparent; }
.pss-home-split { position: absolute; inset: 0; z-index: 1; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(260px, 0.95fr); gap: 28px; align-items: stretch; padding: 8px 8px 4px; min-width: 0; }
.pss-hero-left { position: absolute; inset: 0; z-index: 0; pointer-events: none; -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 5%, #000 40%, transparent 62%), linear-gradient(180deg, transparent 0%, #000 7%, #000 90%, transparent 100%); -webkit-mask-composite: source-in; mask-image: linear-gradient(90deg, transparent 0%, #000 5%, #000 40%, transparent 62%), linear-gradient(180deg, transparent 0%, #000 7%, #000 90%, transparent 100%); mask-composite: intersect; }
.pss-hero-left-img { inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 46%; opacity: 0.88; }
.pss-hero-copy { position: relative; z-index: 4; display: flex; flex-direction: column; min-width: 0; min-height: 0; padding-top: 8px; }
.pss-hero-title { margin-top: 12px; padding-right: 40px; font-family: Newsreader, "Songti SC", "PingFang SC", serif; font-size: 46px; line-height: 1.02; font-weight: 740; letter-spacing: -0.04em; }
.pss-hero-slug { margin-top: 10px; font-family: Newsreader, "Songti SC", "PingFang SC", serif; font-size: 13px; line-height: 1.4; letter-spacing: 0.01em; color: rgba(255,255,255,0.62); user-select: text; }
.pss-gear { appearance: none; cursor: pointer; width: 32px; height: 32px; border: 0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; padding: 0; background: transparent; color: rgba(255,255,255,0.62); }
.pss-gear:hover, .pss-gear[aria-expanded="true"] { color: #fff; background: rgba(255,255,255,0.1); }
.pss-gear:disabled { opacity: 0.4; cursor: not-allowed; }
.pss-hero-sub { margin: 8px 0 18px; max-width: 420px; font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.72); }
.pss-drop { background: rgba(255,255,255,0.035); box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 40px rgba(0,0,0,0.45); -webkit-backdrop-filter: blur(0px) saturate(1); backdrop-filter: blur(0px) saturate(1); transition: background 160ms ease, box-shadow 160ms ease, backdrop-filter 160ms ease, -webkit-backdrop-filter 160ms ease; }
.pss-drop:hover, .pss-drop-on { background: rgba(255,255,255,0.16); box-shadow: inset 0 1px 0 rgba(255,255,255,0.34), 0 18px 40px rgba(0,0,0,0.28); -webkit-backdrop-filter: blur(18px) saturate(1.5); backdrop-filter: blur(18px) saturate(1.5); }
.pss-drop::before, .pss-drop::after { content: ''; position: absolute; pointer-events: none; border: 1px dashed rgba(255,255,255,0.55); }
.pss-drop::before { inset: 0; border-radius: 16px; }
.pss-drop::after { inset: 5px; border-radius: 12px; border-color: rgba(255,255,255,0.28); }
.pss-drop:hover::before, .pss-drop:hover::after, .pss-drop-on::before, .pss-drop-on::after { border-color: rgba(255,255,255,0.82); }
.pss-hero-art { position: relative; align-self: stretch; height: auto; min-height: 420px; min-width: 0; }
.pss-shot { position: absolute; object-fit: cover; }
.pss-shot-b { right: 8px; top: 18px; z-index: 3; width: 42%; height: 148px; border-radius: 14px; border: 2px solid rgba(255,255,255,0.55); box-shadow: 0 22px 40px rgba(0,0,0,0.55); transform: rotate(3deg); object-position: 32% 42%; }
.pss-shot-c { right: 22px; bottom: 16px; z-index: 3; width: 38%; height: 136px; border-radius: 14px; border: 2px solid rgba(255,255,255,0.55); box-shadow: 0 22px 40px rgba(0,0,0,0.55); transform: rotate(-3deg); object-position: 50% 58%; }
@media (max-width: 860px) { .pss-hero, .pss-home-split { grid-template-columns: 1fr; } .pss-hero-left { display: none; } .pss-hero-art { height: 220px; min-height: 0; align-self: start; } .pss-hero-title { font-size: 36px; } .pss-projects-col { padding-top: 0; } }
.pss-projects-col { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: 0; padding-top: 40px; }
.pss-projects { display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: 0; overflow-x: hidden; overflow-y: auto; }
.pss-projects-title { font-size: 13px; font-weight: 700; letter-spacing: 0.08em; color: rgba(255,255,255,0.42); }
.pss-project-empty { font-size: 13px; color: rgba(255,255,255,0.45); padding: 8px 4px; }
.pss-project { position: relative; display: flex; align-items: center; gap: 8px; min-width: 0; padding: 6px 8px 6px 6px; background: transparent; border: 1px solid transparent; border-radius: 16px; box-shadow: none; -webkit-backdrop-filter: blur(0px) saturate(1); backdrop-filter: blur(0px) saturate(1); transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, backdrop-filter 160ms ease, -webkit-backdrop-filter 160ms ease; }
.pss-project:hover { background: rgba(255,255,255,0.16); border-color: rgba(255,255,255,0.28); box-shadow: inset 0 1px 0 rgba(255,255,255,0.34), 0 12px 28px rgba(0,0,0,0.28); -webkit-backdrop-filter: blur(18px) saturate(1.5); backdrop-filter: blur(18px) saturate(1.5); }
.pss-project-open { flex: 1; min-width: 0; display: flex; align-items: center; gap: 14px; border: 0; background: transparent; text-align: left; font-family: inherit; cursor: pointer; color: #fff; padding: 10px 8px; }
.pss-project-mark { width: 4px; align-self: stretch; border-radius: 99px; flex-shrink: 0; }
.pss-project-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.pss-project-name { font-family: Newsreader, "Songti SC", "PingFang SC", serif; font-size: 15px; font-weight: 650; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pss-project-meta { font-size: 12px; color: #9ca3af; }
.pss-del { appearance: none; cursor: pointer; position: absolute; right: 12px; top: 50%; transform: translateY(-50%); border: 0; border-radius: 999px; background: #e11d48; color: #ffffff; font-family: inherit; font-size: 12px; font-weight: 650; line-height: 1; padding: 7px 12px; opacity: 0; pointer-events: none; }
.pss-project:hover .pss-del, .pss-project:focus-within .pss-del { opacity: 1; pointer-events: auto; }
.pss-project:hover .pss-project-open, .pss-project:focus-within .pss-project-open { padding-right: 72px; }
.pss-del:hover { background: #be123c; }
.pss-cue { appearance: none; cursor: pointer; text-align: left; width: 100%; border: 0; border-bottom: 1px solid #f3f4f6; border-left: 3px solid transparent; background: transparent; padding: 12px 16px; font-family: inherit; color: inherit; }
.pss-cue:hover { background: #f8fafc; }
.pss-cue[aria-current="true"] { background: #f0fdfa; border-left-color: #14b8a6; }
.pss-spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #e9d5ff; border-top-color: #a855f7; animation: pss-spin .7s linear infinite; }
@keyframes pss-spin { to { transform: rotate(360deg); } }
`),
        asrReady === false ? keyGate : (onHome ? homePage : detailPage),
        onHome && asrReady !== false ? h('div', { style: { position: 'absolute', top: 14, right: 14, zIndex: 4 } },
          h('button', {
            type: 'button',
            className: 'pss-gear',
            title: t('settings.title'),
            'aria-label': t('settings.title'),
            'aria-expanded': showSettings ? 'true' : 'false',
            disabled: busy,
            onClick: () => setShowSettings((v) => !v),
          }, h(GearMark)),
          settingsPanel,
        ) : null,
        busy ? h('div', {
          style: {
            position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: onHome ? 'rgba(8,8,8,0.72)' : 'rgba(243,244,246,0.72)',
          },
        },
          h('div', {
            style: {
              ...card,
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px',
              boxShadow: '0 12px 32px rgba(17,24,39,0.12)',
            },
          },
            h('div', { className: 'pss-spin', 'aria-hidden': true }),
            h('div', { style: { fontSize: 13 } }, t('hint.working')),
          ),
        ) : null,
      )
    }
    return {
      inject: ['slots', 'locale', 'uiSession', 'sessions', 'workspaces', 'uiWorkspace', 'connection'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'powerful-subtitle-studio: dictionaries')
        const t = ctx.locale.bind(NS)

        const workspaceIdOf = (workspace) => workspace?.workspaceId || workspace?.id || ''

        const listWorkspaces = () => {
          const snap = ctx.workspaces?.list?.getSnapshot?.() ?? {}
          const items = snap.items ?? snap.workspaces ?? []
          return Array.isArray(items) ? items : []
        }

        // 桌面版的目录选择器不能列目录，所以不新建文件夹。
        // 有「字幕工作室」就用它，否则用已经打开的任意工作区来建会话。
        const ensureSubtitleWorkspace = async () => {
          const items = listWorkspaces()
          const dedicated = items.find((w) => w.title === '字幕工作室' || String(w.path || '').endsWith('/.powerful-subtitle-studio'))
          const usable = dedicated ?? items.find((w) => workspaceIdOf(w))
          const id = workspaceIdOf(usable)
          if (id) return id
          throw new Error('还没有工作区。先在 DeepSeek Harness 里打开一个文件夹，然后再点一键处理。')
        }

        const workspaceIdFrom = (result) => {
          if (typeof result === 'string') return result
          const ws = result?.workspace ?? result
          return ws?.workspaceId || ws?.id || ''
        }

        // 把视频所在目录登记成工作区。create 对已有目录是幂等的，不会另建一份。
        const workspaceForDirectory = async (dir) => {
          if (!dir || typeof ctx.workspaces?.create !== 'function') return ''
          return workspaceIdFrom(await ctx.workspaces.create({ path: dir }))
        }

        // 每个项目单独 sessions.create。工作区优先用视频目录，这样字幕写在视频旁边仍在会话工作区内。
        const createNamedSession = async (name, directory) => {
          let wsId = ''
          if (directory) {
            try { wsId = await workspaceForDirectory(directory) } catch { wsId = '' }
          }
          if (!wsId) wsId = await ensureSubtitleWorkspace()
          if (!wsId) throw new Error('没有可用的工作区，会话建不出来')
          const sid = await ctx.sessions.create({ workspaceId: wsId })
          if (name && typeof ctx.sessions.using === 'function') {
            try {
              await ctx.sessions.using(sid, { source: 'subtitleStudio' }, (reference) => reference.binding.session.rename(String(name)))
            } catch { /* 标题失败不阻止会话本身 */ }
          }
          return sid
        }

        const openSession = (sessionId) => {
          if (!sessionId) throw new Error(t('hint.noSession'))
          if (typeof ctx.uiWorkspace?.openSession === 'function') {
            ctx.uiWorkspace.openSession(sessionId)
            return
          }
          ctx.sessions.open(sessionId)
        }

        const promptSession = async (session, text) => {
          if (typeof session?.prompt !== 'function') throw new Error('这条会话现在不能接收消息')
          const result = await session.prompt([{ type: 'text', text }], 'queue')
          if (result && result.ok === false) throw new Error(result.error?.message || result.error?.code || '发送失败')
        }

        const sendToSession = async (sessionId, text) => {
          if (!sessionId) throw new Error('还没有会话编号')
          if (typeof ctx.sessions.using !== 'function') throw new Error('当前桌面版不能把消息写入会话')
          return ctx.sessions.using(sessionId, { source: 'subtitleStudio' }, (reference) => {
            return promptSession(reference.binding.session, text)
          })
        }

        const rpc = async (endpoint, payload) => {
          const attempts = [
            ['/api', 'subtitle/' + endpoint],
            ['/subtitle', endpoint],
          ]
          let last
          for (const [channel, method] of attempts) {
            try {
              const result = await ctx.connection.rpc.call(channel, method, payload ?? {})
              if (!result?.ok) throw new Error(result?.error?.message || t('project.createFailed'))
              return result.value
            } catch (err) {
              last = err
              const msg = err?.message || String(err)
              if (!/HTTP (404|405)/.test(msg)) break
            }
          }
          const msg = last?.message || String(last)
          if (/HTTP (404|405|503)/.test(msg) || /Failed to fetch|NetworkError/.test(msg)) {
            throw new Error(t('project.hostStale'))
          }
          throw last
        }

        const remote = {
          saveConfig: (opts) => rpc('config/save', opts).catch(() => null),
          configStatus: () => rpc('config/status', {}),
          preprocess: (paths) => rpc('preprocess', { paths }),
          listProjects: () => rpc('projects/list', {}).catch(() => null),
          saveProject: (opts) => rpc('projects/save', opts),
          deleteProject: (opts) => rpc('projects/delete', opts),
          binaryStatus: () => rpc('binaries/status', {}),
          downloadBinaries: () => rpc('binaries/download', {}),
          subtitles: (opts) => rpc('subtitles', opts),
          embed: (opts) => rpc('embed', opts),
          mediaTicket: () => rpc('media/ticket', {}),
        }

        const Page = (props) => h(SubtitleStudioPage, {
          createNamedSession, openSession, sendToSession, remote, sessionList: ctx.sessions?.list, t: props.t ?? t,
        })

        ctx.slots.inject('main', function* () {
          yield ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, Page)
        })
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 5,
          label: () => t('panel'),
          locale: NS,
        }, Icon))
      },
    }
  },
})
