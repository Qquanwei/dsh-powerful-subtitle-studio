# 字幕工作室

DeepSeek Harness 插件。把一集视频做成字幕：抽出音频，用阿里云百炼 paraformer-v2 转写，由当前会话里的模型翻译，再写成 SRT、内挂软字幕或烧录视频。同一项目的后续剧集会发到同一条会话。

[![字幕工作室演示视频](https://img.youtube.com/vi/vZGG6eqynzw/maxresdefault.jpg)](https://www.youtube.com/watch?v=vZGG6eqynzw)

## 特色功能

- **多人分离。** 转写时区分说话人。不同的人各成一条字幕；不止一个人时，字幕用不同颜色标出。一句话里混进两个人，按词级时间切开，时间仍落在原来的起止之内。
- **人声分离。** 背景音乐盖过人声、拿不到可用的词级时间时，按语音频段找出人声区间，再逐段转写。
- **重点加粗。** 一句里真正的重点写成 `<b>重点</b>`。预览、字幕列表和 SRT 都会保留加粗；内挂软字幕可能被播放器丢掉。
- **联网核对信源。** 人名、作品名和专有名词拿不准时，由当前会话联网核对通行译法，再写进字幕。
- **抽帧核验音画。** 默认在人名或听写不确定时截几帧，由会话里的模型自己看画面上的人和字。也可以改成逐句核对，或关掉。
- **多集名词一致。** 同一项目的后续剧集发到同一条会话。人名、地名和专有名词沿用已经确定的译法，不另起译名。

## 安装

需要已经装好 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 桌面版 0.2。

在桌面版里打开「浏览插件」，点「添加插件」，填入 `powerful-subtitle-studio` 即可安装。

也可以用命令：

```sh
dsh plugin --profile desktop add powerful-subtitle-studio
```

从本地目录安装：

```sh
dsh plugin --profile desktop add .
```

装完后完全退出并重新打开 DeepSeek Harness。左侧会出现「字幕工作室」。

## 第一次使用

1. 打开「字幕工作室」，在设置里填入百炼 API Key（DashScope）。也可以事先设置环境变量 `DASHSCOPE_API_KEY`。
2. 如果面板提示缺少 ffmpeg，点「下载依赖」。系统里已经有 ffmpeg 和 ffprobe 时会直接用。
3. 把一集视频拖进首页。插件会建一个项目并打开详情。
4. 点「一键处理」。只处理当前这一集。
5. 处理结束后，画面右侧出现字幕。点一句会跳到对应时间。

再拖一集到详情页，会加进同一个项目。选中它再点「一键处理」。

## 你需要准备的

- DeepSeek Harness 桌面版，以及一个能看图的会话模型（抽帧核验时用）。
- 百炼 API Key。语音识别固定使用 paraformer-v2，Key 只存在本机的 `~/.powerful-subtitle-studio/config.json`，不会写进仓库。
- ffmpeg 和 ffprobe。没有的话，面板会从 npmmirror 下载一份放到 `~/.powerful-subtitle-studio/vendor`。下载到的程序是 GPL-3.0-or-later，插件源码是 MIT。

## 插件做了什么

面板负责项目、抽音频、播放和字幕预览。会话里只留三个工具：

| 工具 | 作用 |
|---|---|
| `subtitle_transcribe` | 把音频转成不超过 7 秒的字幕 |
| `subtitle_frames` | 按时间点截图，交给当前模型自己看 |
| `subtitle_compose` | 按序号把译文贴回原来的时间轴，写成 SRT |
| `subtitle_render` | 写出 `视频名.语言.srt`、内挂软字幕，或烧录进画面。写到会话工作区外时会在结果里提示 |

翻译不另调接口，由这条会话自己完成。

## 许可

MIT。烧录会重新编码视频；内挂软字幕不重编码。音频会上传到阿里云百炼。
