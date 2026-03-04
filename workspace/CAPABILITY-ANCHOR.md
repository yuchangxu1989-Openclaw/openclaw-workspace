# 系统能力锚点 - 根治遗忘
# 自动生成的文档，请勿手动编辑（由 ISC 规则同步）

> **生成时间**: 2026/3/5 00:05:37
> **来源**: ISC 规则自动同步

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

## 🔴 核心能力

- **aeo**: skills/aeo/
- **capability-anchor**: skills/capability-anchor/
- **convert-helper**: skills/convert-helper/
- **cras**: skills/cras/
- **cras-generated-1771827136412**: skills/cras-generated-1771827136412/
- **cras-generated-1771827197478**: skills/cras-generated-1771827197478/
- **cras-generated-1772042431830**: skills/cras-generated-1772042431830/
- **cras-generated-1772128853925**: skills/cras-generated-1772128853925/
- **dto-core**: skills/dto-core/
- **evolver**: skills/evolver/
- **evomap-a2a**: skills/evomap-a2a/
- **evomap-publisher**: skills/evomap-publisher/
- **feishu-chat-backup**: skills/feishu-chat-backup/
- **feishu-evolver-wrapper**: skills/feishu-evolver-wrapper/
- **feishu-report-sender**: skills/feishu-report-sender/
- **file-sender**: skills/file-sender/
- **isc-capability-anchor-sync**: skills/isc-capability-anchor-sync/
- **isc-core**: skills/isc-core/
- **isc-document-quality**: skills/isc-document-quality/
- **lep-executor**: skills/lep-executor/
- **lingxiaoge-tribunal**: skills/lingxiaoge-tribunal/
- **parallel-subagent**: skills/parallel-subagent/
- **paths-center**: skills/paths-center/
- **pdca-engine**: skills/pdca-engine/
- **seef**: skills/seef/
- **system-monitor**: skills/system-monitor/

## 🔵 L3 闭环流水线能力（Infrastructure Layer）

> **架构**: EventBus → RuleMatcher → IntentScanner → Dispatcher，全链路 DecisionLog 审计
> **源码**: `infrastructure/` 目录
> **控制**: Feature Flags 统一开关，支持运行时热切换

### L3 Pipeline（闭环编排器）
- **路径**: `infrastructure/pipeline/l3-pipeline.js`
- **能力**: 单次闭环执行 `run()`，串联 EventBus.consume → RuleMatcher.process → IntentScanner.scan → Dispatcher.dispatch
- **断路器**: chain_depth ≤ 5 正常，> 5 自动断路，防 cras→isc→dto→cras 无限循环
- **执行摘要**: 每次 run 输出统计（consumed/matched/intents/dispatched/breaks），写入 `run-log.jsonl`
- **超时控制**: 可配置 `timeoutMs`，默认不限时
- **状态**: ✅ Day 1 已实现 | 🔲 Day 2 待完善：周期调度（当前仅 runOnce）

### EventBus（统一事件总线）
- **路径**: `infrastructure/event-bus/bus-adapter.js`（适配层）+ `bus.js`（底层文件锁存储）
- **能力**:
  - `emit(type, payload, source, metadata)` — 发射事件，文件锁保护写入 `events.jsonl`
  - `consume({type_filter, since, layer, limit})` — 基于 cursor+consumerId 的消费模式
  - **风暴抑制**: 5 秒内相同事件指纹（type+payload MD5）自动去重
  - **通配符匹配**: 精确/前缀(`skill.*`)/后缀(`*.failed`)/全匹配(`*`)
  - **健康检查**: `healthCheck()` 校验 events.jsonl 完整性
  - **ISC 钩子**: `isc.rule.*` 事件自动触发 RuleMatcher.reload()
- **落盘**: 所有事件持久化到 `events.jsonl`，cursor 状态持久化到 `cursor.json`
- **状态**: ✅ Day 1 已实现 | 🔲 Day 2 待完善：事件 TTL 自动清理、分区存储

### RuleMatcher（ISC 规则实时匹配引擎）
- **路径**: `infrastructure/rule-engine/isc-rule-matcher.js`
- **能力**:
  - 加载 `skills/isc-core/rules/` 目录下所有 JSON 规则文件
  - **四级匹配优先级**: 精确 > 前缀通配 > 后缀通配 > 全通配
  - **条件评估**: 支持比较运算符(`>=`,`<=`,`>`,`<`,`==`,`!=`)、AND/OR/NOT 布尔组合
  - **热重载**: 5 秒检测规则目录变更，自动重建索引
  - `match(event)` — 匹配候选规则 | `evaluate(rule, event)` — 条件评估 | `process(event)` — 匹配+评估全流程
  - `explain(eventType)` — 调试：查看哪些规则会被触发
  - **优先级归一化**: 支持 numeric/severity(critical~info)/governance.priority 多格式
