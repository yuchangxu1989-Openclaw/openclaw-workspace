# 关键事件路由稽核报告

**生成时间：** 2026-03-06  
**稽核范围：** `/root/.openclaw/workspace` 仓库  
**稽核范围：** 关键事件白名单 × dispatcher/rule/handler 消费路径  
**基础文件：** `events.jsonl`（1025行）、`skills/isc-core/rules/`（107条规则）、`infrastructure/event-bus/handlers/`（64个Handler）

---

## 一、关键事件白名单 + 路由状态汇总

| 事件 | 实际发生量 | 发射者 | 规则覆盖 | Handler | 状态 |
|------|----------|--------|---------|---------|------|
| `intent.detected` | 15次 | IntentScanner | ❌ 无（mismatch） | — | **P0 NO_ROUTE** |
| `intent.ruleify` | 20次 | cras-intent-extractor | ❌ 无 | — | **P0 NO_ROUTE** |
| `intent.reflect` | 11次 | cras-intent-extractor | ❌ 无 | — | **P0 NO_ROUTE** |
| `intent.directive` | 10次 | cras-intent-extractor | ❌ 无 | — | **P1 NO_ROUTE** |
| `intent.feedback` | 3次 | cras-intent-extractor | ❌ 无 | — | **P1 NO_ROUTE** |
| `intent.unmatched` | 0次 | intent-unknown-discovery.js | ❌ 无 | — | **P1 NO_ROUTE** |
| `intent.boundary.resolved` | 0次 | intent-boundary.js | ❌ 无 | — | **P1 无消费** |
| `git.commit.completed` | 100次 | git-sensor | ❌ 无 | — | **P0 NO_ROUTE** |
| `git.pre_commit.detected` | 22次 | git-sensor | ❌ 无 | — | **P1 NO_ROUTE** |
| `git.commit.skills_public` | 0次 | git-sensor（条件触发） | ✅ public-skill-quality-gate | ✅ | OK（但从未触发） |
| `isc.yellow_light.threshold_crossed` | 0次* | threshold-scanner | ❌ 无 | — | **P0 NO_ROUTE** |
| `system.eventbus.size_threshold_crossed` | 0次* | threshold-scanner | ❌ 无 | — | **P1 NO_ROUTE** |
| `system.handler.failure_threshold_crossed` | 0次* | threshold-scanner | ❌ 无 | — | **P1 NO_ROUTE** |
| `system.eventbus.backlog_threshold_crossed` | 0次* | threshold-scanner | ❌ 无 | — | **P1 NO_ROUTE** |
| `isc.enforcement_rate.threshold_crossed` | 7次 | threshold-scanner | ✅ arch-rule-equals-code-002 | ✅ | OK |
| `lto.signal.created` | 历史有 | lto-signals-watcher | ❌ 无 | — | **P1 NO_ROUTE** |
| `lto.sync.completed` | 历史有 | lto-core | ❌ 无 | — | **P1 NO_ROUTE** |
| `lto.task.completed` | 3次 | lto-core | ❌ 无 | — | **P1 NO_ROUTE** |
| `lto.task.created` | 634次 | lto-core | ✅ 3条规则 | ⚠️ log-action | **P1 半消费** |
| `lto.task.updated` | 0次（规则有定义） | 无发射者 | ✅ cron-task-model-req | log-action | 幽灵规则 |
| `lto.task.validated` | 0次（规则有定义） | 无发射者 | ✅ cron-task-model-req | log-action | 幽灵规则 |
| `aeo.assessment.batch` | 历史有 | skills/aeo | ❌ 无 | — | **P1 NO_ROUTE** |
| `aeo.assessment.completed` | 3次 | aeo + lto-core | ❌ 无 | — | **P1 NO_ROUTE** |
| `aeo.evaluation.completed` | 3次 | skills/aeo | ❌ 无 | — | **P1 NO_ROUTE** |
| `aeo.evaluation.dataset_created` | 0次 | 无发射者 | ✅ eval-data-source / eval-multi-turn | eval-quality-check | OK（但僵死） |
| `aeo_evaluation_required` | **从不发射** | — | ✅ n023/n024（underscore格式） | eval-quality-check | **P0 格式错位** |
| `aeo_issue_frequency_threshold_exceeded` | **从不发射** | — | ✅ n026 | eval-quality-check | **P0 格式错位** |
| `system.error` | 0次（运行时） | lto-core/event-bridge.js | ❌ 无直接消费 | — | **P0 NO_ROUTE** |
| `system.error.lesson_extracted` | 0次 | 无发射者 | ✅ knowledge-must-be-executable | knowledge-executable | 僵死 |
| `orchestration.general.requested` | 0次 | 无 | ✅ parallel-subagent-001 | — | OK |
| `orchestration.pipeline.completed` | 0次 | 无发射者 | ✅ arch-gate-001 | enforcement-engine | 僵死 |
| `orchestration.execution.completed` | 0次 | 无发射者 | ✅ n016 | auto-fix | 僵死 |
| `orchestration.subagent.dispatch` | 历史有 | parallel-subagent handler | ❌ 无 | — | **P1 NO_ROUTE** |
| `orchestration.parallel.configured` | 历史有 | multi-agent-priority handler | ❌ 无 | — | **P1 NO_ROUTE** |
| `orchestration.parallel.config.failed` | 历史有 | multi-agent-priority handler | ❌ 无 | — | **P1 NO_ROUTE** |

