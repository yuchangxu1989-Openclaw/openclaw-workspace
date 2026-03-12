# 系统能力锚点 - 根治遗忘
# 自动生成 — 由 isc-capability-anchor-sync v3 全量扫描生成

> **生成时间**: 2026/3/12 19:00:06
> **技能总数**: 71 | **pip包**: 29 | **npm全局**: 9 | **workspace工具**: 1 | **系统CLI**: 17
> **ISC路由**: 6 | **能力总计**: 127

## 🟡 智谱多模态能力矩阵（ISC 规则自动生成）

### glm-4v
- **模型**: glm-4v
- **触发词**: 视频.*理解, 分析视频, 视频描述
- **输入**: video
- **优先级**: 10
- **技能路径**: skills/glm-4v/

### glm-ocr
- **模型**: glm-ocr
- **触发词**: OCR, 识别文字, 提取文本, PDF.*识别
- **输入**: pdf, image
- **优先级**: 10
- **技能路径**: skills/glm-ocr/

### glm-image
- **模型**: glm-image
- **触发词**: 生成图片, 画图, 绘制, 创建图像
- **输入**: text
- **优先级**: 10
- **技能路径**: skills/glm-image/

### glm-video
- **模型**: glm-video
- **触发词**: 生成视频, 制作视频, 视频生成
- **输入**: image, text
- **优先级**: 10
- **技能路径**: skills/glm-video/

### glm-tts
- **模型**: glm-tts
- **触发词**: 语音合成, TTS, 文字转语音, 朗读
- **输入**: text
- **优先级**: 10
- **技能路径**: skills/glm-tts/

### glm-asr
- **模型**: glm-asr
- **触发词**: 语音识别, ASR, 语音转文字, 转录
- **输入**: audio
- **优先级**: 10

### 智谱技能（无ISC路由，需手动调用）

- **cogvideo**: skills/cogvideo/
- **cogview**: skills/cogview/
- **glm-vision**: skills/glm-vision/
- **zhipu-image-gen**: skills/zhipu-image-gen/
- **zhipu-keys**: skills/zhipu-keys/
- **zhipu-vision**: skills/zhipu-vision/

## 🔵 搜索与信息获取

### public/tavily-search
- **路径**: skills/public/tavily-search/
- **环境变量**: TAVILY_API_KEY

### web_search（OpenClaw原生）
- **类型**: Brave Search API
- **状态**: 需配置BRAVE_API_KEY，当前未配置

### web_fetch（OpenClaw原生）
- **类型**: URL内容提取
- **状态**: 抓取网页内容转markdown，已可用

## 🔴 全量技能清单

