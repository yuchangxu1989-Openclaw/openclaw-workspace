# Day 2: L3 错误处理与恢复机制 — 完成报告

**日期**: 2026-03-05  
**状态**: ✅ 全部完成 | 64/64 测试通过  
**Git**: `3e9cad4`

---

## 交付物总览

| 模块 | 文件 | 核心能力 | 测试数 |
|------|------|---------|--------|
| 错误分类器 | `resilience/error-handler.js` | 三类错误分类 + 指数退避重试 + 降级策略 + 部分响应恢复 | 28 |
| 韧性EventBus | `resilience/resilient-bus.js` | 队列背压 + 死信队列 + 积压告警 | 12 |
| 韧性Dispatcher | `resilience/resilient-dispatcher.js` | Handler崩溃隔离 + 每handler熔断器 + 健康仪表盘 | 11 |
| 配置自愈 | `resilience/config-self-healer.js` | 规则文件容错 + flags降级 + routes降级 | 13 |

---

## 1. 错误分类与处理策略 (`error-handler.js`)

### 三类错误自动分类

```
Transient (网络/API) → 指数退避重试，最多3次
  ├── ETIMEDOUT, ECONNRESET, ECONNREFUSED
  ├── 429 Too Many Requests, 502, 503
  └── rate limit, socket hang up

Permanent (配置/权限) → 立即失败 + 告警 + 降级
  ├── ENOENT, EACCES, EPERM
  ├── JSON SyntaxError, 401, 403
  └── missing config, module not found

Partial (LLM不完整) → 尝试解析 + 降级到regex
  ├── unexpected end of JSON
  ├── truncated, incomplete
  └── finish_reason: length
```

### 核心API

- **`classify(error)`** — 自动分类错误类型
- **`withRetry(fn, options)`** — 指数退避重试（500ms → 1s → 2s，30%抖动，15s上限）
- **`withDegradation(primary, fallback)`** — 主逻辑失败自动切换到降级逻辑
- **`recoverPartialResponse(raw)`** — 4级恢复：完整JSON → 修复截断 → 提取嵌入JSON → regex提取

---

## 2. 消息队列与积压处理 (`resilient-bus.js`)

### 背压策略

| 队列深度 | 策略 |
|---------|------|
| ≤50 | 正常运行 |
| 51-100 | DecisionLog warning告警 |
| >100 | 丢弃低优先级事件（system.health, debug.*, telemetry.*） |

### 事件优先级

- **CRITICAL (100)** / **HIGH (80)**: `system.error`, `user.message`, `isc.rule`
- **NORMAL (50)**: 默认
- **LOW (20)**: `system.health`, `debug.*`, `telemetry.*`
- **BACKGROUND (10)**: 显式标记

### 死信队列

- 事件连续失败3次 → 自动移入 `dead-letter.jsonl`
- 不阻塞主流程，自动ack跳过
- `getDLQ()` 查看死信，`retryDLQ()` 重试

---

## 3. Handler崩溃隔离 (`resilient-dispatcher.js`)

### 崩溃隔离

- 每个handler在独立try-catch中执行
- 一个handler崩溃不影响其他handler的事件处理
- 崩溃自动记录到 manual-queue + DecisionLog

### 每Handler熔断器

```
连续崩溃 1次 → status: degraded, 继续接收事件
连续崩溃 2次 → status: degraded, 继续接收事件  
连续崩溃 3次 → status: disabled, 熔断器打开, 拒绝新事件
          ↓
     5分钟冷却
          ↓
  自动重新启用 (half-open → closed)
```

### 健康仪表盘

- `getHandlerHealth()` — 所有handler的健康状态
- `getDisabledHandlers()` — 被禁用的handler列表
- `enableHandler(name)` / `disableHandler(name)` — 手动控制

---

## 4. 配置自愈 (`config-self-healer.js`)

| 场景 | 行为 |
|------|------|
| 规则文件JSON解析失败 | 跳过该规则 + 告警，其他规则正常加载 |
| flags.json损坏 | 回退到硬编码默认值，尝试写回修复 |
| routes.json损坏 | 备份损坏文件，回退到内置默认路由 |
| 任意JSON文件损坏 | `loadJsonSafe()` 统一容错，可选自动修复 |

内置默认路由保证最小可用性：
- `user.message` → `user-message-router`
- `system.error` → `system-alert`
- `user.intent.*` → `intent-dispatch`

---

## 5. 测试覆盖

```
╔══════════════════════════════════════════════════╗
║        L3 Resilience Test Suite — Day 2          ║
╚══════════════════════════════════════════════════╝

📊 Error Handler:       28 passed, 0 failed
📊 Resilient Bus:       12 passed, 0 failed
📊 Resilient Dispatcher: 11 passed, 0 failed
📊 Config Self-Healer:  13 passed, 0 failed

══════════════════════════════════════════════════
📊 TOTAL: 64 passed, 0 failed, 64 tests
══════════════════════════════════════════════════
```

运行方式: `node infrastructure/tests/resilience/run-all.js`

---

## 架构图

```
┌─────────────────────────────────────────────────────┐
│                    L3 Pipeline                       │
│                                                     │
│  EventBus ──→ RuleMatcher ──→ IntentScanner ──→ Dispatcher
│     │              │                                │
│     ▼              ▼                                ▼
│ ┌────────┐   ┌──────────┐                    ┌──────────┐
│ │Resilient│   │Config    │                    │Resilient │
│ │Bus      │   │Self-     │                    │Dispatcher│
│ │         │   │Healer    │                    │          │
│ │•背压    │   │          │                    │•崩溃隔离 │
│ │•DLQ     │   │•规则容错 │                    │•熔断器   │
│ │•告警    │   │•flags降级│                    │•健康仪表 │
│ └────────┘   │•routes降级│                    └──────────┘
│               └──────────┘                          │
│                                                     │
│                    Error Handler                    │
│              ┌───────────────────┐                  │
│              │ •分类(T/P/Partial)│                  │
│              │ •指数退避重试     │                  │
│              │ •降级策略         │                  │
│              │ •部分响应恢复     │                  │
│              └───────────────────┘                  │
└─────────────────────────────────────────────────────┘
```

---

## 与Day 1的关系

Day 1 实现了 happy path + 全局熔断器(chain_depth ≤5)。  
Day 2 在每个组件内部增加了韧性层：

- **EventBus** Day1只有emit/consume → Day2增加背压+DLQ+告警
- **RuleMatcher** Day1加载失败=crash → Day2单规则容错，跳过损坏文件
- **Dispatcher** Day1单次重试 → Day2每handler独立熔断器+崩溃隔离
- **Config** Day1无容错 → Day2三层配置自愈(规则/flags/routes)
- **Pipeline** Day1全局熔断 → Day2组件级韧性，互不影响
