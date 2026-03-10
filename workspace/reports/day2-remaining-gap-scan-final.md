# Day2 遗留项全面重扫报告（终版）

> **扫描时间**: 2026-03-06 23:12 CST  
> **扫描方式**: 基于当前代码实际读取 + git 状态 + crontab + 运行时产物综合判断  
> **不重复已知结论**，仅以当前代码为准重新定性

---

## 状态总览

| 状态 | 数量 | 说明 |
|------|------|------|
| ✅ 已收口 | 11 | 代码已修 + 测试通过 + 运行可验证 |
| ⚠️ 未收口 | 8 | 已识别但代码/配置层面仍有缺口 |
| 🆕 新发现 | 6 | 本次扫描新发现，之前报告未覆盖 |

---

## 一、已收口项（无需行动）

| # | 项目 | 证据 |
|---|------|------|
| 1 | Main agent 主模型 boom-main/gpt-5.4 | `openclaw.json` 确认 |
| 2 | Fallback 链 → claude-opus-4-6-thinking | `openclaw.json agents.list[main].model.fallbacks` 确认 |
| 3 | HEARTBEAT_OK 静默覆盖 | 11/11 announce 任务已含 HEARTBEAT_OK 指令 |
| 4 | system-monitor 路径修复 | `node index.js health` exit 0, 24 cron 任务可读 |
| 5 | circuit-breaker 单元测试 | `circuit-breaker.test.js` 6/6 pass |
| 6 | handler-executor 单元测试 | `handler-executor.test.js` 6/6 pass |
| 7 | E2E 测试 40/40 | `e2e-event-pipeline.test.js` 全通过 |
| 8 | Handler 语法完整性 74/74 | `node -c` 全量通过，0 broken |
| 9 | meta-enforcement.js 规则路径 | 已修为 `skills/isc-core/rules`（L18） |
| 10 | 新调度引擎 flock 文件锁 | `dispatch-engine.js` writeJson 已改为 flock + atomic rename |
| 11 | intent.detected / git.commit.completed / threshold.* 路由 | 均已建立规则 + handler 闭环 |

---

## 二、未收口项（已知但仍有代码级缺口）

### U-01 [P0] api-probe.js 无 flock 保护

**当前状态**: crontab 行仍为裸调用：
```
*/5 * * * * cd /root/.openclaw/workspace && node scripts/api-probe.js >> /tmp/api-probe.log 2>&1
```
api-probe.js 内部也无 lockFile 机制。failover 切换时存在配置竞争写覆盖风险。

**修复动作**: crontab 加 `flock -xn /tmp/api-probe.lock`，预计 5 分钟

---

### U-02 [P0] 19 条规则的全路径 handler 引用无法被两个 dispatcher 解析

**当前状态**: 
- `handler-executor.js` 的 `loadHandler()` 只在 `event-bus/handlers/` 和 `skills/isc-core/handlers/` 两个目录按**短名**查找
- `infrastructure/dispatcher/dispatcher.js` 的 `resolveHandler()` 只在 `dispatcher/handlers/` 按**短名**查找
- 19 条规则的 `action.handler` 是完整路径（如 `infrastructure/event-bus/handlers/anti-entropy-check.js`、`scripts/check-rule-dedup.js`、`skills/five-layer-event-model/index.js`）
- 实测：`loadHandler('infrastructure/event-bus/handlers/anti-entropy-check.js')` → `NOT FOUND`
- **这 19 条规则在生产中从不执行，且无任何错误日志**

**受影响规则**: anti-entropy-design-principle-001, public-skill-classification-001, isc-rule-creation-dedup-gate-001, self-correction-to-rule-001, parallel-subagent-orchestration-001, pipeline-report-filter-001, scenario-acceptance-gate-001, seef-subskill-orchestration-001, vectorization-standard-enforcement-001, seef-skill-registered-001, layered-decoupling-architecture-001, n033-gateway-config-protection, n036-memory-loss-recovery, subagent-checkpoint-gate-001, skill.evolution.auto-trigger, public-skill-quality-gate-001, skill-no-direct-llm-call-001, five-layer-event-model-001, isc-skill-distribution-separation-001

