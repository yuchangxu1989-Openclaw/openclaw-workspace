# Pipeline E2E Benchmark 独立运行报告

**Date:** 2026-03-05  
**Task:** 让 Pipeline E2E Benchmark 可独立运行，QA 可从零复现 38/38

## TL;DR

✅ **38/38 (100%)** — Pipeline E2E benchmark 已可独立运行，无需外部环境变量或额外安装。

## 问题诊断

### 1. l3-pipeline-cron.js 无法运行（已修复）

**根因**：`scripts/l3-pipeline-cron.js` 探测导出方法时，只检查了 `pipeline.run`、`pipeline.execute`、`pipeline.default?.run`、`pipeline.default`，但 `infrastructure/pipeline/l3-pipeline.js` 导出的是 `{ L3Pipeline, runOnce, _internals }`。四个探测路径全部 miss。

**修复**：增加了对 `pipeline.runOnce` 和 `pipeline.L3Pipeline` 的探测。当检测到 `L3Pipeline` 类时自动实例化并调用 `run()`。

### 2. 实际 benchmark 入口不是 cron 脚本

QA 混淆了两个脚本：
- `scripts/l3-pipeline-cron.js` → cron 定时执行器（执行一次 pipeline 闭环，非 benchmark）
- `infrastructure/tests/benchmarks/run-pipeline-benchmark.js` → **真正的 E2E benchmark（38 cases）**

## QA 复现指南

### 一步运行

```bash
cd /root/.openclaw/workspace
node infrastructure/tests/benchmarks/run-pipeline-benchmark.js
```

从任意目录也可以直接绝对路径运行：

```bash
node /root/.openclaw/workspace/infrastructure/tests/benchmarks/run-pipeline-benchmark.js
```

### 依赖检查

- **外部 npm 包**：无。全部 CommonJS 纯 Node.js 实现
- **环境变量**：无需设置。benchmark 自行管理 feature flags
- **数据文件**：`pipeline-benchmark-dataset.json` 与脚本同目录，自动定位

### 期望输出

```
═══ L3 Pipeline E2E Benchmark ═══

38 cases loaded

  ✅ PB-001 ~ PB-038 (全部通过)

════════════════════════════════════════════════════════════
  端到端正确率:       38/38 (100.0%)
  规则匹配准确率:     38/38 (100.0%)
  熔断有效率:         6/6 (100.0%)
  降级正确率:         4/4 (100.0%)
  平均延迟:           ~650ms (依机器性能浮动)
════════════════════════════════════════════════════════════
```

## 实际运行结果

### 测试1：workspace 目录内运行

```
cd /root/.openclaw/workspace && node infrastructure/tests/benchmarks/run-pipeline-benchmark.js
→ 38/38 (100.0%), 平均延迟 649.0ms
```

### 测试2：任意目录运行（/tmp）

```
cd /tmp && node /root/.openclaw/workspace/infrastructure/tests/benchmarks/run-pipeline-benchmark.js
→ 38/38 (100.0%), 平均延迟 895.4ms
```

### 测试3：cron 脚本修复后

```
cd /root/.openclaw/workspace && node scripts/l3-pipeline-cron.js
→ {"status":"OK","elapsed_ms":25,...}  (exit code 0)
```

## 测试用例覆盖

| 类别 | Cases | 说明 |
|------|-------|------|
| Easy | 18 | 单事件规则匹配、噪声过滤、空事件 |
| Medium | 13 | 熔断边界、批量事件、意图识别、feature flags |
| Hard | 7 | 混合熔断+处理、全熔断批次、高深度对话断路 |

### 子维度

| 维度 | 通过率 |
|------|--------|
| 端到端正确率 | 38/38 (100%) |
| 规则匹配准确率 | 38/38 (100%) |
| 熔断有效率 | 6/6 (100%) |
| 降级正确率 | 4/4 (100%) |

## 代码变更

### `scripts/l3-pipeline-cron.js`

- 增加对 `pipeline.runOnce` 导出的探测
- 增加对 `pipeline.L3Pipeline` 类的自动实例化
- 错误信息更新为包含所有探测路径

## 文件关系

```
scripts/l3-pipeline-cron.js          ← cron 入口，调用 pipeline 执行一次闭环
infrastructure/pipeline/l3-pipeline.js       ← Pipeline 核心类
infrastructure/tests/benchmarks/
  ├── run-pipeline-benchmark.js      ← ★ E2E Benchmark 入口（38 cases）
  └── pipeline-benchmark-dataset.json ← 测试数据集
infrastructure/event-bus/            ← EventBus 模块
infrastructure/rule-engine/          ← ISC 规则匹配器
infrastructure/intent-engine/        ← 意图识别器
infrastructure/dispatcher/           ← 分发执行器
infrastructure/decision-log/         ← 决策日志
```
