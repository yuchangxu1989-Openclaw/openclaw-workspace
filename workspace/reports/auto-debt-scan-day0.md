# Auto Debt Scan - Day 0

> 自动生成于: 2026-03-10T01:20:24.014Z
> 触发器: day0-closure-conditions.md 检测
> 总计发现: **664 个设计债务项**

---

## 📊 概览

| 类别 | 数量 | 严重度 |
|------|------|--------|
| 代码级 TODO/FIXME | 284 | 🔴 高 |
| 配置一致性问题 | 56 | 🔴 高 |
| 事件对齐缺口 | 324 | 🔴 高 |

## 🔧 代码级债务 (284 项)

### TODO (218)

- `skills/evolver/src/ops/innovation.js:44` — ideas.push("- Dev: Implement a 'todo-manager' that syncs code TODOs to tasks.");
- `skills/capability-anchor/index.js:12` — // TODO: 实现 capability-anchor 的核心逻辑
- `skills/lto-core/core/declarative-orchestrator.js:544` — // TODO: 实现自动技能化
- `skills/lto-core/core/declarative-orchestrator.js:549` — // TODO: 实现自动向量化
- `skills/public/isc-auto-align/scripts/isc-auto-align.sh:33` — # TODO: 感知探针 for rule: $RULE_ID ($RULE_NAME)
- `skills/public/isc-auto-align/scripts/isc-auto-align.sh:36` — # TODO: 实现 inotifywait / cron / git hook 等感知机制
- `skills/public/isc-auto-align/scripts/isc-auto-align.sh:52` — # TODO: 感知探针 for rule: $RULE_ID ($RULE_NAME)
- `skills/public/isc-auto-align/scripts/isc-auto-align.sh:55` — # TODO: 实现 inotifywait / cron / git hook 等感知机制
- `skills/public/isc-auto-align/scripts/isc-auto-align.sh:74` — # TODO: 执行动作脚本 for rule: $RULE_ID ($RULE_NAME)
- `skills/public/isc-auto-align/scripts/isc-auto-align.sh:76` — # TODO: 实现规则要求的执行逻辑
- ... 还有 208 项

### TEMP (37)

