# Day 2 依赖方向检查报告

> **生成时间**: 2026-03-05 02:34 CST  
> **检查工具**: `scripts/dependency-check.js --all`  
> **检查范围**: `infrastructure/` 全量 + `skills/` 全量

---

## 执行摘要

| 指标 | 数值 |
|------|------|
| 扫描文件数 | ~150 (.js/.cjs) |
| 错误 (阻断级) | **6** |
| 警告 (观察级) | **20** |
| L3模块数 | 15 |
| L2模块数 | 5 (event-bridge) |
| 检测到的循环 | 0条硬循环, 4条lazy循环 |

---

## 错误清单 (Exit 1)

### DEP-005: .secrets 硬编码 (5处)

| 文件 | 行号 |
|------|------|
| `infrastructure/intent-engine/intent-scanner.js` | 33 |
| `infrastructure/tests/benchmarks/run-intent-benchmark-llm.js` | 34 |
| `infrastructure/vector-service/src/zhipu-vectorizer.cjs` | 31 |
| `skills/zhipu-image-gen/index.js` | 5 |
| `skills/zhipu-vision/index.js` | 5 |

**修复**: 改用 `process.env.ZHIPU_API_KEY` 或 `require('skills/_shared/paths').SECRETS_DIR`

### DEP-001-R: L3→L1/L2 反向依赖 (1处)

| 文件 | 行号 | 目标 |
|------|------|------|
| `infrastructure/observability/dashboard.js` | 56 | `skills/aeo/assessment-store.js` |

**修复**: dashboard通过EventBus事件消费AEO数据，而非直接require

---

## 警告清单 (非阻断)

### DEP-002: L2→L3 直接依赖 (6处)

所有skills/下的event-bridge文件直接require了infrastructure/event-bus：

| 文件 | 目标 |
|------|------|
| `skills/isc-core/event-bridge.js` | event-bus/bus.js |
| `skills/seef/event-bridge.js` | event-bus/bus.js |
| `skills/cras/event-bridge.js` | event-bus/bus-adapter |
| `skills/cras/rule-suggester.js` | event-bus/bus-adapter |
| `skills/dto-core/event-bridge.js` | event-bus/bus.js |
| `skills/aeo/event-bridge.js` | event-bus/bus.js |

**修复方案**: 创建 `infrastructure/event-bus/sdk.js` 薄客户端后，将DEP-002升级为error。

### DEP-004: 未声明外部依赖 (14处)

| 包名 | 使用位置 |
|------|---------|
| `glob` | lep-core (4处) |
| `node-fetch` | lep-core, lep-executor |
| `dotenv` | evolver, feishu-evolver-wrapper (4处) |
| `node-cron` | dto-core |
| `benchmark` | aeo |
| `openclaw` | parallel-subagent |
| `chokidar` | seef |

---

## L3模块依赖深度排序

| 深度 | 模块 | 硬依赖 |
|------|------|--------|
| 0 | decision-log, config, state-tracker, feedback, vector-service, capability-anchor | _(无)_ |
| 1 | event-bus/bus.js, observability/metrics | _(无)_ |
| 2 | bus-adapter, rule-engine, observability/alerts, observability/health | decision-log, metrics |
| 3 | dispatcher, intent-engine, resilience | bus, decision-log, metrics |
| 4 | pipeline, l3-dashboard | 全依赖 |
| 5 | mr, lep-core | lep-core + 幻影依赖 |

---

## L3循环依赖分析

**硬循环**: 0条 ✅

**Lazy循环 (try-catch/函数内)**: 4条 ⚠️
1. `event-bus/bus-adapter` ↔ `observability/metrics`
2. `event-bus/bus-adapter` → `rule-engine` → `observability/metrics` → (不反向)
3. `observability/health` ↔ `event-bus/bus-adapter`
4. `observability/health` → `rule-engine` → `observability/metrics`

**结论**: 运行时无死锁风险（均为lazy加载），但建议通过依赖注入消除。

---

## 新建/修改文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `designs/l3-architecture/dependency-direction.md` | 新建 | 依赖方向图 + 禁止线 + 违规清单 |
| `scripts/dependency-check.js` | 新建 | CI门禁脚本，5条规则 |
| `scripts/isc-pre-commit-check.js` | 修改 | 集成dependency-check到Rule 5 |
| `reports/day2-dependency-check.md` | 新建 | 本报告 |

---

## 下一步行动

| 优先级 | 行动 | 预估 |
|--------|------|------|
| P0 | 修复5处.secrets硬编码 | 30min |
| P1 | 修复dashboard.js反向依赖 | 1h |
| P1 | 清理lep-core幻影依赖 | 1h |
| P2 | 创建EventBus SDK → 升级DEP-002为error | 2h |
| P2 | 在package.json补齐glob/node-fetch/dotenv声明 | 30min |
| P3 | 消除4条lazy循环 (依赖注入重构) | 4h |
