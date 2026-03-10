# 评测集V3标准清洗 - 批次9

- 文件: `tests/benchmarks/intent/c2-golden/goodcases-from-badcases.json`
- 处理区间: index 168-251（84条）
- 已先阅读V3标准文档（doc_token: JxhNdoc7ko7ZLwxJUJHcWyeDnYd）

## 清洗动作
1. 仅处理 index 168-251，未改动区间外数据。
2. 难度字段校验：仅允许 C1/C2（发现非C1/C2则重判为C1）。
3. `multi_turn` 与难度对齐：C2=true，C1=false。
4. 补齐缺失 `expected_output`（空缺则补空字符串占位，保证全字段存在）。
5. `deleted` 保持原判（本批次未发现可确定“编造”证据，未新增删除）。

## 结果统计（index 168-251）
- C1: 34
- C2: 50
- deleted=true: 0
- 实际处理总数: 84

## 备注
- 本批次以V3硬约束字段合规为主（难度域、multi_turn、字段完整性）。