- `skills/public/multi-agent-reporting/examples/basic-usage.js:124` — console.log('  TEMPLATE (pre-filled from plan)');
- `skills/public/ops-maintenance/scripts/spawn-glm5.sh:16` — TEMP_FILE=$(mktemp)
- `skills/public/ops-maintenance/scripts/spawn-glm5.sh:17` — echo "$TASK" > "$TEMP_FILE"
- `skills/public/ops-maintenance/scripts/spawn-glm5.sh:25` — const task = fs.readFileSync('$TEMP_FILE', 'utf8');
- `skills/public/ops-maintenance/scripts/spawn-glm5.sh:33` — fs.unlinkSync('$TEMP_FILE');
- `skills/public/ops-maintenance/scripts/spawn-glm5.sh:36` — fs.unlinkSync('$TEMP_FILE');
- `skills/public/pdf-generator/generate.js:19` — const TEMPLATE_DIR = path.join(__dirname, 'templates');
- `skills/public/pdf-generator/generate.js:20` — const LATEX_TEMPLATE = path.join(TEMPLATE_DIR, 'default.latex');
- `skills/public/pdf-generator/generate.js:285` — if (fs.existsSync(LATEX_TEMPLATE)) {
- `skills/public/pdf-generator/generate.js:286` — pandocArgs.push('--template', LATEX_TEMPLATE);
- ... 还有 27 项

### BUG (11)

- `skills/feishu-evolver-wrapper/commentary.js:17` — failure: ["BUG DETECTED. DESTROY.", "FAILURE IS UNACCEPTABLE.", "RETRY OR DIE."],
- `skills/feishu-evolver-wrapper/utils/logger.js:32` — debug: (msg, data) => log('DEBUG', msg, data)
- `skills/seef/evolution-pipeline/src/__tests__/error-handler.test.js:110` — expect(ErrorSeverity.DEBUG).toBe('debug');
- `skills/seef/evolution-pipeline/src/error-handler.js:20` — DEBUG: 'debug',
- `infrastructure/lep-core/executors/base.js:224` — DEBUG: 0,
- `infrastructure/lep-core/executors/base.js:246` — this._log('DEBUG', message, ...args);
- `scripts/isc-hooks/rule.intent-post-commit-quality-gate-h8z2sz.sh:26` — DEBUG_FOUND=""
- `scripts/isc-hooks/rule.intent-post-commit-quality-gate-h8z2sz.sh:29` — if grep -qn "console\.log\|debugger\|TODO.*HACK\|FIXME.*URGENT" "$f" 2>/dev/null; then
- `scripts/isc-hooks/rule.intent-post-commit-quality-gate-h8z2sz.sh:30` — DEBUG_FOUND="$DEBUG_FOUND $f"
- `scripts/isc-hooks/rule.intent-post-commit-quality-gate-h8z2sz.sh:35` — if [ -n "$DEBUG_FOUND" ]; then
- ... 还有 1 项

### XXX (16)

- `infrastructure/mr/src/sandbox-validator.ts:8` — * - 零硬编码模型名称，使用{{MODEL_XXX}}占位符
- `infrastructure/mr/src/mr-router.ts:8` — * - 零硬编码模型名称，使用{{MODEL_XXX}}占位符
- `infrastructure/mr/src/preference-merger.ts:8` — * - 零硬编码模型名称，使用{{MODEL_XXX}}占位符
- `infrastructure/mr/src/intent-classifier.ts:7` — * - 零硬编码模型名称，使用{{MODEL_XXX}}占位符
- `infrastructure/mr/src/lep-delegate.ts:8` — * - 零硬编码模型名称，使用{{MODEL_XXX}}占位符
- `infrastructure/mr/dist/preference-merger.d.ts:8` — * - 零硬编码模型名称，使用{{MODEL_XXX}}占位符
- `infrastructure/mr/dist/intent-classifier.d.ts:7` — * - 零硬编码模型名称，使用{{MODEL_XXX}}占位符
- `infrastructure/mr/dist/intent-classifier.js:8` — * - 零硬编码模型名称，使用{{MODEL_XXX}}占位符
- `infrastructure/mr/dist/sandbox-validator.js:9` — * - 零硬编码模型名称，使用{{MODEL_XXX}}占位符
- `infrastructure/mr/dist/sandbox-validator.d.ts:8` — * - 零硬编码模型名称，使用{{MODEL_XXX}}占位符
- ... 还有 6 项

### FIXME (2)

- `infrastructure/self-check/day-completion-scanner.js:416` — if (codeDebt.filter(i => i.tag === 'FIXME').length > 0) {
- `infrastructure/self-check/day-completion-scanner.js:417` — report += `3. **优先级P1**: 清理 FIXME 标记（${codeDebt.filter(i => i.tag === 'FIXME').length} 项）\n`;

## ⚙️ 配置一致性问题 (56 项)

- **[missing_skill_ref]** ISC规则 "ISC-AUTO-QA-001" 引用的技能目录不存在: skills/completion-handler.sh
  → 在: `skills/isc-core/rules/rule.auto-qa-on-completion-001.json`
- **[missing_skill_ref]** ISC规则 "ISC-FILE-SEND-INTENT-001" 引用的技能目录不存在: skills/file-sender
  → 在: `skills/isc-core/rules/rule.file-send-intent-001.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-$rule.json" 引用的ISC规则不存在: N036
  → 在: `skills/lto-core/subscriptions/isc-$rule.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-ISC-SKILL-QUALITY-001.json" 引用的ISC规则不存在: ISC-SKILL-QUALITY-001
  → 在: `skills/lto-core/subscriptions/isc-ISC-SKILL-QUALITY-001.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-N006.json" 引用的ISC规则不存在: N006
  → 在: `skills/lto-core/subscriptions/isc-N006.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-N007-v2.json" 引用的ISC规则不存在: N007-v2
  → 在: `skills/lto-core/subscriptions/isc-N007-v2.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-N016.json" 引用的ISC规则不存在: N016
  → 在: `skills/lto-core/subscriptions/isc-N016.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-N017.json" 引用的ISC规则不存在: N017
  → 在: `skills/lto-core/subscriptions/isc-N017.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-N018.json" 引用的ISC规则不存在: N018
  → 在: `skills/lto-core/subscriptions/isc-N018.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-N019.json" 引用的ISC规则不存在: N019
  → 在: `skills/lto-core/subscriptions/isc-N019.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-N020.json" 引用的ISC规则不存在: N020
  → 在: `skills/lto-core/subscriptions/isc-N020.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-N022.json" 引用的ISC规则不存在: N022
  → 在: `skills/lto-core/subscriptions/isc-N022.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-N023.json" 引用的ISC规则不存在: N023
  → 在: `skills/lto-core/subscriptions/isc-N023.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-N024.json" 引用的ISC规则不存在: N024
  → 在: `skills/lto-core/subscriptions/isc-N024.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-N025.json" 引用的ISC规则不存在: N025
  → 在: `skills/lto-core/subscriptions/isc-N025.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-N026.json" 引用的ISC规则不存在: N026
  → 在: `skills/lto-core/subscriptions/isc-N026.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-N028.json" 引用的ISC规则不存在: N028
  → 在: `skills/lto-core/subscriptions/isc-N028.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-N029.json" 引用的ISC规则不存在: N029
  → 在: `skills/lto-core/subscriptions/isc-N029.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-N034.json" 引用的ISC规则不存在: N034
  → 在: `skills/lto-core/subscriptions/isc-N034.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-N035.json" 引用的ISC规则不存在: N035
  → 在: `skills/lto-core/subscriptions/isc-N035.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-R006.json" 引用的ISC规则不存在: R006
  → 在: `skills/lto-core/subscriptions/isc-R006.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-R013.json" 引用的ISC规则不存在: R013
  → 在: `skills/lto-core/subscriptions/isc-R013.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-R014.json" 引用的ISC规则不存在: R014
  → 在: `skills/lto-core/subscriptions/isc-R014.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-S005.json" 引用的ISC规则不存在: S005
  → 在: `skills/lto-core/subscriptions/isc-S005.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-evomap_sync.json" 引用的ISC规则不存在: evomap_sync
  → 在: `skills/lto-core/subscriptions/isc-evomap_sync.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-gateway-config-protection-N033.json" 引用的ISC规则不存在: gateway-config-protection-N033
  → 在: `skills/lto-core/subscriptions/isc-gateway-config-protection-N033.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-isc-detect-repeated-error.json" 引用的ISC规则不存在: isc-detect-repeated-error
  → 在: `skills/lto-core/subscriptions/isc-isc-detect-repeated-error.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-isc-naming-constants.json" 引用的ISC规则不存在: isc-naming-constants
  → 在: `skills/lto-core/subscriptions/isc-isc-naming-constants.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-isc-naming-gene-files.json" 引用的ISC规则不存在: isc-naming-gene-files
  → 在: `skills/lto-core/subscriptions/isc-isc-naming-gene-files.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-isc-naming-skill-dir.json" 引用的ISC规则不存在: isc-naming-skill-dir
  → 在: `skills/lto-core/subscriptions/isc-isc-naming-skill-dir.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-isc-rule-missing-resource.json" 引用的ISC规则不存在: isc-rule-missing-resource
  → 在: `skills/lto-core/subscriptions/isc-isc-rule-missing-resource.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-isc-rule-timeout-retry.json" 引用的ISC规则不存在: isc-rule-timeout-retry
  → 在: `skills/lto-core/subscriptions/isc-isc-rule-timeout-retry.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-memory-loss-self-recovery-N036.json" 引用的ISC规则不存在: memory-loss-self-recovery-N036
  → 在: `skills/lto-core/subscriptions/isc-memory-loss-self-recovery-N036.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-planning-time-granularity-037.json" 引用的ISC规则不存在: planning.time-granularity-037
  → 在: `skills/lto-core/subscriptions/isc-planning-time-granularity-037.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-readme_quality.json" 引用的ISC规则不存在: readme_quality
  → 在: `skills/lto-core/subscriptions/isc-readme_quality.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-aeo-evaluation-set-registry-001.json" 引用的ISC规则不存在: rule.aeo-evaluation-set-registry-001
  → 在: `skills/lto-core/subscriptions/isc-rule-aeo-evaluation-set-registry-001.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-auto-readme-generation-trigger-001.json" 引用的ISC规则不存在: rule.auto-readme-generation-trigger-001
  → 在: `skills/lto-core/subscriptions/isc-rule-auto-readme-generation-trigger-001.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-auto-vectorization-trigger-001.json" 引用的ISC规则不存在: rule.auto-vectorization-trigger-001
  → 在: `skills/lto-core/subscriptions/isc-rule-auto-vectorization-trigger-001.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-cron-task-model-selection-002.json" 引用的ISC规则不存在: rule.cron-task-model-selection-002
  → 在: `skills/lto-core/subscriptions/isc-rule-cron-task-model-selection-002.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-dual-channel-message-guarantee-001.json" 引用的ISC规则不存在: rule.dual-channel-message-guarantee-001
  → 在: `skills/lto-core/subscriptions/isc-rule-dual-channel-message-guarantee-001.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-github-api-skill-001.json" 引用的ISC规则不存在: rule.github-api-skill-001
  → 在: `skills/lto-core/subscriptions/isc-rule-github-api-skill-001.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-http-skills-suite-001.json" 引用的ISC规则不存在: rule.http-skills-suite-001
  → 在: `skills/lto-core/subscriptions/isc-rule-http-skills-suite-001.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-parallel-analysis-workflow-001.json" 引用的ISC规则不存在: rule.parallel-analysis-workflow-001
  → 在: `skills/lto-core/subscriptions/isc-rule-parallel-analysis-workflow-001.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-recognition-accuracy-N034.json" 引用的ISC规则不存在: rule-recognition-accuracy-N034
  → 在: `skills/lto-core/subscriptions/isc-rule-recognition-accuracy-N034.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-skill-quality-001.json" 引用的ISC规则不存在: rule.skill-quality-001
  → 在: `skills/lto-core/subscriptions/isc-rule-skill-quality-001.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-trigger-integrity-N035.json" 引用的ISC规则不存在: rule-trigger-integrity-N035
  → 在: `skills/lto-core/subscriptions/isc-rule-trigger-integrity-N035.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-vectorization-aeo-auto-001.json" 引用的ISC规则不存在: rule.vectorization.aeo-auto-001
  → 在: `skills/lto-core/subscriptions/isc-rule-vectorization-aeo-auto-001.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-vectorization-knowledge-auto-001.json" 引用的ISC规则不存在: rule.vectorization.knowledge-auto-001
  → 在: `skills/lto-core/subscriptions/isc-rule-vectorization-knowledge-auto-001.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-vectorization-memory-auto-001.json" 引用的ISC规则不存在: rule.vectorization.memory-auto-001
  → 在: `skills/lto-core/subscriptions/isc-rule-vectorization-memory-auto-001.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-vectorization-skill-auto-001.json" 引用的ISC规则不存在: rule.vectorization.skill-auto-001
  → 在: `skills/lto-core/subscriptions/isc-rule-vectorization-skill-auto-001.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-vectorization-skill-cleanup-003.json" 引用的ISC规则不存在: rule.vectorization.skill-cleanup-003
  → 在: `skills/lto-core/subscriptions/isc-rule-vectorization-skill-cleanup-003.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-vectorization-skill-lifecycle-002.json" 引用的ISC规则不存在: rule.vectorization.skill-lifecycle-002
  → 在: `skills/lto-core/subscriptions/isc-rule-vectorization-skill-lifecycle-002.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule-vectorization-unified-standard-001.json" 引用的ISC规则不存在: rule.vectorization.unified-standard-001
  → 在: `skills/lto-core/subscriptions/isc-rule-vectorization-unified-standard-001.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-rule_2f7dd6e4.json" 引用的ISC规则不存在: rule_2f7dd6e4
  → 在: `skills/lto-core/subscriptions/isc-rule_2f7dd6e4.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-skill_md_quality.json" 引用的ISC规则不存在: skill_md_quality
  → 在: `skills/lto-core/subscriptions/isc-skill_md_quality.json`
- **[orphan_dto_subscription]** DTO订阅 "isc-vectorization.json" 引用的ISC规则不存在: vectorization
  → 在: `skills/lto-core/subscriptions/isc-vectorization.json`

## 📡 事件 Producer/Consumer 对齐 (324 项)

### 孤立生产者 (有emit无consume)

- `aeo.assessment.batch` → skills/aeo/event-bridge.js
- `aeo.evaluation.completed` → skills/aeo/event-bridge.js
- `started` → skills/aeo/src/dashboard/alert-notifier.cjs
- `stopped` → skills/aeo/src/dashboard/alert-notifier.cjs
- `acknowledged` → skills/aeo/src/dashboard/alert-notifier.cjs
- `listening` → skills/aeo/src/dashboard/realtime-monitor.cjs
- `broadcast` → skills/aeo/src/dashboard/realtime-monitor.cjs
- `test:started` → skills/aeo/src/evaluation/executor.cjs
- `test:completed` → skills/aeo/src/evaluation/executor.cjs
- `task:scheduled` → skills/aeo/src/evaluation/scheduler.cjs
- `scheduler:started` → skills/aeo/src/evaluation/scheduler.cjs
- `scheduler:stopped` → skills/aeo/src/evaluation/scheduler.cjs
- `task:paused` → skills/aeo/src/evaluation/scheduler.cjs
- `task:resumed` → skills/aeo/src/evaluation/scheduler.cjs
- `task:progress` → skills/aeo/src/evaluation/scheduler.cjs
- ... 还有 229 项

### 孤立消费者 (有subscribe无emit)

- `data` → skills/aeo/bin/run-eval.js
- `timeout` → skills/aeo/bin/run-eval.js
- `skill.registered` → skills/aeo/src/core/aeo-lto-bridge.cjs
- `cras.insight.high-failure` → skills/aeo/src/core/aeo-lto-bridge.cjs
- `user.feedback.negative` → skills/aeo/src/core/aeo-lto-bridge.cjs
- `close` → skills/aeo/src/sandbox/container-pool.cjs
- `input` → skills/aeo/src/sandbox/sandbox-runtime.js
- `complete` → skills/aeo/src/sandbox/sandbox-runtime.js
- `exit` → skills/cras/cras-b-fixed.js
- `SIGINT` → skills/cras/insight-enhancer.js
- `uncaughtException` → skills/cras/insight-enhancer.js
- `SIGTERM` → skills/evolver/index.js
- `open` → skills/evomap-a2a/index.js
- ` + crons.length + ` → skills/feishu-card-sender/collect-and-report-progress.js
- `circuit_breaker` → skills/feishu-evolver-wrapper/index.js
- ... 还有 65 项

## 🎯 修复建议

2. **优先级P0**: 修复 ISC 规则中的技能引用
3. **优先级P1**: 清理 FIXME 标记（2 项）
4. **优先级P2**: 补全孤立事件的 consumer 或移除无用 producer
5. **优先级P3**: 逐步清理 TODO 标记（218 项）

---
*由 infrastructure/self-check/day-completion-scanner.js 自动生成*