- **规则数量**: 动态加载（规则目录下所有 `.json` 文件）
- **状态**: ✅ Day 1 已实现 | 🔲 Day 2 待完善：复杂嵌套条件、规则冲突检测

### IntentScanner（意图识别扫描器）
- **路径**: `infrastructure/intent-engine/intent-scanner.js`
- **能力**:
  - **LLM 主路径**: 调用智谱 GLM-5 进行对话意图识别，输出 JSON 结构化意图
  - **正则降级**: LLM 不可用时自动降级为关键词正则匹配（IC1 情绪/IC2 规则类）
  - **五类意图**: IC1(情绪表达) / IC2(规则与规范) / IC3 / IC4 / IC5（从 `intent-registry.json` 加载）
  - **闭环**: 识别到的意图自动 `EventBus.emit('intent.detected', ...)` 回写事件总线
  - **Decision Log**: 每次扫描结果写入本地日志 + 统一 DecisionLogger
- **Feature Flag**: `INTENT_SCANNER_ENABLED` 环境变量控制
- **状态**: ✅ Day 1 已实现 | 🔲 Day 2 待完善：IC3-IC5 正则降级覆盖、置信度校准

### Dispatcher（路由分发器）
- **路径**: `infrastructure/dispatcher/dispatcher.js`
- **能力**:
  - `dispatch(rule, event)` — 根据匹配规则路由到对应 handler 执行
  - **四级路由**: 精确 > 前缀 > 后缀 > 通配（与 RuleMatcher 一致）
  - **Handler 加载**: `routes.json` 显式配置 + `handlers/` 目录约定加载（文件名即 action 名）
  - **超时控制**: 默认 30 秒，支持同步/异步 handler
  - **容错**: 失败自动重试 1 次 → 写入 `manual-queue.jsonl` 人工队列
  - **文件分发**: 无可执行 handler 时写入 `dispatched/` 目录（文件级分发记录）
  - **路由缓存**: 匹配结果缓存，`reloadRoutes()` 清缓存
- **Feature Flag**: `DISPATCHER_ENABLED` 环境变量控制
- **状态**: ✅ Day 1 已实现 | 🔲 Day 2 待完善：更多内置 handler、并行分发

### DecisionLog（全链路审计日志）
- **路径**: `infrastructure/decision-log/decision-logger.js`
- **能力**:
  - `log(entry)` — 记录决策，自动填充 id/timestamp，校验 phase/confidence/method
  - `query({since, phase, component, limit})` — 按条件查询决策记录，newest-first
  - `summarize(timeRange)` — 生成统计摘要：按 phase/method/component 分组，平均置信度，降级计数
  - `rotate()` — 自动轮转：超 10MB 重命名+清理 7 天前归档
  - **三阶段**: sensing（感知）/ cognition（认知）/ execution（执行）
  - **四种方法**: llm / regex / rule_match / manual
- **存储**: `decisions.jsonl`，JSONL 格式，单文件追加
- **状态**: ✅ Day 1 已实现 | 🔲 Day 2 待完善：结构化查询索引、实时告警

### Feature Flags（运行时能力开关）
- **路径**: `infrastructure/config/feature-flags.js`
- **能力**:
  - **三层优先级**: 环境变量 > `flags.json` 配置文件 > 硬编码默认值
  - `get(flagName)` / `isEnabled(flagName)` / `getAll()` — 实时读取
  - `reload()` — 运行时热重载配置文件（无需重启进程）
  - **默认开关状态**:
    - `L3_PIPELINE_ENABLED`: **false**（总开关默认关闭，需显式开启）
    - `L3_EVENTBUS_ENABLED`: true
    - `L3_RULEMATCHER_ENABLED`: true
    - `L3_INTENTSCANNER_ENABLED`: true
    - `L3_DISPATCHER_ENABLED`: true
    - `L3_DECISIONLOG_ENABLED`: true
    - `L3_CIRCUIT_BREAKER_DEPTH`: 5
- **状态**: ✅ Day 1 已实现 | 🔲 Day 2 待完善：flag 变更事件通知、A/B 实验支持

## 🟣 使用原则

1. **主模型**: Claude Opus-4-6-Thinking（文本推理）
2. **扩展模型**: 智谱（多模态、生成）
3. **自动路由**: ISC规则自动识别需求，DTO调度对应模型
4. **能力来源**: 本文档由 ISC 规则自动生成
