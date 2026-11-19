# powerful-subtitle-studio

一个 DeepSeek Harness（DSH）插件：把视频批量变成**中文字幕**，并保证**同一部番剧的人物、专有名词在所有集里译名一致**，适合多集番剧（anime）的连续翻译。

## 核心能力

- **项目化管理（多集翻译）**：每个项目 = 一部番 / 一季。拖入视频自动建项目（标题自动生成），点进项目后可继续拖第 2、3 集，所有集共享同一术语库，并且**消息发到同一个会话**，翻译上下文连贯、译名一致。
- **无字幕 → 语音识别再翻译**：ffmpeg 抽音频，走百炼（DashScope）**SenseVoice 文件转写**，自带句子级时间戳 + 抗 BGM；然后由主对话模型直接翻译。
- **有字幕 → 直接翻译**：视频内嵌或外挂 SRT/ASS/VTT 时，直接翻译。
- **图片识别辅助**：按时间点抽帧，用视觉模型识别「谁在说话 / 画面文字」，修正听写、提升翻译精度。
- **字幕写回视频**：导出 SRT，或内挂软字幕（MKV/MP4 无损），或硬烧录进画面（MP4）。
- **界面直连 + 智能体编排**：面板上的保存配置 / 列项目 / 预处理都是 HTTP 接口直连（不经过对话）；只有「预处理产物 → 转写 → 翻译 → 出字幕」交给智能体用工具自主编排。

## 安装

桌面版 / Web：**插件 → 添加插件 → 本地目录**，选择本目录；或命令行：

```sh
dsh plugin --profile web add /绝对路径/powerful-subtitle-studio
```

安装后启用，并**刷新页面**。

## 配置（只需一个 key）

在左侧「字幕工作室」面板 → 设置里填入：

- **百炼 API Key（DashScope）**：`DASHSCOPE_API_KEY`（用于语音识别 SenseVoice）。翻译与视觉走 DSH 自带模型，**无需额外 key**。

也可以直接改 `~/.powerful-subtitle-studio/config.json`（API Key 支持 `${ENV_VAR}` 引用环境变量）：

```jsonc
{
  "asr": {
    "baseUrl": "https://dashscope.aliyuncs.com",
    "apiKey": "${DASHSCOPE_API_KEY}",
    "model": "sensevoice-v1",
    "language": "ja"
  }
}
```

## 依赖

- **ffmpeg / ffprobe** 必须在 `PATH` 里（抽音频、抽帧、烧录/内挂字幕）。
- 语音识别：阿里云百炼 SenseVoice 文件转写（异步：上传 → 提交 → 轮询 → 下载，返回句子时间戳）。
- 翻译：主对话模型直接翻译（无需翻译 API）。
- 视觉：DSH 已配置的多模态模型（自动探测）。

## 工具

| 工具 | 作用 |
|---|---|
| `subtitle_project_init` | 初始化 / 返回项目（含共享术语库） |
| `subtitle_glossary` | 术语库增删改查 / 导入，保证译名一致 |
| `subtitle_scan` | 扫描视频，判断走翻译还是语音识别 |
| `subtitle_preprocess` | 预处理：检查配置 + 为每个无字幕视频抽音频 |
| `subtitle_transcribe` | 语音转文字（百炼 SenseVoice，带时间轴） |
| `subtitle_visual_check` | 按时间点抽帧 + 视觉模型分析 |
| `subtitle_render` | 把字幕写回视频（SRT / 软字幕 / 硬烧录） |
| `subtitle_status` | 查看项目状态、最近运行记录 |
| `subtitle_check` | 提交前体检：ffmpeg / key / 模型 |
| `subtitle_config` | 查看 / 保存配置 |
| `subtitle_models` | 列出 DSH 可用模型 |

## 典型流程

1. 打开「字幕工作室」→ 拖入视频 / 文件夹，自动建项目并进入详情（或手动新建项目）。
2. 点「一键处理」：面板直连预处理（抽音频 + 检查配置），再把音频路径发给项目会话。
3. 智能体依次调用：`subtitle_transcribe`（转写）→ 自己翻译（套术语库）→ `subtitle_render`（出 SRT）。
4. 返回项目列表，点进同一项目，拖第 2 集继续 —— 消息发到**同一会话**，译名保持一致。

## 注意事项

- **成本 / 隐私**：语音识别把音频发到阿里云百炼；视觉把单帧图片发到 DSH 视觉模型；翻译文本发给主对话模型。请核对各服务隐私政策。
- **烧录会重新编码视频**，画质有损且字幕不可关；内挂软字幕（`mkv-soft`/`mp4-soft`）用 `-c copy` 无损、可逆。
- 老番 BGM 嘈杂时，SenseVoice 内建 VAD 抗噪，通常无需单独做「人声分离」。

## 许可

MIT。
