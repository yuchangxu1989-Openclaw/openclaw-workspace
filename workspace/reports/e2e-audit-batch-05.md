# E2E 全链路审计报告（Batch 05：第41-50条）

- 审计时间：2026-03-10 09:51 GMT+8
- 审计范围：`skills/isc-core/rules` 中第41-50条规则
- 审计方法：
  - `jq '{id:.id, trigger_events:.trigger.events, handler:.handler}'`
  - 参考对照：`/root/.openclaw/workspace/reports/e2e-audit-reference-data.txt`
  - handler检查：`wc -l` + `head -20`
- 四项检查维度：
  1. 意图注册（intent registration）
  2. 事件注册（event registration）
  3. 感知层探针（sensor/probe）
  4. 执行层 handler（executable handler）

---

## 1) rule.eval-batch-size-limit-001.json
- ID：`rule.eval-batch-size-limit-001`
- 触发声明：`trigger.events = null`（`jq`提取为空）
- handler（规则内声明）：`infrastructure/event-bus/handlers/eval-batch-size-limit.sh`（路径失配）
- 实际handler定位：`./scripts/isc-hooks/rule.eval-batch-size-limit-001.sh`（51行）
- 结论：
  - 意图注册：未见显式意图路由字段（部分满足）
  - 事件注册：缺失/不规范（`trigger.events`为空）
  - 感知层探针：有（检查config与task board批量上限）
  - 执行层handler：有实现，但**规则内路径与实际文件不一致**

## 2) rule.eval-data-source-redline-001.json
- ID：`rule.eval-data-source-redline-001`
- 触发事件：
  - `aeo.evaluation.dataset_created`
  - `aeo.evaluation.dataset_modified`
- handler（规则内声明）：`handlers/eval-data-source-redline.js`（路径失配）
- 实际handler定位：`./scripts/isc-hooks/rule.eval-data-source-redline-001.sh`（18行）
- 结论：
  - 意图注册：未见显式intent字段（部分满足）
  - 事件注册：已注册（2个事件）
  - 感知层探针：有（扫描synthetic/generated/fabricated/imagined标记）
  - 执行层handler：有实现，但**声明路径与实际不一致，且实现语言形态不一致（json写JS路径，实际为SH）**

## 3) rule.eval-driven-development-loop-001.json
- ID：`rule.eval-driven-development-loop-001`
- 触发事件：
  - `skill.general.created`
  - `skill.general.created`（重复）
  - `system.general.created`
  - `quality.general.completed`
- handler（规则内声明）：`scripts/isc-hooks/rule.eval-driven-development-loop-001.sh`（路径从workspace根看不存在）
- 实际handler定位：`./scripts/isc-hooks/rule.eval-driven-development-loop-001.sh`（21行）
- 结论：
  - 意图注册：未见显式intent字段（部分满足）
  - 事件注册：有，但含重复事件项（质量问题）
  - 感知层探针：有（技能目录下eval/tests覆盖率检查）
  - 执行层handler：有；**路径基准不统一导致解析失败风险**

## 4) rule.eval-mining-intent-route-001.json
- ID：`rule.eval-mining-intent-route-001`
- 触发声明：`trigger`为字符串 `user.intent.eval_mining`（非`trigger.events`结构）
- handler（规则内声明）：`handlers/eval-mining-intent-route.js`
- 实际handler定位：`./skills/isc-core/handlers/eval-mining-intent-route.js`（78行）
- 结论：
  - 意图注册：**已显式注册**（`user.intent.eval_mining` + `keywords_hint`）
  - 事件注册：不适用/未按events数组注册（模型差异）
  - 感知层探针：有（关键词识别MINING_KEYWORDS）
  - 执行层handler：有实现（JS）

## 5) rule.eval-must-include-multi-turn-001.json
- ID：`rule.eval-must-include-multi-turn-001`
- 触发事件：
  - `aeo.evaluation.dataset_created`
  - `aeo.evaluation.dataset_modified`
- handler（规则内声明）：`infrastructure/event-bus/handlers/eval-must-include-multi-turn.sh`（路径失配）
- 实际handler定位：`./scripts/isc-hooks/rule.eval-must-include-multi-turn-001.sh`（32行）
- 结论：
  - 意图注册：未见显式intent字段（部分满足）
  - 事件注册：已注册
  - 感知层探针：有（多轮样本比例>=40%校验）
  - 执行层handler：有实现，但**声明路径与实际不一致**

## 6) rule.eval-role-separation-001.json
- ID：`ISC-EVAL-ROLE-SEPARATION-001`
- 触发声明：`trigger.events = null`（`jq`提取为空）
- handler（规则内声明）：`infrastructure/event-bus/handlers/handle-eval-role-separation-001.sh`（相对规则目录失配）
- 实际handler定位：`./skills/isc-core/infrastructure/event-bus/handlers/handle-eval-role-separation-001.sh`（40行）
- 结论：
  - 意图注册：未见显式intent字段
  - 事件注册：JSON未给出events；但handler注释注明触发`eval.case.execution.completed`
  - 感知层探针：有（evaluator/executor agentId分离校验）
  - 执行层handler：有实现（SH）

