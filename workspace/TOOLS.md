# TOOLS.md - 能力速查与工具指南

## 意图→工具映射（核心速查表）

| 用户意图 | 正确工具 | 备注 |
|----------|----------|------|
| 发文件给我 | `message send` + `filePath` | 直接发文件附件 |
| 语音转文字 | `curl zhipu API, model=glm-asr` | 先ffmpeg转wav再调API |
| 发语音回复 | `bash scripts/feishu-voice-reply.sh "文本" "ou_xxx"` | GLM-TTS→opus→飞书语音气泡 |
| 发飞书消息 | `message send` + `target` | target=用户open_id |
| 读飞书文档 | `feishu_doc read` | 传doc_token |
| 写飞书文档 | **委派子Agent** → `feishu_doc write` | main禁止直接写 |
| 搜索 | `web_search`（Brave）或 `tavily-search` | tavily有API key可用 |
| 网页抓取 | `web_fetch` | URL→markdown |
| 看图/OCR | 智谱 `glm-4v` / `glm-ocr` | skills/glm-4v/, skills/glm-ocr/ |
| 生成图片 | 智谱 `glm-image` / `cogview` | skills/glm-image/ |
| 生成视频 | 智谱 `glm-video` / `cogvideo` | skills/glm-video/ |
| 派任务 | `sessions_spawn` + `agentId` | 必须传agentId，19个白名单 |
| 查子Agent状态 | `subagents list` | 看active和recent |
| 搜记忆 | `memory_search` | 搜历史对话 |
| 写记忆 | `memory_write_public` | 跨Agent可见 |
| 健康检查 | 按 `HEARTBEAT.md` 执行 | 派scout做 |
| 读多维表格 | `feishu_bitable_list_records` | 先get_meta拿app_token |
| 格式转换 | `pandoc` / `ffmpeg` | 文档用pandoc，音视频用ffmpeg |

## 多模态能力（智谱API）

| 能力 | 模型 | 输入 |
|------|------|------|
| 语音识别 ASR | glm-asr | audio |
| 语音合成 TTS | glm-tts | text |
| OCR文字识别 | glm-ocr | image/pdf |
| 图片理解 | glm-4v | image |
| 视频理解 | glm-4v | video |
| 图片生成 | glm-image | text |
| 视频生成 | glm-video | text/image |

## 实战经验（踩坑记录）

### 飞书通道特性
- ✅ 支持streaming和block streaming
- ❌ 不支持inline buttons
- 避免构建含交互按钮的卡片消息

### TTS语音回复
- 一键调用：`bash scripts/feishu-voice-reply.sh "文本" "ou_xxx"`
- 音色：douji（固定）
- 触发条件：用户发语音+短回复时自动用语音

### Agent并发
- maxConcurrent = 16
- 每个agent有boom fallback

### 🚨 绝对禁令
- **禁止** `openclaw doctor --fix` — 100%改崩openclaw.json导致变砖
- 只允许 `openclaw doctor`（纯只读验证）
