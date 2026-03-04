# P1-4：AEO 事件桥接 + 流水线状态追踪系统

**完成时间**: 2026-03-03  
**Git Commit**: `[P1] AEO event bridge + pipeline state tracker`

---

## 任务A：AEO 事件桥接

### 文件
- `workspace/skills/aeo/event-bridge.js`

### 功能
| 函数 | 说明 |
|------|------|
| `onAssessmentComplete(result)` | 单个评测完成后发布事件到事件总线 |
| `publishBatchResults(results)` | 批量发布评测结果 + 汇总事件 |

### 事件类型
| 事件 | 触发条件 | Source |
|------|---------|--------|
| `aeo.assessment.completed` | 评测通过 (passed=true) | `aeo` |
| `aeo.assessment.failed` | 评测未通过 (passed=false) | `aeo` |
| `aeo.assessment.batch` | 批量评测汇总 | `aeo` |

### 事件 Payload 示例
```json
{
  "skill_name": "weather",
  "track": "effect",
  "score": 85,
  "passed": true,
  "issues": [],
  "timestamp": 1772485800000
}
```

### 集成方式
```javascript
const bridge = require('./skills/aeo/event-bridge.js');

// 评测完成后调用
bridge.onAssessmentComplete({
  skill_name: 'my-skill',
  track: 'effect',
  score: 85,
  passed: true,
  issues: []
});
```

---

## 任务B：流水线状态追踪器

### 文件
- `workspace/infrastructure/state-tracker/tracker.js`
- 运行时数据：`state-tracker/runs/*.json` + `state-tracker/current.json`

### API

| 函数 | 说明 |
|------|------|
| `createRun(trigger, metadata)` | 创建新的流水线运行，返回 run 对象 |
| `updateStage(runId, stage, status, result)` | 更新某阶段状态 |
| `getRun(runId)` | 获取指定运行记录 |
| `getCurrentRun()` | 获取最新运行 |
| `listRuns(limit)` | 列出最近 N 条运行记录 |

### 流水线阶段
```
ISC → DTO → SEEF → AEO → CRAS
```

### 状态机
| 状态 | 说明 |
|------|------|
| `pending` | 等待执行 |
| `running` | 执行中 |
| `done` | 完成 |
| `failed` | 失败 |
| `skipped` | 跳过 |

### 运行状态自动推导
- 所有阶段完成且无失败 → `completed`
- 所有阶段完成但有失败 → `completed_with_errors`
- 否则保持 `running`

### 使用示例
```javascript
const tracker = require('./infrastructure/state-tracker/tracker.js');

// 创建运行
const run = tracker.createRun('webhook', { rule_id: 'N001' });

// 各阶段更新
tracker.updateStage(run.id, 'isc', 'running');
tracker.updateStage(run.id, 'isc', 'done', { rules_checked: 5 });
tracker.updateStage(run.id, 'dto', 'done', { synced: true });
// ...

// 查询状态
const current = tracker.getCurrentRun();
console.log(current.status, current.stages);
```

---

## 测试结果

- ✅ AEO 事件桥接：单条/批量发布均正常，事件写入 event-bus
- ✅ 状态追踪器：创建运行、阶段更新、状态自动推导、列表查询均通过
- ✅ Git 提交成功
