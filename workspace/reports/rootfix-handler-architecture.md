# 根治报告：L3-L5 自动分诊+输出重定向

## 修改清单

### L3/L4: task-timeout-check.sh — 超时自动分诊+清理
- **分诊逻辑**: 超时任务先检查 `reports/`、`scripts/`、`skills/`、`logs/` 下是否有以label命名的产出文件
  - 产出已存在 → 标记 `done`（不进retry队列）
  - 产出不存在 → 标记 `timeout` 并进retry队列
- **自动清理**: retry队列中 `status=pending` 超2小时 → 自动标记 `abandoned`

### L5: 脚本输出重定向

| 脚本 | 日志文件 | stdout行数上限 |
|------|----------|----------------|
| completion-handler.sh | logs/completion-handler-latest.log | ≤10行 |
| register-task.sh | logs/register-task-latest.log | ≤5行 |
| show-task-board-feishu.sh | 无（本身就是展示） | running数+3行 |

## 验证结果

```
register-task.sh 实际输出: 2行 ≤ 5 ✅
completion-handler.sh 实际输出: 3行 ≤ 10 ✅
show-task-board-feishu.sh 实际输出: 8行 (5 running + 3) ✅
```

## 修改时间
2026-03-08T21:44 CST
