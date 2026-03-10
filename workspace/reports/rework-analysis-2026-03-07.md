# 返工根因分析报告 - 2026-03-07

> 自动生成于: 2026-03-07T23:55:02.655Z
> 分析窗口: 过去 10 分钟
> 检测到返工事件: **33 个**

---

## 📊 返工事件统计

| 根因类别 | 得分 | 事件数 | ISC规则状态 |
|----------|------|--------|-------------|
| kill | 28.8 | 32 | ⚠️ 待规则化 |
| retry | 0.8 | 1 | ⚠️ 待规则化 |

## 🔍 根因详情

### kill (score: 28.8)

**触发信号样本**:
```
[Dispatcher] Handler intent-event-handler executed: {"status":"ok","handler":"intent-event-handler","action":"reflect","result":{"status":"ok","handler":"cras-analysis","insight":{"id":"insight_177281
```
```
[Dispatcher] Handler intent-event-handler executed: {"status":"ok","handler":"intent-event-handler","action":"reflect","result":{"status":"ok","handler":"cras-analysis","insight":{"id":"insight_177281
```

### retry (score: 0.8)

**触发信号样本**:
```
[IntentExtractor:LLM] 使用 zhipu-cron/glm-5
[IntentExtractor:LLM] zhipu-cron/glm-5 调用失败: HTTP timeout after 60000ms
[IntentExtractor:LLM] Failover → claude-scout/claude-opus-4-6
[IntentExtractor] 🎯 int
```

## 📚 Golden Testset 更新

无新case追加（类似case可能已存在）

## 📝 ISC 规则草案

无新草案生成（置信度不足或草案已存在）

---
*由 infrastructure/self-check/rework-analyzer.js 自动生成*