> `0次*` = 当前events.jsonl中未出现，但sensor运行时会发射。

---

## 二、P0问题详情（阻塞级，必须修复）

### P0-01：`intent.detected` 事件命名错位，rule.semantic-intent-event-001 永远不触发

**现象：**
- `IntentScanner` 通过 `bus-adapter` 发射：`intent.detected`
- `rule.semantic-intent-event-001` 监听：`cras.intent.detected`
- `cras.intent.detected` 在整个代码库**从未被发射**

**影响：**
- 语义意图事件规则自创建以来 **0次触发**
- 15条 `intent.detected` 事件全部落空
- 意图→动作的闭环链路完全断开

**修复：**
```json
// rule.semantic-intent-event-001.json
"trigger": {
  "events": ["intent.detected"]  // 改: cras.intent.detected → intent.detected
}
```

---

### P0-02：`intent.ruleify` / `intent.reflect` 等CRAS意图子类型无任何路由

**现象：**
- `cras-intent-extractor` 发射细粒度意图事件：`intent.ruleify`(20次)、`intent.reflect`(11次)、`intent.directive`(10次)、`intent.feedback`(3次)
- 白名单中无任何规则消费这些事件

**影响：**
- CRAS主动学习结果无法触发下游规则创建/更新
- `intent.ruleify` 是"用户教学→规则化"的核心信号，完全掉地

**修复：**
```json
// 新建规则 rule.intent-action-routing-001.json
"trigger": {
  "events": ["intent.ruleify", "intent.reflect", "intent.directive", "intent.feedback"]
}
// handler: 区分 intent_type 进行路由（ruleify→isc-rule-decompose，directive→enforcement-engine）
```

---

### P0-03：`git.commit.completed` 100次全量 NO_ROUTE

**现象：**
- `git-sensor` 每次提交发射 `git.commit.completed`（events.jsonl中100条记录）
- 代码库107条规则中**无一监听此事件**
- 仅存在 `git.commit.skills_public`（条件判断后发射，从未触发）

**影响：**
- 所有代码变更事件无法触发skill质量门、architecture review、rule-code pairing检查
- git.commit.completed 是整个CI-like自动化的入口事件，完全失效

**修复：**
```json
// rule.public-skill-quality-gate-001.json 添加
"events": ["skill.public.pre_publish", "skill.public.modified", "git.commit.skills_public", "git.commit.completed"]

// 或新建 rule.git-commit-dispatch-001.json 做 fanout 路由
```

---

### P0-04：`threshold.*` 空间 4 条事件无路由

**现象：**
- `threshold-scanner` 实际发射事件使用非统一格式：
  - `isc.yellow_light.threshold_crossed` → **无任何规则消费**
  - `system.eventbus.size_threshold_crossed` → **无任何规则消费**
  - `system.handler.failure_threshold_crossed` → **无任何规则消费**
  - `system.eventbus.backlog_threshold_crossed` → **无任何规则消费**
- 仅 `isc.enforcement_rate.threshold_crossed` 有 `rule.arch-rule-equals-code-002` 消费

**影响：**
- 告警触发后无任何自动修复或通知动作
- 黄灯规则比率超阈、事件积压超阈均静默失败

**修复（选项A）：** 在 threshold-config.json 中统一 eventType 格式：
```json
"eventType": "threshold.yellow_light.crossed"  // 统一使用 threshold.* 命名空间
```
然后新建 `rule.threshold-alert-routing-001.json` 监听 `threshold.*`，handler: `notify-alert`

**修复（选项B）：** 为每个已有 eventType 单独补规则消费。

---

### P0-05：`aeo_evaluation_required` 格式错位，n023/n024/n026 永远不触发

**现象：**
- `rule.n023`, `rule.n024` 监听：`aeo_evaluation_required`（下划线格式）
- `rule.n026` 监听：`aeo_issue_frequency_threshold_exceeded`（下划线格式）
- 整个代码库**无任何地方发射这两个事件**（发射的是 `aeo.evaluation.completed`, `aeo.assessment.completed`）

