# CRAS 成长复盘闭环规则化落地说明

生成时间：2026-03-07 00:50 GMT+8  
目标：把“CRAS 每日复盘 → 感悟 → 自动转成任务/规则/评测/次日验证”从想法变成正式程序规则，做到**言出法随**。

---

## 一、已落地的正式闭环

当前仓库内已经具备并已接通的关键链路如下：

1. **复盘产物进入事件总线**
   - 入口事件：`intent.reflect`
   - 已有规则：
     - `skills/isc-core/rules/rule.intent-reflect-dispatch-001.json`
     - `skills/isc-core/rules/rule.intent-reflect-consumption-001.json`
   - 执行处理器：
     - `infrastructure/event-bus/handlers/intent-event-handler.js`

2. **感悟自动沉淀为 CRAS insight**
   - `intent-event-handler.js` 的 `handleReflect()` 会调用：
     - `skills/cras/event-bridge.js#analyzeRequest()`
   - 结果：生成 insight 文件，并发出：
     - `cras.insight.generated`

3. **规则/任务可自动生成**
   - `intent.ruleify` → `handleRuleify()` → 自动生成 ISC 规则草案文件，并发出：
     - `isc.rule.created`
   - `intent.directive` → `handleDirective()` → 自动创建 本地任务编排 任务，并发出：
     - `dto.task.created`

4. **评测沉淀链路已存在**
   - 规则：`skills/isc-core/rules/rule.eval-driven-development-loop-001.json`
   - 评测检查器：
     - `infrastructure/event-bus/handlers/eval-quality-check.js`
   - 本地任务编排/CRAS 桥接：
     - `skills/lto-core/event-bridge.js`
     - `skills/cras/event-bridge.js`

5. **当前最大断点**
   - 复盘事件虽然能生成 insight，但**没有把 insight 强制分解成：任务 / 规则 / 评测 / 次日验证任务**。
   - 也就是说，已有“能分析”，但还没有“必须闭环”。

---

## 二、本次正式规则化结论

从现在起，CRAS 每日复盘产物必须遵守以下**执行性规则**：

### R1. 复盘不是文档，复盘必须产出动作对象
凡进入 `intent.reflect` / CRAS 复盘链路的内容，不允许只停留在 insight；必须最少产出以下四类对象中的一类，优先全产出：
- `dto task`
- `isc rule`
- `eval case / eval report`
- `next-day verification task`

### R2. 感悟必须被类型化
每条复盘感悟必须被判定为以下类别之一：
- `task`：需要一次性执行的动作
- `rule`：需要长期约束的机制
- `eval`：需要被量化验证的能力/假设
- `verify_next_day`：需要次日回看验证是否生效

### R3. 次日验证是强制项
只要复盘产出 `task` / `rule` / `eval` 中任一项，就必须自动生成至少 1 个 `verify_next_day` 本地任务编排 任务。

### R4. 03:00 成长复盘必须作为闭环触发器
后续每日 03:00 成长复盘任务，不应只写报告；它必须同时承担：
- 扫描前一日 `intent.reflect` / CRAS insight
- 自动补齐缺失的 task/rule/eval/verify
- 汇总“昨日闭环完成率”
- 把未验证项目转成当天优先验证任务

---

## 三、正式程序接口定义（规则级）

### 1. 复盘闭环对象模型

统一使用以下逻辑对象：

```json
{
  "source": "intent.reflect | cras.daily.review",
  "source_event_id": "evt_xxx",
  "insight_id": "insight_xxx",
  "insight_summary": "一句话感悟",
  "derived_actions": [
    {
      "kind": "task | rule | eval | verify_next_day",
      "title": "动作标题",
      "description": "执行说明",
      "priority": "P0 | P1 | P2",
      "owner": "system",
      "status": "pending"
    }
  ]
}
```

### 2. 强制闭环判定标准

若一次复盘满足以下任一条件，则视为“高价值复盘”，必须闭环：
- `confidence >= 0.75`
- 包含关键词：`根因` / `教训` / `以后` / `必须` / `不要再` / `下次` / `规则`
- 来源是每日成长复盘任务

### 3. 闭环完整性检查

每条高价值复盘必须满足：
- 至少 1 个 `task`
- `rule` 与 `eval` 至少二选一
- 至少 1 个 `verify_next_day`

否则判定：`closure_incomplete`

---

## 四、应接入的正式执行路径

### 路径 A：复盘产物 → 自动任务
- 输入：`intent.reflect`
- 执行器：`intent-event-handler.js`
- 动作：生成 本地任务编排 task

