# 事件链 P0 缺口修复优先级 & 验收标准

**生成时间：** 2026-03-06  
**来源：** key-event-routing-audit.md 的 P0 项  
**目的：** 热修后快速复核，按 ROI 排序，每项含精确验收步骤

---

## 全局验收基线

修复前确认 cron-dispatch.log 中 `dispatched>0 matched:0` 的情况（已有实测记录）：
```
Done: 2/2 dispatched, stats: {"dispatched":2,"matched":0,"executed":0,"skipped":0,"failed":0}
```

**修复后通用检查命令：**
```bash
# 手动触发一次 cron-dispatch-runner
node /root/.openclaw/workspace/infrastructure/event-bus/cron-dispatch-runner.js
# 然后看日志
tail -3 /root/.openclaw/workspace/infrastructure/logs/cron-dispatch.log
```
期望：`matched > 0, executed > 0`（对应修复的事件类型）

---

## P0 排序（按 ROI 从高到低）

### #1 P0-01 ── intent.detected 命名错位

**ROI 最高：1 行 JSON 改动，15 个已入队事件立即激活，handler 文件已存在**

**修复位置：**
```
skills/isc-core/rules/rule.semantic-intent-event-001.json
```

**改动：**
```json
// 修改前
"events": ["cras.intent.detected"]
// 修改后
"events": ["intent.detected"]
```

**验收标准：**
1. 在 events.jsonl 中找任意一条 `intent.detected` 的 id，手动重放：
   ```bash
   node -e "
   const {Dispatcher}=require('./infrastructure/event-bus/dispatcher');
   const d=new Dispatcher();d.init().then(()=>d.dispatch('intent.detected',{intent_id:'IC1',confidence:0.8}));
   " 2>&1 | grep -E "executed|matched|semantic-intent"
   ```
2. 检查 handler 执行记录：
   ```bash
   grep "semantic-intent-event-001" /root/.openclaw/workspace/infrastructure/logs/dispatcher-actions.jsonl | tail -3
   ```
   期望：出现 `"ruleId":"rule.semantic-intent-event-001"` + `"status":"executed"`
3. 检查 handler-actions.jsonl：
   ```bash
   grep "semantic-intent-event" /root/.openclaw/workspace/infrastructure/logs/handler-actions.jsonl | tail -3
   ```
   期望：有新增条目，`handler: "semantic-intent-event"`

---

### #2 P0-05 ── aeo_evaluation_required 格式错位（n023/n024/n026 永不触发）

**ROI 极高：3 个规则文件各改 1 个字段，handler eval-quality-check.js 已存在**

**修复位置：**
```
skills/isc-core/rules/rule.n023-auto-aeo-evaluation-standard-generation-023.json
skills/isc-core/rules/rule.n024-aeo-dual-track-orchestration-024.json
skills/isc-core/rules/rule.n026-aeo-insight-to-action-026.json
```

**n023 / n024 改动：**
```json
// 修改前（两个文件都有）
"events": ["aeo_evaluation_required", ...]
// 修改后
"events": ["aeo.evaluation.completed", "aeo.assessment.completed", ...]
```

**n026 改动：**
```json
// 修改前
"events": ["aeo_issue_frequency_threshold_exceeded", "n020_analysis_completed"]
// 修改后
"events": ["aeo.evaluation.completed", "n020_analysis_completed"]
// （aeo_issue_frequency_threshold_exceeded 当前无发射者，用 aeo.evaluation.completed 作为触发点兜底）
```

**验收标准：**
1. 触发一次 aeo.evaluation.completed：
   ```bash
   node -e "
   const {Dispatcher}=require('./infrastructure/event-bus/dispatcher');
   const d=new Dispatcher();d.init().then(()=>d.dispatch('aeo.evaluation.completed',{skill:'test',score:0.8}));
   "
   ```
2. 检查三条规则均被命中：
   ```bash
   grep -E "n023|n024|n026" /root/.openclaw/workspace/infrastructure/logs/dispatcher-actions.jsonl | tail -6
   ```
   期望：n023、n024、n026 各出现至少 1 条 `executed` 记录

---

### #3 P0-03 ── git.commit.completed 100 次 NO_ROUTE

**ROI 高：100 个已在队列的事件，handler public-skill-quality-gate.js 已存在，只需在规则里加 1 个事件类型**

**修复位置（二选一）：**
- 方案 A（推荐）：修改 `skills/isc-core/rules/rule.public-skill-quality-gate-001.json`
  ```json
  // trigger.events 数组中追加
  "git.commit.completed"
  ```
- 方案 B：新建 `rule.git-commit-dispatch-001.json` 做 fanout 路由

