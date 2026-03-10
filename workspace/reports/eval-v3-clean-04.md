# 评测集V3标准清洗报告 - 批次4（03-global-rename.json）

- 时间：2026-03-08
- 文件：`/root/.openclaw/workspace/tests/benchmarks/intent/c2-golden/03-global-rename.json`
- 总条目：30

## 清洗结果统计

- 保留并重判为 C2：22
- 保留并降级为 C1：0
- 删除（`deleted=true`）：8

## 删除明细（不满足V3“C2必须来自真实纠偏，禁止编造”）

- GR-017（source=scenario_based）
- GR-018（source=scenario_based）
- GR-019（source=scenario_based）
- GR-020（source=scenario_based）
- GR-021（source=scenario_based）
- GR-022（source=scenario_based）
- GR-023（source=scenario_based）
- GR-024（source=scenario_based）

## 备注

- 按V3硬性约束，仅保留 `source=real_conversation` 条目，以及可视作真实纠偏延展的后续同批条目（GR-025~GR-030保留但补齐字段并标注多轮）。
- 对全部条目补齐：`multi_turn`、`expected_output`（若缺失则补全）、`deleted`（显式布尔值）。
- 难度统一收敛至 C1/C2；原C3条目已处理为删除或降级判定（本批无降级保留）。