**修复动作**: 两选一（可并行做）：
- A: 将 19 条规则的 handler 字段改为短名（如 `anti-entropy-check`）
- B: `loadHandler()` 和 `resolveHandler()` 增加路径解析（path.isAbsolute / includes('/')）

---

### U-03 [P0] intent.ruleify / intent.reflect / intent.directive 路由已配但 Dispatcher 主链路未打通

**当前状态**:
- `routes.json` 已添加 3 条路由 → `intent-event-handler`（priority: high/normal）
- `infrastructure/dispatcher/handlers/intent-event-handler.js` 存在（223 行，非 stub）
- **但** `infrastructure/dispatcher/dispatcher.js` 的 `HANDLERS_DIR = path.join(__dirname, 'handlers')` 指向 `infrastructure/dispatcher/handlers/`
- intent-event-handler.js 在 `infrastructure/dispatcher/handlers/` 中 ✅ — 实测 resolveHandler 可找到
- **真正的问题**: event-bus 链路（cron-dispatch-runner）的规则匹配中，这 3 个事件类型在 `skills/isc-core/rules/` 下**无对应规则 JSON**，所以 cron-dispatch 的 `_matchRules()` 对这 3 个事件类型命中 0

**修复动作**: 在 `skills/isc-core/rules/` 下为 intent.ruleify / intent.reflect / intent.directive 创建规则 JSON，handler 指向 `intent-event-handler`

---

### U-04 [P1] system.error handler 执行时 context 缺字段导致崩溃

**当前状态**: 
- `knowledge-executable.js` L12: `const logger = context.logger;` — 无 `|| console` 兜底
- dispatcher 传入 `context = {}` 时，`logger` 为 `undefined`，后续 `logger.info(...)` 直接 TypeError
- 同样问题存在于 **11 个 handler**: eval-quality-check, isc-creation-gate, isc-lto-handshake, isc-rule-decompose, isc-skill-index-update, isc-skill-permission, isc-skill-security, knowledge-executable, meta-enforcement, multi-agent-priority, verify-config-before-code

**修复动作**: 批量修复，将 `context.logger;` 改为 `context.logger || console;`

---

### U-05 [P1] eval-quality-check handler 对 16 条规则返回"未实现"

**当前状态**: eval-quality-check.js 是通用扫描器，但对具体规则的检查逻辑返回 `未实现该规则检查逻辑`。16 条规则（含 aeo_evaluation_required 的 n023/n024）表面有 handler 绑定但实际无执行力。

**修复动作**: 为高优先级规则（至少 n023/n024 AEO 相关）实现具体检查逻辑

---

### U-06 [P1] isc-change-alignment.js 主路径仍因 Class/Function 不匹配而 fallback

**当前状态**: 
- `isc-lto-alignment-checker.js` 导出 `module.exports = ISCDTOAlignmentChecker`（Class）
- handler L28: `if (typeof checker === 'function')` → L29: `alignmentResult = await checker({...})`
- Class 的 typeof 也是 'function'，但不能不用 `new` 调用 → TypeError → catch → fallback 到内置简版检查
- 功能不中断但主路径永远走不到

**修复动作**: L28-29 改为 `if (checker.prototype && checker.prototype.constructor) { checker = new checker(); alignmentResult = await checker.iscProactive(); }`

---

### U-07 [P1] 新调度引擎灰度未激活（DISPATCH_ENGINE 环境变量未设置）

**当前状态**: 
- `dispatcher.js` 已内置 Feature Flag：`DISPATCH_ENGINE=old|dual|new`
- 当前未设置（默认 `old`），新引擎代码完全不走
- `dispatch-engine state`: running=0, queue=0, history=0（从未被使用）
- crontab 中 `dispatch-reap-cron.js` 每 5 分钟运行但 reap 空状态

