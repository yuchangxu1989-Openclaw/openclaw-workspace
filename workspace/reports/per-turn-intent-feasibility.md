# P0 任务：每轮对话意图洞察强制化 — 可行性验证

> 时间：2026-03-08
> 范围：`skills/cras` 意图扫描模块 + `infrastructure/event-bus` 事件总线能力

## 1. 现状扫描结论

### 1.1 CRAS 侧已有能力（与本任务强相关）

已发现可直接复用的意图模块：

- `skills/cras/intent-inline-hook.js`
  - 已实现“单条消息实时语义意图提取 + 立即 emit 事件”
  - 分类固定为 5 类：`RULEIFY/QUERY/FEEDBACK/DIRECTIVE/REFLECT`
  - LLM 超时硬限制：`INLINE_TIMEOUT_MS = 3000ms`
  - 失败降级：LLM 失败后走 heuristic（关键词启发）
  - 输出事件前缀：`intent.inline.{type}`
- `skills/cras/intent-extractor-inline.js`
  - 明确定位“快路（inline hook）”
  - 支持阻塞/非阻塞两种模式，默认非阻塞（fire-and-forget）
  - 支持最小文本长度过滤、置信度过滤、去重（10min 窗口）
  - 事件 emit 已接入 event bus adapter

**结论**：方案 A/B/C 都不是“从零开发”，核心提取能力已具备，重点在接入策略和调度策略。

### 1.2 Event Bus 侧能力（与触发进化强相关）

已发现能力：

- `infrastructure/event-bus/bus-adapter.js`
  - 统一对外 `emit/consume`
  - 5 秒风暴抑制（按 type+payload fingerprint）
  - 元数据注入（`trace_id/chain_depth/layer`）
  - 熔断器检查（`circuit-breaker`）
- `infrastructure/event-bus/README.md`
  - JSONL append-only 事件总线
  - 支持 wildcard 类型过滤、ack、history、stats
  - 10MB 日志轮转 + archive
- `infrastructure/event-bus/handlers/` 下存在意图相关处理器：
  - `intent-event-handler.js`
  - `semantic-intent-event.js`
  - `intent-boundary.js`
  - `intent-type-convergence.js`
  - `intent-unknown-discovery.js`
  - 以及 `skill-evolution-trigger.js`

**结论**：事件总线已具备“意图事件 -> 规则处理 -> 进化触发”的基础设施，主要缺口是“每轮都保证触发”的编排保证与 SLA 监控。

---

## 2. 三种方案可行性评估

评估维度：延迟影响、token 消耗、准确率、实现复杂度。

## 2.1 方案 A：在主 Agent 每轮回复前插入意图分析 hook

### 方案描述
在主回复链路中，先执行意图提取，再生成最终回复（pre-hook，偏同步门控）。

### 可行性
**可行，但高风险影响交互体验**。现有 `intent-inline-hook.js` 可直接改为 blocking 使用。

### 评估
- 延迟影响：**高**
  - 每轮至少增加一次意图调用时延（典型 200ms~2s，最坏触发 3s timeout）
  - 用户可感知首 token 延迟明显增加
- token 消耗：**中-高**
  - 严格“每轮强制”会把闲聊也纳入，调用次数最大
- 准确率：**高（单轮视角）**
  - 因为拿到最新用户输入，时效最好
  - 但若为控时强降 prompt，复杂意图可能被简化
- 实现复杂度：**中**
  - 技术改造不难（hook 位点已具备）
  - 难点在回归：要验证所有渠道不会因超时影响主回复

### 风险
- 在高并发或模型波动时，主对话 SLA 被意图模块拖累。

---

## 2.2 方案 B：异步 post-hook，回复后台分析意图并 emit 事件

### 方案描述
主回复完成后异步触发意图分析（或用户消息到达后并行触发但不阻塞回复），完成后 emit 到 event bus，由后续 handler 触发进化。

### 可行性
**高度可行，且与现有代码最匹配**。`intent-extractor-inline.js` 默认就是非阻塞模式。

### 评估
- 延迟影响：**低**
  - 理论上对用户回复路径几乎 0 影响（仅新增异步任务调度成本）
- token 消耗：**中**
  - 每轮仍会调用，但可通过阈值/采样/文本长度过滤下降成本
- 准确率：**中-高**
  - 单轮语义准确率接近 A
  - 但异步链路可能有丢失（进程退出、任务中断），需幂等补偿
