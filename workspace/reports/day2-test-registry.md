# Day 2: 统一测试用例入库与分类管理 — 完成报告

**日期**: 2026-03-05  
**状态**: ✅ 已完成

---

## TL;DR

建立了统一测试中心 `tests/`，索引 30 条测试用例，覆盖 8/15 基础设施模块（53%），统一运行器首次全量执行结果：**389/476 assertions passed (81.7%)**。7 个模块无任何测试覆盖，3 个场景领域未覆盖。

---

## 1. 目录结构（已创建）

```
tests/
├── registry.json          ← 统一索引（30条）
├── runner.js              ← 统一运行器 v1.0
├── unit/                  ← 10 个单测文件
│   ├── event-bus.test.js
│   ├── feature-flags.test.js
│   ├── intent-scanner.test.js
│   ├── dispatcher.test.js
│   ├── intent-dispatch.test.js
│   ├── isc-rule-matcher.test.js
│   ├── decision-logger.test.js
│   ├── mr-shadow-tester.test.js
│   ├── mr-mvp.test.mjs (ESM)
│   └── mr-safety.test.mjs (ESM)
├── integration/           ← 2 个集成测试数据
│   ├── mr-shadow-test-report.json
│   └── mr-shadow-test-config.json
├── e2e/                   ← 1 个端到端测试
│   └── l3-verify-e2e.js
├── benchmarks/
│   ├── intent/            ← 80-sample 意图识别 benchmark
│   │   ├── intent-benchmark-dataset.json
│   │   ├── run-intent-benchmark.js
│   │   └── run-intent-benchmark-llm.js
│   ├── pipeline/          ← 38-case pipeline benchmark
│   │   ├── pipeline-benchmark-dataset.json
│   │   └── run-pipeline-benchmark.js
│   └── scenarios/         ← 10 个场景 benchmark
│       ├── runner.js
│       └── scenario-*.json (10 files)
├── regression/            ← 回归测试基础设施
│   └── auto-archive.js
└── results/
    └── latest.json        ← 最新运行结果
```

## 2. 迁移清单