### 路径 B：复盘产物 → 自动规则
- 输入：高置信复盘 + 含长期约束语义
- 动作：发出 `intent.ruleify` 或直接生成 rule draft

### 路径 C：复盘产物 → 评测沉淀
- 输入：涉及能力判断、效果判断、方法优劣判断的复盘
- 动作：沉淀为 eval case / eval backlog / eval report

### 路径 D：复盘产物 → 次日验证
- 输入：任何 task/rule/eval
- 动作：自动创建 本地任务编排 次日验证任务

---

## 五、建议的正式脚本/规则改造点

以下为**直接可实施**的程序化改造方案，供主代理继续提交代码时使用。

### 改造点 1：给 `intent-event-handler.js` 增加 reflect 闭环分解器

当前：
- `handleReflect()` 只做 CRAS analyzeRequest

应改成：
- `handleReflect()` 在 insight 生成后，继续做 `reflect -> closure decomposition`
- 自动生成：
  - 1个 本地任务编排 task
  - 可选 1个 ISC rule draft
  - 1个 eval backlog对象
  - 1个 next-day verification task

推荐新增函数：
- `deriveClosureArtifactsFromReflect(event, insight)`
- `createNextDayVerificationTask(...)`
- `maybeEmitRuleifyFromReflect(...)`
- `persistReflectClosureRecord(...)`

### 改造点 2：新增 CRAS growth closure ledger

新增目录建议：

- `skills/cras/growth-loop/`
- `skills/cras/growth-loop/closures/`
- `skills/cras/growth-loop/evals/`

每次复盘写入一个 closure record，作为第二天 03:00 任务的输入。

### 改造点 3：新增“每日03:00成长复盘闭环任务”

建议 cron job 语义：
- 扫描前 24h 的：
  - `intent.reflect`
  - `cras.insight.generated`
  - growth-loop closure records
- 执行：
  - 缺 task 补 task
  - 缺 rule 补 rule draft
  - 缺 eval 补 eval backlog
  - 缺 verify 补次日验证任务
- 输出：
  - `reports/cras-growth-loop-daily-YYYY-MM-DD.md`

### 改造点 4：新增 ISC 规则文件约束闭环

建议新增规则（正式文件名建议）：

1. `rule.cras-reflect-must-close-loop-001.json`
   - 约束：高价值 reflect 不允许只生成 insight，必须闭环

2. `rule.cras-growth-review-must-create-next-day-verification-001.json`
   - 约束：所有成长复盘动作项必须有次日验证

3. `rule.cras-daily-review-03-trigger-closure-repair-001.json`
   - 约束：03:00 成长复盘任务必须执行闭环缺口修复

4. `rule.cras-reflect-insight-must-land-to-task-or-rule-001.json`
   - 约束：感悟不是摘要，必须落到 task 或 rule

---

## 六、与“新增每日03:00成长复盘任务”的对接规范

虽然仓库中尚未检出明确名为“每日03:00成长复盘”的 job，但现在可以先正式定义其对接要求：

### 03:00 任务输入
- 前一天全部 `intent.reflect`
- 前一天全部 `cras.insight.generated`
- 前一天全部 `dto.task.created`（由复盘派生）
- 前一天 closure records

### 03:00 任务输出
- `昨日成长复盘闭环日报`
- 自动补齐的 本地任务编排 tasks
- 自动补齐的 ISC rule drafts
- 自动补齐的 eval backlog
- 当天要执行的次日验证任务

### 03:00 任务成功标准
- 前一日高价值复盘闭环率 = 100%
- 缺失闭环项被自动补齐
- 未完成验证项全部转入当天验证队列

---

## 七、正式落地优先级

### P0：必须立刻执行
1. 把 `intent.reflect` 从“只产 insight”升级为“产 closure artifacts”
2. 强制生成 `next-day verification task`
3. 增加 growth-loop closure records

### P1：当天补齐
1. 新增 3~4 条 ISC 正式规则文件
2. 增加 03:00 成长复盘任务脚本
3. 增加闭环完整率报告

### P2：后续增强
1. 自动从复盘文本提取 eval cases
2. 自动把 badcase 反推成 rule candidate
3. 自动统计“复盘 → 次日验证通过率”

---

## 八、最终裁决

**正式规则已经明确：CRAS 每日复盘不再允许只产生感悟文本，必须自动落到任务 / 规则 / 评测 / 次日验证。**

一句话定义：

> 复盘不是总结，复盘是立法；感悟不是感受，感悟是待执行对象；03:00 不是汇报，是闭环修复器。

