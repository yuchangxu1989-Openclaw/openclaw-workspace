# D2-03 事件驱动自愈PoC

## 背景

cron任务"本地任务编排-AEO-智能流水线-每小时"连续报错9次，根因是`delivery.target`字段应为`delivery.to`。系统仅发报告，无自动修复能力。

## 实现

### 脚本位置
`/root/.openclaw/workspace/infrastructure/self-healing/cron-healer.js`

### 核心逻辑
1. 读取 `/root/.openclaw/cron/jobs.json`
2. 筛选 `consecutiveErrors >= 3` 的任务
3. 对每个故障任务匹配已知错误模式库
4. 匹配成功 → 自动修复 + 重置错误计数 + 写日志
5. 无匹配 → escalate（记录日志，待人工介入）

### 已知错误模式（可扩展）

| ID | 描述 | 修复动作 |
|---|---|---|
| `delivery-target-to-to` | `delivery.target` 应为 `delivery.to` | 重命名字段 |
| `delivery-missing-to` | `delivery.mode=announce` 但缺少 `to` | 补充默认用户ID |

### 日志
JSONL格式，按日存储：`infrastructure/self-healing/logs/heal-YYYY-MM-DD.jsonl`

## 验收结果

### 测试场景
- 将DTO-AEO任务的`delivery.to`改为`delivery.target`，`consecutiveErrors`设为5
- PDCA任务已有真实bug：`delivery.mode=announce`但缺少`to`，`consecutiveErrors=3`

### 执行结果
```
[cron-healer] Found 2 job(s) with consecutiveErrors >= 3
✅ 本地任务编排-AEO: delivery.target→delivery.to, errors 5→0
✅ PDCA: 补充delivery.to, errors 3→0
Healed: 2, Escalated: 0
```

### 修复后验证
- 本地任务编排-AEO: `delivery.to` 正确，`consecutiveErrors=0` ✅
- PDCA: `delivery.to` 已补充，`consecutiveErrors=0` ✅
- 日志完整记录修复详情 ✅

## 额外发现

运行healer时顺带修复了一个**真实生产bug**：`能力同步与PDCA-每4小时`任务的`delivery`缺少`to`字段，已连续报错3次。自愈脚本首次运行即产生实际价值。

## 后续扩展方向
- 注册为cron任务（如每15分钟执行一次）
- 增加更多错误模式（timeout→调大timeoutSeconds、脚本不存在→禁用任务等）
- 与event-dispatcher集成，实现事件触发式自愈
