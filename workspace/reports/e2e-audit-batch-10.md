# E2E 全链路审计报告（Batch 10：规则 91-100）

- 时间：2026-03-10 09:56 GMT+8
- 范围：
  1. rule.isc-lto-handshake-001.json
  2. rule.isc-naming-convention-001.json
  3. rule.isc-rule-auto-decompose-001.json
  4. rule.isc-rule-creation-dedup-gate-001.json
  5. rule.isc-rule-modified-dedup-scan-001.json
  6. rule.isc-skill-index-auto-update-001.json
  7. rule.isc-skill-permission-classification-031.json
  8. rule.isc-skill-security-gate-030.json
  9. rule.isc-skill-usage-protocol-001.json
  10. rule.isc-standard-format-001.json

## 审计方法
- 对每条规则执行：`jq '{id:.id, trigger_events:.trigger.events, handler:.handler}'`
- 参考基线：`/root/.openclaw/workspace/reports/e2e-audit-reference-data.txt`
- 对 handler 执行：`wc -l` + `head -20`
- 四项检查：
  - 意图注册（intent）
  - 事件注册（event）
  - 感知层探针（probe）
  - 执行层 handler（handler）

## Verdict 表

| Rule ID | 意图注册 | 事件注册 | 感知层探针 | 执行层handler | handler行数 | 备注 |
|---|---|---|---|---|---:|---|
| rule.isc-lto-handshake-001 | FAIL | PASS | PASS | PASS | 21 | reference 中未检索到该 rule id |
| rule.isc-naming-convention-001 | FAIL | PASS | PASS | PASS | 31 | reference 中未检索到该 rule id |
| rule.isc-rule-auto-decompose-001 | FAIL | PASS | PASS | PASS | 27 | reference 中未检索到该 rule id |
| rule.isc-rule-creation-dedup-gate-001 | FAIL | PASS | PASS | PASS | 44 | reference 中未检索到该 rule id |
| rule.isc-rule-modified-dedup-scan-001 | FAIL | PASS | PASS | PASS | 31 | reference 中未检索到该 rule id |
| rule.isc-skill-index-auto-update-001 | FAIL | PASS | PASS | PASS | 16 | reference 中未检索到该 rule id |
| rule.isc-skill-permission-classification-031 | FAIL | PASS | PASS | PASS | 33 | reference 中未检索到该 rule id |
| rule.isc-skill-security-gate-030 | FAIL | PASS | PASS | PASS | 35 | reference 中未检索到该 rule id |
| rule.isc-skill-usage-protocol-001 | FAIL | PASS | PASS | FAIL | 0 | handler 文件缺失：handlers/isc-skill-usage-protocol-001.js |
| rule.isc-standard-format-001 | FAIL | PASS | PASS | PASS | 37 | reference 中未检索到该 rule id |

## 统计
- 样本数：10
- 四项总检查点：40
- PASS 数：29
- 通过率：72.5%

按维度：
- 意图注册：0/10（0%）
- 事件注册：10/10（100%）
- 感知层探针：10/10（100%）
- 执行层 handler：9/10（90%）

## 结论
1. 规则定义中的事件触发与探针覆盖总体完整。
2. 执行层仅 1 条规则存在 handler 缺失（rule.isc-skill-usage-protocol-001）。
3. 意图注册在 reference 数据中均未命中，需确认：
   - 是 reference 数据未纳入该批规则，还是
   - 意图注册链路确实未完成全局展开。

## 建议修复
- 为 `rule.isc-skill-usage-protocol-001` 补齐 handler 文件，或修正 `handler` 路径指向现有实现。
- 补齐/刷新 intent 注册索引（或更新 reference 基线），确保 `rule id -> intent` 可追踪。
- 对绝对路径 handler（如 `/root/.openclaw/workspace/scripts/isc-hooks/...`）统一规范，避免环境迁移时路径失效。
