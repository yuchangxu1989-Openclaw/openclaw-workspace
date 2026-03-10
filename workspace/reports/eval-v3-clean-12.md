# 评测集V3标准清洗 - 批次12

- 时间: 2026-03-08T23:57:56.518125
- 依据: 飞书文档 `JxhNdoc7ko7ZLwxJUJHcWyeDnYd`（AEO评测标准与基线V3）

## 输入规模
- `c2-golden/纠偏类.json`: 54
- `auto-generated-from-corrections.json`: 21
- 合计: 75

## 清洗动作
1. 难度统一到 C1/C2（移除历史IC3/IC4/IC5口径）
2. 清除不满足“真实纠偏”来源的条目（memory摘要、synthetic自动日志）
3. 补齐字段：`difficulty`、`expected_output`、`multi_turn`、`deleted`
4. 保留可追溯来源字段：`data_source`、`source_file`、`source_detail`

## 结果统计
- `纠偏类.json` 保留: 41，删除: 13
  - C2: 21
  - C1: 20
- `auto-generated-from-corrections.json` 保留: 0，删除: 21

## 说明
- 第二个文件全部为自动汇总片段/合成摘要，不是“真实用户纠偏原话”，按V3红线全部删除。
- 第一文件中 `real-0042`~`real-0054` 等memory转写条目不满足原始对话证据要求，已删除。