- 实现复杂度：**低-中**
  - 大量能力已现成（non-blocking + event bus + handlers）
  - 需补“可靠投递与补偿扫描”

### 风险
- 不是强一致：回复已发出，意图分析可能稍后才完成。

---

## 2.3 方案 C：利用 CRAS 快通道 5min 批量扫描最近对话

### 方案描述
由 cron/runner 每 5 分钟扫描最近会话批量提取意图，再统一 emit 事件。

### 可行性
**可行，适合兜底与成本优化，不适合作为唯一主路径**。

### 评估
- 延迟影响：**极低（对实时对话）**
  - 完全脱离主回复链路
- token 消耗：**低-中（可控）**
  - 批处理可压缩上下文、合并调用
  - 但若对话量巨大，批扫总量仍可观
- 准确率：**中**
  - 优势：可利用多轮上下文，减少单轮误判
  - 劣势：实时性差，短生命周期意图可能错失最佳触发窗口
- 实现复杂度：**中-高**
  - 要处理游标、去重、幂等、重放、批次失败恢复

### 风险
- 事件触发滞后（最长 5min+），不满足“每轮立即进化感知”的产品预期。

---

## 3. 三方案横向对比（摘要）

| 维度 | 方案A 前置同步 | 方案B 异步后置 | 方案C 5min批扫 |
|---|---|---|---|
| 对回复延迟影响 | 高 | 低 | 极低 |
| token 消耗 | 中-高 | 中 | 低-中 |
| 意图时效性 | 高 | 高（轻微异步） | 低 |
| 准确率 | 高 | 中-高 | 中（多轮增强但滞后） |
| 实现复杂度 | 中 | 低-中 | 中-高 |
| 工程风险 | 高（SLA） | 低 | 中 |

---

## 4. 推荐方案

**推荐：B 为主、C 为兜底（B+C 组合），不建议 A 作为默认全量策略。**

原因：
1. 目标是“每轮都洞察并触发进化”，同时不能牺牲主 Agent 响应体验。
2. 当前代码库已天然偏向 B（非阻塞 inline + event bus 处理链）。
3. C 可作为“补偿机制”覆盖 B 的异步漏单，形成最终一致。
4. A 可只在高价值会话/关键渠道做灰度（例如特定 session tag）。

---

## 5. 实现路线图（可落地）

### Phase 1（1~2天）：打通“每轮触发”最小闭环（B主路径）

1. 在主消息处理入口统一接入 `InlineIntentHook.onMessage(text, context)`（非阻塞）。
2. 统一 event type 命名（建议保留 `intent.inline.*`，并在 handler 层做标准化映射）。
3. 在 event bus handler 中建立“意图 -> 进化动作”最小链路（复用 `intent-event-handler.js` + `skill-evolution-trigger.js`）。
4. 增加观测指标：
   - per-turn 触发率
   - 提取成功率 / fallback 率
   - event emit 成功率
   - 从用户消息到 evolution trigger 的 P95 延迟

### Phase 2（2~4天）：可靠性增强（B 完整化）

1. 增加异步任务幂等键（session_id + message_id + intent_fp）。
2. 增加失败重试队列（指数退避，上限次数）。
3. 对 event-bus 抑制策略做白名单：避免误抑制高价值 intent 事件。
4. 对 heuristic fallback 打标，后续用于质量回放。

### Phase 3（3~5天）：加入 C 作为补偿扫描

1. 建立 5min 扫描任务：按 cursor 读取最近新增对话。
2. 仅补偿“未产生日志/事件”的消息，避免重复计费。
3. 与快路共享 fingerprint 去重策略（已有雏形，可统一到单模块）。
4. 输出补偿报告：漏检率、补偿命中率、重复率。

### Phase 4（持续）：质量优化与灰度 A

1. 维护标注集（可从 `intent-eval-cases.json` 演进）。
2. 分意图类型监控 precision/recall。
3. 对关键场景灰度 A（同步 pre-hook），验证收益是否显著高于延迟代价。

---

## 6. 最终结论（P0）

- “每轮对话都自动洞察用户意图并触发进化”**技术上可行**。
- 基于现有代码，**最快可行路径是方案 B**（异步 post-hook），并配合 **方案 C** 做最终一致补偿。
- 方案 A 不建议全量启用，除非接受明显响应时延上升。

> 建议决策：立即立项 **B+C**，先交付可观测的“每轮触发率 >= 95%”版本，再迭代到 >= 99%（含补偿）。
