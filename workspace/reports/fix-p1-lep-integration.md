# P1修复报告 2/3: LEP韧性层集成到SEEF子技能

> 生成时间: 2026-03-01 13:41 (Asia/Shanghai)
> 状态: ✅ 完成

## 概述

将LEP (Local Execution Protocol) 韧性层集成到SEEF (Skill Evolution Engine Framework) 的全部5个子技能中，实现统一的 try-catch / 重试 / WAL日志 / 熔断保护 / 回滚机制。

## 变更清单

### 新增文件

| 文件 | 大小 | 说明 |
|:-----|:-----|:-----|
| `skills/seef/sub-skills/lep-resilience.cjs` | 15.5KB | LEP韧性层统一包装器 |

### 修改文件

| 文件 | 版本变更 | 新增导出 |
|:-----|:---------|:---------|
| `sub-skills/evaluator/index.cjs` | 1.0.0 → 1.1.0 | `evaluateWithLEP()` |
| `sub-skills/discoverer/index.cjs` | 1.0.0 → 1.1.0 | `discoverWithLEP()` |
| `sub-skills/optimizer/index.cjs` | 1.0.0 → 1.1.0 | `optimizeWithLEP()` |
| `sub-skills/validator/index.js` | 1.1.0 → 1.2.0 | `validateWithLEP()` |
| `sub-skills/recorder/index.cjs` | 1.1.0 → 1.2.0 | `recordWithLEP()` |

## 架构设计

### 韧性层结构

```
调用方
  │
  ▼
lepWrap(subSkillName, executeFn, input, options)
  │
  ├─ 1. 熔断检查 (CircuitBreaker)
  │     └─ open → 立即拒绝 (CIRCUIT_BREAKER_OPEN)
  │     └─ half-open → 允许一次试探
  │
  ├─ 2. WAL: 写入 start 日志
  │
  ├─ 3. 创建回滚快照 (仅 optimizer/recorder)
  │
  ├─ 4. 带重试的执行
  │     ├─ 超时保护 (Promise.race)
  │     ├─ 失败判定 (isRetryable)
  │     ├─ 指数退避 + 抖动
  │     └─ 最多 maxRetries+1 次尝试
  │
  ├─ 5a. 成功 → WAL success + 清理快照 + 返回 result + _lep 元数据
  │
  └─ 5b. 全部失败
        ├─ WAL final_failure
        ├─ 熔断计数 +1
        ├─ 触发回滚 (如有快照)
        └─ 返回降级响应 {success: false, _lep: {degraded: true}}
```

### 各子技能策略配置

| 子技能 | maxRetries | timeout | 回滚 | 原因 |
|:-------|:-----------|:--------|:-----|:-----|
| evaluator | 2 | 60s | ❌ | 只读操作 |
| discoverer | 2 | 90s | ❌ | 只读（扫描生态耗时较长） |
| optimizer | 2 | 120s | ✅ | **修改文件，需要回滚保护** |
| validator | 2 | 90s | ❌ | 只读（含ISC规则加载） |
| recorder | 3 | 120s | ✅ | 多处写入（历史/元数据/CRAS） |

### 回滚机制

- **快照范围**: `SKILL.md`, `package.json`, `index.js`, `index.cjs`
- **触发条件**: 全部重试耗尽后自动触发
- **存储位置**: `skills/seef/sub-skills/.lep-rollback/{executionId}/`
- **审计保留**: 成功执行的快照标记 `.completed` 保留用于审计

### WAL (Write-Ahead Log)

- **格式**: JSONL (每行一条JSON)
- **路径**: `skills/seef/sub-skills/.lep-wal/wal-{YYYY-MM-DD}.jsonl`
- **记录**: start / retry_failure / success / final_failure / rollback
- **用途**: 崩溃恢复、执行审计、问题排查

### 熔断器

- **阈值**: 5次连续失败
- **冷却时间**: 60秒
- **状态机**: closed → open → half-open → closed
- **作用域**: 进程级，按子技能名称隔离

### 指标采集

- **路径**: `skills/seef/sub-skills/.lep-metrics.json`
- **字段**: total / success / failure / circuit_breaker_reject / avgDuration / lastStatus

## API 变更

### 向后兼容

所有子技能保留原始函数导出：
```javascript
// 原始函数仍可用（内部/测试用）
const { evaluate } = require('./evaluator/index.cjs');

// LEP包装版（推荐外部调用）
const { evaluateWithLEP } = require('./evaluator/index.cjs');

// 默认导出指向LEP版本
const evaluator = require('./evaluator/index.cjs').default;
```

### 返回值增强

LEP包装后的返回值包含 `_lep` 元数据字段：
```javascript
{
  // ... 原始子技能返回值 ...
  _lep: {
    executionId: "evaluator-mm7boff3-dyanma",
    subSkill: "evaluator",
    attempt: 1,
    duration: 36,
    status: "success",     // "success" | "failed"
    retried: false,
    circuitState: "closed",
    // 失败时额外字段:
    degraded: true,
    rolledBack: true,
    rollbackSuccess: true
  }
}
```

### 工具函数

```javascript
const { getMetrics, getCircuitBreakerStates, resetCircuitBreaker, getTodayWAL }
  = require('./lep-resilience.cjs');
```

## 验证结果

### 测试1: 正常执行 ✅
- evaluator 通过LEP执行，1次成功，36ms
- discoverer 通过LEP执行，1次成功，14ms
- WAL正确记录 start + success

### 测试2: 重试恢复 ✅
- 模拟2次 ECONNRESET 失败后第3次成功
- 指数退避: ~93ms → ~196ms
- 结果包含 `retried: true, attempt: 3`

### 测试3: 全部失败降级 ✅
- 模拟永久失败，2次尝试后返回降级响应
- `success: false, _lep.degraded: true`
- WAL记录完整的 start → retry_failure → final_failure

### 测试4: WAL/指标/熔断器 ✅
- WAL条目正确写入 `.lep-wal/wal-2026-03-01.jsonl`
- 指标文件正确累计 total/success/failure/avgDuration
- 熔断器状态正确维护 closed/open/half-open 转换

## 技术说明

### ESM/CJS 兼容

工作区根 `package.json` 包含 `"type": "module"`，因此：
- 韧性层文件命名为 `.cjs` 确保以CJS模式加载
- 所有 require 路径显式包含 `.cjs` 扩展名
- 子技能内部 require 路径: `require('../lep-resilience.cjs')`

### 不侵入原始逻辑

- 原始 `evaluate()` / `discover()` 等函数**零修改**
- LEP层通过组合（而非继承）方式包装
- CLI入口切换到LEP版本，退出码也基于 `_lep.status`
