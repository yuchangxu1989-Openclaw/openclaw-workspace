# ISC规则审计报告

**审计时间**: 2026-03-10T23:39:16.331Z
**审计器**: isc-rule-auditor.js v1.0

## 概览

| 指标 | 数量 |
|------|------|
| 规则总数 | 187 |
| ✅ 合规 | 171 |
| ⚠️ 警告 | 16 |
| ❌ 违规 | 0 |
| 合规率 | 91% |

## ⚠️ 警告（建议修复）

- **rule.batch-completion-auto-push-001**: handler路径声明存在但文件缺失: handlers/batch-completion-auto-push-001.js
  - 修复: 创建对应handler脚本或修正路径
- **rule.capability-anchor-auto-register-001**: handler路径声明存在但文件缺失: handlers/capability-anchor-auto-register-001.js
  - 修复: 创建对应handler脚本或修正路径
- **rule.capability-gap-auto-learn-001**: handler路径声明存在但文件缺失: handlers/capability-gap-auto-learn-001.js
  - 修复: 创建对应handler脚本或修正路径
- **deep-think-auto-delegate-001**: handler路径声明存在但文件缺失: handlers/deep-think-auto-delegate-001.js
  - 修复: 创建对应handler脚本或修正路径
- **rule.eval-batch-size-limit-001**: handler路径声明存在但文件缺失: infrastructure/event-bus/handlers/eval-batch-size-limit.sh
  - 修复: 创建对应handler脚本或修正路径
- **ISC-EVAL-ROLE-SEPARATION-001**: handler路径声明存在但文件缺失: infrastructure/event-bus/handlers/handle-eval-role-separation-001.sh
  - 修复: 创建对应handler脚本或修正路径
- **rule.isc-auto-programmatic-alignment-001**: handler路径声明存在但文件缺失: infrastructure/event-bus/handlers/handle-isc-auto-programmatic-alignment-001.sh
  - 修复: 创建对应handler脚本或修正路径
- **rule.isc-change-auto-trigger-alignment-001**: handler路径声明存在但文件缺失: handlers/isc-change-auto-trigger-alignment-001.js
  - 修复: 创建对应handler脚本或修正路径
- **rule.isc-skill-usage-protocol-001**: handler路径声明存在但文件缺失: handlers/isc-skill-usage-protocol-001.js
  - 修复: 创建对应handler脚本或修正路径
- **rule.pipeline-benchmark-skill-publish-security-gate-001**: handler路径声明存在但文件缺失: infrastructure/event-bus/handlers/handle-pipeline-benchmark-skill-publish-security-gate-001.sh
  - 修复: 创建对应handler脚本或修正路径
- **rule.pipeline-report-filter-001**: handler路径声明存在但文件缺失: handlers/pipeline-report-filter-001.js
  - 修复: 创建对应handler脚本或修正路径
- **PROJECT-ARTIFACT-GATE-001**: handler路径声明存在但文件缺失: infrastructure/event-bus/handlers/handle-project-artifact-gate-001.sh
  - 修复: 创建对应handler脚本或修正路径
- **rule.project-artifact-settlement-001**: handler路径声明存在但文件缺失: handlers/project-artifact-settlement-001.js
  - 修复: 创建对应handler脚本或修正路径
- **ISC-TASKBOARD-PUSH-001**: handler路径声明存在但文件缺失: handlers/taskboard-push-001.js
  - 修复: 创建对应handler脚本或修正路径
- **TIMEOUT-AUTO-RETRY-001**: handler路径声明存在但文件缺失: handlers/timeout-auto-retry-001.js
  - 修复: 创建对应handler脚本或修正路径
- **USER-MESSAGE-INTENT-PROBE-001**: handler路径声明存在但文件缺失: handlers/user-message-intent-probe-001.js
  - 修复: 创建对应handler脚本或修正路径

## 结论

⚠️ 无阻断性违规，但有 16 条警告需关注。
