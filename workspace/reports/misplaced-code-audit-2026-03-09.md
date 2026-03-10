# 错位代码审计报告

**日期**: 2026-03-09  
**触发**: handler-utils.js 发现归属错误，扩大排查范围  

## 审计结论

| 区域 | 文件总数 | 薄封装 | 位置正确 | 需迁移 | 待归档 |
|------|---------|--------|---------|--------|--------|
| event-bus/handlers/ | 96 | 0 | ~10 | ~80 | 6 |
| event-bus/sensors/ | 3+1 | 0 | 3 | 0 | 0 |
| intent-engine/ | 6+logs | 0 | 0 | 整体迁移 | 0 |
| scripts/ (root) | ~80 | 49 | 49 | 13 | ~10 |
| scripts/isc-hooks/ | ~100 | 0 | 0 | 整体迁移 | 0 |
| scripts/gates/ | 6 | 0 | 0 | 6 | 0 |
| scripts/long-horizon/ | 8 | 0 | 0 | 8 | 0 |

---

## 1. infrastructure/event-bus/handlers/ — 重灾区

### 1.1 应归属 skills/isc-core/ 的 handler（~40个）

这些handler实现ISC规则的执行逻辑，应作为 `isc-core/handlers/` 或 `isc-core/infrastructure/event-bus/handlers/` 的一部分：

| 文件 | 理由 |
|------|------|
| `isc-creation-gate.js` | ISC规则创建门禁 |
| `isc-rule-decompose.js` | ISC规则分解 |
| `isc-skill-security-gate.js` | ISC技能安全门 |
| `isc-skill-security-gate-030.js` | ISC技能安全门v030 |
| `isc-skill-security.js` | ISC技能安全 |
| `isc-skill-permission.js` | ISC技能权限分类 |
| `isc-skill-index-update.js` | ISC技能索引更新 |
| `isc-change-alignment.js` | ISC变更对齐 |
| `isc-lto-handshake.js` | ISC-LTO握手 |
| `isc-eval-middleware.js` | ISC评估中间件 |
| `check-version-integrity.js` | 版本完整性检查(ISC规则) |
| `naming-convention-check.js` | 命名规范检查(ISC规则) |
| `check-dependency-direction.js` | 依赖方向检查(ISC规则) |
| `gate-check.js` | 门禁检查(ISC通用) |
| `gate-check-trigger.js` | 门禁触发(ISC通用) |
| `gate.js` | 门禁(ISC通用) |
| `enforcement-engine.js` | 执行引擎(ISC) |
| `enforcement-audit.js` | 执行审计(ISC) |
| `meta-enforcement.js` | 元执行(ISC) |
| `completeness-check.js` | 完整性检查(ISC) |
| `document-structure-check.js` | 文档结构检查(ISC) |
| `verify-config-before-code.js` | 编码前验证配置(ISC) |
| `quality-gate.js` | 质量门禁(ISC) |
| `block-on-fail.js` | 失败阻断(ISC) |
| `anti-entropy-check.js` | 反熵检查(ISC) |
| `dedup-scan.js` | 去重扫描(ISC) |
| `artifact-gate-check.js` | 工件门禁(ISC) |
| `sprint-closure-gate.js` | Sprint关闭门禁(ISC) |
| `scenario-acceptance-gate.js` | 场景验收门禁(ISC) |
| `layered-architecture-checker.js` | 分层架构检查(ISC) |
| `skill-distribution-separation.js` | 技能分发分离(ISC) |
| `classify-skill-distribution.js` | 技能分发分类(ISC) |
| `public-skill-quality-gate.js` | 公共技能质量门(ISC) |
| `public-skill-classification.js` | 公共技能分类(ISC) |
| `vectorization-standard-enforcement.js` | 向量化标准执行(ISC) |
| `discovery-rule-creation.js` | 发现→规则创建(ISC) |
| `knowledge-executable.js` | 知识可执行(ISC) |
| `skill-no-direct-llm.js` | 技能禁止直接LLM(ISC) |
| `auto-skillization.js` | 自动技能化(ISC) |
| `intent-boundary.js` | 意图边界(ISC) |
| `intent-type-convergence.js` | 意图类型收敛(ISC) |
| `intent-unknown-discovery.js` | 未知意图发现(ISC) |

**注**: `isc-core/infrastructure/event-bus/handlers/` 下已有部分迁移过的handler（21个），说明迁移已部分启动但未完成。

### 1.2 应归属其他技能的 handler

