# 野生脚本技能归属分析

**生成时间**: 2026-03-09 15:53 CST  
**分析范围**: `/root/.openclaw/workspace/scripts/` 下 87 个非薄封装脚本  
**排除**: 7 个薄封装脚本 (auto-badcase-harvest.sh, completion-handler.sh, push-feishu-board.sh, register-task.sh, show-task-board-feishu.sh, show-task-board.sh, update-task.sh)

## 分析方法

1. **读取脚本头部注释** — 了解用途、设计意图
2. **检查被调用关系** — cron/jobs.json 引用、pre-commit hook 引用、其他脚本交叉引用
3. **匹配现有技能目录** — 对照 skills/ 和 skills/public/ 下的技能
4. **频率判定标准**:
   - **高频**: 被 cron/pre-commit 自动调用，或日常运维必需
   - **中频**: 被其他脚本引用，或偶尔手动调用
   - **低频**: 一次性/实验/验证性脚本
   - **一次性**: 明确的 PoC、pilot、实验、临时修复

---

## 归属映射表

| # | 脚本 | 用途 | 频率 | 归属技能 | 处置建议 |
|---|------|------|------|---------|---------|
| 1 | api-failover-probe.sh | API Provider 失败探测+飞书告警 | 中 | skills/public/system-monitor | 收编 |
| 2 | api-key-probe.sh | API Key余额探针，heartbeat调用 | 中 | skills/public/system-monitor | 收编 |
| 3 | api-probe.js | API Provider 全量探测（读openclaw.json） | 中 | skills/public/system-monitor | 收编 |
| 4 | auto-grant-feishu-perm.sh | 飞书文档自动授权 | 中 | skills/public/auto-grant-feishu-perm | 已有对应技能，收编 |
| 5 | auto-skill-discovery.sh | 扫描scripts/找未技能化脚本候选 | 低 | skills/public/skill-creator-addon | 收编 |
| 6 | audit-cron-model-policy.js | 审计cron jobs模型策略合规 | 中 | skills/isc-core | 收编 |
| 7 | backup-rotate.sh | 多版本轮转备份 | 中 | （新建）ops-maintenance | 收编 |
| 8 | backup.sh | OpenClaw workspace备份（cron引用） | 高 | （新建）ops-maintenance | 收编 |
| 9 | badcase-to-goodcase.sh | badcase→goodcase 自动翻转 | 中 | skills/public/badcase-to-goodcase | 已有对应技能，收编 |
| 10 | c2-admission-gate.js | C2评测用例准入门禁（pre-commit调用） | 高 | skills/public/eval-mining | 收编 |
| 11 | check-dependency-direction.js | 依赖方向CI门禁 | 高 | skills/isc-core | 收编 |
| 12 | check-opus-key.sh | 检测Opus API Key可用性 | 低 | skills/public/system-monitor | 归档 |
| 13 | check-rule-dedup.js | ISC规则去重检查（pre-commit调用） | 高 | skills/isc-core | 收编 |
| 14 | check-version-integrity.js | 版本号诚实性门禁 | 中 | skills/isc-core | 收编 |
| 15 | classify-skill-distribution.js | 技能分发类型分类检查 | 低 | skills/isc-core | 收编 |
| 16 | config-api-protocol-check.js | openclaw.json API协议一致性校验 | 低 | skills/isc-core | 收编 |
| 17 | cras-daily-report.sh | CRAS每日洞察报告汇总（cron引用） | 高 | skills/cras | 收编 |
| 18 | cras-d-doc-publish.js | CRAS-D 研究报告飞书发布 | 中 | skills/cras | 收编 |
| 19 | cras-d-materialize-action-cards.js | CRAS-D 行动卡片物化 | 中 | skills/cras | 收编 |
| 20 | cras-d-refresh-research.js | CRAS-D 研究刷新（Tavily搜索） | 中 | skills/cras | 收编 |
| 21 | cras-d-research-report.js | CRAS-D 研究策略报告生成 | 中 | skills/cras | 收编 |
| 22 | cras-e-capture.js | CRAS-E 事件捕获 | 中 | skills/cras | 收编 |
| 23 | cras-e-status.js | CRAS-E 状态报告 | 中 | skills/cras | 收编 |
| 24 | critical-files-check.sh | 关键系统文件存在性检查 | 中 | （新建）ops-maintenance | 收编 |
| 25 | daily-ops-report.js | 每日运维报告生成器 | 高 | skills/daily-ops-report | 已有对应技能，收编 |
| 26 | day2-gap3-aeo-close-loop.js | AEO闭环验证脚本 | 低 | skills/aeo | 归档 |
| 27 | day2-top3-main-implementation.js | L3 全链路主入口实现 | 中 | skills/lep-executor | 收编 |
| 28 | degradation-drill.js | 降级演练脚本 | 低 | skills/isc-core | 归档 |
| 29 | delegation-guard-check.sh | 主Agent委派守卫检查 | 中 | skills/isc-core | 收编 |
| 30 | dependency-check.js | 依赖方向检查（增强版，5条规则） | 高 | skills/isc-core | 收编（合并check-dependency-direction.js） |
| 31 | detect-deep-think-intent.sh | 深度思考意图探测 | 中 | skills/public/detect-deep-think-intent | 已有对应技能，收编 |
| 32 | detect-user-emphasis.js | 用户反复强调概念探测 | 低 | skills/cras | 收编 |
| 33 | doc-quality-gate-hook.sh | 文档质量门禁感知探针 | 中 | skills/isc-document-quality | 收编 |
| 34 | enforcement-poc.js | ISC Runtime Enforcement PoC | 一次性 | skills/isc-core | 归档 |
| 35 | eval-case-runner.js | 评测用例执行（角色分离引擎） | 中 | skills/public/eval-runner | 收编 |
| 36 | eval-codex-pilot.js | Codex模型评测 Pilot | 一次性 | — | 归档 |
| 37 | eval-engine.sh | 评测用例角色分离引擎入口 | 中 | skills/public/eval-runner | 收编 |
| 38 | eval-glm5-fewshot-pilot.js | GLM-5 Few-shot评测 Pilot | 一次性 | — | 归档 |
| 39 | eval-opus-pilot.js | Opus模型评测 Pilot | 一次性 | — | 归档 |
| 40 | eval-stats.sh | 评测集V3实时统计（cron引用） | 高 | skills/public/eval-mining | 收编 |
| 41 | evomap-manual-sync.sh | EvoMap手动同步 | 低 | skills/evomap-uploader | 收编 |
| 42 | fix-goodcases-fields.js | 修复goodcases字段分类 | 一次性 | — | 归档 |
| 43 | gateway-memory-governor.sh | Gateway内存外部治理（每5分钟） | 高 | skills/public/system-monitor | 收编 |
| 44 | gateway-monitor.sh | Gateway内存监控与自动重启 | 中 | skills/public/system-monitor | 收编（被v2替代） |
| 45 | gateway-monitor-v2.sh | Gateway内存监控增强v2（cron引用） | 高 | skills/public/system-monitor | 收编 |
| 46 | install-hooks.sh | 安装ISC pre-commit hook | 低 | skills/isc-core | 收编 |
| 47 | intent-harvest-dispatch.sh | 意图探针→harvest分发 | 中 | skills/cras | 收编 |
| 48 | intent-probe.sh | 用户消息意图探针v2 | 中 | skills/cras | 收编 |
| 49 | isc-auto-align.sh | ISC规则自动对齐（pre-commit调用） | 高 | skills/public/isc-auto-align | 已有对应技能，收编 |
| 50 | isc-c2-regression.sh | C2自动采集回归测试 | 中 | skills/public/eval-runner | 收编 |
| 51 | isc-cron-scan.sh | ISC Cron批量扫描入口 | 中 | skills/isc-core | 收编 |
| 52 | isc-enforcement-verifier.js | ISC规则执行绑定状态检查 | 中 | skills/isc-core | 收编 |
| 53 | isc-pre-commit-check.js | ISC Pre-Commit检查（pre-commit调用） | 高 | skills/isc-core | 收编 |
| 54 | key-management.sh | API Key统一管理 | 低 | skills/zhipu-keys | 收编 |
| 55 | l3-pipeline-cron.js | L3 Pipeline Cron入口（每5分钟） | 高 | skills/lep-executor | 收编 |
| 56 | l3-verify-e2e.js | L3闭环真实验证 | 低 | skills/lep-executor | 归档 |
| 57 | live-task-queue-report.js | 实时任务队列报告 | 中 | skills/public/multi-agent-reporting | 收编 |
| 58 | llm-smoke-test.js | IntentScanner LLM Smoke Test | 一次性 | — | 归档 |
| 59 | memory-summary-cron.js | 定期git变更记忆摘要（cron引用） | 高 | （新建）ops-maintenance | 收编 |
| 60 | openai-with-proxy.sh | 临时代理调用OpenAI | 一次性 | — | 归档 |
| 61 | process-retry-queue.sh | 自动重试队列处理 | 中 | skills/public/multi-agent-dispatch | 收编 |
| 62 | public-skill-pre-commit-check.js | Public Skill质量门禁（pre-commit调用） | 高 | skills/isc-core | 收编 |
| 63 | refresh-board.js | 刷新看板（subagents→报告） | 中 | skills/public/multi-agent-reporting | 收编 |
| 64 | report-counter.js | 报告计数器 | 中 | skills/public/multi-agent-reporting | 收编 |
| 65 | report-snapshot.js | 报告快照锁定机制 | 中 | skills/daily-ops-report | 收编 |
| 66 | report-with-auto-send.js | 报告生成+飞书自动发送 | 中 | skills/feishu-report-sender | 收编 |
| 67 | retry-dispatcher.sh | 重试派发器 | 中 | skills/public/multi-agent-dispatch | 收编 |
| 68 | runtime-active-queue.js | 运行时活跃任务队列管理 | 中 | skills/public/multi-agent-dispatch | 收编 |
| 69 | runtime-active-queue-html.js | 活跃任务队列HTML报告 | 低 | skills/public/multi-agent-reporting | 收编 |
| 70 | runtime-active-queue-report.js | 活跃任务队列文本报告 | 中 | skills/public/multi-agent-reporting | 收编 |
| 71 | send-task-queue-card.js | 飞书交互卡片发送 | 中 | skills/feishu-card-sender | 收编 |
| 72 | session-cleanup-governor.sh | 会话清理治理（多Agent） | 高 | （新建）ops-maintenance | 收编 |
| 73 | session-cleanup.sh | 会话文件自动清理（cron引用） | 高 | （新建）ops-maintenance | 收编 |
| 74 | skill-distribution-checker.js | 技能分发标记检查 | 低 | skills/isc-core | 收编 |
| 75 | spawn-glm5.sh | spawn GLM-5子Agent | 低 | skills/zhipu-keys | 归档 |
| 76 | startup-self-check.sh | 会话启动自检 | 高 | （新建）ops-maintenance | 收编 |
| 77 | subagent-report.sh | 子Agent任务看板报告 | 中 | skills/public/multi-agent-reporting | 收编 |
| 78 | system-maintenance.sh | 系统维护（cron引用） | 高 | （新建）ops-maintenance | 收编 |
| 79 | task-queue-expand.js | 任务队列展开 | 中 | skills/public/multi-agent-dispatch | 收编 |
| 80 | task-queue-report.js | 任务队列报告 | 中 | skills/public/multi-agent-reporting | 收编 |
| 81 | task-timeout-check.sh | 超时检测+自动重试分诊 | 高 | skills/public/multi-agent-dispatch | 收编 |
| 82 | test-version-semantic.js | 版本号语义化测试 | 一次性 | — | 归档 |
| 83 | thinking-content-cleanup.sh | 推理内容定期清理 | 中 | （新建）ops-maintenance | 收编 |
| 84 | v3-eval-clean.js | V3评测集清洗 | 中 | skills/public/eval-mining | 收编 |
| 85 | v3-eval-clean-batch.sh | V3评测集批量清洗 | 低 | skills/public/eval-mining | 收编 |
| 86 | verify-delegation-guard.sh | 委派守卫全局部署验证 | 低 | skills/isc-core | 归档 |
| 87 | verify-report-snapshot.js | 报告快照完整性验证 | 低 | skills/daily-ops-report | 收编 |