**修复动作**: 若要开始灰度验证，需设置 `DISPATCH_ENGINE=dual`。当前不算 bug 但属于未完成交付。

---

### U-08 [P1] Dispatcher routes.json 引用不存在的 handler: completeness-check

**当前状态**: 
- `routes.json` 中 `git.commit.completed → completeness-check`
- `completeness-check.js` 存在于 `event-bus/handlers/` ✅
- **不存在于** `dispatcher/handlers/` ❌
- `dispatcher.js` 的 `HANDLERS_DIR` 指向 `dispatcher/handlers/`
- 因此通过 routes.json 路由到达时，resolveHandler → null → fallback 到 dispatchLayer.enqueue（文件分发），不会执行 handler

**修复动作**: 将 `completeness-check.js` 复制或 symlink 到 `dispatcher/handlers/`，或修改 resolveHandler 支持跨目录查找

---

## 三、新发现项

### N-01 [P0] cron/jobs.json 语法损坏

**发现**: JSON parse 在 line 801 失败 — `"payload": { "kind": "agentTurn",\n\n }` 中存在空行+逗号后直接关闭大括号。

**影响**: 任何读取 jobs.json 的脚本（如 system-monitor）如果用严格 JSON.parse，会崩溃或跳过。OpenClaw 自身可能有容错解析，但这是数据完整性风险。

**修复动作**: 修复 L800（删除空行）或补全缺失的 `"message"` 字段值

---

### N-02 [P1] event-dispatch-runner cron 任务连续超时 5 次

**发现**: 
- `event-dispatch-runner` 任务 `enabled: true`，`consecutiveErrors: 5`，`lastError: "cron: job execution timed out"`
- 这是核心事件调度链路的 cron 触发器，连续 5 次超时意味着事件派发链路可能间歇性中断

**影响**: 事件堆积、规则不触发、handler 不执行

**修复动作**: 排查超时原因（可能与 dispatcher.js 处理耗时或锁竞争有关），必要时加大 timeoutSeconds 或优化处理逻辑

---

### N-03 [P1] .gitignore 极度不完整，运行时产物持续污染 Git

**发现**: 
- `.gitignore` 仅含 1 行：`workspace/scripts/.probe-state.json`
- 当前 git dirty 文件：JSONL 日志 8 个、状态 JSON 7 个、signal 文件 78 个、本地任务编排 task 文件 35 个
- 这些全是运行时产物，不应进入版本控制

**修复动作**: 扩展 .gitignore：
```
infrastructure/logs/*.jsonl
infrastructure/enforcement/*.jsonl
infrastructure/event-bus/signals/processed/
infrastructure/event-bus/signals/*.signal
infrastructure/event-bus/.cron-dispatch-cursor.json
infrastructure/event-bus/sensors/.threshold-state.json
infrastructure/self-check/.*-state.json
infrastructure/dispatcher/state/
infrastructure/dispatcher/dispatched-archive/
skills/lto-core/tasks/
skills/cras/.intent-extractor-state.json
skills/isc-core/.rules-snapshot.json
skills/public/multi-agent-dispatch/state/
scripts/.probe-state.json
scripts/logs/
*.lock
.entropy-archive/
tmp-*.json
```

---

### N-04 [P1] 汇报技能（multi-agent-reporting）与新调度引擎完全脱钩

**发现**: 
- `multi-agent-reporting/index.js`（372 行）**不引用 DispatchEngine**，无 `liveBoard()` 调用
- `report-trigger.js`（171 行）是桥接模块，设计正确，但无人调用它
- 即使 `DISPATCH_ENGINE=dual/new`，调度事件也不会自动触发汇报

**修复动作**: 在 dispatcher.js 或 dispatch-bridge.js 中接入 ReportTrigger

---

### N-05 [P2] notify-alert handler 仅写 JSONL，无真实通知

