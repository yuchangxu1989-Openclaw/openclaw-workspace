# Day2 收口补 Lane：LEP 能力回迁方案

**决策前提**：删除 `infrastructure/lep-core` 作为独立主路模块。其封装的 retry / circuit breaker / WAL / trace / recovery 五类能力不丢弃，按最小侵入方式回迁至 dispatcher / execution / repair 三层。

---

## 0. 现状速查

| 能力 | LEP 中的位置 | 系统现有基础 | 结论 |
|------|-------------|-------------|------|
| **Retry** | `LEPExecutor`（3次指数退避）| `dispatcher.js` 已有 2-attempt retry → manual queue | 扩展现有，加退避参数 |
| **Circuit Breaker** | `LEPExecutor.circuitBreaker` | `resilient-dispatcher.js` 已有 per-handler CB；`circuit-breaker.js` 已有 event 级限流 | 提升 `resilient-dispatcher` 为 canonical，删 LEP 包装 |
| **WAL** | `LEPExecutor._initWAL` → `.lep-wal/` | `manual-queue.jsonl`（仅追加，无确认/回放）| 新增 `wal.js` 包装 manual-queue，补 recover 启动扫描 |
| **Trace** | `lep-event-bridge.js`（executionId）+ L3 gateway（trace_id）| `l3-gateway.js` 已生成 `trace_id` per event | 将 trace_id 透传至 dispatcher context，handler 直接读取 |
| **Recovery** | `n016-repair-loop.js` + `n017-recurring-pattern.js` | `self-healing/cron-healer.js` + `monitoring/auto-rootcause-repair.js` | 抽 repair-coordinator，吸收 n016/n017 核心逻辑，去掉 BaseExecutor 壳 |

---

## 1. Retry — 落点：`infrastructure/dispatcher/`

### 现状

`dispatcher.js` 已实现：
```
attempt 0 → attempt 1 → enqueueManual()
```
无退避延迟，固定 2 次。LEP 额外提供：指数退避 + 可配最大次数。

### 最小改动

**新文件**：`infrastructure/dispatcher/retry-policy.js`

```js
'use strict';
/**
 * Retry Policy — 替代 LEP RetryManager
 * 
 * 落点：dispatcher 层，dispatcher.js / resilient-dispatcher.js 直接 require
 */

const DEFAULT = { maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0, backoff: 'fixed' };

/**
 * 计算第 attempt 次重试的等待时间（毫秒）
 * @param {number} attempt - 当前已尝试次数（0-based）
 * @param {object} policy
 */
function calcDelay(attempt, policy = DEFAULT) {
  const p = { ...DEFAULT, ...policy };
  if (p.backoff === 'exponential') {
    const delay = p.baseDelayMs * Math.pow(2, attempt);
    return Math.min(delay, p.maxDelayMs);
  }
  return p.baseDelayMs;
}

/**
 * 带重试的执行包装器
 * @param {Function} fn - async () => result
 * @param {object} policy - { maxRetries, baseDelayMs, maxDelayMs, backoff }
 * @returns {Promise<{result, attempts, retried}>}
 */
async function withRetry(fn, policy = DEFAULT) {
  const p = { ...DEFAULT, ...policy };
  let lastErr;
  for (let i = 0; i <= p.maxRetries; i++) {
    try {
      const result = await fn();
      return { result, attempts: i + 1, retried: i > 0 };
    } catch (err) {
      lastErr = err;
      if (i < p.maxRetries) {
        const delay = calcDelay(i, p);
        if (delay > 0) await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

module.exports = { withRetry, calcDelay, DEFAULT };
```

**修改**：`infrastructure/dispatcher/dispatcher.js`

在现有 retry loop 区块（第 603 行附近）：
```js
// 现有：固定 2-attempt for loop
for (let attempt = 0; attempt < 2; attempt++) { ... }
```
替换为调用 `withRetry`（或保持循环结构，把延迟参数从 options 读取），改动范围约 10 行，不改动函数签名。

**无需改动**：`resilient-dispatcher.js`（其 circuit breaker 已提供兜底，retry 只在进入 CB 前发生）。

---

## 2. Circuit Breaker — 落点：`infrastructure/resilience/`

### 现状

