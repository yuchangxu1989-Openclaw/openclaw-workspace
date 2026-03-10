# E2E Audit Batch 09（规则81-90）

审计时间：2026-03-10  
审计范围：`/root/.openclaw/workspace/skills/isc-core/rules` 指定10条规则  
审计方法：按要求执行 `jq` 检查 `id/trigger.events/handler`，并对 handler 执行 `wc -l` + `head -20`；对照 `reports/e2e-audit-reference-data.txt`（事件注册与handler文件基线）。

## Verdict 表

| # | 规则文件 | 意图注册 | 事件注册 | 感知层探针 | 执行层 handler | Verdict |
|---|---|---|---|---|---|---|
| 81 | rule.intent-会话记忆机制-f2lei.json | ✅ (`id`存在) | ✅ (`intent.ruleify`在参考事件中) | ⚠️ 弱（仅intent触发，未见额外探针事件） | ❌ `session-memory-mechanism` 不存在（非路径，无法`wc/head`） | **FAIL** |
| 82 | rule.intent-子agent产出自动发送-g7wmm7.json | ✅ | ✅ (`intent.ruleify`) | ⚠️ 弱 | ❌ `subagent-output-auto-send` 不存在 | **FAIL** |
| 83 | rule.intent-子agent深度思考委派机制-2l6fsj.json | ✅ | ✅ (`intent.ruleify`) | ⚠️ 弱 | ❌ `deep-thinking-delegation` 不存在 | **FAIL** |
| 84 | rule.intent-规则命名规范与去重技能-pop4vq.json | ✅ | ✅ (`intent.ruleify`) | ⚠️ 弱 | ❌ 相对路径 `scripts/isc-hooks/...` 在当前目录下不存在（应为绝对路径或正确相对根） | **FAIL** |
| 85 | rule.interaction-source-file-delivery-007.json | ✅ (`id=N007-v2`) | ⚠️ 部分通过（`user.request.source_file`,`session.received.file_request` 未出现在参考事件列表） | ✅ 双事件覆盖文件请求场景 | ✅ `/root/.openclaw/workspace/scripts/isc-hooks/N007-v2.sh` 存在（31行） | **PASS(有事件注册漂移风险)** |
| 86 | rule.interactive-card-context-inference-001.json | ✅ | ⚠️ 部分通过（`session.reply.received` 未在参考事件列表） | ✅ 对 reply payload 做 context/thread 字段探测 | ✅ handler存在（17行） | **PASS(有事件注册漂移风险)** |
| 87 | rule.isc-auto-programmatic-alignment-001.json | ✅ | ⚠️ 部分通过（`isc.rule.created`在参考中；`isc.rule.modified/deleted`与参考`updated`命名不一致） | ✅ 规则生命周期事件覆盖较完整 | ❌ `infrastructure/event-bus/handlers/handle-...sh` 路径不存在 | **FAIL** |
| 88 | rule.isc-change-auto-trigger-alignment-001.json | ✅ | ⚠️ 部分通过（`isc.rule.matched`,`isc.category.matched`未见于参考） | ✅ 匹配态触发可作为变更探针 | ❌ `handlers/isc-change-auto-trigger-alignment-001.js` 不存在 | **FAIL** |
| 89 | rule.isc-creation-gate-001.json | ✅ | ⚠️ 部分通过（matched类事件未在参考） | ✅ 具备创建门禁触发点 | ✅ handler存在（31行） | **PASS(有事件注册漂移风险)** |
| 90 | rule.isc-evomap-mandatory-security-scan-032.json | ✅ | ⚠️ 部分通过（`evomap.*`未在参考事件列表） | ✅ 清单驱动+安全扫描探针明确 | ✅ handler存在（42行） | **PASS(有事件注册漂移风险)** |

## 汇总

- 总计：10
- 通过（PASS）：4
- 失败（FAIL）：6
- **通过率：40%**

## 关键发现

1. **执行层缺失是主因（6/10）**：
   - 81/82/83 使用了非文件型 handler 名称（疑似逻辑名），落地脚本未解析到真实文件。
   - 84 使用相对路径且相对基准不正确。
   - 87/88 handler 指向路径不存在。
2. **事件注册与参考基线存在漂移**：
   - 多条规则使用了未出现在参考中的事件名（如 `session.reply.received`、`isc.rule.matched`、`evomap.*`）。
   - `isc.rule.modified` vs 参考 `isc.rule.updated` 存在命名不一致。
3. **感知层整体可用但intent类规则探针偏弱**：
   - 81-84 仅 `intent.ruleify`，缺少更细粒度输入条件探针。

## 建议（最小修复优先级）

- P0：补齐/修正 81/82/83/84/87/88 的 handler 文件路径，确保 `wc/head` 可达。
- P1：统一事件命名词表（尤其 `modified/updated`，以及 matched/session/evomap 事件是否应补录到全局注册表）。
- P2：为 81-84 增补感知层触发条件（例如 `intent.directive`、`intent.feedback` 或专用事件）。