## 7) rule.eval-sample-auto-collection-001.json
- ID：`rule.eval-sample-auto-collection-001`
- 触发事件：
  - `event.general.classified`
  - `orchestration.general.completed`
  - `quality.general.failed`
- handler（规则内声明）：`handlers/eval-sample-auto-collection.js`
- 实际handler定位：`./skills/isc-core/handlers/eval-sample-auto-collection.js`（113行）
- 结论：
  - 意图注册：未见显式intent字段（以事件驱动为主）
  - 事件注册：已注册（3个事件）
  - 感知层探针：有（按intent/event/pipeline分类采样）
  - 执行层handler：有实现（JS）

## 8) rule.evalset-cron-daily-generation-001.json
- ID：`rule.evalset-cron-daily-generation-001`
- 触发事件：`cron.evalset.daily`
- handler（规则内声明）：`handlers/evalset-cron-daily-generation.js`
- 实际handler定位：`./skills/isc-core/handlers/evalset-cron-daily-generation.js`（143行）
- 结论：
  - 意图注册：无（cron型规则）
  - 事件注册：已注册（cron事件）
  - 感知层探针：有（来源合规、去重、closed-book安全）
  - 执行层handler：有实现（JS）

## 9) rule.eval-standard-auto-sync-001.json
- ID：`rule.eval-standard-auto-sync-001`
- 触发声明：`trigger`为字符串 `eval.standard.version.changed`（非`trigger.events`结构）
- handler（规则内声明）：`scripts/isc-hooks/rule.eval-standard-auto-sync-001.sh`
- 实际handler定位：`./scripts/isc-hooks/rule.eval-standard-auto-sync-001.sh`（81行）
- 结论：
  - 意图注册：无（标准变更事件驱动）
  - 事件注册：已注册（但采用字符串trigger模型）
  - 感知层探针：有（文档hash变化检测）
  - 执行层handler：有实现（SH）

## 10) rule.failure-pattern-alert-001.json
- ID：`rule.failure-pattern-alert-001`
- 触发事件：`system.failure.pattern_detected`
- handler（规则内声明）：`scripts/isc-hooks/rule.failure-pattern-alert-001.sh`
- 实际handler定位：`./scripts/isc-hooks/rule.failure-pattern-alert-001.sh`（19行）
- 结论：
  - 意图注册：无（告警事件驱动）
  - 事件注册：已注册
  - 感知层探针：有（日志失败模式聚合检测）
  - 执行层handler：有实现（SH）

---

## 汇总结论（第41-50条）

- **意图注册**：
  - 显式完备：1/10（`rule.eval-mining-intent-route-001`）
  - 其余多为事件/cron驱动，未显式intent。

- **事件注册**：
  - 明确事件数组：6/10
  - 字符串trigger模型：2/10（`eval-mining-intent-route`, `eval-standard-auto-sync`）
  - 缺失/空：2/10（`eval-batch-size-limit`, `eval-role-separation`）
  - 另发现1处重复事件声明（`eval-driven-development-loop`）

- **感知层探针**：
  - 10/10均存在可执行探针逻辑（关键词匹配、比例校验、目录扫描、hash校验、日志模式分析等）。

- **执行层handler**：
  - 10/10均可定位到真实handler文件。
  - 但存在**多处路径基准不一致**（规则json中的handler路径与仓库真实路径偏移），可能导致调度器按声明路径加载失败。

- **对照参考数据一致性**：
  - 参考文件中可见目标handler文件名均存在（如 `rule.eval-batch-size-limit-001.sh`, `rule.eval-standard-auto-sync-001.sh`, `rule.failure-pattern-alert-001.sh`），与本次“文件存在性”审计结论一致。

---

## 问题清单（需修复）

1. 规则Schema不统一：`trigger.events[]` 与 `trigger: string` 混用，导致统一`jq`提取失败。  
2. handler路径声明不统一：相对路径基准混乱（`skills/isc-core/`前缀有无不一致）。  
3. `rule.eval-driven-development-loop-001.json` 存在重复事件项。  
4. `rule.eval-batch-size-limit-001` 与 `ISC-EVAL-ROLE-SEPARATION-001` 的事件注册信息在JSON层不完整（为空/null）。

---

## 审计结论

第41-50条规则整体已具备“可执行handler + 可感知探针”的基础能力，但在“声明层规范化（触发模型、路径模型、去重）”上仍存在系统性偏差。当前状态可判定为：

- **执行链路：基本可用**
- **注册链路：部分失真（需标准化修复）**
- **全局展开真实性：成立，但存在声明-实现偏移**
