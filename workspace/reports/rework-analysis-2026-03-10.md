# 返工根因分析报告 - 2026-03-10

> 自动生成于: 2026-03-10T22:45:01.312Z
> 分析窗口: 过去 10 分钟
> 检测到返工事件: **21 个**

---

## 📊 返工事件统计

| 根因类别 | 得分 | 事件数 | ISC规则状态 |
|----------|------|--------|-------------|
| kill | 18 | 20 | ⚠️ 待规则化 |
| retry | 0.8 | 1 | ⚠️ 待规则化 |

## 🔍 根因详情

### kill (score: 18)

**触发信号样本**:
```
[Dispatcher] Handler log-action executed: {"success":true,"result":"Logged to /root/.openclaw/workspace/infrastructure/logs/handler-actions.jsonl"}
[Dispatcher] {"status":"executed","eventType":"git.c
```
```
[Dispatcher] Handler log-action executed: {"success":true,"result":"Logged to /root/.openclaw/workspace/infrastructure/logs/handler-actions.jsonl"}
[Dispatcher] {"status":"executed","eventType":"inten
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
