# 系统能力锚点 - 根治遗忘
# 自动生成的文档，请勿手动编辑（由 ISC 规则同步）

> **生成时间**: 2026/3/6 02:12:00
> **来源**: ISC 规则自动同步 + 全量技能扫描

## 🟡 智谱多模态能力矩阵（ISC 规则自动生成）

### glm-4v
- **模型**: glm-4v
- **触发词**: 视频.*理解, 分析视频, 视频描述
- **输入**: video
- **优先级**: 10

### glm-ocr
- **模型**: glm-ocr
- **触发词**: OCR, 识别文字, 提取文本, PDF.*识别
- **输入**: pdf, image
- **优先级**: 10

### glm-image
- **模型**: glm-image
- **触发词**: 生成图片, 画图, 绘制, 创建图像
- **输入**: text
- **优先级**: 10

### glm-video
- **模型**: glm-video
- **触发词**: 生成视频, 制作视频, 视频生成
- **输入**: image, text
- **优先级**: 10

### glm-tts
- **模型**: glm-tts
- **触发词**: 语音合成, TTS, 文字转语音, 朗读
- **输入**: text
- **优先级**: 10

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

## 🔴 核心技能（skills/）

| 技能 | 路径 | 说明 |
|------|------|------|
| aeo | skills/aeo/ | 智能体效果运营系统 - Phase 2 双轨运营 |
| agent-mode-enforcer | skills/agent-mode-enforcer/ | 主Agent执行模式评估器 |
| api | skills/api/ | API调用技能 |
| api-aggregator | skills/api-aggregator/ | 并发HTTP API聚合调用 |
| capability-anchor | skills/capability-anchor/ | 能力锚点系统 |
| cogvideo | skills/cogvideo/ | 文字描述生成视频 |
| cogview | skills/cogview/ | 文字描述生成图片 |
| convert-helper | skills/convert-helper/ | 格式转换工具 |
| cras | skills/cras/ | CRAS认知进化伙伴 - 知识管理与认知进化中枢 |
| cras-generated-1771827136412 | skills/cras-generated-1771827136412/ | CRAS自动生成技能 |
| cras-generated-1771827197478 | skills/cras-generated-1771827197478/ | CRAS自动生成技能 |
| cras-generated-1772042431830 | skills/cras-generated-1772042431830/ | CRAS自动生成技能 |
| cras-generated-1772128853925 | skills/cras-generated-1772128853925/ | CRAS自动生成技能 |
| daily-ops-report | skills/daily-ops-report/ | 每日运营报告（定时08:00/20:00） |
| dto-core | skills/dto-core/ | DTO声明式任务调度平台 v3.0.11 |
| etl | skills/etl/ | ETL数据处理 |
| evolver | skills/evolver/ | AI自主进化引擎 |
| evomap-a2a | skills/evomap-a2a/ | EvoMap A2A协议连接器 |
| evomap-publisher | skills/evomap-publisher/ | EvoMap技能发布器 |
| evomap-uploader | skills/evomap-uploader/ | EvoMap上传器 |
| feishu-chat-backup | skills/feishu-chat-backup/ | 飞书聊天记录备份 |
| feishu-evolver-wrapper | skills/feishu-evolver-wrapper/ | 飞书进化引擎封装（生命周期+卡片报告） |
| feishu-report-sender | skills/feishu-report-sender/ | 飞书报告推送 |
| file-downloader | skills/file-downloader/ | HTTP/HTTPS文件下载 |
| file-sender | skills/file-sender/ | 通用文件发送（自动适配通道） |
| github-api | skills/github-api/ | GitHub仓库文件读取 |
| glm-4v | skills/glm-4v/ | 视频理解/问答 |
| glm-asr | skills/glm-asr/ | 语音转文本（GLM-ASR-2512） |
| glm-image | skills/glm-image/ | 智谱图片生成 |
| glm-ocr | skills/glm-ocr/ | 图片文字识别 |
| glm-tts | skills/glm-tts/ | 文字转语音 |
| glm-video | skills/glm-video/ | 本地图片生成视频 |
| glm-vision | skills/glm-vision/ | 图片理解/分析 |
| isc-capability-anchor-sync | skills/isc-capability-anchor-sync/ | ISC能力锚点自动同步器 |
| isc-core | skills/isc-core/ | ISC智能标准中心 - 标准生成与演进 |
| isc-document-quality | skills/isc-document-quality/ | 文档质量多维度评估 |
| lep-executor | skills/lep-executor/ | LEP韧性执行中心 |
| **lingxiaoge-tribunal** | skills/lingxiaoge-tribunal/ | **凌霄阁v1.0 - 7人裁决神殿，三轮对抗式决策** |
| new-skill | skills/new-skill/ | 新技能模板 |
| new-skill-v2 | skills/new-skill-v2/ | 新技能模板v2 |
| parallel-subagent | skills/parallel-subagent/ | 并行子代理执行器 v3.0 |
| paths-center | skills/paths-center/ | 路径中心（占位符） |
| pdca-engine | skills/pdca-engine/ | PDCA-C执行引擎 |
| pdf-generator | skills/pdf-generator/ | PDF生成 |
| rule-hygiene | skills/rule-hygiene/ | ISC规则治理（去重/命名/三维分析） |
| seef | skills/seef/ | SEEF技能生态进化工厂 |
| system-monitor | skills/system-monitor/ | 技能健康度评估仪表盘 |
| tavily-search | skills/tavily-search/ | Tavily搜索 |
| test-skill-for-seef | skills/test-skill-for-seef/ | SEEF测试技能 |
| verify-test-skill | skills/verify-test-skill/ | 验证测试技能 |
| zhipu-image-gen | skills/zhipu-image-gen/ | 智谱图片生成 |
| zhipu-keys | skills/zhipu-keys/ | 智谱密钥管理 |
| zhipu-vision | skills/zhipu-vision/ | 智谱视觉 |

