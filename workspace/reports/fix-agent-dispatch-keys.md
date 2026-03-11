# 子Agent调度Key分配排查报告

**时间**: 2026-03-11 09:16 GMT+8
**状态**: ✅ 配置正确，问题在调用层

## 排查结果

### 1. 配置检查：✅ 每个agent都有独立key

19个agent全部配置了独立的model，每个有3个provider做fallback：

| Agent | Primary Key | Fallback 1 | Fallback 2 |
|-------|------------|------------|------------|
| main | claude-main | boom-main | zhipu-main |
| researcher | claude-researcher | boom-researcher | zhipu-researcher |
| coder | claude-coder | boom-coder | zhipu-coder |
| reviewer | claude-reviewer | boom-reviewer | zhipu-reviewer |
| writer | claude-writer | boom-writer | zhipu-writer |
| analyst | claude-analyst | boom-analyst | zhipu-analyst |
| scout | claude-scout | boom-scout | zhipu-scout |
| cron-worker | zhipu-cron-worker | boom-cron-worker | claude-cron-worker |
| researcher-02 | claude-researcher-02 | boom-researcher-02 | zhipu-researcher-02 |
| coder-02 | claude-coder-02 | boom-coder-02 | zhipu-coder-02 |
| reviewer-02 | claude-reviewer-02 | boom-reviewer-02 | zhipu-reviewer-02 |
| writer-02 | claude-writer-02 | boom-writer-02 | zhipu-writer-02 |
| analyst-02 | claude-analyst-02 | boom-analyst-02 | zhipu-analyst-02 |
| scout-02 | claude-scout-02 | boom-scout-02 | zhipu-scout-02 |
| cron-worker-02 | claude-cron-worker-02 | boom-cron-worker-02 | zhipu-cron-worker-02 |
| worker-03 | claude-worker-03 | boom-main-02 | zhipu-worker-03 |
| worker-04 | claude-worker-04 | boom-main-03 | zhipu-worker-04 |
| worker-05 | claude-worker-05 | boom-main-04 | zhipu-worker-05 |
| worker-06 | claude-worker-06 | boom-main-05 | zhipu-worker-06 |

### 2. 根因：sessions_spawn未传agentId

`agents.defaults.model.primary = "claude-main/claude-opus-4-6-thinking"`

当`sessions_spawn`不指定`agentId`时，回落到defaults → 全部用`claude-main`的key。

**这不是配置问题，是调用问题。**

### 3. 修复方案：调度策略

主Agent在spawn子Agent时，**必须指定agentId参数**。按以下轮转策略分配：

#### 轮转池（按用途分组）

**通用任务池**（轮转使用）：
```
researcher, coder, reviewer, writer, analyst, scout
researcher-02, coder-02, reviewer-02, writer-02, analyst-02, scout-02
worker-03, worker-04, worker-05, worker-06
```

**定时任务专用**：
```
cron-worker, cron-worker-02
```

#### 调度规则

1. **每次spawn必须传agentId**：`sessions_spawn({ agentId: "researcher", task: "..." })`
2. **轮转分配**：按序从池中取下一个可用agent，避免集中在同一个
3. **并发上限**：每个agentId同时最多2个session（避免单key限速）
4. **按任务类型匹配**（优先，非强制）：
   - 调研类 → researcher/researcher-02
   - 代码类 → coder/coder-02
   - 审查类 → reviewer/reviewer-02
   - 写作类 → writer/writer-02
   - 分析类 → analyst/analyst-02
   - 探查类 → scout/scout-02
   - 批量任务 → worker-03~06
   - 定时任务 → cron-worker/cron-worker-02

#### 示例

```javascript
// ❌ 错误 - 不指定agentId，全部回落到claude-main
sessions_spawn({ task: "分析ISC规则" })

// ✅ 正确 - 指定agentId，使用独立key
sessions_spawn({ agentId: "analyst", task: "分析ISC规则" })
sessions_spawn({ agentId: "researcher", task: "调研ISC变更" })
sessions_spawn({ agentId: "worker-03", task: "批量展开batch-ag" })
```

### 4. 配置无需修改

openclaw.json配置完全正确，无需改动。问题100%在调用侧。