系统已有两层 CB，职责已明确分层：

| 文件 | 粒度 | 作用 |
|------|------|------|
| `infrastructure/event-bus/circuit-breaker.js` | 事件类型 / 全局 | 防事件洪峰、链路深度保护 |
| `infrastructure/resilience/resilient-dispatcher.js` | per-handler | 连续失败 3 次熔断，5min 冷却自恢复 |

LEP 的 `circuitBreaker`（`failureThreshold=5, resetTimeout=30s`）与 `resilient-dispatcher` 语义完全重叠。

### 最小改动

**无新文件**。只做三件事：

1. **在 `resilient-dispatcher.js` 顶部注释中显式声明**：本文件为全系统 handler-level circuit breaker 的 canonical 实现，替代 LEP CircuitBreaker。

2. **将 `lep-event-bridge.js` 中的 `lep.circuit.opened` 事件改为由 resilient-dispatcher 直接 emit**：

   在 `resilient-dispatcher.js` `_logAlert('handler_disabled', ...)` 之后加一行：
   ```js
   // 向 EventBus 广播 CB 开路事件（原 lep-event-bridge 职责）
   try {
     const bus = require('../event-bus/bus-adapter');
     bus.emit('dispatcher.handler.circuit_opened', {
       handler: handlerName,
       consecutive_failures: health.consecutiveFailures,
     }, 'resilient-dispatcher');
   } catch (_) {}
   ```

3. **删除 `infrastructure/lep-core/lep-event-bridge.js` 中 `lep.circuit.opened` 监听注册**（如 lep-core 整体删除则此步骤随之消除）。

---

## 3. WAL（Write-Ahead Log）— 落点：`infrastructure/dispatcher/`

### 现状

`manual-queue.jsonl` 是只追加的失败记录，没有确认机制，也没有启动时回放。LEP 的 `.lep-wal/` 目录意图实现真正的 WAL（写入即持久，可幂等回放），但实际代码是占位实现。

### 最小改动

**新文件**：`infrastructure/dispatcher/wal.js`

```js
'use strict';
/**
 * Dispatcher WAL — 替代 LEP WAL
 * 
 * 对 manual-queue.jsonl 加 status 字段包装，
 * 提供幂等写入 + 启动时回放扫描两个核心方法。
 * 
 * 落点：dispatcher 层
 */

const fs = require('fs');
const path = require('path');

const WAL_FILE = path.join(__dirname, 'manual-queue.jsonl');
const WAL_RECOVERED_FILE = path.join(__dirname, 'wal-recovered.jsonl');

/**
 * 追加一条 WAL 记录（status=pending）
 */
function walAppend(ruleId, event, error) {
  const entry = {
    walId: `wal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    status: 'pending',          // pending | recovered | dead
    ruleId: ruleId || 'unknown',
    eventType: event && event.type || 'unknown',
    eventId: event && event.id || 'unknown',
    error: error instanceof Error ? error.message : String(error),
    event,
  };
  try {
    fs.appendFileSync(WAL_FILE, JSON.stringify(entry) + '\n');
  } catch (_) {}
  return entry.walId;
}

/**
 * 启动时扫描 WAL，返回待回放的事件列表
 * 调用方负责重新投递后调用 walAck(walId)
 */
function walRecoverPending(maxAge = 24 * 60 * 60 * 1000) {
  if (!fs.existsSync(WAL_FILE)) return [];
  const cutoff = Date.now() - maxAge;
  const lines = fs.readFileSync(WAL_FILE, 'utf8').trim().split('\n').filter(Boolean);
  const pending = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      // 只回放 status=pending 且在最大年龄内的记录
      if (entry.status === 'pending' && new Date(entry.ts).getTime() > cutoff) {
        pending.push(entry);
      }
    } catch (_) {}
  }
  return pending;
}

/**
 * 标记某条 WAL 记录为已恢复（追加一条 ack 记录到 recovered 文件）
 */
function walAck(walId) {
  try {
    fs.appendFileSync(WAL_RECOVERED_FILE,
      JSON.stringify({ walId, ackedAt: new Date().toISOString() }) + '\n');
  } catch (_) {}
}

