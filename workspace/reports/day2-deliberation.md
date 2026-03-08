# Day 2: Deliberation最小化实现报告

**日期**: 2026-03-05
**执行者**: subagent (day2-deliberation-minimal)
**Commit**: 7843cf5

---

## 裁决殿裁决执行情况

| 裁决要求 | 实现状态 |
|----------|---------|
| deliberation不建独立层 | ✅ 无新层，全部嵌入L3现有决策路径 |
| 在L3决策路径增加decision_log字段 | ✅ 每个决策点都记录decision+why+alternatives_considered |
| 用最小成本实现决策可追溯 | ✅ 增量修改5个现有模块，无新依赖 |

---

## 审查结果：变更前的决策记录缺陷

| 模块 | 变更前 | 变更后 |
|------|--------|--------|
| **DecisionLogger核心** | 无event_id、无decision字段、无alternatives_considered、query不支持事件链 | ✅ 完整支持 |
| **IntentScanner** | why="evidence"(原文照搬)，无降级决策记录 | ✅ why含confidence+排除理由+降级推理 |
| **ISCRuleMatcher** | why="Event: X, source: Y"(泛泛描述) | ✅ why含首选规则+匹配类型+优先级对比 |
| **Dispatcher** | why="handler=X, event=Y"(键值罗列) | ✅ why含路由模式+级别+候选handler列表 |
| **FeatureFlags** | ❌ 无任何DecisionLog | ✅ getWithSource()记录配置来源(env/file/default) |
| **L3Pipeline** | 熔断why="Prevent infinite loop"(固定字符串) | ✅ why含chain_depth数值+event_id联动 |

---

## 变更明细

### 1. DecisionLogger核心增强 (`decision-logger.js`)
- **新增字段**: `event_id`, `decision`, `alternatives_considered`
- **新增API**: `queryChain(eventId)` — 按event_id重建完整决策推理链
- **增强query**: 支持`until`时间范围、`event_id`过滤
- **向后兼容**: 所有新字段可选，默认null/空数组

### 2. IntentScanner (`intent-scanner.js`)
- **LLM路径**: decision_logs现在包含`decision`(选择了什么)、`why`(含confidence对比+排除理由)、`alternatives_considered`(被排除的意图及原因)
- **Regex降级路径**: 同上，额外说明关键词匹配数量和confidence计算公式
- **降级决策**: 新增专门的降级决策记录——记录"为什么从LLM降到regex"(API key缺失/调用失败)

### 3. ISCRuleMatcher (`isc-rule-matcher.js`)
- **match()**: 记录top_rule和alternatives_considered(其余匹配规则的优先级+匹配类型对比)
- **_logDecision()**: why从"Event: X"变为"首选规则: R001(匹配类型=exact, 优先级=80); 事件来源: Y"
- **evaluation**: 条件评估结果完整记录(condition + shouldFire + reason)

### 4. Dispatcher (`dispatcher.js`)
- **logDecision()**: 构建结构化why(路由模式+handler+事件+attempt次数)
- **路由候选**: 收集所有匹配的route candidates，记录alternatives_considered
- **no_route**: 说明检查了多少条路由规则、为什么全部未匹配

### 5. FeatureFlags (`feature-flags.js`)
- **新增API**: `getWithSource(flagName)` — 返回`{value, source}`，自动记录DecisionLog
- **决策记录**: 记录为什么使用这个配置值(env覆盖file?file覆盖default?)
- **alternatives_considered**: 展示其他配置源的值及被覆盖原因

### 6. L3Pipeline (`l3-pipeline.js`)
- **熔断决策**: 增加event_id联动、chain_depth数值推理、alternatives_considered
- **总开关**: 记录pipeline被跳过的配置来源

---

## 决策记录格式（统一规范）

每个L3决策点现在记录：

```json
{
  "id": "auto-generated-uuid",
  "event_id": "evt_001",
  "timestamp": "2026-03-05T02:30:00.000Z",
  "phase": "cognition",
  "component": "ISCRuleMatcher",
  "decision": "匹配规则 N005-知识管理",
  "what": "N005",
  "why": "首选规则: N005(匹配类型=exact, 优先级=80); 排除N010(优先级20,通配)",
  "confidence": 1.0,
  "alternatives_considered": [
    { "id": "N010-通用处理", "priority": 20, "reason": "通配规则优先级低于精确匹配" }
  ],
  "decision_method": "rule_match"
}
```

## 决策链追溯示例

`queryChain('evt_full_chain_001')` 输出：

```
1. [sensing/IntentScanner] 选择意图 IC3-知识分析 — LLM confidence 0.87 > threshold 0.6 (排除: IC1(0.12), IC2(0.05))
2. [cognition/ISCRuleMatcher] 匹配规则 N005-知识管理 — 精确匹配, 优先级80 (排除: N010-通用处理(?))
3. [execution/Dispatcher] 路由到 cras-knowledge-handler — 路由模式: knowledge.analysis.* (排除: *→echo(?))
```

---

## 测试验证

| 测试套件 | 结果 |
|---------|------|
| test-deliberation.js (64项新测试) | ✅ 64/64 通过 |
| test-decision-logger.js (原有) | ✅ 10/10 通过 |
| intent-scanner.test.js (原有) | ✅ 45/45 通过 |
| feature-flags.test.js (原有) | ✅ 22/22 通过 |

**测试覆盖决策点**:
- ✅ IntentScanner: LLM路径why+regex降级why+降级决策
- ✅ ISCRuleMatcher: 匹配alternatives+评估条件+排除记录
- ✅ Dispatcher: 路由推理+候选列表+无路由说明
- ✅ FeatureFlags: 配置溯源(env/file/default)
- ✅ L3Pipeline: 熔断推理+event_id联动
- ✅ 决策链重建(sensing→cognition→execution全链)
- ✅ 格式一致性(5个模块统一decision/why/alternatives_considered)