## 🔵 基础设施能力（infrastructure/）

| 模块 | 路径 | 说明 |
|------|------|------|
| **feature-flags** | infrastructure/feature-flags/ | **Feature Flag降级开关**（flags.json + index.js） |
| **event-bus** | infrastructure/event-bus/ | **事件总线**（bus/dispatcher/facade/cron-runner/handlers） |
| **condition-evaluator** | infrastructure/condition-evaluator/ | **条件评估器**（规则条件动态求值） |
| **scanners** | infrastructure/scanners/ | **Scanner体系**（base-scanner + git-scanner） |
| **probes** | infrastructure/probes/ | **知识发现探针**（knowledge-discovery-probe） |
| **message-hook** | infrastructure/message-hook/ | **消息Hook**（消息拦截与增强） |
| **report-snapshot.js** | infrastructure/report-snapshot.js | **报告快照锁**（SHA-256指纹防ghost data） |
| aeo | infrastructure/aeo/ | AEO基础设施 |
| capability-anchor | infrastructure/capability-anchor/ | 能力锚点基础设施 |
| config | infrastructure/config/ | 全局配置 |
| cron | infrastructure/cron/ | Cron调度 |
| decision-log | infrastructure/decision-log/ | 决策日志 |
| dispatcher | infrastructure/dispatcher/ | 任务分发器 |
| enforcement | infrastructure/enforcement/ | 规则执行层 |
| event-driven | infrastructure/event-driven/ | 事件驱动框架 |
| feedback | infrastructure/feedback/ | 反馈收集 |
| intent-engine | infrastructure/intent-engine/ | 意图识别引擎 |
| lep-core | infrastructure/lep-core/ | LEP核心 |
| llm-context | infrastructure/llm-context/ | LLM上下文管理 |
| observability | infrastructure/observability/ | 可观测性 |
| pipeline | infrastructure/pipeline/ | 流水线 |
| resilience | infrastructure/resilience/ | 韧性框架 |
| rule-engine | infrastructure/rule-engine/ | 规则引擎 |
| self-check | infrastructure/self-check/ | 自检 |
| self-healing | infrastructure/self-healing/ | 自愈 |
| state-tracker | infrastructure/state-tracker/ | 状态追踪 |
| task-flow | infrastructure/task-flow/ | 任务流 |

## 🟢 工具脚本（scripts/）

| 脚本 | 路径 | 说明 |
|------|------|------|
| **classify-skill-distribution.js** | scripts/classify-skill-distribution.js | **技能分类分布检查器** |
| **check-version-integrity.js** | scripts/check-version-integrity.js | **版本号诚实性审计门禁** |
| **check-dependency-direction.js** | scripts/check-dependency-direction.js | **依赖方向CI门禁** |
| **check-rule-dedup.js** | scripts/check-rule-dedup.js | **ISC规则去重检查（快筛+语义深检）** |
| startup-self-check.sh | scripts/startup-self-check.sh | 启动自检 |
| daily-ops-report.js | scripts/daily-ops-report.js | 每日运营报告 |
| degradation-drill.js | scripts/degradation-drill.js | 降级演练 |
| dependency-check.js | scripts/dependency-check.js | 依赖检查 |
| isc-enforcement-verifier.js | scripts/isc-enforcement-verifier.js | ISC执行验证 |
| isc-pre-commit-check.js | scripts/isc-pre-commit-check.js | ISC预提交检查 |
| report-snapshot.js | scripts/report-snapshot.js | 报告快照 |
| gateway-monitor.sh | scripts/gateway-monitor.sh | 网关监控 |
| session-cleanup.sh | scripts/session-cleanup.sh | 会话清理 |
| system-maintenance.sh | scripts/system-maintenance.sh | 系统维护 |

## 🟠 测试与基准（tests/）

| 模块 | 路径 | 说明 |
|------|------|------|
| **intent benchmark** | tests/benchmarks/intent/ | **意图识别基准测试（单轮+多轮+真实对话样本）** |
| pipeline benchmark | tests/benchmarks/pipeline/ | 流水线基准测试 |
| scenarios benchmark | tests/benchmarks/scenarios/ | 场景基准测试 |

## 🟣 使用原则

1. **主模型**: Claude Opus-4-6-Thinking（文本推理）
2. **扩展模型**: 智谱（多模态、生成）
3. **自动路由**: ISC规则自动识别需求，DTO调度对应模型
4. **能力来源**: 本文档由 ISC 规则自动生成 + 全量目录扫描
5. **事件驱动同步**: event-bus 可触发 isc-capability-anchor-sync 自动刷新