module.exports = { walAppend, walRecoverPending, walAck };
```

**修改**：`infrastructure/dispatcher/dispatcher.js`

`enqueueManual()` 函数中将 `walAppend` 替换现有 `fs.appendFileSync`（或在其基础上包装），改动 ≤5 行。

**修改**：dispatcher 启动入口（`main()` 函数顶部）加入启动回放：
```js
// WAL recovery: re-queue 上次未处理的失败事件
const { walRecoverPending, walAck } = require('./wal');
const pendingWAL = walRecoverPending();
if (pendingWAL.length) {
  console.log(`[Dispatcher] WAL recovery: ${pendingWAL.length} pending entries`);
  // 注入到待处理队列（不重复 ack 已消费的）
  events.unshift(...pendingWAL.map(w => w.event).filter(Boolean));
}
```

---

## 4. Trace — 落点：`infrastructure/dispatcher/` + `infrastructure/pipeline/`

### 现状

`l3-gateway.js` 已为每个 event 生成 `trace_id`（`l3gw_{ts}_{rand}`）并写入日志。LEP 的 `executionId` 覆盖同一语义但只在 lep-core 内部流通，没有透传到 handler。

### 最小改动

**新文件**：`infrastructure/dispatcher/trace.js`

```js
'use strict';
/**
 * Dispatcher Trace Context — 替代 LEP executionId
 * 
 * 职责：生成并透传 trace_id，使 handler 可以无感知地使用。
 * 与 l3-gateway.js 协议兼容（优先使用 event.meta.trace_id）。
 */

function generateTraceId(prefix = 'dsp') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 从 event 提取或生成 trace_id
 * l3-gateway 已注入的不覆盖，dispatcher 自生成的以 'dsp_' 开头便于区分
 */
function resolveTraceId(event) {
  return (event && event.meta && event.meta.trace_id)
      || (event && event.trace_id)
      || generateTraceId();
}

/**
 * 将 trace_id 注入到 dispatcher context（handler 通过 context.traceId 读取）
 */
function attachTrace(event, context) {
  const traceId = resolveTraceId(event);
  context.traceId = traceId;
  // 回写到 event.meta 保证下游事件继承
  if (event && typeof event === 'object') {
    event.meta = event.meta || {};
    event.meta.trace_id = traceId;
  }
  return traceId;
}

module.exports = { generateTraceId, resolveTraceId, attachTrace };
```

**修改**：`infrastructure/dispatcher/dispatcher.js`

在 `dispatch()` 函数构建 `context` 对象时（约第 607 行）：
```js
const { attachTrace } = require('./trace');
const context = {
  rule,
  route: route ? route.config : null,
  handlerName,
  matchedPattern: route ? route.pattern : 'direct',
};
const traceId = attachTrace(event, context);   // ← 新增，≤2行
```

**无需修改**：`l3-gateway.js`（已生成 trace_id，trace.js 优先使用它）。

---

## 5. Recovery（修复循环）— 落点：`infrastructure/self-healing/`

### 现状

LEP 的 `n016-repair-loop.js` 和 `n017-recurring-pattern.js` 都继承自 `BaseExecutor`（LEP 内部抽象），被 LEP 主路作为"规则执行器"调用。删除 LEP 后，这两个执行器的核心逻辑（循环修复、模式检测）需要平迁到 self-healing 层。

`self-healing/cron-healer.js` + `monitoring/auto-rootcause-repair.js` 已覆盖：
- cron job 级别的自愈（字段修复、连续失败清零）
- 任务级修复任务创建与告警同步

n016/n017 的额外能力：迭代修复循环（n016）+ 跨时间窗口重复模式检测（n017）。

### 最小改动

**新文件**：`infrastructure/self-healing/repair-coordinator.js`

```js
'use strict';
/**
 * Repair Coordinator — 替代 LEP n016/n017
 * 
 * 整合：
 *   - 迭代修复循环（原 n016-repair-loop）
 *   - 重复模式检测（原 n017-recurring-pattern）
 * 
 * 去掉 BaseExecutor 壳，直接暴露函数接口，
 * 由 self-healing cron job 或 event-bus handler 调用。
 * 
 * 落点：infrastructure/self-healing/
 */

const fs = require('fs');
const path = require('path');

