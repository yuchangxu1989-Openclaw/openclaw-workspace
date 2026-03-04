# D2-08: L3 Pipeline 主路升级报告

**日期**: 2026-03-05
**状态**: ✅ 完成
**耗时**: ~30min

## TL;DR

L3 Pipeline 从旁路监听升级为主路处理。通过 L3 Gateway 拦截 `bus-adapter.emit()`，实现：
- `user.message` 事件走 L3 全流程 (IntentScanner → RuleMatcher → Dispatcher v2 → Handler)
- FeatureFlag 灰度控制（可按事件类型切换 L3 vs 旧路径）
- L3 失败自动 fallback 到旧路径（不丢事件）
- Shadow 模式双路径对比日志

## 架构变更

### 核心新增文件

| 文件 | 作用 |
|------|------|
| `infrastructure/pipeline/l3-gateway.js` | L3 主路网关，拦截 emit 实现实时事件处理 |
| `infrastructure/pipeline/l3-gateway-test.js` | 39 项集成测试 |

### 架构对比

**变更前（旁路模式）**：
```
EventSource → bus-adapter.emit() → events.jsonl
                                     ↓ (poll)
                              旧 Dispatcher 消费 → handler
                              
L3 Pipeline (独立 run) → 批量读 events → 处理 (不影响实际路由)
```

**变更后（主路模式）**：
```
EventSource → bus-adapter.emit() [被 L3 Gateway 拦截]
  ├─ 正常写入 events.jsonl（保证持久化）
  ├─ FeatureFlag 匹配？
  │   ├─ YES → L3 全流程（IntentScanner → RuleMatcher → Dispatcher v2）
  │   │   ├─ 成功 → ack 事件（旧 Dispatcher 不再消费）
  │   │   └─ 失败 → 不 ack → 旧 Dispatcher 自动 fallback
  │   └─ NO → 事件走旧路径
  └─ Shadow 模式？→ 双路径对比日志
```

## FeatureFlag 配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `L3_MAINLINE_ENABLED` | `true` | 总开关 |
| `L3_MAINLINE_EVENTS` | `user.message` | 逗号分隔的事件类型模式 |
| `L3_SHADOW_MODE` | `false` | 双路径对比模式 |
| `L3_FALLBACK_ENABLED` | `true` | 失败时回退旧路径 |
| `INTENT_SCANNER_ENABLED` | `true` | IntentScanner 运行时开关 |

### 灰度示例

```bash
# 仅 user.message 走 L3（默认）
export L3_MAINLINE_EVENTS=user.message

# 扩大到 ISC 规则事件
export L3_MAINLINE_EVENTS=user.message,isc.rule.*

# 全量走 L3
export L3_MAINLINE_EVENTS=*

# 关闭 L3，全走旧路径
export L3_MAINLINE_ENABLED=false

# Shadow 模式：双路径对比
export L3_SHADOW_MODE=true
```

## 测试结果

### 39/39 全部通过

```
── Test 1: FeatureFlag ──
  ✅ 总开关/事件列表/Shadow/Fallback 配置正确

── Test 2: 事件匹配 ──
  ✅ 精确匹配/前缀匹配/通配匹配

── Test 3: L3 单事件处理 ──
  ✅ L3 处理链: IntentScanner:ok → RuleMatcher:ok → Dispatcher:ok
  ✅ 匹配规则: 0, 意图: 1, 分发: 1（走 direct route）

── Test 4: Gateway 安装与拦截 ──
  ✅ 事件被拦截 → L3 处理成功 → ack 事件
  ✅ 非 L3 事件走旧路径

── Test 5: FeatureFlag 灰度控制 ──
  ✅ L3 关闭时事件不被拦截，走旧路径

── Test 6: Shadow 模式 ──
  ✅ 双路径对比：L3=cras-knowledge-handler, Legacy=cras-knowledge-handler
  ✅ Match=true，结果一致

── Test 7: 非对话事件 ──
  ✅ isc.rule.changed 跳过 IntentScanner，RuleMatcher 正常

── Test 8: 日志验证 ──
  ✅ gateway 日志包含完整处理链（IntentScanner/RuleMatcher/Dispatcher）
```

## Fallback 机制

**设计原则：事件不丢**

1. 事件总是先写入 `events.jsonl`（L3 Gateway 不阻塞 emit）
2. L3 成功 → `ack` 事件，旧 Dispatcher 跳过
3. L3 失败 → 不 `ack`，旧 Dispatcher 下次消费时自动处理
4. L3 Gateway 崩溃 → 事件已在 bus 中，旧 Dispatcher 照常消费

**零丢失保证**：即使 L3 Gateway 进程挂掉，事件已持久化在 JSONL 中。

## 日志文件

| 文件 | 用途 |
|------|------|
| `infrastructure/pipeline/l3-gateway.log.jsonl` | Gateway 每步处理日志 |
| `infrastructure/pipeline/l3-comparison.log.jsonl` | Shadow 模式 L3 vs Legacy 对比 |
| `infrastructure/pipeline/run-log.jsonl` | L3 Pipeline 批处理日志（原有） |

## 使用方式

```javascript
// 安装 L3 Gateway
const gateway = require('./infrastructure/pipeline/l3-gateway');
const { uninstall, stats } = gateway.install();

// 此后所有 bus-adapter.emit('user.message', ...) 自动走 L3

// 查看统计
console.log(gateway.stats());
// → { installed: true, intercepted: 5, l3_success: 4, l3_fallback: 1, ... }

// 卸载（恢复旧路径）
gateway.uninstall();
```

## 验收标准达成

| 标准 | 状态 |
|------|------|
| emit user.message → 走 L3 全流程 | ✅ IntentScanner → RuleMatcher → Dispatcher v2 → handler |
| 日志看到完整 L3 处理链路 | ✅ gateway.log.jsonl 记录每个 stage |
| FeatureFlag 关闭后走旧路径 | ✅ L3_MAINLINE_ENABLED=false 时 passthrough |
| L3 失败自动 fallback | ✅ 不 ack → 旧 Dispatcher 消费 |
| 双路径对比日志 | ✅ Shadow 模式 comparison.log.jsonl |