---

## 按技能分组

### ISC-core (skills/isc-core) — 14 个脚本
ISC 规则引擎、pre-commit 门禁、依赖检查等核心治理脚本。

| 脚本 | 用途 | 频率 | 处置 |
|------|------|------|------|
| audit-cron-model-policy.js | cron模型策略审计 | 中 | 收编 |
| check-dependency-direction.js | 依赖方向CI门禁 | 高 | 合并→dependency-check.js |
| check-rule-dedup.js | 规则去重检查 | 高 | 收编 |
| check-version-integrity.js | 版本号诚实性门禁 | 中 | 收编 |
| classify-skill-distribution.js | 技能分发分类 | 低 | 收编 |
| config-api-protocol-check.js | API协议一致性校验 | 低 | 收编 |
| delegation-guard-check.sh | 委派守卫检查 | 中 | 收编 |
| dependency-check.js | 依赖方向检查增强版 | 高 | 收编 |
| install-hooks.sh | 安装pre-commit hook | 低 | 收编 |
| isc-cron-scan.sh | ISC cron批量扫描 | 中 | 收编 |
| isc-enforcement-verifier.js | 执行绑定状态检查 | 中 | 收编 |
| isc-pre-commit-check.js | pre-commit主检查 | 高 | 收编 |
| public-skill-pre-commit-check.js | Public Skill门禁 | 高 | 收编 |
| skill-distribution-checker.js | 技能分发标记检查 | 低 | 收编 |