**影响：**
- AEO评测标准自动生成（n023）从未触发
- AEO双轨编排（n024）从未触发
- AEO洞察转行动（n026）从未触发
- 三条规则自创建起 **0次执行**

**修复：**
```json
// rule.n023, n024, n026 中修改 events 字段
// 改: "aeo_evaluation_required" → "aeo.evaluation.completed"
// 改: "aeo_issue_frequency_threshold_exceeded" → 新增专门发射此事件的传感器
```

---

### P0-06：`system.error` 无直接消费路径

**现象：**
- `skills/lto-core/event-bridge.js` 在异常时发射 `system.error`
- 唯一相关规则 `rule.knowledge-must-be-executable-001` 监听的是 `system.error.lesson_extracted`（细粒度子事件），不监听 `system.error`

**影响：**
- 系统错误发生后无任何自动响应（通知/修复/告警）

**修复：**
```json
// rule.knowledge-must-be-executable-001 或新建 rule.system-error-alert-001
"events": ["system.error", "system.error.lesson_extracted"]
// handler: notify-alert（P0告警）
```

---

## 三、P1问题详情（重要，应在当前sprint内修复）

### P1-01：`lto.task.created` 634次半消费（主消费规则为 log-action）

**现象：**
- `lto.task.created` 是事件总线中频率最高事件（634条）
- `rule.cron-task-model-requirement-001` 消费此事件，但 handler = `log-action`（纯日志，无实际执行）
- `rule.anti-entropy-design-principle-001` 和 `rule.layered-decoupling-architecture-001` 也消费，但均无强制执行动作

**修复：**
```json
// rule.cron-task-model-requirement-001 的 action.handler 改为真正执行器
// 如: "handler": "isc-lto-handshake" 或 "handler": "enforcement-engine"
```

---

### P1-02：`lto.signal.created` / `lto.task.completed` / `lto.sync.completed` 无路由

**现象：**
- `lto-signals-watcher` 发射 `lto.signal.created` 后直接调用 `event-bridge`（绕过dispatcher）
- `lto.task.completed`（3次）、`lto.sync.completed` 落空

**修复：** 新增规则监听 `lto.signal.created`，触发 本地任务编排-AEO 流水线（替代当前直接调用模式）

---

### P1-03：`aeo.assessment.completed` / `aeo.evaluation.completed` 无路由

**现象：**
- AEO评测完成后无任何下游动作
- `aeo.general.completed` 有 `rule.scenario-acceptance-gate-001` 消费，但实际发射的是 `aeo.assessment.completed` 和 `aeo.evaluation.completed`（事件命名不一致）

**修复：**
- 要么统一发射 `aeo.general.completed`（改emitter）
- 要么在规则中添加 `aeo.assessment.completed`, `aeo.evaluation.completed` 到监听列表

---

### P1-04：`orchestration.subagent.dispatch` / `orchestration.parallel.*` 无路由

**现象：**
- `parallel-subagent-orchestration.js` handler 发射 `orchestration.subagent.dispatch`
- `multi-agent-priority.js` handler 发射 `orchestration.parallel.configured` / `orchestration.parallel.config.failed`
- 无任何规则监听这三个事件

**修复：** 在 `rule.task-orchestration-quality-001` 或 `rule.parallel-subagent-orchestration-001` 中添加这些事件

---

### P1-05：多条高严重性规则使用 log-action（实质半消费）

| 规则 | 严重级 | 事件 | 问题 |
|------|--------|------|------|
| rule.cras-dual-channel-001 | high | cras.scan.completed | log-action无执行 |
| rule.memory-digest-must-verify-001 | high | knowledge.general.updated | log-action无执行 |
| rule.umr-domain-routing-001 | — | user.general.message | 路由规则只记日志 |
| rule.umr-intent-routing-001 | — | user.general.message | 路由规则只记日志 |

**修复：** 为这些规则实现真正的handler（`routing-dispatcher`, `cras-dual-channel-handler`等）

---

### P1-06：已废弃的 `event-bus.js` 产生数据分裂

**现象：**
- `event-bus.js`（标记为 @deprecated）写入 `data/events.jsonl`（17行）
- `bus.js`（活跃）写入 `events.jsonl`（1025行）
- `cron-dispatch-runner.js` 只读 `events.jsonl`
- 14条 `intent.detected` 事件在 `data/events.jsonl` 中（来自早期测试），从未被dispatcher处理

**修复：**
1. 立即禁止任何代码使用 `event-bus.js`（当前仅在 `data/` 目录存有少量测试数据）
2. 将 `data/events.jsonl` 中有效事件迁移合并到主 `events.jsonl`

