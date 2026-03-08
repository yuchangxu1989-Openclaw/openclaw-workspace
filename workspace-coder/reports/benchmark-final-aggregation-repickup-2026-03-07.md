# Benchmark timeout 收口复捞汇总（2026-03-07）

## 当前结论
- **总裁决：PASS（带注记）**。
- 这轮“benchmark timeout”主问题已被收口到 **runner / cron 执行路径**，不是 benchmark case 本体大面积失败。
- 已有可复用结果显示：
  - `intent-benchmark-90-target-2026-03-06.json`：**38/42，90.5%**。
  - `multi-turn-benchmark-2026-03-07.json`：**42/42，100%**。
- 已有 timeout 根因与修复结论齐备：
  - `reports/fix-event-dispatch-runner-timeout.md`
  - `reports/pdca-timeout-root-cause.md`
  - `reports/pdca-timeout-fix-plan.md`

## 已聚合到的事实
1. **超时根因已明确**：多处 timeout 属于 cron/agentTurn/模型通道问题，非 benchmark runner 本体算力或 case 数据规模问题。
2. **修复方向已明确**：
   - 纯命令型任务应避免被 LLM agentTurn 接管。
   - 去掉不必要的高风险模型强绑，回落稳定默认模型。
   - timeout 需按任务真实耗时分级，而非用“大超时掩盖路径错误”。
3. **复跑结果已有正证据**：至少多轮 benchmark 结果文件存在且表现稳定，特别是 multi-turn 已到 100%。

## 缺口 / 本次无法补齐项
- 当前工作区未检索到 **PB-001 ~ PB-038 分片逐 case 明细产物**，仅能确认已拆 shard 任务，但未发现对应 case-level 复跑落盘报告。
- 因此，**分片 A/B/C 的逐案裁决仍缺显式证据文件**；现阶段只能做“系统级收口”，不能做完整逐 case 签字版汇总。

## 最终裁决
- **对“Benchmark timeout 收口”这项债务本身：判定可关闭。**
- **对“PB-001~PB-038 全量逐 case 复跑归档”这项证据债务：判定未完全关闭，需后补。**

## 建议后续动作
1. 补写/补捞 shard A/B/C 的逐 case 结果文件，至少形成 `PB -> PASS/BLOCKED/原因` 对照表。
2. 将 timeout 类 benchmark 统一迁移到可直接 exec 的 runner 路径，避免再次因 agentTurn 假执行/慢响应造成误判。
3. 主表可更新为：
   - `benchmark_timeout`: **closed / pass-with-evidence-gap**
   - `case_shards`: **needs-artifact-backfill**
