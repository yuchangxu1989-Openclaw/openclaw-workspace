# 系统能力锚点 - 根治遗忘
# 自动生成的文档，请勿手动编辑（由 ISC 规则同步）

> **生成时间**: 2026/3/2 17:05:54
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
- **council-of-seven**: skills/council-of-seven/
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
- **parallel-subagent**: skills/parallel-subagent/
- **paths-center**: skills/paths-center/
- **pdca-engine**: skills/pdca-engine/
- **seef**: skills/seef/
- **system-monitor**: skills/system-monitor/

## 🟣 使用原则

1. **主模型**: Kimi K2.5（文本推理）
2. **扩展模型**: 智谱（多模态、生成）
3. **自动路由**: ISC规则自动识别需求，DTO调度对应模型
4. **能力来源**: 本文档由 ISC 规则自动生成