**建议**: 在 `skills/isc-core/` 下新建 `bin/` 或 `scripts/` 目录收纳。`check-dependency-direction.js` 和 `dependency-check.js` 功能重叠，合并为一个。

### CRAS (skills/cras) — 9 个脚本
CRAS 意图分析、研究报告、事件捕获全链路。

| 脚本 | 用途 | 频率 | 处置 |
|------|------|------|------|
| cras-daily-report.sh | 每日洞察报告汇总 | 高 | 收编 |
| cras-d-doc-publish.js | CRAS-D 飞书发布 | 中 | 收编 |
| cras-d-materialize-action-cards.js | CRAS-D 行动卡片 | 中 | 收编 |
| cras-d-refresh-research.js | CRAS-D 研究刷新 | 中 | 收编 |
| cras-d-research-report.js | CRAS-D 研究报告 | 中 | 收编 |
| cras-e-capture.js | CRAS-E 事件捕获 | 中 | 收编 |
| cras-e-status.js | CRAS-E 状态报告 | 中 | 收编 |
| intent-harvest-dispatch.sh | 意图→harvest分发 | 中 | 收编 |
| intent-probe.sh | 用户消息意图探针v2 | 中 | 收编 |

**注意**: `detect-user-emphasis.js` 也属于 CRAS 感知层。