| 原始位置 | 目标位置 | 类型 |
|---------|---------|------|
| infrastructure/event-bus/test-bus.js | tests/unit/event-bus.test.js | 单测 |
| infrastructure/config/feature-flags.test.js | tests/unit/feature-flags.test.js | 单测 |
| infrastructure/intent-engine/intent-scanner.test.js | tests/unit/intent-scanner.test.js | 单测 |
| infrastructure/dispatcher/dispatcher.test.js | tests/unit/dispatcher.test.js | 单测 |
| infrastructure/dispatcher/test-intent-dispatch.js | tests/unit/intent-dispatch.test.js | 单测 |
| infrastructure/rule-engine/isc-rule-matcher.test.js | tests/unit/isc-rule-matcher.test.js | 单测 |
| infrastructure/decision-log/test-decision-logger.js | tests/unit/decision-logger.test.js | 单测 |
| infrastructure/mr/test-shadow-tester.js | tests/unit/mr-shadow-tester.test.js | 单测 |
| infrastructure/mr/test-mvp.js | tests/unit/mr-mvp.test.mjs | 单测(ESM) |
| infrastructure/mr/test-safety.js | tests/unit/mr-safety.test.mjs | 单测(ESM) |
| infrastructure/mr/shadow-test-report.json | tests/integration/ | 集成数据 |
| infrastructure/mr/config/shadow-test.json | tests/integration/ | 集成配置 |
| scripts/l3-verify-e2e.js | tests/e2e/ | E2E |
| infrastructure/tests/benchmarks/*.json | tests/benchmarks/intent/ & pipeline/ | 数据集 |
| infrastructure/tests/benchmarks/run-*.js | tests/benchmarks/intent/ & pipeline/ | 运行器 |
| scripts/scenario-benchmark/scenarios/*.json | tests/benchmarks/scenarios/ | 场景定义 |
| scripts/scenario-benchmark/runner.js | tests/benchmarks/scenarios/ | 场景运行器 |

**策略**: 全部复制（非移动），原始文件保持不动，避免 break 现有脚本。

## 3. Registry.json 统计

- **总条目**: 30
- **按类别**: unit(10), integration(2), e2e(1), benchmark/intent(3), benchmark/pipeline(2), benchmark/scenarios(11), regression(1)
- **按模块**: intent-engine(4), mr(5), dispatcher(2), pipeline(2), event-bus(1), config(1), rule-engine(1), decision-log(1), scenario-benchmark(11), e2e-integration(1), regression-infra(1)
- **按难度**: easy(多数), medium(中等), hard(少量), mixed(数据集)

## 4. Runner.js 功能

| 命令 | 说明 |
|------|------|
| `node tests/runner.js` | 跑全套（15个可执行文件） |
| `node tests/runner.js --category unit` | 只跑单测 |
| `node tests/runner.js --category benchmark/intent` | 只跑意图benchmark |
| `node tests/runner.js --module dispatcher` | 只跑dispatcher相关 |
| `node tests/runner.js --tag IC1` | 只跑含IC1标签的 |
| `node tests/runner.js --dry-run` | 预览不执行 |
| `node tests/runner.js --coverage` | 显示覆盖率分析 |
| `node tests/runner.js --verbose` | 详细输出 |

**输出**:
- 实时进度（✅/❌/💥/⏭️）
- 按类别/模块汇总
- 覆盖率 Gap 分析
- 结果写入 `tests/results/latest.json`
- 自动更新 `registry.json` 的 `last_run` 和 `last_result`

## 5. 首次全量运行结果

```
Files:      15 executed
✅ Passed:  8 files
❌ Failed:  4 files
💥 Error:   0 files
⏭️  Skipped: 2 files (ESM)
Assertions: 389/476 passed (81.7%)
Duration:   ~94s
```

### 详细结果

| 测试 | 状态 | 通过/总数 | 耗时 |
|------|------|----------|------|
| event-bus 单测 | ✅ | 25/25 | 127ms |
| feature-flags 单测 | ✅ | 23/23 | 49ms |
| intent-scanner 单测 | ❌ | 46/47 | 78ms |
| dispatcher 单测 | ✅ | 61/61 | 234ms |
| intent-dispatch 单测 | ✅ | 24/24 | 31ms |
| isc-rule-matcher 单测 | ✅ | 100/100 | 51ms |
| decision-logger 单测 | ✅ | 10/10 | 33ms |
| mr-shadow-tester 单测 | ✅ | 11/11 | 30s |
| L3 E2E 验证 | ❌ | 24/46 | 6.7s |
| Intent Benchmark (regex) | ⏭️ | 0/0 | 28ms |
| Intent Benchmark (LLM) | ❌ | 19/81 | 26s |
| Pipeline Benchmark | ❌ | 36/38 | 511ms |
| Scenario Benchmark | ✅ | 10/10 | 30s |

## 6. 覆盖率 Gap 分析

### 模块覆盖率: 8/15 (53%)

**已覆盖 ✅**: config, decision-log, dispatcher, event-bus, intent-engine, mr, pipeline, rule-engine

**未覆盖 ❌**:
- **capability-anchor** — 能力锚点模块，无任何测试
- **feedback** — 反馈模块，无任何测试
- **lep-core** — 韧性执行核心，无任何测试
- **observability** — 可观测性模块，无任何测试
- **resilience** — 韧性模块，无任何测试
- **state-tracker** — 状态跟踪模块，无任何测试
- **vector-service** — 向量服务，无任何测试

### 测试类型 Gap

每个模块理想状态应有 unit + integration + e2e 三层覆盖。当前状态：

| 模块 | unit | integration | e2e | benchmark |
|------|------|-------------|-----|-----------|
| event-bus | ✅ | ❌ | ❌ | — |
| config | ✅ | ❌ | ❌ | — |
| intent-engine | ✅ | ❌ | ❌ | ✅ |
| dispatcher | ✅ | ❌ | ❌ | — |
| rule-engine | ✅ | ❌ | ❌ | — |
| decision-log | ✅ | ❌ | ❌ | — |
| mr | ✅ | ✅ | ❌ | — |
| pipeline | — | — | ✅(via L3) | ✅ |

### 场景领域覆盖

- ✅ 已覆盖: analysis, content, CRAS, dev
- ❌ 缺失: system-admin, communication, data-processing

### 优先补齐建议

1. **lep-core 单测** — 韧性执行是核心路径，必须有测试
2. **state-tracker 单测** — 状态管理影响所有模块
3. **feedback 单测** — 反馈回路是闭环关键
4. **integration 测试** — 当前仅 mr 有集成测试，需补齐 event-bus → rule-engine → dispatcher 链路
5. **pipeline 单测** — pipeline 模块本身缺少直接单测
6. **场景补齐** — system-admin、communication、data-processing 领域

---

## Git 提交文件清单

```
tests/registry.json
tests/runner.js
tests/unit/ (10 files)
tests/integration/ (2 files)
tests/e2e/ (1 file)
tests/benchmarks/intent/ (3 files)
tests/benchmarks/pipeline/ (2 files)
tests/benchmarks/scenarios/ (11 files)
tests/results/latest.json
reports/day2-test-registry.md
```
