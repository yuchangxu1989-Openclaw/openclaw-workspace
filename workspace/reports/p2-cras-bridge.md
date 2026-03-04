# P2-1 CRAS 事件桥接 — 真正的学习引擎

## 状态: ✅ 完成

## 背景

诊断发现 CRAS 学习引擎是半成品：
- `index.js` 中的 `crawlSource()` 返回模拟数据（`requiresExternalSearch: true` 占位）
- `modules/first-principle-learning.js` 的 `findSourcePapers()` 返回硬编码假论文
- `cras-b-fixed.js` 在读取失败时降级到模拟数据
- **没有从事件总线消费任何事件**

## 交付物

### 新增文件: `skills/cras/event-bridge.js`

CRAS 事件桥接模块，实现三大能力：

| 能力 | 实现方式 |
|------|----------|
| 消费 AEO 评测结果 | `bus.consume('cras', { types: ['aeo.assessment.*', ...] })` |
| 产出真正的洞察报告 | `analyzeEvent()` → 洞察文件 + 汇总报告 |
| 洞察写入事件总线 | `bus.emit('cras.insight.generated', ...)` |

### 消费的事件类型

- `aeo.assessment.*` — AEO 评测通过/失败
- `dto.sync.completed` — DTO 规则同步完成
- `system.error` — 系统错误

### 产出

- **洞察文件**: `skills/cras/insights/insight_*.json` — 每个事件一条洞察
- **汇总报告**: `skills/cras/reports/report_*.json` — 按批次汇总
- **事件总线**: 发布 `cras.insight.generated` 事件，包含洞察数量、报告 ID、摘要

## 测试结果

```
✅ 测试事件已发布 (3 events: assessment pass, assessment fail, system error)
[CRAS] 发现 5 个待处理事件 (含 2 个先前已存在的事件)
[CRAS] 报告已保存: report_1772486023756
[CRAS] 已发布洞察事件 (report: report_1772486023756)
[CRAS] 完成: {"processed":5,"insights":5}
```

报告内容验证：
- `insight_count: 5`
- `by_severity: { error: 1, warning: 1, info: 3 }`
- recommendations 包含具体改进建议
- 幂等性验证：重复运行输出 `无待处理事件`

事件总线验证：
- `cras.insight.generated` 事件成功写入总线
- 其他消费者可订阅该事件获取 CRAS 洞察

## Git Commit

```
[main df4ae0e] [P2] CRAS event bridge - real learning engine consuming AEO assessments
 7 files changed, 249 insertions(+)
```

## 架构说明

```
事件总线 (events.jsonl)
  │
  ├── aeo.assessment.* ──────┐
  ├── dto.sync.completed ────┤
  ├── system.error ──────────┤
  │                          ▼
  │              event-bridge.js
  │                 │       │
  │                 ▼       ▼
  │          insights/   reports/
  │                 │
  │                 ▼
  └── cras.insight.generated ───► 其他消费者
```
