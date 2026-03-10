# E2E 全链路审计报告（Batch 19：规则 181-186，最后一批）

- 时间：2026-03-10 10:01 GMT+8
- 范围：
  1. rule.vectorization-standard-enforcement-001.json
  2. rule.version-integrity-gate-001.json
  3. rule.visual-output-style-001.json
  4. rule.voice-reply-on-short-response-001.json
  5. rule.wild-script-auto-discovery-001.json
  6. rule.zhipu-capability-router-001.json

## 审计方法

对每条规则执行 4 项检查：
1. **意图注册（intent）** — 规则 id 是否出现在 reference 意图索引中
2. **事件注册（event）** — trigger.events 是否声明且命中参考事件池
3. **感知层探针（probe）** — trigger 结构是否完整可触发
4. **执行层 handler** — handler 文件是否存在、行数、逻辑成熟度

参考基线：`/root/.openclaw/workspace/reports/e2e-audit-reference-data.txt`

---

## 逐条审计

### 1) rule.vectorization-standard-enforcement-001
- **意图注册**：FAIL — reference 中未检索到该 rule id 的 intent 条目
- **事件注册**：PASS — `events.L1: ["isc.rule.matched","isc.category.matched"]`，命中参考事件池
- **感知层探针**：PASS — trigger 结构完整（events + actions + event 均声明）
- **执行层 handler**：PASS — 45 行，Python 内嵌逻辑检查向量文件维度(1024)、引擎(zhipu)、禁 TF-IDF，逻辑成熟
- handler 在 reference HANDLER_FILES 中：✅ 命中

### 2) rule.version-integrity-gate-001
- **意图注册**：FAIL — reference 中未检索到该 rule id 的 intent 条目
- **事件注册**：PASS — `["skill.lifecycle.created","skill.lifecycle.modified"]`，语义合理
- **感知层探针**：PASS — trigger.events 完整
- **执行层 handler**：PASS — 29 行，检查 git diff 中版本号变更与 CHANGELOG 联动，逻辑完整
- handler 在 reference HANDLER_FILES 中：✅ 命中（version-integrity-gate-001.sh）

### 3) rule.visual-output-style-001
- **意图注册**：FAIL — reference 中未检索到该 rule id 的 intent 条目
- **事件注册**：PASS — `["document.diagram.created"]`，语义明确
- **感知层探针**：PASS — trigger 结构完整（events + actions + event）
- **执行层 handler**：⚠️ WEAK — 31 行，但为通用 case 模板，当前 rule id 落入默认 TODO 分支，未实现实际风格检查逻辑
- handler 在 reference HANDLER_FILES 中：✅ 命中

### 4) rule.voice-reply-on-short-response-001
- **意图注册**：FAIL — reference 中未检索到该 rule id 的 intent 条目
- **事件注册**：⚠️ WEAK — 无 `trigger.events` 数组，仅有 `trigger.event: "before_reply"` + `condition`，结构异构
- **感知层探针**：⚠️ WEAK — 使用非标准 trigger schema（event + condition 而非 events 数组）
- **执行层 handler**：PASS — 25 行，根据文本长度判断是否建议语音回复，逻辑完整
- handler 在 reference HANDLER_FILES 中：✅ 命中（voice-reply-on-short-response-001.sh）

### 5) rule.wild-script-auto-discovery-001
- **意图注册**：FAIL — reference 中未检索到该 rule id 的 intent 条目
- **事件注册**：⚠️ WEAK — 无 `trigger.events`，使用 `"trigger": "cron.daily.0900"` 字符串形式，结构异构
- **感知层探针**：⚠️ WEAK — trigger 为 cron 字符串而非标准 events 数组
- **执行层 handler**：PASS — 38 行，扫描 scripts 目录发现未被 SKILL.md 引用的野脚本，逻辑成熟
- handler 在 reference HANDLER_FILES 中：✅ 命中（wild-script-auto-discovery-001.sh）
- ⚠️ 注意：规则 JSON 中 id 为 `ISC-WILD-SCRIPT-AUTO-DISCOVERY-001`（大写），与文件名 `rule.wild-script-auto-discovery-001` 不一致

### 6) rule.zhipu-capability-router-001
- **意图注册**：FAIL — reference 中未检索到该 rule id 的 intent 条目
- **事件注册**：PASS — `["isc.rule.matched","isc.category.matched"]`，命中参考事件池
- **感知层探针**：PASS — trigger 结构完整
- **执行层 handler**：⚠️ WEAK — 19 行，仅做 rule file 存在性和 action 字段 grep 检查，核心路由逻辑为 TODO
- handler 在 reference HANDLER_FILES 中：✅ 命中
- ⚠️ handler 使用相对路径 `scripts/isc-hooks/rule.zhipu-capability-router-001.sh`

---

## Verdict 表

| # | Rule ID | 意图注册 | 事件注册 | 感知层探针 | 执行层handler | handler行数 | 备注 |
|---|---------|----------|----------|------------|---------------|------------:|------|
| 181 | rule.vectorization-standard-enforcement-001 | FAIL | PASS | PASS | PASS | 45 | 逻辑成熟 |
| 182 | rule.version-integrity-gate-001 | FAIL | PASS | PASS | PASS | 29 | 逻辑完整 |
| 183 | rule.visual-output-style-001 | FAIL | PASS | PASS | WEAK | 31 | handler 为通用模板，本规则落入 TODO |
| 184 | rule.voice-reply-on-short-response-001 | FAIL | WEAK | WEAK | PASS | 25 | trigger 结构异构（无 events 数组） |
| 185 | rule.wild-script-auto-discovery-001 | FAIL | WEAK | WEAK | PASS | 38 | trigger 为 cron 字符串；id 大小写不一致 |
| 186 | rule.zhipu-capability-router-001 | FAIL | PASS | PASS | WEAK | 19 | handler 逻辑为骨架 TODO |

## 统计

- 样本数：6
- 四项总检查点：24
- PASS 数（含 WEAK 算 0.5）：
  - 意图注册：0/6（0%）
  - 事件注册：4 PASS + 2 WEAK = 5/6（83%）
  - 感知层探针：4 PASS + 2 WEAK = 5/6（83%）
  - 执行层 handler：3 PASS + 3 WEAK = 4.5/6（75%）
- 严格 PASS 率：11/24 = 45.8%
- 宽松 PASS 率（WEAK 算通过）：19.5/24 = 81.3%

## 发现的问题

1. **意图注册全部缺失** — 6 条规则均未在 reference 意图索引中出现
2. **trigger schema 异构** — rule.voice-reply-on-short-response-001 和 rule.wild-script-auto-discovery-001 使用非标准 trigger 结构
3. **id 不一致** — rule.wild-script-auto-discovery-001.json 内部 id 为 `ISC-WILD-SCRIPT-AUTO-DISCOVERY-001`（大写），与文件名不匹配
4. **handler 骨架化** — visual-output-style-001 和 zhipu-capability-router-001 的 handler 实质为 TODO 占位
5. **handler 路径不统一** — zhipu-capability-router-001 使用相对路径

## 建议修复

1. 补齐 intent 注册索引或更新 reference 基线
2. 统一 trigger schema 为 `events` 数组格式（cron 类型可约定 `events: ["cron.daily.0900"]`）
3. 修正 wild-script-auto-discovery-001.json 的 id 为小写 `rule.wild-script-auto-discovery-001`
4. 为 visual-output-style-001 和 zhipu-capability-router-001 实现实际执行逻辑
5. 统一 handler 路径为绝对路径