### 评测 Eval (skills/public/eval-runner + eval-mining) — 8 个脚本
评测集运行、挖掘、清洗、统计。

| 脚本 | 用途 | 频率 | 归属 | 处置 |
|------|------|------|------|------|
| c2-admission-gate.js | C2用例准入门禁 | 高 | eval-mining | 收编 |
| eval-case-runner.js | 评测单用例执行 | 中 | eval-runner | 收编 |
| eval-engine.sh | 评测引擎入口 | 中 | eval-runner | 收编 |
| eval-stats.sh | 评测集统计 | 高 | eval-mining | 收编 |
| isc-c2-regression.sh | C2回归测试 | 中 | eval-runner | 收编 |
| v3-eval-clean.js | 评测集清洗 | 中 | eval-mining | 收编 |
| v3-eval-clean-batch.sh | 批量清洗 | 低 | eval-mining | 收编 |
| detect-user-emphasis.js | 用户强调探测 | 低 | cras | 收编 |

### Multi-Agent (skills/public/multi-agent-dispatch + multi-agent-reporting) — 12 个脚本
任务看板、队列管理、报告生成。

| 脚本 | 用途 | 频率 | 归属 | 处置 |
|------|------|------|------|------|
| live-task-queue-report.js | 实时任务队列报告 | 中 | reporting | 收编 |
| refresh-board.js | 刷新看板 | 中 | reporting | 收编 |
| report-counter.js | 报告计数器 | 中 | reporting | 收编 |
| runtime-active-queue.js | 运行时活跃队列管理 | 中 | dispatch | 收编 |
| runtime-active-queue-html.js | 活跃队列HTML | 低 | reporting | 收编 |
| runtime-active-queue-report.js | 活跃队列报告 | 中 | reporting | 收编 |
| subagent-report.sh | 子Agent看板报告 | 中 | reporting | 收编 |
| task-queue-expand.js | 任务队列展开 | 中 | dispatch | 收编 |
| task-queue-report.js | 任务队列报告 | 中 | reporting | 收编 |
| process-retry-queue.sh | 重试队列处理 | 中 | dispatch | 收编 |
| retry-dispatcher.sh | 重试派发器 | 中 | dispatch | 收编 |
| task-timeout-check.sh | 超时检测 | 高 | dispatch | 收编 |

