# Timeout 分级配置方案

## 背景

直接修改 `openclaw.json` 的 timeout 会导致 crash。正确做法：通过 `sessions_spawn` 的 `runTimeoutSeconds` 参数传入。

## 分级方案

| 级别 | 秒数 | 适用场景 | 关键词匹配 |
|------|------|----------|-----------|
| **light** | 300 (5min) | QA、验证、review、scout、探针 | review/verify/check/qa/validate/scout/smoke/probe/health |
| **standard** | 600 (10min) | 开发、分析、coder、writer | 默认，无特殊关键词 |
| **heavy** | 1200 (20min) | 评测、批量、research、报告 | eval/bench/batch/regression/research/harvest/evolution/report |

## 使用方式

### 脚本调用
```bash
TIMEOUT=$(bash scripts/get-task-timeout.sh "任务label或类型")
# 返回纯数字秒数: 300 / 600 / 1200
```

### 在 sessions_spawn 中使用
```javascript
sessions_spawn({
  task: "...",
  label: "my-eval-task",
  runTimeoutSeconds: 1200  // 从 get-task-timeout.sh 获取
})
```

### 主Agent调用规范
spawn 前先获取 timeout：
```
TIMEOUT=$(bash /root/.openclaw/workspace/scripts/get-task-timeout.sh "<label>")
```
然后将数值传入 `runTimeoutSeconds` 参数。

## ⚠️ 铁律
- **绝对禁止**修改 `openclaw.json` 中的任何 timeout 配置
- timeout 只通过 spawn 参数 `runTimeoutSeconds` 传入
