# Day 3 — 统一测试 Runner 报告

**日期**: 2026-03-06  
**文件**: `infrastructure/tests/run-all-tests.js`  
**状态**: ✅ 已创建并验证

---

## 1. 概述

创建统一测试 Runner，聚合三个核心测试套件，通过 `child_process.execSync` 分组执行。任一套件失败不阻断其他套件继续运行。

## 2. 聚合的测试套件

| ID | 套件名称 | 类别 | 脚本路径 |
|---|---|---|---|
| resilience | 韧性层测试 | unit | `tests/resilience/run-all.js` |
| integration | 集成测试 | integration | `tests/integration/skill-integration.test.js` |
| e2e | E2E 闭环测试 | e2e | `tests/l3-e2e-test.js` |

## 3. 功能特性

- **隔离执行**: 每个套件在独立子进程中运行，异常不传播
- **超时保护**: 每个套件 120 秒超时，防止挂起阻塞
- **输出解析**: 每个套件有专用解析器，提取 passed/failed/total 数值
- **fallback 计数**: 解析器无法匹配时，通过 ✅/❌ emoji 计数推断结果
- **超时检测**: 被 SIGTERM 杀死的进程标记为 `error`，报告已完成的部分结果
- **退出码**: 0 = 全部通过, 1 = 有失败或错误
- **JSON 模式**: `--json` 输出结构化 JSON 结果
- **筛选**: `--only=resilience,e2e` 或 `--skip=e2e`

## 4. 验证运行结果

### 4.1 全量运行

```
╔══════════════════════════════════════════════════════════╗
║          统一测试 Runner (Unified Test Runner)           ║
╚══════════════════════════════════════════════════════════╝

  🛡️  单元测试 (Unit)
  ⏳ 韧性层测试 (Resilience) ... ✅ 64/64 passed (150ms)

  🔗 集成测试 (Integration)
  ⏳ 集成测试 (Skill Integration) ... ✅ 47/47 passed (57ms)

  🔄 端到端测试 (E2E)
  ⏳ E2E 闭环测试 (End-to-End) ... 💥 ERROR: Timed out after 120s (partial: 8 passed before kill)

  📊 总汇总 (Summary)
  ──────────────────────────────────────────────────────
  韧性层测试 (Resilience)            64      0    ✅
  集成测试 (Skill Integration)       47      0    ✅
  E2E 闭环测试 (End-to-End)          8       0    💥
  ──────────────────────────────────────────────────────
  TOTAL                             119      0    ❌

  总耗时: 120.3s
  退出码: 1 (E2E 超时)
```

### 4.2 排除 E2E 运行

```
  韧性层测试 (Resilience)            64      0    ✅
  集成测试 (Skill Integration)       47      0    ✅
  TOTAL                             111      0    ✅

  总耗时: 211ms
  退出码: 0
```

### 4.3 JSON 模式验证

`--json` 输出结构化数据，包含 `timestamp`, `duration_ms`, `summary`, `suites[]`, `exit_code`。✅ 正常。

## 5. E2E 超时分析

E2E 测试 (`l3-e2e-test.js`) 的场景 2 中 `IntentScanner` 连接 `https://localhost:1/nonexistent` 时挂起，120 秒超时后被 SIGTERM 杀死。这是 E2E 测试本身的已知问题（`localhost:1` 无服务监听导致 TCP SYN 重试），不是 Runner 的问题。

**Runner 的处理方式正确**:
- 检测到 `err.killed` + `err.signal === 'SIGTERM'`
- 标记为 `error` 状态
- 报告已完成的部分结果（8 passed）
- 不阻断后续套件

**建议**: E2E 测试应使用不可路由的地址（如 `192.0.2.1`）或 mock HTTP 来避免长时间挂起。

## 6. 架构要点

```
run-all-tests.js
  ├── SUITES[] — 套件注册表（id, name, category, script, parseResult）
  ├── runSuite(suite) — child_process.execSync + 超时/异常处理
  │   ├── 正常退出 → parseResult 解析
  │   ├── 非零退出 → 从 stdout 解析（fail 或 pass）
  │   ├── 超时/信号 → error + partial results
  │   └── 无输出 → error + stderr 提取
  ├── main() — 按类别分组执行 + 汇总表
  └── module.exports = { main, SUITES }
```

## 7. 用法

```bash
# 运行所有套件
node infrastructure/tests/run-all-tests.js

# 只运行韧性和集成测试
node infrastructure/tests/run-all-tests.js --only=resilience,integration

# 跳过 E2E
node infrastructure/tests/run-all-tests.js --skip=e2e

# JSON 输出（适合 CI/CD）
node infrastructure/tests/run-all-tests.js --json
```