**验收标准：**
1. 检查 dispatcher 接收到 git.commit.completed 后有 match：
   ```bash
   node -e "
   const {Dispatcher}=require('./infrastructure/event-bus/dispatcher');
   const d=new Dispatcher();d.init().then(()=>d.dispatch('git.commit.completed',{commit:'abc123',file_count:1,files:['workspace/skills/test/SKILL.md'],categories:{skills:1}}));
   "
   ```
2. 验证规则命中：
   ```bash
   grep "public-skill-quality-gate" /root/.openclaw/workspace/infrastructure/logs/dispatcher-actions.jsonl | tail -3
   ```
   期望：出现 `"eventType":"git.commit.completed"` + `"ruleId":"rule.public-skill-quality-gate-001"`
3. 检查 cron-dispatch 下次运行时 matched > 0：
   ```bash
   tail -1 /root/.openclaw/workspace/infrastructure/logs/cron-dispatch.log
   ```
   期望：`"matched":N` N > 0（有 git 提交在 5min 窗口内）

---

### #4 P0-02 ── intent.ruleify / intent.reflect 等 44 次无路由

**ROI 高：CRAS 主动学习核心链路，44 个已入队事件（ruleify:20, reflect:11, directive:10, feedback:3）**

**修复：新建规则文件**
```
skills/isc-core/rules/rule.intent-action-routing-001.json
```

**最小可用规则结构：**
```json
{
  "id": "rule.intent-action-routing-001",
  "rule_name": "CRAS意图子类型路由",
  "version": "1.0.0",
  "severity": "high",
  "trigger": {
    "events": ["intent.ruleify", "intent.reflect", "intent.directive", "intent.feedback"]
  },
  "action": {
    "type": "handler",
    "handler": "discovery-rule-creation"
  }
}
```
> 备注：`discovery-rule-creation.js` handler 已存在，可路由 ruleify/reflect 类型；
> directive 类型可后续升级为 `enforcement-engine` handler。

**验收标准：**
1. 触发测试事件：
   ```bash
   node -e "
   const {Dispatcher}=require('./infrastructure/event-bus/dispatcher');
   const d=new Dispatcher();
   d.init().then(async()=>{
     await d.dispatch('intent.ruleify',{intent_type:'RULEIFY',target:'test',confidence:0.9});
     await d.dispatch('intent.reflect',{intent_type:'REFLECT',target:'test',confidence:0.85});
   });
   "
   ```
2. 验证四种意图类型均路由成功：
   ```bash
   grep "intent-action-routing-001" /root/.openclaw/workspace/infrastructure/logs/dispatcher-actions.jsonl | tail -5
   ```
   期望：`intent.ruleify` 和 `intent.reflect` 都出现匹配记录
3. handler 执行记录：
   ```bash
   grep "discovery-rule-creation" /root/.openclaw/workspace/infrastructure/logs/handler-actions.jsonl | tail -3
   ```
   期望：有新增条目

---

### #5 P0-06 ── system.error 无消费路径

**ROI 中高：安全底线，notify-alert.js handler 已存在，改动极小（修改 1 个现有规则）**

**修复位置：**
```
skills/isc-core/rules/rule.knowledge-must-be-executable-001.json
```

**改动：** 在 trigger.events 中追加 `system.error`：
```json
"events": ["system.error.lesson_extracted", "system.error"]
```

> 或新建 `rule.system-error-alert-001.json`（更清晰但稍费时间）：
> ```json
> {
>   "id": "rule.system-error-alert-001",
>   "trigger": { "events": ["system.error"] },
>   "action": { "type": "handler", "handler": "notify-alert" }
> }
> ```

**验收标准：**
1. 触发 system.error 测试事件：
   ```bash
   node -e "
   const {Dispatcher}=require('./infrastructure/event-bus/dispatcher');
   const d=new Dispatcher();
   d.init().then(()=>d.dispatch('system.error',{message:'test error',source:'event-bridge',severity:'critical'}));
   "
   ```
2. 验证 alerts.jsonl 中有新告警写入：
   ```bash
   tail -3 /root/.openclaw/workspace/infrastructure/logs/alerts.jsonl
   ```
   期望：出现 `"eventType":"system.error"` + `"handler":"notify-alert"` 的新条目
3. 验证 dispatcher 命中：
   ```bash
   grep "system.error" /root/.openclaw/workspace/infrastructure/logs/dispatcher-actions.jsonl | grep -v "lesson" | tail -3
   ```
   期望：出现 `"eventType":"system.error"` 的 executed 记录

---

### #6 P0-04 ── threshold 4 类事件无路由（告警基础设施缺口）

**ROI 中：0 次历史记录，但告警链路缺失风险高；threshold-scanner 实时运行，事件随时会来**

**修复：新建规则**
```
skills/isc-core/rules/rule.threshold-alert-routing-001.json
```

