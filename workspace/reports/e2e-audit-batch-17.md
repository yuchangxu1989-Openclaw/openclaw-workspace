# E2E 全链路审计报告（Batch 17：规则 161-170）

- 时间：2026-03-10 10:01 GMT+8
- 范围：
  1. rule.skill-distribution-auto-classify-001.json
  2. rule.skill-distribution-separation-001.json
  3. rule.skill.evolution.auto-trigger.json
  4. rule.skill-mandatory-skill-md-001.json
  5. rule.skill-no-direct-llm-call-001.json
  6. rule.skill-post-creation-guard-001.json
  7. rule.spawn-taskboard-hook-001.json
  8. rule.sprint-closure-acceptance-001.json
  9. rule.subagent-checkpoint-gate-001.json
  10. rule.subagent-report-queue-001.json

## 审计方法
- 对每条规则执行：`jq '{id:.id, trigger_events:.trigger.events, handler:.handler}'`
- 参考基线：`/root/.openclaw/workspace/reports/e2e-audit-reference-data.txt`
- 对 handler 执行：`wc -l` + `head -20`
- 四项检查：
  - 意图注册（intent）：rule id 或等价标识在 reference ===HANDLER_FILES=== 中可追踪
  - 事件注册（event）：trigger.events 中声明的事件类型在 reference ===EVENT_TYPES=== 中已注册
  - 感知层探针（probe）：trigger 结构存在且至少声明一个触发事件
  - 执行层 handler（handler）：handler 文件存在于磁盘且行数 > 0

## Verdict 表

| # | Rule ID | 意图注册 | 事件注册 | 感知层探针 | 执行层handler | handler行数 | 备注 |
|--:|---|---|---|---|---|---:|---|
| 161 | rule.skill-distribution-auto-classify-001 | PASS | FAIL | PASS | PASS | 31 | handler 在 reference 命中；trigger events `skill.lifecycle.created/modified` 不在 reference event types 中 |
| 162 | isc-skill-distribution-separation-001 | PASS | FAIL | PASS | PASS | 33 | handler 命中；trigger events `skill.general.publish_requested` 等不在 reference event types 中 |
| 163 | skill.evolution.auto-trigger | PASS | FAIL | PASS | FAIL | 0 | handler 命中（reference 中有 `rule.skill.evolution.auto-trigger.sh`）；但 rule JSON handler 路径为 `scripts/isc-hooks/skill.evolution.auto-trigger.sh`（缺 `rule.` 前缀），实际文件为 `rule.skill.evolution.auto-trigger.sh`，路径不匹配 |
| 164 | rule.skill-mandatory-skill-md-001 | PASS | FAIL | PASS | PASS | 25 | handler 命中；trigger events `isc.rule.matched/isc.category.matched` 不在 reference event types 中 |
| 165 | rule.skill-no-direct-llm-call-001 | PASS | FAIL | PASS | PASS | 19 | handler 命中；trigger events `skill.lifecycle.created/modified` 不在 reference event types 中 |
| 166 | rule.skill-post-creation-guard-001 | PASS | FAIL | WARN | PASS | 88 | handler 命中（两个 handler 文件均存在：rule 版 88 行 + skill 版 31 行）；trigger 为裸字符串 `"skill.created"` 而非标准数组；event `skill.lifecycle.post_creation` 不在 reference 中 |
| 167 | ISC-SPAWN-TASKBOARD-HOOK-001 | PASS | FAIL | FAIL | PASS | 19 | handler 命中；trigger.events 为 null（仅有 `trigger.event: agent.task.spawned`），探针结构不完整 |
| 168 | ⚠️ id=null (sprint-closure-acceptance) | PASS | FAIL | PASS | PASS | 31 | handler 命中；**rule id 为 null**，需补齐；trigger events 中 `sprint.closure.requested` 等不在 reference event types 中；handler 为模板代码（case 分支未覆盖自身 rule id） |
| 169 | rule.subagent-checkpoint-gate-001 | PASS | FAIL | WARN | PASS | 17 | handler 命中；trigger.events 为嵌套对象 `{META:[...]}` 非标准数组，探针结构非规范 |
| 170 | ⚠️ id=null (subagent-report-queue) | PASS | FAIL | WARN | PASS | 39 | handler 命中；**rule id 为 null**，需补齐；trigger.events 为 null（仅有 `trigger.event`），探针结构不完整 |

## 统计
- 样本数：10
- 四项总检查点：40
- PASS 数：20
- WARN 数：3
- FAIL 数：17
- 通过率（PASS only）：50.0%
- 通过率（PASS+WARN）：57.5%

按维度：
| 维度 | PASS | WARN | FAIL | 通过率 |
|---|---:|---:|---:|---|
| 意图注册 | 10 | 0 | 0 | 100% |
| 事件注册 | 0 | 0 | 10 | 0% |
| 感知层探针 | 6 | 3 | 1 | 60% |
| 执行层 handler | 9 | 0 | 1 | 90% |

## 缺陷分类

### P0 — 结构性缺陷
1. **rule.sprint-closure-acceptance-001** — `id` 字段为 null，规则缺少身份标识
2. **rule.subagent-report-queue-001** — `id` 字段为 null，规则缺少身份标识
3. **skill.evolution.auto-trigger** — handler 路径 `skill.evolution.auto-trigger.sh` 与实际文件 `rule.skill.evolution.auto-trigger.sh` 不匹配，运行时将 handler not found

### P1 — 探针结构异常
4. **rule.spawn-taskboard-hook-001** — `trigger.events` 为 null，仅有非标准 `trigger.event` 单值字段
5. **rule.subagent-report-queue-001** — 同上，`trigger.events` 为 null
6. **rule.subagent-checkpoint-gate-001** — `trigger.events` 为嵌套对象 `{META:[...]}` 而非标准数组
7. **rule.skill-post-creation-guard-001** — trigger 为裸字符串而非标准结构

### P2 — 事件未注册
8. 全部 10 条规则的 trigger events 均不在 reference event types 基线中。涉及事件类型：
   - `skill.lifecycle.created`, `skill.lifecycle.modified`
   - `skill.general.publish_requested`, `skill.evomap.requested`, `skill.evomap.sync`
   - `skill.usage.pattern_detected`, `skill.performance.degraded`, `skill.evolution.scheduled`
   - `isc.rule.matched`, `isc.category.matched`
   - `skill.lifecycle.post_creation`, `skill.created`
   - `agent.task.spawned`, `subagent.task.completed`
   - `sprint.closure.requested`, `sprint.day.closure.requested`, `project.milestone.closure.requested`
   - `orchestration.task.created`, `orchestration.task.timeout`, `orchestration.task.truncated`

### P3 — 实现质量
9. **rule.sprint-closure-acceptance-001** — handler 为模板代码（通用 case 分支），`$RULE_ID` 未匹配自身，实际逻辑为空
10. **rule.skill-distribution-auto-classify-001** — handler 同为模板代码，case 分支未覆盖自身 rule id

## 建议修复
1. 为 `rule.sprint-closure-acceptance-001` 和 `rule.subagent-report-queue-001` 补齐 `id` 字段
2. 修正 `rule.skill.evolution.auto-trigger.json` 中 handler 路径为 `scripts/isc-hooks/rule.skill.evolution.auto-trigger.sh`
3. 将非标准 trigger 结构（裸字符串、嵌套对象、单值 event）统一为 `trigger.events: [...]` 数组格式
4. 将全部 20 个自定义事件类型注册到 eventbus event type registry
5. 替换模板 handler（rule 161、168）为针对自身 rule id 的实际逻辑
