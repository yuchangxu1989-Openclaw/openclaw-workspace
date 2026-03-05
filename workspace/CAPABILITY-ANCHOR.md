# 系统能力锚点 - 根治遗忘
# 自动生成 — 由 isc-capability-anchor-sync v2 全量扫描生成

> **生成时间**: 2026/3/6 07:49:49
> **技能总数**: 53
> **ISC路由**: 12

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

### glm-tts-clone
- **模型**: glm-tts-clone
- **触发词**: 克隆声音, 声音克隆, 模仿音色
- **输入**: audio
- **优先级**: 10

### glm-asr
- **模型**: glm-asr
- **触发词**: 语音识别, ASR, 语音转文字, 转录
- **输入**: audio
- **优先级**: 10
- **技能路径**: skills/glm-asr/

### charglm-video
- **模型**: charglm-video
- **触发词**: 实时视频通话, 视频通话, 视频对话
- **输入**: video, audio, text
- **输出**: audio
- **优先级**: 10

### charglm-voice
- **模型**: charglm-voice
- **触发词**: 实时语音通话, 语音通话, 语音对话
- **输入**: audio, text
- **输出**: audio
- **优先级**: 10

### glm-thinking
- **模型**: glm-thinking
- **触发词**: 深度思考, 学术研究, 复杂推理, 详细分析
- **优先级**: 5

### glm-ppt
- **模型**: glm-ppt
- **触发词**: 制作PPT, 生成PPT, 创建演示文稿
- **优先级**: 10

### glm-5-coder
- **模型**: glm-5
- **触发词**: 复杂代码, 代码架构, 算法设计, 深度编码, 重构代码
- **输入**: text
- **优先级**: 10
- **说明**: GLM-5深度思考编码模型 - 用于复杂代码场景

### 智谱技能（无ISC路由，需手动调用）

- **cogvideo**: skills/cogvideo/
- **cogview**: skills/cogview/
- **glm-vision**: skills/glm-vision/
- **zhipu-image-gen**: skills/zhipu-image-gen/
- **zhipu-keys**: skills/zhipu-keys/
- **zhipu-vision**: skills/zhipu-vision/

## 🔵 搜索与信息获取

### tavily-search
- **路径**: skills/tavily-search/
- **环境变量**: 环境变量: TAVILY_API_KEY

### web_search（OpenClaw原生）
- **类型**: Brave Search API
- **状态**: 需配置BRAVE_API_KEY，当前未配置

### web_fetch（OpenClaw原生）
- **类型**: URL内容提取
- **状态**: 抓取网页内容转markdown，已可用

## 🔴 全量技能清单