### System Monitor (skills/public/system-monitor) — 6 个脚本
API探测、Gateway监控、Key检查。

| 脚本 | 用途 | 频率 | 处置 |
|------|------|------|------|
| api-failover-probe.sh | API失败探测 | 中 | 收编 |
| api-key-probe.sh | API Key余额探针 | 中 | 收编 |
| api-probe.js | API全量探测 | 中 | 收编 |
| check-opus-key.sh | Opus Key检查 | 低 | 归档 |
| gateway-memory-governor.sh | Gateway内存治理 | 高 | 收编 |
| gateway-monitor.sh | Gateway内存监控v1 | 中 | 归档（被v2替代） |
| gateway-monitor-v2.sh | Gateway内存监控v2 | 高 | 收编 |

### AEO (skills/aeo) — 1 个脚本
| 脚本 | 用途 | 频率 | 处置 |
|------|------|------|------|
| day2-gap3-aeo-close-loop.js | AEO闭环验证 | 低 | 归档到 skills/aeo/archive/ |

### LEP-executor (skills/lep-executor) — 3 个脚本
| 脚本 | 用途 | 频率 | 处置 |
|------|------|------|------|
| day2-top3-main-implementation.js | L3全链路主入口 | 中 | 收编 |
| l3-pipeline-cron.js | L3 Pipeline Cron | 高 | 收编 |
| l3-verify-e2e.js | L3闭环验证 | 低 | 归档 |

### Daily-Ops-Report (skills/daily-ops-report) — 2 个脚本
| 脚本 | 用途 | 频率 | 处置 |
|------|------|------|------|
| daily-ops-report.js | 每日运维报告 | 高 | 收编 |
| report-snapshot.js | 报告快照锁定 | 中 | 收编 |
| verify-report-snapshot.js | 快照验证 | 低 | 收编 |

### 飞书相关 (skills/feishu-*) — 3 个脚本
| 脚本 | 用途 | 频率 | 归属 | 处置 |
|------|------|------|------|------|
| auto-grant-feishu-perm.sh | 飞书文档授权 | 中 | public/auto-grant-feishu-perm | 收编 |
| report-with-auto-send.js | 报告+飞书发送 | 中 | feishu-report-sender | 收编 |
| send-task-queue-card.js | 飞书交互卡片 | 中 | feishu-card-sender | 收编 |

### 已有对应 Public 技能 — 3 个脚本
| 脚本 | 对应技能 | 处置 |
|------|---------|------|
| badcase-to-goodcase.sh | skills/public/badcase-to-goodcase | 收编 |
| detect-deep-think-intent.sh | skills/public/detect-deep-think-intent | 收编 |
| isc-auto-align.sh | skills/public/isc-auto-align | 收编 |

### EvoMap (skills/evomap-uploader) — 1 个脚本
| 脚本 | 用途 | 频率 | 处置 |
|------|------|------|------|
| evomap-manual-sync.sh | EvoMap手动同步 | 低 | 收编 |

### Zhipu-Keys (skills/zhipu-keys) — 2 个脚本
| 脚本 | 用途 | 频率 | 处置 |
|------|------|------|------|
| key-management.sh | API Key统一管理 | 低 | 收编 |
| spawn-glm5.sh | spawn GLM-5子Agent | 低 | 归档 |

### Skill-Creator-Addon — 1 个脚本
| 脚本 | 用途 | 频率 | 处置 |
|------|------|------|------|
| auto-skill-discovery.sh | 未技能化脚本发现 | 低 | 收编 |

### ISC-Document-Quality — 1 个脚本
| 脚本 | 用途 | 频率 | 处置 |
|------|------|------|------|
| doc-quality-gate-hook.sh | 文档质量门禁探针 | 中 | 收编 |

---

## 需要新建的技能

### 🆕 ops-maintenance（运维维护）
**理由**: 有 7 个脚本涉及备份、会话清理、启动自检、系统维护，且无现有技能覆盖。