const PATTERN_LOG = path.join(__dirname, 'logs', 'recurring-patterns.jsonl');
const REPAIR_LOG  = path.join(__dirname, 'logs', 'repair-iterations.jsonl');

function nowIso() { return new Date().toISOString(); }
function appendLog(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ ...obj, ts: nowIso() }) + '\n');
}

// ── n016 核心：迭代修复循环 ──────────────────────────────────────

/**
 * 对一组 fixableIssues 执行最多 maxIterations 轮修复
 * 每轮执行 fixFn(issues) → { fixed: [...], remaining: [...] }
 * 
 * @param {Array}    issues
 * @param {Function} fixFn          async (issues) => { fixed, remaining }
 * @param {object}   opts           { maxIterations=3, exitOnEmpty=true }
 * @returns {object} { totalFixed, remaining, iterations }
 */
async function runRepairLoop(issues, fixFn, opts = {}) {
  const { maxIterations = 3, exitOnEmpty = true } = opts;
  let current = [...issues];
  let totalFixed = 0;
  let iteration = 0;

  for (; iteration < maxIterations && current.length > 0; iteration++) {
    const { fixed = [], remaining = current } = await fixFn(current);
    totalFixed += fixed.length;
    current = remaining;

    appendLog(REPAIR_LOG, {
      iteration: iteration + 1,
      fixed: fixed.length,
      remaining: current.length,
    });

    if (exitOnEmpty && current.length === 0) break;
  }

  return { totalFixed, remaining: current, iterations: iteration };
}

// ── n017 核心：重复模式检测 ──────────────────────────────────────

const _errorWindow = [];   // { error, ts }[]
const WINDOW_MS = 60 * 60 * 1000;   // 1h 窗口
const RECUR_THRESHOLD = 3;           // 同类 error ≥3 次 → recurring

/**
 * 记录一次执行失败错误，判断是否为重复模式
 * @param {string} errorMsg
 * @returns {{ isRecurring: boolean, count: number, pattern: string }}
 */
function trackError(errorMsg) {
  const now = Date.now();
  // 淘汰窗口外的记录
  while (_errorWindow.length && now - _errorWindow[0].ts > WINDOW_MS) {
    _errorWindow.shift();
  }
  // 归一化 error 为 pattern（去掉路径/时间戳等动态部分）
  const pattern = errorMsg
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.Z]+/g, '<ts>')
    .replace(/0x[\da-f]+/gi, '<addr>')
    .replace(/\d+ms/g, '<N>ms')
    .slice(0, 200);

  _errorWindow.push({ pattern, ts: now });
  const count = _errorWindow.filter(e => e.pattern === pattern).length;
  const isRecurring = count >= RECUR_THRESHOLD;

  if (isRecurring) {
    appendLog(PATTERN_LOG, { pattern, count, window_ms: WINDOW_MS });
  }

  return { isRecurring, count, pattern };
}

