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

    const zh = {
      'panel': '字幕工作室',
      'title': '字幕工作台',
      'subtitle': '拖入视频会建立项目',
      'drop.hint': '把视频文件或文件夹拖到这里',
      'drop.hint2': '支持一次拖入多个文件，或整个文件夹',
      'drop.add': '把下一集拖到这里',
      'drop.add2': '会加进当前项目',
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
      'drop.hint': 'Drop video files or folders here',
      'drop.hint2': 'Drop several files, or a whole folder',
      'drop.add': 'Drop the next episode here',
      'drop.add2': 'Adds it to this project',
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
      cafe: 'data:image/jpeg;base64,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',
      train: 'data:image/jpeg;base64,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',
      desk: 'data:image/jpeg;base64,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',
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

    function collectDrop(e) {
      e.preventDefault()
      const dt = e.dataTransfer
      if (!dt) return []
      const found = []
      for (const item of dt.items) {
        if (item.kind !== 'file') continue
        const file = item.getAsFile()
        if (file === null) continue
        const isDir = typeof item.webkitGetAsEntry === 'function' && item.webkitGetAsEntry()?.isDirectory === true
        const bridge = (globalThis).__DSH_HOST_PATHS__
        const hostPath = bridge?.pathFor(file) ?? ''
        if (hostPath) found.push({ path: hostPath, isDir })
        else found.push({ path: file.name, isDir, unresolved: true })
      }
      return found
    }

    function DropZone({ items, onAdd, onClear, t, fill, compact, quiet, hint, hint2 }) {
      const [dragging, setDragging] = useState(false)
      const title = dragging ? t('drop.dragging') : (hint || t('drop.hint'))
      const sub = hint2 || t('drop.hint2')
      return h('div', { style: fill ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : null },
        h('div', {
          onDragOver: (e) => { e.preventDefault(); setDragging(true) },
          onDragLeave: () => setDragging(false),
          onDrop: (e) => { setDragging(false); onAdd(collectDrop(e)) },
          style: {
            flex: fill ? 1 : undefined,
            minHeight: quiet ? 64 : (compact ? 96 : (fill ? 220 : undefined)),
            borderRadius: quiet ? 12 : (compact ? 16 : 14),
            padding: quiet ? '10px 12px' : (compact ? '16px 14px' : '22px 16px'),
            textAlign: 'center',
            background: dragging
              ? (compact ? 'rgba(255,255,255,0.14)' : '#f5f3ff')
              : (compact ? 'rgba(255,255,255,0.08)' : (quiet ? '#f8fafc' : '#f8fafc')),
            border: (quiet ? '1px dashed ' : '1px solid ') + (dragging ? (compact ? 'rgba(255,255,255,0.42)' : '#a78bfa') : (compact ? 'rgba(255,255,255,0.16)' : (quiet ? '#d1d5db' : '#e5e7eb'))),
            boxShadow: compact ? 'none' : undefined,
            cursor: 'default',
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
      const [bilingual, setBilingual] = useState(false)
      const [renderMode, setRenderMode] = useState('srt')
      const [notice, setNotice] = useState(null)
      const [busy, setBusy] = useState(false)
      const [embedding, setEmbedding] = useState(false)
      const [configKey, setConfigKey] = useState('')
      const [showSettings, setShowSettings] = useState(false)
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
        if (!found || found.length === 0) return
        const resolved = found.filter((it) => !it.unresolved)
        if (resolved.length === 0) { setNotice({ tone: 'error', text: t('hint.noHostPath') }); return }
        const name = deriveProjectName(resolved) || t('project.untitled')
        setNotice(null)
        let sessionId = ''
        try { sessionId = await createNamedSession(name) } catch { /* 会话可以进详情后再建 */ }
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
          if (!sid) sid = await remember(await createNamedSession(currentProject?.name || t('project.untitled')))
          return await deliver(sid)
        } catch (err) {
          const msg = err?.message || String(err)
          if (!/unknown session/.test(msg)) throw err
          sid = await remember(await createNamedSession(currentProject?.name || t('project.untitled')))
          return deliver(sid)
        }
      }

      const jumpToSession = async () => {
        setNotice(null)
        try {
          let sid = currentProject?.sessionId
          if (!sid) {
            sid = await createNamedSession(currentProject?.name || t('project.untitled'))
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
            `1) 对这个音频只调用一次 subtitle_transcribe（不要传 language，源语言自动识别）。返回的 cues 已经按词级时间戳切成短字幕，不同 speaker 不要并成一条。不要检查静音点，不要把音频切成更短的片段再转写。\n` +
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
            if (res && res.saved !== false) { setConfigKey(''); setNotice({ tone: 'success', text: t('settings.saved') }) }
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

      const homePage = h('div', {
        style: { flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 },
      },
        h('section', { className: 'pss-hero' },
          h('div', { className: 'pss-hero-copy' },
            h('div', { className: 'pss-hero-title' }, t('title')),
            h('div', { className: 'pss-hero-sub' }, t('subtitle')),
            h(DropZone, { compact: true, items: [], t, onAdd: createProjectFromDrop, onClear: () => {} }),
          ),
          h('div', { className: 'pss-hero-art', 'aria-hidden': 'true' },
            h('div', { className: 'pss-shot-main' },
              h('img', { src: HERO.cafe, alt: '', className: 'pss-shot pss-shot-a' }),
              h('div', { className: 'pss-shot-fade' }),
            ),
            h('img', { src: HERO.train, alt: '', className: 'pss-shot pss-shot-b' }),
            h('img', { src: HERO.desk, alt: '', className: 'pss-shot pss-shot-c' }),
          ),
        ),
        binBanner,
        notice ? h(Notice, { tone: notice.tone }, notice.text) : null,
        unresolvedCount > 0 ? h(Notice, { tone: 'error' }, t('hint.noHostPath')) : null,
        projects.length > 0
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, minHeight: 0, flexShrink: 0 } },
            h('div', { style: { fontSize: 13, fontWeight: 700 } }, t('project.list')),
            h('div', { style: { overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 } },
              projects.map((p) => h('div', {
                key: p.id,
                style: {
                  display: 'flex', alignItems: 'center', minWidth: 0, padding: '4px 4px 4px 12px',
                  background: '#1f1f1f', border: '1px solid #2a2a2a', borderRadius: 12,
                },
              },
                h('button', {
                  type: 'button',
                  onClick: () => openProject(p),
                  style: {
                    flex: 1, minWidth: 0, border: 0, background: 'transparent', textAlign: 'left',
                    fontFamily: SANS, cursor: 'pointer', padding: '8px 0', color: '#ffffff',
                  },
                },
                  h('div', { style: { fontSize: 14, fontWeight: 650 } }, p.name || p.id),
                  h('div', { style: { marginTop: 2, fontSize: 12, color: '#6b7280' } }, `${(p.videos ?? []).length} ${t('project.episodes')}`),
                ),
                h('button', {
                  type: 'button',
                  className: 'pss-del',
                  title: t('project.delete'),
                  'aria-label': t('project.delete'),
                  disabled: deleting,
                  onClick: () => removeProject(p),
                }, '×'),
              )),
            ),
          )
          : null,
      )

      const addToProject = (found) => {
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
              h(DropZone, { quiet: true, hint: t('drop.add'), hint2: t('drop.add2'), items: [], t, onAdd: addToProject, onClear: () => {} }),
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

      return h('div', {
        style: {
          ...LIGHT_VARS,
          height: '100%', minHeight: '100%', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
          color: onHome ? '#ffffff' : '#111827', fontFamily: SANS,
          background: onHome ? '#141414' : '#f3f4f6', padding: 16, gap: 12,
        },
      },
        h('style', null, `
.pss-hero { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(260px, 0.95fr); gap: 28px; align-items: center; padding: 8px 8px 4px; min-height: 420px; overflow: visible; color: #fff; background: transparent; }
.pss-hero-copy { position: relative; z-index: 4; }
.pss-hero-title { margin-top: 12px; padding-right: 40px; font-size: 46px; line-height: 1.02; font-weight: 740; letter-spacing: -0.04em; }
.pss-gear { appearance: none; cursor: pointer; width: 32px; height: 32px; border: 0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; padding: 0; background: transparent; color: rgba(255,255,255,0.62); }
.pss-gear:hover, .pss-gear[aria-expanded="true"] { color: #fff; background: rgba(255,255,255,0.1); }
.pss-gear:disabled { opacity: 0.4; cursor: not-allowed; }
.pss-hero-sub { margin: 12px 0 18px; max-width: 420px; font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.72); }
.pss-hero-art { position: relative; height: 360px; }
.pss-shot { position: absolute; object-fit: cover; }
.pss-shot-main { position: absolute; left: -12%; top: -6%; width: 124%; height: 118%; z-index: 1; }
.pss-shot-a { inset: 0; width: 100%; height: 100%; object-position: 64% 40%; }
.pss-shot-fade { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, #141414 0%, rgba(20,20,20,0.88) 14%, rgba(20,20,20,0.2) 34%, rgba(20,20,20,0) 48%, rgba(20,20,20,0) 64%, rgba(20,20,20,0.72) 86%, #141414 100%), linear-gradient(180deg, #141414 0%, rgba(20,20,20,0) 14%, rgba(20,20,20,0) 48%, rgba(20,20,20,0.78) 76%, #141414 100%); }
.pss-shot-b { right: 8px; top: 18px; z-index: 3; width: 42%; height: 118px; border-radius: 14px; border: 3px solid rgba(255,255,255,0.92); box-shadow: 0 16px 32px rgba(0,0,0,0.45); transform: rotate(3deg); }
.pss-shot-c { right: 22px; bottom: 16px; z-index: 3; width: 38%; height: 108px; border-radius: 14px; border: 3px solid rgba(255,255,255,0.92); box-shadow: 0 16px 32px rgba(0,0,0,0.45); transform: rotate(-3deg); }
@media (max-width: 860px) { .pss-hero { grid-template-columns: 1fr; min-height: 0; } .pss-hero-art { height: 280px; } .pss-hero-title { font-size: 36px; } }
.pss-del { appearance: none; cursor: pointer; flex-shrink: 0; align-self: center; margin-right: 4px; border: 0; border-radius: 8px; background: transparent; color: #9ca3af; font-family: inherit; font-size: 14px; line-height: 1; padding: 6px 8px; }
.pss-del:hover { color: #be123c; background: #fff1f2; }
.pss-cue { appearance: none; cursor: pointer; text-align: left; width: 100%; border: 0; border-bottom: 1px solid #f3f4f6; border-left: 3px solid transparent; background: transparent; padding: 12px 16px; font-family: inherit; color: inherit; }
.pss-cue:hover { background: #f8fafc; }
.pss-cue[aria-current="true"] { background: #f0fdfa; border-left-color: #14b8a6; }
.pss-spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #e9d5ff; border-top-color: #a855f7; animation: pss-spin .7s linear infinite; }
@keyframes pss-spin { to { transform: rotate(360deg); } }
`),
        onHome ? homePage : detailPage,
        onHome ? h('div', { style: { position: 'absolute', top: 14, right: 14, zIndex: 4 } },
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
            background: onHome ? 'rgba(20,20,20,0.72)' : 'rgba(243,244,246,0.72)',
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

        // 每个项目单独 sessions.create。connectWorkspace 会复用工作区里那条空白会话，
        // 多个项目会写进同一条对话，会话列表里也对不上项目。
        const createNamedSession = async (name) => {
          const wsId = await ensureSubtitleWorkspace()
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