**发现**: 
- `notify-alert.js`（event-bus 和 dispatcher 版本）仅写 `alerts.jsonl`
- 无 Feishu webhook、无 bus.emit 到通知服务、无 HTTP 调用
- 4 条规则（failure-pattern-alert、caijuedian-tribunal 等）+ 4 类 threshold 事件依赖此 handler
- **关键告警信号被静默吞掉**

**修复动作**: 接入 Feishu webhook 或 OpenClaw message API

---

### N-06 [P2] 两套 dispatcher 系统共存，handler 目录不一致

**发现**: 
- `infrastructure/event-bus/` 下有自己的 handler-executor + 75 个 handlers
- `infrastructure/dispatcher/` 下有自己的 resolveHandler + 18 个 handlers
- 两套 handler 集合**几乎不重叠**，但 routes.json 引用的 handler 存在于 dispatcher/handlers，ISC rules 的 handler 存在于 event-bus/handlers
- 事件根据入口路径走不同链路，handler 解析结果不同
- 长期是架构债务，短期造成排查困难

**修复动作**: 统一 handler 注册表，或让两个 executor 共享同一份 handler 目录

---

## 四、可并发执行任务拆分

以下任务互相无依赖，可同时启动：

### 并发组 A（P0 级，立即执行）

| Task ID | 任务 | 来源 | 预估时间 | 前置依赖 |
|---------|------|------|----------|----------|
| A-1 | api-probe crontab 加 flock | U-01 | 5 min | 无 |
| A-2 | 修复 cron/jobs.json 语法错误 | N-01 | 10 min | 无 |
| A-3 | 19 条规则 handler 字段改短名 | U-02 | 15 min | 无 |
| A-4 | 为 intent.ruleify/reflect/directive 创建 ISC 规则 JSON | U-03 | 20 min | 无 |

### 并发组 B（P1 级，组 A 不阻塞）

| Task ID | 任务 | 来源 | 预估时间 | 前置依赖 |
|---------|------|------|----------|----------|
| B-1 | 11 个 handler 的 context.logger 加 `\|\| console` 兜底 | U-04 | 10 min | 无 |
| B-2 | isc-change-alignment.js Class 调用修复 | U-06 | 5 min | 无 |
| B-3 | completeness-check.js 复制到 dispatcher/handlers/ | U-08 | 2 min | 无 |
| B-4 | .gitignore 扩展 | N-03 | 5 min | 无 |
| B-5 | event-dispatch-runner 超时排查 | N-02 | 30 min | A-2（jobs.json 先修好） |
| B-6 | 设置 DISPATCH_ENGINE=dual 灰度 | U-07 | 10 min | 无 |

### 并发组 C（P1-P2，优化类）

| Task ID | 任务 | 来源 | 预估时间 | 前置依赖 |
|---------|------|------|----------|----------|
| C-1 | eval-quality-check 为 n023/n024 实现检查逻辑 | U-05 | 45 min | 无 |
| C-2 | ReportTrigger 接入 dispatcher | N-04 | 30 min | B-6 |
| C-3 | notify-alert 接入真实通知 | N-05 | 30 min | 无 |
| C-4 | Handler 目录统一方案设计 | N-06 | 60 min | 无（设计先行） |

---

## 五、执行建议

1. **组 A 全部立即并发**，4 个任务完全独立，任一完成即可提交
2. **组 B 与组 A 可同时开始**（除 B-5 需等 A-2）
3. **组 C 在 A+B 完成后或资源充足时启动**
4. 所有任务完成后，运行一次 `e2e-event-pipeline.test.js` + `condition-evaluator.test.js` + `circuit-breaker.test.js` + `handler-executor.test.js` 全量回归

---

## 六、一句话结论

**Day2 核心功能已交付，但存在 4 个 P0（api-probe 无锁、19 条规则静默失效、intent 三路由未在 event-bus 链路生效、jobs.json 损坏）和 10 个 P1-P2（context 崩溃、Class 调用错误、handler 目录分裂、调度引擎未激活、汇报未接入、通知空转、gitignore 缺失、cron 超时累积）。全部可并发修复，预计 2-3 人小时。**
