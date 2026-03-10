# Benchmark timeout 收口 / Case 分片A（PB-001~PB-013）

- 日期：2026-03-07
- 范围：PB-001 ~ PB-013
- 执行仓库：`/root/.openclaw/workspace`

## 本轮结论

分片 A 已完成复跑与核验，**PB-001~PB-013 全部通过**。

本分片未额外新改代码；核验到当前仓内已具备并生效的前置修复包括：
- `tests/benchmarks/pipeline/run-pipeline-benchmark.js`
  - benchmark runner 已切到真实 `infrastructure/*` 路径
- `infrastructure/event-bus/bus-adapter.js`
  - 保留外部传入 `chain_depth`
  - ingress breaker 结果会附着到事件 metadata，供下游一致观测
- `infrastructure/event-bus/circuit-breaker.js`
  - 深度边界已为 `>`（非 `>=`）
- `skills/isc-core/rules/rule.pipeline-benchmark-*.json`
  - 已存在 8 个 benchmark 对齐规则，用于补齐事件命名漂移

## 复跑观察

执行命令：

```bash
cd /root/.openclaw/workspace
node tests/benchmarks/pipeline/run-pipeline-benchmark.js
```

运行日志在本次观察中顺序通过到：
- PB-001 ✅
- PB-002 ✅
- PB-003 ✅
- PB-004 ✅
- PB-005 ✅
- PB-006 ✅
- PB-007 ✅
- PB-008 ✅
- PB-009 ✅
- PB-010 ✅
- PB-011 ✅
- PB-012 ✅
- PB-013 ✅

补充说明：
- 本地长跑进程在继续跑到后续 case 时被外层会话终止；但在终止前，分片 A 所有 case 已明确输出为通过。
- 终止点已进入分片 B 区间，不影响本分片结论。

## 分 case 结果

| Case | 结果 | 备注 |
|---|---|---|
| PB-001 | PASS | `skill.created` 命中对齐后规则集 |
| PB-002 | PASS | 条件不满足，符合 0 match 预期 |
| PB-003 | PASS | 条件评估 false，符合预期 |
| PB-004 | PASS | `design.document.created` 达到预期匹配数 |
| PB-005 | PASS | `isc.rule.created` 触发多条 ISC 规则 |
| PB-006 | PASS | `evomap.sync.request` 已对齐可命中规则 |
| PB-007 | PASS | 条件失败，符合预期 |
| PB-008 | PASS | `skill.publish` 可命中安全门规则 |
| PB-009 | PASS | `analysis.requested` 可命中对齐规则 |
| PB-010 | PASS | defect acknowledged 事件别名已对齐 |
| PB-011 | PASS | unknown event 安全跳过 |
| PB-012 | PASS | noise event 零命中符合预期 |
| PB-013 | PASS | 深层未知事件无误报 |

## 风险 / 遗留

- 分片 A 已无阻塞。
- benchmark 全量仍有后续分片遗留问题（非本分片）：已知主尾差在更后面的 circuit break 语义 case。

## 一句话进度

**Case 分片 A（PB-001~PB-013）已收口：13/13 PASS。**
