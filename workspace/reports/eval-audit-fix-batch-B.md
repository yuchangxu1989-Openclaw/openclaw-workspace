# 评测集修复审计报告 - 批次B

执行时间: 2026-03-08

## 修复规则
1. expected_behavior存在且expected_output缺失 → 补expected_output=expected_behavior
2. 缺category → 自动补全（纠偏类/认知错误类/交付质量类/自主性缺失类）
3. 缺difficulty → 自动标注C1-C5
4. 缺source → 按文件来源标注real_conversation或mined_from_memory

## 文件级统计

### /root/.openclaw/workspace/tests/benchmarks/intent/c2-golden/05-rule-fullchain.json
- 总条数: 50
- 新增 expected_output: 0
- 新增 category: 0
- 新增 difficulty: 50
- 新增 source: 50

### /root/.openclaw/workspace/tests/benchmarks/intent/c2-golden/mined-from-memory.json
- 总条数: 35
- 新增 expected_output: 35
- 新增 category: 0
- 新增 difficulty: 0
- 新增 source: 0

### /root/.openclaw/workspace/tests/benchmarks/intent/c2-golden/session-20260308-evening.json
- 总条数: 45
- 新增 expected_output: 0
- 新增 category: 0
- 新增 difficulty: 0
- 新增 source: 0

## 备注
- 已将修复结果直接回写到原JSON文件。
- 分类与难度采用规则化启发式推断。