- ✅ **aeo**: skills/aeo/ — AEO效果运营（含质量子技能体系）
- ✅ **aeo/pdca**: skills/aeo/pdca/ — PDCA持续改进引擎（AEO子模块）
- ✅ **anti-entropy-checker**: skills/anti-entropy-checker/
- ✅ **api-aggregator**: skills/api-aggregator/
- ✅ **architecture-review-pipeline**: skills/architecture-review-pipeline/ — 将架构评审流程固化为可执行技能：架构师提交后自动并行工程与质量复审，未通过自动打回，通过后进入裁决殿终审并给出最终裁决。
- ✅ **cras**: skills/cras/ — CRAS认知进化伙伴 - 知识管理与认知进化中枢。实现从数据汲取到技能进化的全闭环，包含主动学习引擎、用户洞察分析、知识治理、战略行研、自主进化五大模块。
- ✅ **cron-health**: skills/cron-health/
- ✅ **dispatch-protocol**: skills/dispatch-protocol/
- ✅ **evolver**: skills/evolver/ — 自进化引擎 - AI Agent自我演进. Analyzes runtime history to identify improvements and applies protocol-constrained evolution.
- ✅ **evomap-a2a**: skills/evomap-a2a/ — EvoMap A2A连接 - WebSocket连接、自动重连、消息队列
- ✅ **evomap-publisher**: skills/evomap-publisher/ — EvoMap极简发布器 - 只负责一件事：将SEEF+DTO生成的技能发布到EvoMap网络
- ✅ **evomap-uploader**: skills/evomap-uploader/
- ✅ **feishu-card-sender**: skills/feishu-card-sender/
- ✅ **feishu-chat-backup**: skills/feishu-chat-backup/ — 飞书聊天备份
- ✅ **feishu-common**: skills/feishu-common/
- ✅ **feishu-evolver-wrapper**: skills/feishu-evolver-wrapper/ — 飞书自进化封装. Manages the evolution loop lifecycle (start/stop/ensure), sends rich Feishu card reports, and provides dashboard visualization. Use when running evolver with Feishu reporting or when managing the evolution daemon.
- ✅ **feishu-report-sender**: skills/feishu-report-sender/ — 飞书报告发送 - 将报告推送到飞书
- ✅ **file-downloader**: skills/file-downloader/
- ✅ **five-layer-event-model**: skills/five-layer-event-model/
- ✅ **github-api**: skills/github-api/
- ✅ **intent-design-principles**: skills/intent-design-principles/ — 将"意图理解系统设计原则"固化为可执行技能，覆盖意图注册治理、收敛类型覆盖、反熵增校验、未知意图发现调度与健康报告。
- ✅ **isc-capability-anchor-sync**: skills/isc-capability-anchor-sync/ — ISC锚点自动同步 - 从ISC规则自动生成能力锚点文档
- ✅ **isc-core**: skills/isc-core/ — ISC标准管理 - 标准生成与演进机制的唯一管理源
- ✅ **isc-document-quality**: skills/isc-document-quality/ — ISC文档质量评估。对技能文档进行多维度质量评分，包括基础完整性、规范符合度、内容准确性、扩展完整性。输出标准化评估报告。
- ✅ **layered-architecture-checker**: skills/layered-architecture-checker/
- ✅ **lep-executor**: skills/lep-executor/ — LEP稳定执行 - 统一韧性任务执行引擎
- ✅ **long-horizon-autonomy**: skills/long-horizon-autonomy/
- ✅ **lto-core**: skills/lto-core/ — LTO本地可控编排器 v3.0.11 - 可扩展调度平台，多模态触发、自适应执行，ISC规则全自动订阅执行，Git全仓库跟踪
- ✅ **memos-memory-guide**: skills/memos-memory-guide/ — Use the MemOS Local memory system to search and use the user's past conversations. Use this skill whenever the user refers to past chats, their own preferences or history, or when you need to answer from prior context. When auto-recall returns nothing (long or unclear user query), generate your own short search query and call memory_search. Use task_summary when you need full task context, skill_get for experience guides, and memory_timeline to expand around a memory hit.
- ✅ **parallel-subagent**: skills/parallel-subagent/
- ✅ **project-mgmt**: skills/project-mgmt/ — 项目管理 - 任务编排、Sprint规划、架构评审、裁决
- ✅ **public**: skills/public/
- 📄 **public/auto-badcase-harvest**: skills/public/auto-badcase-harvest/
- 📄 **public/auto-grant-feishu-perm**: skills/public/auto-grant-feishu-perm/ — 飞书文档创建后自动授权指定用户full_access权限
- 📄 **public/badcase-to-goodcase**: skills/public/badcase-to-goodcase/ — 扫描badcase文件，自动翻转生成goodcase评测集
- ✅ **public/caijuedian-tribunal**: skills/public/caijuedian-tribunal/ — LLM驱动的7视角三轮对抗式深度决策引擎。完整可运行，支持CLI和模块调用。
- ✅ **public/convert-helper**: skills/public/convert-helper/ — 基于知识库分析，高频需求: 格式转换 (出现2次)
- ✅ **public/daily-gongzhonghao**: skills/public/daily-gongzhonghao/
- 📄 **public/detect-deep-think-intent**: skills/public/detect-deep-think-intent/ — 检测用户输入中的深度思考意图关键词，触发子Agent委派
- 📄 **public/eval-mining**: skills/public/eval-mining/
- 📄 **public/eval-runner**: skills/public/eval-runner/
- 📄 **public/feishu-doc-verify**: skills/public/feishu-doc-verify/ — 飞书文档create/write后验证block_count>1，防止空文档推送
- ✅ **public/file-sender**: skills/public/file-sender/ — |
- ✅ **public/glm-asr**: skills/public/glm-asr/ — GLM-ASR 语音转文本 - 使用智谱 GLM-ASR-2512 模型，支持多语言语音转录
- 📄 **public/glm-tts**: skills/public/glm-tts/
- 📄 **public/isc-auto-align**: skills/public/isc-auto-align/ — ISC规则增删改时自动检查感知/执行/验真三层对齐
- 📄 **public/multi-agent-dispatch**: skills/public/multi-agent-dispatch/ — >
- ✅ **public/multi-agent-reporting**: skills/public/multi-agent-reporting/ — >
- ✅ **public/ops-maintenance**: skills/public/ops-maintenance/
- 📄 **public/pdf-generator**: skills/public/pdf-generator/
- 📄 **public/skill-creator-addon**: skills/public/skill-creator-addon/
- ✅ **public/system-monitor**: skills/public/system-monitor/ — 系统健康监控中心 — 健康检查、告警根因分析、未响应告警扫描、主Agent违规检测、Git push探针
- ✅ **quality-audit**: skills/quality-audit/ — >
- ✅ **seef**: skills/seef/ — SEEF技能生态进化工厂 - 高度自治、可被云端大模型动态发现与自由编排的独立子技能集合，具备自主执行完整PDCA闭环能力
- ✅ **seef/evolution-pipeline**: skills/seef/evolution-pipeline/ — EvoMap技能自动进化流水线 - 实现技能从开发到EvoMap发布的全自动化状态机驱动系统
- ✅ **self-check-scanners**: skills/self-check-scanners/
- ✅ **shared**: skills/shared/
- ✅ **skill-creator**: skills/skill-creator/ — >
- ✅ **system-mapping-visualizer**: skills/system-mapping-visualizer/