| 文件 | 应归属技能 | 理由 |
|------|-----------|------|
| `cras-dual-channel.js` | skills/cras/ | CRAS双通道逻辑 |
| `aeo-e2e-test.js` | skills/aeo/ | AEO端到端测试 |
| `aeo-evaluation-required.js` | skills/aeo/ | AEO评估触发 |
| `eval-quality-check.js` | skills/aeo/ | 评估质量检查 |
| `tracker-sync-handler.js` | skills/project-mgmt/ | 项目Tracker同步 |
| `evomap-sync-trigger.js` | skills/evomap-publisher/ | Evomap同步触发 |
| `seef-skill-registered.js` | skills/seef/ | SEEF技能注册 |
| `seef-subskill-orchestration.js` | skills/seef/ | SEEF子技能编排 |
| `capability-anchor-register.js` | skills/capability-anchor/ 或 isc-capability-anchor-sync/ | 能力锚点注册 |
| `capability-anchor-sync.js` | skills/isc-capability-anchor-sync/ | 能力锚点同步 |
| `skill-evolution-trigger.js` | skills/evolver/ | 技能进化触发 |
| `github-sync-trigger.js` | skills/github-api/ | GitHub同步 |
| `memory-archiver.js` | skills/lto-core/ 或独立 | 记忆归档 |
| `memory-digest-must-verify.js` | skills/lto-core/ | 记忆摘要验证 |
| `memory-loss-recovery.js` | skills/lto-core/ | 记忆丢失恢复 |
| `day-transition.js` | skills/lto-core/ | 日切换处理 |
| `cron-job-requested.js` | skills/lto-core/ | Cron任务请求 |
| `cron-task-model-requirement.js` | skills/lto-core/ | Cron任务模型要求 |
| `planning-time-granularity.js` | skills/project-mgmt/ | 规划时间粒度 |
| `zhipu-capability-router.js` | skills/zhipu-keys/ 或 zhipu-vision/ | 智谱能力路由 |
| `glm-vision-priority.js` | skills/glm-vision/ | GLM视觉优先级 |
| `caijuedian-tribunal.js` | skills/public/caijuedian-tribunal/ | 裁决点仲裁 |
| `interactive-card-context-inference.js` | skills/feishu-card-sender/ | 交互卡片上下文推理 |
| `design-document-delivery-pipeline.js` | skills/isc-document-quality/ | 设计文档交付管道 |
| `pipeline-report-filter.js` | skills/isc-report-readability/ | 流水线报告过滤 |
| `self-correction-root-cause.js` | skills/cras/ | 自修正根因分析 |
| `five-layer-event-model.js` | skills/five-layer-event-model/ | 五层事件模型 |
| `semantic-intent-event.js` | skills/intent-design-principles/ | 语义意图事件 |

### 1.3 通用基础设施 handler — 位置正确

| 文件 | 理由 |
|------|------|
| `p0-batch1-handlers.js` | 通用P0安全批处理 |
| `p0-utils.js` | 通用工具函数 |
| `log-action.js` | 通用日志 |
| `log-only.js` | 仅日志 |
| `log.js` | 日志 |
| `route.js` | 通用路由 |
| `notify-alert.js` | 通用告警通知 |
| `global-event-escalation.js` | 全局事件升级 |
| `event-health-monitor.js` | 事件健康监控 |
| `auto-trigger.js` | 自动触发(通用) |
| `batch3-misc-handlers.js` | 杂项批处理 |

### 1.4 重复文件 — 应清理

| 文件 | 问题 |
|------|------|
| `auto_fix.js` + `auto-fix.js` | 命名冲突，疑似重复 |
| `auto-fix-severity.js` | 与auto-fix可能重叠 |

---

## 2. infrastructure/event-bus/sensors/ — 位置正确 ✅

3个sensor文件（threshold-scanner, git-sensor, skill-publish-sensor）都是通用感知层组件，属于事件总线基础设施，位置合理。

---

## 3. infrastructure/intent-engine/ — 整体应迁移

| 文件 | 建议 |
|------|------|
| `intent-scanner.js` | → skills/cras/ 或独立 skills/intent-engine/ |
| `registry-manager.js` | 同上 |
| `intent-registry.json` | 同上 |
| `unknown-candidates.jsonl` | 同上 |
| `SKILL.md` | 已有SKILL.md，说明本身就应该是一个技能 |
| `logs/` | 跟随迁移 |

**理由**: 目录下有 SKILL.md，表明它已被识别为技能但未实际迁移。功能上是CRAS快通道的意图识别组件。

---

## 4. scripts/ — 薄封装 vs 实体代码

### 4.1 薄封装（49个）— 位置正确 ✅

这些文件只是 `exec` 转发到技能目录的代理脚本，保留在scripts/作为入口点是合理的。

### 4.2 实体代码 — 需迁移