| 脚本 | 用途 | 频率 |
|------|------|------|
| backup.sh | 工作空间备份 | 高（cron） |
| backup-rotate.sh | 多版本轮转备份 | 中 |
| critical-files-check.sh | 关键文件存在性检查 | 中 |
| memory-summary-cron.js | git变更记忆摘要 | 高（cron） |
| session-cleanup.sh | 会话文件清理 | 高（cron） |
| session-cleanup-governor.sh | 会话清理治理 | 高 |
| startup-self-check.sh | 启动自检 | 高 |
| system-maintenance.sh | 系统维护 | 高（cron） |
| thinking-content-cleanup.sh | 推理内容清理 | 中 |

---

## 可归档/删除的脚本

归档到 `scripts/archive/`（共 12 个）：

| 脚本 | 原因 |
|------|------|
| check-opus-key.sh | 简单单Key检测，被api-key-probe.sh替代 |
| day2-gap3-aeo-close-loop.js | Day2 一次性 AEO 验证 |
| degradation-drill.js | 降级演练PoC，非日常使用 |
| enforcement-poc.js | ISC Enforcement PoC，概念验证已完成 |
| eval-codex-pilot.js | Codex 模型一次性 Pilot 评测 |
| eval-glm5-fewshot-pilot.js | GLM-5 一次性 Pilot 评测 |
| eval-opus-pilot.js | Opus 一次性 Pilot 评测 |
| fix-goodcases-fields.js | 一次性字段修复脚本 |
| gateway-monitor.sh | 被 gateway-monitor-v2.sh 替代 |
| l3-verify-e2e.js | L3 闭环验证（一次性） |
| llm-smoke-test.js | IntentScanner Smoke Test |
| openai-with-proxy.sh | 临时代理调用，含硬编码代理 |
| spawn-glm5.sh | 简单spawn包装，低使用 |
| test-version-semantic.js | 版本号语义化测试 |
| verify-delegation-guard.sh | 委派守卫验证（一次性） |

---

## 执行优先级建议

### P0: 高频核心 — 立即收编（15 个）
被 cron 或 pre-commit 直接引用，不收编会影响系统稳定性。

| 脚本 | 目标技能 |
|------|---------|
| backup.sh | ops-maintenance (新建) |
| session-cleanup.sh | ops-maintenance (新建) |
| system-maintenance.sh | ops-maintenance (新建) |
| memory-summary-cron.js | ops-maintenance (新建) |
| gateway-monitor-v2.sh | system-monitor |
| gateway-memory-governor.sh | system-monitor |
| eval-stats.sh | eval-mining |
| cras-daily-report.sh | cras |
| isc-pre-commit-check.js | isc-core |
| check-rule-dedup.js | isc-core |
| public-skill-pre-commit-check.js | isc-core |
| c2-admission-gate.js | eval-mining |
| dependency-check.js | isc-core |
| task-timeout-check.sh | multi-agent-dispatch |
| l3-pipeline-cron.js | lep-executor |

### P1: 中频辅助 — 本周收编（47 个）
被其他脚本引用或定期手动调用，对系统功能有价值。

包括: CRAS 全系列 (8个)、multi-agent 系列 (11个)、ISC 辅助系列 (8个)、飞书相关 (3个)、eval 辅助 (4个)、daily-ops-report 辅助 (3个)、已有技能对应 (3个)、其余中频脚本 (7个)

### P2: 低频/一次性 — 归档到 scripts/archive/（15 个）
一次性 PoC、Pilot、已被替代的旧版本。

见上方 "可归档/删除的脚本" 部分。

---

## 重复/可合并的脚本

| 组 | 脚本 | 建议 |
|----|------|------|
| 依赖检查 | check-dependency-direction.js + dependency-check.js | 合并为 dependency-check.js |
| Gateway监控 | gateway-monitor.sh + gateway-monitor-v2.sh + gateway-memory-governor.sh | 保留 v2 + governor，归档 v1 |
| 会话清理 | session-cleanup.sh + session-cleanup-governor.sh | 合并为 governor 版 |

---

## 统计摘要

| 分类 | 数量 |
|------|------|
| 总野生脚本 | 87 |
| P0 立即收编 | 15 |
| P1 本周收编 | 57 |
| P2 归档 | 15 |
| 需新建技能 | 1 (ops-maintenance) |
| 涉及现有技能 | 14 个 |
| 重复可合并 | 3 组 |