> 图例: ✅=完整(SKILL.md+代码) 📄=仅文档 ⚙️=仅代码 ❓=空目录

## 🟠 Python Packages (pip)

- **annotated-doc** v0.0.4
- **anthropic** v0.84.0
- **docstring_parser** v0.17.0
- **fastcore** v1.12.23
- **git-filter-repo** v2.47.0
- **httpx** v0.28.1
- **lxml** v6.0.2
- **matplotlib** v3.10.8
- **numpy** v2.4.2
- **pandas** v3.0.1
- **pexpect** v4.9.0
- **pillow** v12.1.1
- **protobuf** v6.33.5
- **pyarrow** v23.0.1
- **PyPDF2** v3.0.1
- **python-discovery** v1.1.1
- **python-magic** v0.4.27
- **python-pptx** v1.0.2
- **requests** v2.32.5
- **rich** v13.7.1
- **tenacity** v9.1.4
- **Twisted** v24.3.0
- **typer** v0.24.1
- **unidiff** v0.7.5
- **uv** v0.10.9
- **xlsxwriter** v3.2.9
- **xxhash** v3.6.0
- **youtube-transcript-api** v1.2.4
- **yt-dlp** v2026.3.3

## 🟤 Node.js Global Packages (npm)

- **@aisuite/chub** v0.1.1
- **@executeautomation/playwright-mcp-server** v1.0.12
- **@mermaid-js/mermaid-cli** v11.12.0
- **@modelcontextprotocol/server-puppeteer** v2025.5.12
- **@upstash/context7-mcp** v2.1.3
- **openclaw** v2026.3.2
- **playwright** v1.58.2
- **puppeteer** v24.38.0
- **ws** v8.19.0

## 🔧 Workspace Tools

- **MediaCrawler**: `MediaCrawler/main.py` — <div align="center">

## ⚡ System CLI Tools

- **yt-dlp**: 视频/音频下载工具 (`/usr/local/bin/yt-dlp`) — 2026.03.03
- **ffmpeg**: 音视频转码/处理 (`/usr/bin/ffmpeg`) — ffmpeg version 6.1.1-3ubuntu5 Copyright (c) 2000-2023 the FFmpeg developers
- **ffprobe**: 音视频信息探测 (`/usr/bin/ffprobe`) — ffprobe version 6.1.1-3ubuntu5 Copyright (c) 2007-2023 the FFmpeg developers
- **playwright**: 浏览器自动化 (`/usr/bin/playwright`) — Version 1.58.2
- **curl**: HTTP请求工具 (`/usr/bin/curl`) — curl 8.5.0 (x86_64-pc-linux-gnu) libcurl/8.5.0 OpenSSL/3.0.13 zlib/1.3 brotli/1....
- **wget**: 文件下载工具 (`/usr/bin/wget`) — GNU Wget 1.21.4 built on linux-gnu.
- **jq**: JSON处理工具 (`/usr/bin/jq`) — jq-1.7
- **git**: 版本控制 (`/usr/bin/git`) — git version 2.43.0
- **python3**: Python 3 解释器 (`/usr/bin/python3`) — Python 3.12.3
- **node**: Node.js 运行时 (`/usr/bin/node`) — v22.22.0
- **sqlite3**: SQLite数据库CLI (`/usr/bin/sqlite3`) — 3.45.1 2024-01-30 16:01:20 e876e51a0ed5c5b3126f52e532044363a014bc594cfefa87ffb5b...
- **rsync**: 文件同步工具 (`/usr/bin/rsync`) — rsync  version 3.2.7  protocol version 31
- **ssh**: SSH客户端 (`/usr/bin/ssh`) — unknown option -- -
- **pandoc**: 文档格式转换 (`/usr/bin/pandoc`) — pandoc 3.1.3
- **chromium**: Chromium浏览器 (`/snap/bin/chromium`) — ERROR: ld.so: object '/$LIB/libonion.so' from /etc/ld.so.preload cannot be prelo...
- **chromium-browser**: Chromium浏览器 (`/usr/bin/chromium-browser`) — ERROR: ld.so: object '/$LIB/libonion.so' from /etc/ld.so.preload cannot be prelo...
- **uv**: Python包管理器(快速) (`/usr/local/bin/uv`) — uv 0.10.9

## 🟣 使用原则

1. **主模型**: 跟随 openclaw.json 配置（不硬编码）
2. **扩展模型**: 智谱（多模态、生成），通过ISC路由自动选择
3. **搜索首选**: tavily-search（AI优化），web_search为备选
4. **能力来源**: 本文档由 isc-capability-anchor-sync v3 全量扫描自动生成
5. **同步频率**: 每小时自动 + 技能变更时触发
6. **扫描范围**: MCP规则 + skills/ + pip + npm全局 + workspace工具 + 系统CLI