| 文件 | 应归属技能 | 理由 |
|------|-----------|------|
| `evolution-daily-report.js` (262行) | skills/evolver/ | 进化每日报告 |
| `glm5-proxy.cjs` (160行) | skills/zhipu-keys/ | 智谱API代理 |
| `test-api-connectivity.cjs` (118行) | skills/public/system-monitor/ | API连通性测试 |
| `day2-enforcement-patcher.py` (598行) | skills/isc-core/scripts/ | ISC执行补丁 |
| `day2-rule-migration.py` (272行) | skills/isc-core/scripts/ | ISC规则迁移 |
| `clean-evalset.py` (310行) | skills/aeo/ | 评测集清洗 |
| `gen-c2-evalset.py` (892行) | skills/aeo/ | C2评测集生成 |
| `gen-c2-evalset-part2.py` (580行) | skills/aeo/ | C2评测集生成(续) |
| `cron-model-upgrade-analysis.cjs` (134行) | skills/lto-core/ | Cron模型升级分析 |
| `safe-interrupt.sh` | skills/public/ops-maintenance/ | 安全中断脚本 |
| `doc-quality-gate.md` (48行) | skills/isc-document-quality/ | 文档质量门禁说明 |
| `doc-quality-gate-state.json` | skills/isc-document-quality/ | 文档质量门禁状态 |
| `eval-task-template.md` (69行) | skills/aeo/ | 评估任务模板 |

### 4.3 scripts/isc-hooks/ — 整体迁移

~100个ISC hook脚本，全部是ISC规则的执行钩子，应整体迁移至 `skills/isc-core/hooks/` 或 `skills/isc-core/isc-hooks/`。

### 4.4 scripts/gates/ — 迁移

6个门禁脚本，功能上属于ISC质量门禁体系：

| 文件 | 应归属技能 |
|------|-----------|
| `run-all-gates.js` | skills/isc-core/gates/ |
| `isc-compliance-gate.js` | skills/isc-core/gates/ |
| `report-integrity-gate.js` | skills/isc-report-readability/ |
| `entry-point-smoke-gate.js` | skills/isc-core/gates/ |
| `feature-flag-audit-gate.js` | skills/isc-core/gates/ |
| `data-source-gate.js` | skills/aeo/ |
| `independent-qa-gate.js` | skills/isc-core/gates/ |

### 4.5 scripts/long-horizon/ — 迁移

8个长周期运维脚本：

| 文件 | 应归属技能 |
|------|-----------|
| `dead-skill-detector.sh` | skills/seef/ 或 skills/evolver/ |
| `theory-to-rule-pipeline.js` | skills/ruleify/ 或 skills/isc-core/ |
| `research-signal-harvester.js` | skills/cras/ |
| `directed-research-harvester.js` | skills/cras/ |
| `capability-growth-tracker.js` | skills/capability-anchor/ |
| `weekly-evolution-report.sh` | skills/evolver/ |
| `entropy-index-calculator.sh` | skills/anti-entropy-checker/ |
| `evolution-checkpoint-audit.js` | skills/evolver/ |
| `stale-backlog-pruner.sh` | skills/project-mgmt/ |
| `orphaned-task-scanner.sh` | skills/project-mgmt/ |
| `log-archive-rotator.sh` | skills/public/ops-maintenance/ |

### 4.6 scripts/archive/ — 保留或清理

11个归档脚本，已废弃，位置可接受但建议定期清理。

### 4.7 scripts/isc-generated/ — 迁移

`verify-rule.isc-auto-programmatic-alignment-001.sh` → skills/isc-core/

---

## 5. 优先级建议

### P0 — 立即处理
1. **scripts/isc-hooks/ 整体迁移** → `skills/isc-core/hooks/`（~100个文件，最大批量收益）
2. **infrastructure/intent-engine/ 整体迁移** → `skills/intent-engine/` 或 `skills/cras/intent-engine/`

### P1 — 本周完成
3. **event-bus/handlers/ 中ISC相关handler** → `skills/isc-core/infrastructure/event-bus/handlers/`（续已有迁移）
4. **event-bus/handlers/ 中其他技能handler** → 各归属技能

### P2 — 逐步清理
5. **scripts/ 中实体代码** → 各归属技能后留薄封装
6. **scripts/gates/** → `skills/isc-core/gates/`
7. **scripts/long-horizon/** → 各归属技能

---

## 6. 统计摘要

- **需迁移文件总数**: ~200+
- **涉及目标技能**: isc-core(主), aeo, cras, seef, evolver, lto-core, project-mgmt, capability-anchor 等15+个
- **已有迁移模式参考**: `isc-core/infrastructure/event-bus/handlers/` 下21个已迁移handler
- **薄封装模式参考**: scripts/ 下49个薄封装脚本可作为迁移后的兼容方案