- 📄 **aeo**: skills/aeo/ — 智能体效果运营系统 - Phase 2 双轨运营
- ✅ **agent-mode-enforcer**: skills/agent-mode-enforcer/
- ✅ **api**: skills/api/
- ✅ **api-aggregator**: skills/api-aggregator/
- 📄 **capability-anchor**: skills/capability-anchor/ — 能力锚点系统 - 【占位符】强制读取机制刚建立
- ✅ **convert-helper**: skills/convert-helper/ — 基于知识库分析，高频需求: 格式转换 (出现2次)
- ✅ **cras**: skills/cras/ — CRAS认知进化伙伴 - 知识管理与认知进化中枢。实现从数据汲取到技能进化的全闭环，包含主动学习引擎、用户洞察分析、知识治理、战略行研、自主进化五大模块。
- ✅ **cras-generated-1771827136412**: skills/cras-generated-1771827136412/ — CRAS 自动生成的技能 - 填补能力空白
- ✅ **cras-generated-1771827197478**: skills/cras-generated-1771827197478/ — CRAS 自动生成的技能 - 填补能力空白
- ✅ **cras-generated-1772042431830**: skills/cras-generated-1772042431830/ — CRAS 自动生成的技能 - 填补能力空白
- ✅ **cras-generated-1772128853925**: skills/cras-generated-1772128853925/ — CRAS 自动生成的技能 - 填补能力空白
- 📄 **daily-ops-report**: skills/daily-ops-report/
- ✅ **dto-core**: skills/dto-core/ — DTO (Declarative Task Orchestration) v3.0.11 - 可扩展任务调度平台，支持声明式任务编排、多模态触发、自适应执行，ISC规则全自动订阅执行，Git全仓库跟踪
- ✅ **etl**: skills/etl/
- ✅ **evolver**: skills/evolver/ — A self-evolution engine for AI agents. Analyzes runtime history to identify improvements and applies protocol-constrained evolution.
- ✅ **evomap-a2a**: skills/evomap-a2a/ — EvoMap A2A协议连接器 - 实现与EvoMap Hub的WebSocket连接、自动重连、消息队列管理
- ✅ **evomap-publisher**: skills/evomap-publisher/ — EvoMap极简发布器 - 只负责一件事：将SEEF+DTO生成的技能发布到EvoMap网络
- 📄 **evomap-uploader**: skills/evomap-uploader/
- ✅ **feishu-chat-backup**: skills/feishu-chat-backup/ — 飞书聊天记录备份系统 - 实质性记录对话日志
- ✅ **feishu-evolver-wrapper**: skills/feishu-evolver-wrapper/ — Feishu-integrated wrapper for the capability-evolver. Manages the evolution loop lifecycle (start/stop/ensure), sends rich Feishu card reports, and provides dashboard visualization. Use when running evolver with Feishu reporting or when managing the evolution daemon.
- ✅ **feishu-report-sender**: skills/feishu-report-sender/ — 飞书报告发送器 - 将CRAS、EvoMap的报告队列实际推送到飞书
- ✅ **file-downloader**: skills/file-downloader/
- ✅ **file-sender**: skills/file-sender/ — 通用文件发送器 - 自动适配通道能力，支持直接传输或内容输出
- ✅ **github-api**: skills/github-api/
- ✅ **isc-capability-anchor-sync**: skills/isc-capability-anchor-sync/ — ISC能力锚点自动同步器 - 从ISC规则自动生成能力锚点文档
- ✅ **isc-core**: skills/isc-core/ — ISC智能标准中心 - 标准生成与演进机制的唯一管理源
- ✅ **isc-document-quality**: skills/isc-document-quality/ — ISC智能标准中心 - 文档质量评估系统。对技能文档进行多维度质量评分，包括基础完整性、规范符合度、内容准确性、扩展完整性。输出标准化评估报告。
- ✅ **lep-executor**: skills/lep-executor/ — LEP韧性执行中心 (Local Execution Protocol) - 全局统一韧性任务执行引擎，整合现有分散的韧性能力
- 📄 **lingxiaoge-tribunal**: skills/lingxiaoge-tribunal/ — LLM驱动的7视角三轮对抗式深度决策引擎。完整可运行，支持CLI和模块调用。
- ✅ **new-skill**: skills/new-skill/
- ✅ **new-skill-v2**: skills/new-skill-v2/
- ✅ **parallel-subagent**: skills/parallel-subagent/ — 并行子代理执行器 v3.0 - 企业级并发控制与容错
- 📄 **paths-center**: skills/paths-center/ — 路径中心 - 【占位符】概念驱动，需求不清
- ✅ **pdca-engine**: skills/pdca-engine/ — PDCA-C执行引擎 - 每5分钟有实际产出
- 📄 **pdf-generator**: skills/pdf-generator/
- 📄 **rule-hygiene**: skills/rule-hygiene/ — ISC规则治理——去重、命名统一、三维分析（意图/事件/执行），输出规则-事件-DTO对齐矩阵
- 📄 **seef**: skills/seef/ — SEEF技能生态进化工厂 - 高度自治、可被云端大模型动态发现与自由编排的独立子技能集合，具备自主执行完整PDCA闭环能力
- ✅ **system-monitor**: skills/system-monitor/ — 技能健康度评估仪表盘 - 自动化扫描所有技能，评估完整性、活跃度、依赖健康度，生成可视化报告
- ✅ **test-skill-for-seef**: skills/test-skill-for-seef/
- ✅ **verify-test-skill**: skills/verify-test-skill/

> 图例: ✅=完整(SKILL.md+代码) 📄=仅文档 ⚙️=仅代码 ❓=空目录

## 🟣 使用原则

1. **主模型**: 跟随 openclaw.json 配置（不硬编码）
2. **扩展模型**: 智谱（多模态、生成），通过ISC路由自动选择
3. **搜索首选**: tavily-search（AI优化），web_search为备选
4. **能力来源**: 本文档由 isc-capability-anchor-sync 全量扫描自动生成
5. **同步频率**: 每小时自动 + 技能变更时触发
