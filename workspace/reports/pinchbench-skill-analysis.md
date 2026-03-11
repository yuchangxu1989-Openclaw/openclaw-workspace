# PinchBench/Skill 项目分析 — 与我们审计体系的对比

> 分析时间: 2026-03-11
> 仓库: https://github.com/pinchbench/skill

---

## 一、项目概述

PinchBench 是一个面向 OpenClaw AI 编程 Agent 的基准评测系统。核心理念：**用真实任务替代合成测试**来衡量 LLM 作为 Agent 大脑的实际表现。

- 23 个真实场景任务，覆盖 8 大类（生产力、研究、写作、编码、分析、邮件、记忆、技能生态）
- 三种评分模式：automated（Python 代码断言）、llm_judge（LLM 裁判）、hybrid（混合）
- 公开排行榜 pinchbench.com，支持多次运行取均值
- 效率指标追踪：tokens/task、cost/task、score per 1K tokens、score per dollar
- 默认裁判模型：Claude Opus 4.5

---

## 二、核心功能对比表

| 维度 | PinchBench | 我们的审计体系 |
|------|-----------|--------------|
| **评测对象** | 不同 LLM 模型作为 Agent 的能力横评 | 同一系统内 Agent 的任务执行质量纵深审计 |
| **任务来源** | 23 个预定义真实场景任务（静态） | 423 条 golden test + 真实对话挖掘（动态增长） |
| **评分方式** | Python 自动断言 + LLM Judge + 混合 | ISC 217 条规则硬门禁 + V4 字段标准 + AEO 北极星指标 |
| **评分粒度** | 每个 criterion 0.0-1.0，取均值 | 5 个北极星指标各自独立打分，有权重体系 |
| **自动化程度** | 全自动（一键 run.sh） | 半自动（cron 触发 + 人工复核） |
| **效率度量** | ✅ tokens/task、cost/task、score/1K tokens | ❌ 无 token 效率追踪 |
| **可复现性** | ✅ 固定 prompt + workspace 文件 + 确定性评分 | ⚠️ 依赖实时环境，复现性较弱 |
| **公开对比** | ✅ 公开排行榜，跨模型横评 | ❌ 内部使用，无横评机制 |
| **任务模板** | ✅ 标准化 YAML frontmatter + 结构化 sections | ⚠️ golden test 有 V4 字段标准，但无统一模板文件格式 |
| **Transcript 审计** | ✅ 解析 JSONL transcript 检查工具调用链 | ✅ ISC 规则检查执行链路 |
| **LLM 裁判** | ✅ 带权重的 rubric，4 级评分（1.0/0.75/0.5/0.25/0.0） | ⚠️ AEO 有评分但 rubric 不如 PinchBench 结构化 |
| **部分得分** | ✅ 支持 partial credit（如 0.3、0.5） | ⚠️ 多数为 pass/fail 二值判定 |
| **根因分析** | ❌ 只评分不分析失败原因 | ✅ 根因分析覆盖率是北极星指标之一 |
| **纠偏闭环** | ❌ 无纠偏机制 | ✅ correction-harvester + badcase 自动入队 |
| **多轮/长链路** | ⚠️ 单任务最多 300s，链路较短 | ✅ 支持多 Agent 协作的长链路审计 |

---

## 三、值得借鉴的点

### 1. 🔥 Token 效率指标（高优先级）

PinchBench 追踪每个任务的 token 消耗、API 请求数、成本，并计算：
- `score_per_1k_tokens`（得分/千 token）
- `score_per_dollar`（得分/美元）

**我们的差距**：完全没有 token 效率追踪。Agent 可能用 50K tokens 完成一个本该 5K tokens 搞定的任务，我们无从发现。

**建议**：在看板统计中增加 token 消耗维度，纳入 AEO 评测指标。

### 2. 🔥 标准化任务模板（高优先级）

PinchBench 的任务定义非常规范：
```yaml
---
id: task_XX_name
name: Task Display Name
category: category_name
grading_type: automated | llm_judge | hybrid
timeout_seconds: 120
workspace_files: []
---
## Prompt
## Expected Behavior
## Grading Criteria
## Automated Checks (Python grade函数)
## LLM Judge Rubric (带权重的评分标准)
```

