# 评测集V3标准清洗报告 - 批次2

- 时间: 2026-03-08
- 文件: `/root/.openclaw/workspace/tests/benchmarks/intent/c2-golden/01-academic-insight.json`
- 标准依据: 飞书文档 `JxhNdoc7ko7ZLwxJUJHcWyeDnYd`（重点核对：第二章第三节C1/C2定义、第三章第三节组成约束）

## 清洗结果

- 原始条数: 30
- 清洗后保留: 22
- 删除: 8
- 难度重判:
  - C2: 16
  - C1: 6
- `multi_turn=true`: 16
- `multi_turn=false`: 6
- 真实对话占比（source=real_conversation）: 16/22 = 72.7%

## 处理说明

1. 已将所有难度统一到V3允许集合（仅C1/C2），去除原C3。
2. 对不满足C2定义（单轮、意图明确、执行链短、无跨模块/根因/架构决策）的样本降级为C1。
3. 删除8条不满足“C2需真实纠偏场景”且复杂度不足、偏泛化scenario的样本。
4. 全量补齐并规范字段：
   - `id`
   - `input`
   - `expected_output`
   - `category`
   - `difficulty` (C1/C2)
   - `source`
   - `multi_turn`

## 删除ID

- AI-017
- AI-018
- AI-019
- AI-020
- AI-022
- AI-023
- AI-026
- AI-030

## 备注

- 本文件单独清洗后真实对话占比未达80%（72.7%），该约束属于评测集组成约束，建议在后续批次通过补充真实对话样本/替换scenario样本进行整体拉齐。