```json
{
  "id": "rule.threshold-alert-routing-001",
  "rule_name": "阈值告警路由",
  "version": "1.0.0",
  "severity": "critical",
  "trigger": {
    "events": [
      "isc.yellow_light.threshold_crossed",
      "system.eventbus.size_threshold_crossed",
      "system.handler.failure_threshold_crossed",
      "system.eventbus.backlog_threshold_crossed"
    ]
  },
  "action": {
    "type": "handler",
    "handler": "notify-alert"
  }
}
```

**验收标准：**
1. 查看 threshold-scanner 是否有事件发射记录：
   ```bash
   grep "threshold_crossed" /root/.openclaw/workspace/infrastructure/logs/threshold-scanner.log | tail -5
   ```
2. 强制触发 threshold 事件：
   ```bash
   node -e "
   const {Dispatcher}=require('./infrastructure/event-bus/dispatcher');
   const d=new Dispatcher();
   d.init().then(()=>d.dispatch('isc.yellow_light.threshold_crossed',{current:0.35,threshold:0.3,metric:'yellow_light_ratio'}));
   "
   ```
3. 验证 alerts.jsonl 写入：
   ```bash
   tail -3 /root/.openclaw/workspace/infrastructure/logs/alerts.jsonl
   ```
   期望：`"eventType":"isc.yellow_light.threshold_crossed"` + `"severity":"critical"` 的新条目
4. 在 threshold-scanner 下一个周期（约 5min）后，确认 cron-dispatch.log 中：
   ```bash
   grep "threshold_crossed" /root/.openclaw/workspace/infrastructure/logs/cron-dispatch.log | tail -3
   ```
   期望：如果 threshold 确实被触发，`matched > 0`

---

## 快速对照表

| 优先级 | P0 编号 | 影响事件量 | 修复方式 | 改动量 | 验收关键日志 |
|--------|---------|-----------|---------|--------|------------|
| **#1** | P0-01 intent.detected 错位 | 15次（已入队） | 修改 1 个 JSON 字段 | 1 行 | `dispatcher-actions.jsonl` 含 `semantic-intent-event-001` |
| **#2** | P0-05 aeo_evaluation_required 格式 | n023/n024/n026 全死 | 修改 3 个 JSON 字段 | 3 行 | `dispatcher-actions.jsonl` 含 n023/n024/n026 |
| **#3** | P0-03 git.commit.completed 无路由 | 100次（已入队） | 现有规则加 1 个事件 | 1 行 | `dispatcher-actions.jsonl` 含 `public-skill-quality-gate` |
| **#4** | P0-02 intent.ruleify 等无路由 | 44次（已入队） | 新建 1 个规则文件 | ~10 行 | `dispatcher-actions.jsonl` 含 `intent-action-routing-001` |
| **#5** | P0-06 system.error 无路由 | 0次（当前） | 现有规则加 1 个事件 | 1 行 | `alerts.jsonl` 含 `system.error` |
| **#6** | P0-04 threshold 4 事件无路由 | 0次（潜在） | 新建 1 个规则文件 | ~15 行 | `alerts.jsonl` 含 `threshold_crossed` |

---

## 热修后一键复核脚本

```bash
#!/bin/bash
# 运行位置: /root/.openclaw/workspace/
LOGS=/root/.openclaw/workspace/infrastructure/logs

echo "=== P0 修复验收 ==="
echo ""

echo "[P0-01] intent.detected routing:"
grep -c "semantic-intent-event-001" $LOGS/dispatcher-actions.jsonl 2>/dev/null && echo "  ✅ matched" || echo "  ❌ 0 matches"

echo "[P0-05] aeo rules routing:"
for rule in n023 n024 n026; do
  count=$(grep -c "\"$rule\"" $LOGS/dispatcher-actions.jsonl 2>/dev/null || echo 0)
  [ "$count" -gt "0" ] && echo "  ✅ $rule: $count matches" || echo "  ❌ $rule: 0 matches"
done

echo "[P0-03] git.commit.completed routing:"
grep -c "public-skill-quality-gate" $LOGS/dispatcher-actions.jsonl 2>/dev/null && echo "  ✅ matched" || echo "  ❌ 0 matches"

echo "[P0-02] intent subtypes routing:"
grep -c "intent-action-routing-001" $LOGS/dispatcher-actions.jsonl 2>/dev/null && echo "  ✅ matched" || echo "  ❌ 0 matches"

echo "[P0-06] system.error routing:"
grep -c "system.error" $LOGS/alerts.jsonl 2>/dev/null && echo "  ✅ alert written" || echo "  ❌ no alerts"

echo "[P0-04] threshold routing:"
grep -c "threshold_crossed" $LOGS/alerts.jsonl 2>/dev/null && echo "  ✅ alert written" || echo "  ❌ no alerts"
```

---

*质量仲裁官出品 | 基于 key-event-routing-audit.md + 实测 cron-dispatch.log*