**我们的差距**：423 条 golden test 有 V4 字段标准，但缺少像 PinchBench 这样的「可执行评分函数」——每个 case 自带 Python 断言代码。

**建议**：为 golden test 增加 `automated_checks` 字段，写入可执行的 Python 评分函数，实现「case 自带评分逻辑」。

### 3. 🔥 Partial Credit 机制（中优先级）

PinchBench 支持细粒度部分得分（0.0/0.25/0.3/0.5/0.75/1.0），而不是简单的 pass/fail。例如：
- 文件创建了但内容不完整 → 0.5
- 日期格式对了但具体日期错了 → 0.3

**我们的差距**：ISC 规则多为二值判定，缺少「做对了一半」的度量。

**建议**：在 AEO 评分中引入 partial credit，特别是对复杂任务。

### 4. 🟡 可复现的隔离 Workspace（中优先级）

每个 PinchBench 任务有独立的 workspace 目录，预置文件通过 `workspace_files` 声明。评分函数直接检查 workspace 产物。

**我们的差距**：Agent 在共享环境中执行，产物散落各处，难以隔离复现。

**建议**：为 golden test 回归测试设计隔离 workspace 机制。

### 5. 🟡 LLM Judge Rubric 结构化（中优先级）

PinchBench 的 LLM 裁判有严格的 rubric 格式：
- 每个 criterion 有权重（如 45%/30%/25%）
- 每个分数档（1.0/0.75/0.5/0.25/0.0）有明确的文字描述
- 裁判输出 JSON 格式，可解析

**我们的差距**：AEO 评分的 rubric 不够结构化，裁判标准散落在多个文档中。

**建议**：统一 AEO 的 LLM 裁判 rubric 格式，参考 PinchBench 的权重+分档描述模式。

### 6. 🟢 多次运行取均值（低优先级）

PinchBench 支持 `--runs N` 对同一任务多次运行取均值，消除随机性。

**建议**：golden test 回归时可考虑多次运行取均值，但优先级不高。

---

## 四、不适用的点

| 点 | 原因 |
|----|------|
| **公开排行榜** | 我们是内部系统，不需要跨模型公开横评 |
| **单任务短链路设计** | 我们的核心场景是多 Agent 协作长链路，PinchBench 的单任务 120-300s 设计不适用 |
| **OpenClaw 生态绑定** | PinchBench 深度绑定 OpenClaw 的 session/agent API，我们有自己的调度体系 |
| **静态任务集** | 23 个固定任务太少，我们已有 423 条且持续增长，不需要照搬它的任务集 |
| **无根因分析** | PinchBench 只评分不分析为什么失败，我们的根因分析能力是核心优势，不应退化 |
| **无纠偏闭环** | PinchBench 是一次性评测，没有 correction-harvester 这样的持续改进机制 |

---

## 五、建议行动项

| 优先级 | 行动项 | 预估工作量 | 依赖 |
|--------|--------|-----------|------|
| P1 | 看板增加 token 效率追踪（tokens/task、score/1K tokens） | 1-2 天 | 需要从 Agent transcript 提取 token 用量 |
| P1 | golden test 增加可执行 Python 评分函数字段 | 2-3 天 | V4 字段标准扩展 |
| P2 | AEO 评分引入 partial credit（0.0-1.0 连续分） | 1 天 | AEO 评分引擎改造 |
| P2 | 统一 LLM 裁判 rubric 格式（权重+分档描述） | 1 天 | AEO rubric 模板化 |
| P3 | golden test 回归增加隔离 workspace 机制 | 2-3 天 | 需要沙箱或临时目录方案 |
| P3 | golden test 回归支持多次运行取均值 | 0.5 天 | 依赖隔离 workspace |

---

## 六、总结

PinchBench 是一个设计精良的 Agent 横评框架，它的核心优势在于**标准化、可复现、效率度量**。我们的审计体系在**纵深审计、根因分析、纠偏闭环、长链路覆盖**方面远超 PinchBench。

最值得借鉴的两点：
1. **Token 效率指标** — 我们完全缺失，应尽快补上
2. **可执行评分函数** — 让每个 golden test 自带 Python 断言，实现真正的自动化回归