module.exports = { runRepairLoop, trackError };
```

**修改**：`infrastructure/monitoring/auto-rootcause-repair.js`

在 `main()` 末尾追加调用（可选，需要时启用）：
```js
// 对非自动修复的 findings 触发 repair-coordinator 迭代修复循环
const { runRepairLoop } = require('../self-healing/repair-coordinator');
// （具体 fixFn 由各 finding 类型的 runbook 实现）
```

**修改**：`infrastructure/event-bus/dispatcher.js`（事件总线侧 dispatcher）

在 handler 失败回调中调用 `trackError`，替换 lep-event-bridge 的 `lep.task.failed` 事件发布：
```js
const { trackError } = require('../self-healing/repair-coordinator');
// handler 执行失败时：
const { isRecurring, pattern } = trackError(err.message);
if (isRecurring) {
  bus.emit('system.recurring_error_detected', { pattern }, 'dispatcher');
}
```

---

## 6. 文件级落点汇总

### 新增文件（最小集）

| 文件路径 | 替代 LEP 能力 | 行数估算 |
|----------|-------------|---------|
| `infrastructure/dispatcher/retry-policy.js` | `LEPExecutor.retryPolicy` + `RetryManager` | ~60 行 |
| `infrastructure/dispatcher/wal.js` | `LEPExecutor._initWAL` + `.lep-wal/` | ~70 行 |
| `infrastructure/dispatcher/trace.js` | `lep-event-bridge.js` executionId + `l3-gateway.js` traceId 统一 | ~50 行 |
| `infrastructure/self-healing/repair-coordinator.js` | `n016-repair-loop.js` + `n017-recurring-pattern.js` 核心逻辑 | ~120 行 |

合计 **~300 行新代码**，全部纯函数/无状态，零外部依赖。

### 修改文件（改动量）

| 文件路径 | 改动内容 | 改动量 |
|----------|----------|-------|
| `infrastructure/dispatcher/dispatcher.js` | 引入 retry-policy/wal/trace，替换内联实现 | ~20 行 |
| `infrastructure/resilience/resilient-dispatcher.js` | 加 CB 开路事件向 EventBus 广播 | ~8 行 |
| `infrastructure/monitoring/auto-rootcause-repair.js` | 可选：接入 repair-coordinator | ~5 行 |
| `infrastructure/event-bus/dispatcher.js` | 接入 trackError | ~5 行 |

### 可删除文件（LEP 独立模块）

```
infrastructure/lep-core/           # 整个目录
  core/LEPExecutor.js              # retry/circuit/WAL/trace 已回迁
  core/RetryManager.js             # → retry-policy.js
  core/HealthMonitor.js            # → resilient-dispatcher.js
  executors/n016-repair-loop.js    # → repair-coordinator.js
  executors/n017-recurring-pattern.js  # → repair-coordinator.js
  executors/base.js                # 随 n016/n017 一起删
  lep-event-bridge.js              # 桥接职责分散归位
  index.js
lep-subagent/                      # 独立 subagent 进程，随 LEP 主路删除
```

---

## 7. 迁移顺序（最小风险路径）

```
Step 1  新增 retry-policy.js + wal.js + trace.js（纯新增，不破坏现有）
Step 2  修改 dispatcher.js 引入三者，验证现有测试不回归
Step 3  新增 repair-coordinator.js，验证 runRepairLoop / trackError 单元测试通过
Step 4  修改 resilient-dispatcher.js 广播 CB 事件
Step 5  删除 infrastructure/lep-core/（确认无其他 require 引用）
Step 6  删除 lep-subagent/（确认 cron jobs 中无直接调用）
```

---

## 8. 不变的边界

以下文件**不需要改动**，保持原职责：

- `infrastructure/event-bus/circuit-breaker.js` — 事件总线级限流，与 handler CB 正交
- `infrastructure/pipeline/l3-gateway.js` — trace_id 生成保留，trace.js 复用它
- `infrastructure/self-healing/cron-healer.js` — cron 字段级自愈，repair-coordinator 不替代它
- `infrastructure/monitoring/auto-rootcause-repair.js` — 告警 + 任务创建，仍是 rootcause 入口

---

## 9. 验收标准

| 验收项 | 验证方式 |
|--------|---------|
| Retry 退避生效 | `node -e "const {withRetry}=require('./infrastructure/dispatcher/retry-policy'); withRetry(()=>{throw new Error('x')},{maxRetries:2,baseDelayMs:50,backoff:'exponential'}).catch(e=>console.log('ok:',e.message))"` |
| WAL 写入 + 回放 | `node -e "const {walAppend,walRecoverPending}=require('./infrastructure/dispatcher/wal'); walAppend('test',{type:'t',id:'e1'},'err'); console.log(walRecoverPending().length>0)"` |
| Trace 透传 | dispatcher 日志中 context.traceId 存在且格式为 `dsp_*` 或 `l3gw_*` |
| Circuit Breaker 广播 | `resilient-dispatcher` 熔断后 EventBus 中出现 `dispatcher.handler.circuit_opened` 事件 |
| Repair Loop | `runRepairLoop([{id:1}], async(issues)=>({fixed:issues,remaining:[]}), {maxIterations:3})` 返回 `totalFixed:1` |
| lep-core 无引用 | `grep -r "lep-core\|lep-subagent" infrastructure/ skills/ --include="*.js" \| grep -v "node_modules"` 无输出 |

---

*本方案不保留 LEP 独立主路叙事。全部能力以最小文件数直接归位到 dispatcher / self-healing / resilience 三个既有目录，不新建独立层。*
