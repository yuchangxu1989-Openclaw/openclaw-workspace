# eval-v3-clean-06

- 批次：06
- 文件：`/root/.openclaw/workspace/tests/benchmarks/intent/c2-golden/05-rule-fullchain.json`
- 时间：2026-03-08

## 清洗结果统计
- 原始条数：50
- 保留条数：1
- 删除条数：49
- C1：1
- C2：0

## 处理说明
1. 原文件50条虽标注`level:C2`，但实际均为“单轮+意图明确+固定规则下发”，不满足V3对C2（多轮、隐含意图、跨模块、根因分析、≥4步复杂链）的硬约束。
2. 按规则“C3/C4/C5→重判C1或C2；不符C2→降级或删”，考虑到本文件位于`c2-golden`目录，为避免污染C2金标集，执行“高置信保留1条模板+其余删除”。
3. 对保留条目补齐了V3要求字段：`multi_turn`、`expected_output`、`deleted`，并统一`level/difficulty`为C1。
4. 未发现可核证“编造”证据链，因此删除以结构合规性为主（非事实造假判定）。

## 风险与建议
- 建议将本文件整体迁移至`c1`目录或重建为真实C2纠偏链路case（含多轮上下文与根因分析）。
- 后续批次建议增加准入脚本：若`difficulty=C2`则强制校验`multi_turn=true`且执行链含根因分析步骤。