---

### P1-07：`git.pre_commit.detected` 22次 NO_ROUTE

**现象：** git-sensor 发射，无任何规则消费。pre-commit 检查无自动化响应。

**修复：** 新增规则或在 `rule.public-skill-quality-gate-001` 中添加此事件

---

## 四、规则健康状态总览

```
总规则数：107
有Handler的规则：105（98.1%）
Handler文件缺失：0（全部通过basename fallback解析）

路由状态：
  有效路由：      ~67条规则正常匹配+执行
  僵死规则：       ~8条（监听的事件从未发射）
  半消费规则：    ~10条（log-action作为handler）
  格式错位：       3条（aeo_*/intent错位）
```

### 僵死规则（监听事件从未发射）

| 规则 | 监听事件 | 问题 |
|------|---------|------|
| rule.five-layer-event-model-001 | event.general.created, event.general.emitted | 无人发射这两个事件 |
| rule.orchestration-pipeline-related | orchestration.pipeline.completed | 无人发射 |
| rule.system.error.lesson_extracted | system.error.lesson_extracted | 无人发射此细粒度事件 |
| rule.caijuedian-tribunal-001 | "review.rejection.count >= 2"（非法表达式） | 条件语法错误 |
| rule.cron-task-model-req: lto.task.updated | lto.task.updated | 无人发射 |

---

## 五、修复优先级清单

### P0 阻塞项（立即修复）

| ID | 问题 | 修复动作 | 预计工时 |
|----|------|---------|---------|
| P0-01 | intent.detected → cras.intent.detected 命名错位 | 修改 rule.semantic-intent-event-001.json 的 events 字段 | 5分钟 |
| P0-02 | intent.ruleify/reflect/directive 无路由 | 新建 rule.intent-action-routing-001.json | 30分钟 |
| P0-03 | git.commit.completed 100次 NO_ROUTE | 修改 rule.public-skill-quality-gate-001 添加此事件，或新建分发规则 | 15分钟 |
| P0-04 | threshold 4条事件无路由 | 新建 rule.threshold-alert-routing-001.json，handler=notify-alert | 30分钟 |
| P0-05 | aeo_evaluation_required 格式错位（n023/n024/n026永不触发） | 修改这三条规则的 events 字段 | 15分钟 |
| P0-06 | system.error 无消费路径 | 修改或新建规则添加 system.error 监听 | 15分钟 |

### P1 重要项（本Sprint内完成）

| ID | 问题 | 修复动作 |
|----|------|---------|
| P1-01 | lto.task.created 634次半消费（log-action） | 升级 handler 为真正执行器 |
| P1-02 | lto.signal.created/task.completed 无路由 | 新增规则或修改现有 lto 规则 |
| P1-03 | aeo.assessment.completed/aeo.evaluation.completed 无路由 | 统一 aeo 事件命名 + 规则补充 |
| P1-04 | orchestration.subagent.dispatch 等无路由 | 在 orchestration 相关规则中补充 |
| P1-05 | high-severity 规则使用 log-action | 实现真正的 handler |
| P1-06 | 废弃 event-bus.js 数据分裂 | 禁用 event-bus.js，合并数据 |
| P1-07 | git.pre_commit.detected 无路由 | 添加规则监听 |

---

## 六、根因分析

1. **事件命名无强制规范**：intent.detected vs cras.intent.detected、aeo.* vs aeo_* 等混用，缺少统一注册表和发布校验
2. **"Rule=Code"配对检查不完整**：有规则JSON但未验证监听的事件是否真实存在于codebase中（反向校验缺失）
3. **Handler占位符问题**：log-action 被大量用作占位符，规则"通过"了质量门但实际无效
4. **事件发射点分散**：git-sensor、threshold-scanner、intent-engine、lto-core、aeo 各自独立发射，无集中的"事件目录"对照规则白名单做路由完备性检查
5. **测试覆盖不足**：events.jsonl中100条 git.commit.completed 从未有任何dispatcher处理记录，长期未被发现

---

## 七、建议增加的基础设施

1. **事件路由完备性检查**（加入 gate 流程）：
   - 定期扫描 events.jsonl，统计 NO_ROUTE 事件
   - 如某类型超过10次未消费，自动告警
   
2. **事件命名注册表**：建立 `infrastructure/event-bus/EVENT_REGISTRY.md`，列出所有合法事件类型、格式要求和对应消费者

3. **规则健康检查**：在 `threshold-scanner` 中增加 `rule_trigger_coverage_rate` 指标，检测僵死规则比例

---

*稽核人：质量仲裁官 | 方法：代码分析 + 事件日志分析 + 规则-Handler映射验证*
