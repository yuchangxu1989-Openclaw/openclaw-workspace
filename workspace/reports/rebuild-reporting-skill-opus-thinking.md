# 汇报技能重做报告

**日期**: 2026-03-06
**版本**: v3.0.0 (从 v2.0.0 完全重写)

## 做了什么

将 `multi-agent-reporting` 从 v2 的臃肿调度看板重写为纯汇报渲染器。

### 核心变更

| 项目 | v2 (旧) | v3 (新) |
|------|---------|---------|
| 定位 | 调度看板+汇报混合 | 纯汇报渲染 |
| 主表内容 | 所有任务 | 仅进行中 |
| 0活跃时 | 空表或占位符 | 新完成表+风险+决策 |
| 标题 | 固定文本 | 动态并发状态 |
| Agent名 | agentId | displayName全称 |
| 表头 | Agent/Model/Task/Status/Duration/Commit | #/Agent/任务/模型/状态/用时 |
| "下一步"列 | 有 | 删除 |
| 模型名 | 完整名 | 自动缩写 |
| Next Actions区 | 有 | 删除 |
| Model Breakdown | 有 | 删除 |
| 输出格式 | 5种 | 2种(文本+飞书卡片) |
| 代码量 | ~450行 | ~270行 |

### 吸收的全部用户纠偏

1. ✅ 与调度技能拆开 — 无任何调度/分配逻辑
2. ✅ 反映调度更新 — 完成/风险/决策都作为更新展示
3. ✅ 主表只放进行中 — `classify()` 分组后仅 `active` 进主表
4. ✅ 0活跃不给空表 — 新完成以表格展示，补风险和决策
5. ✅ 标题精准描述并发状态 — `generateTitle()` 动态生成
6. ✅ Agent名用全称 — 优先 `displayName` → `agentName` → `agentId`
7. ✅ 表头顺序 — `# / Agent / 任务 / 模型 / 状态 / 用时`
8. ✅ 无"下一步"列 — 完全删除
9. ✅ 列宽压窄 — `shortModel()` 自动缩写模型名
10. ✅ 少废话 — 无冗余文字，仅数据
11. ✅ 双输出 — `renderText()` + `renderCard()`

## 文件清单

```
skills/public/multi-agent-reporting/
├── SKILL.md              ← 技能文档
├── config.json           ← 默认配置
├── index.js              ← 核心引擎(270行)
├── live-board-cli.js     ← CLI工具
├── test/
│   └── reporting.test.js ← 63项测试(全通过)
└── examples/
    └── demo.js           ← 使用示例
```

## 测试结果

```
63 passed, 0 failed
```

覆盖: shortModel · agentName · classify · computeStats · generateTitle · renderText · renderCard · renderReport · 边界情况

## API 摘要

```js
const { renderReport, renderText, renderCard } = require('./index.js');

// 统一入口
const { text, card, title, stats } = renderReport(tasks);

// 文本
const markdown = renderText(tasks, { showThinking: true });

// 飞书卡片
const feishuCard = renderCard(tasks);
```

## 输出样例

### 有活跃任务

```
## 🔄 3 Agent 并行执行中 · ⚠️1风险

| # | Agent | 任务 | 模型 | 状态 | 用时 |
|---|-------|------|------|------|------|
| 1 | 创作大师 | 写文档 | opus-4 | 🔄执行 | 3m12s |
| 2 | 研究员 | 调研 | gpt-4o | 🔄执行 | 1m45s |

**✅ 新完成 (1)**
- 架构师「系统设计」5m20s

**⚠️ 关键风险 (1)**
- ⏸️ DBA专家「DB迁移」schema lock
```

### 0 活跃

```
## ⏸️ 0 活跃 · ⚠️1风险 · ✅2完成

### ✅ 新完成 (2)
| # | Agent | 任务 | 模型 | 用时 |
|---|-------|------|------|------|
| 1 | 架构师 | 系统设计 | sonnet-4 | 5m |
| 2 | 测试专家 | 单元测试 | haiku-3-5 | 2m |

**⚠️ 关键风险 (1)**
- ⏸️ DBA专家「DB迁移」schema lock
```

### 飞书卡片

卡片颜色自动适配:
- 🟠 orange — 有风险/待决策
- 🔵 blue — 纯执行中
- 🟢 green — 全部完成
- ⚪ grey — 空

结构: `header` + `elements`(div/lark_md + hr)

## 删除的内容

从 v2 中删除(不再需要):
- `formatDashboard()` — 被 `renderText()` 替代
- `validateReport()` — 验证不属于汇报技能
- `generateTemplate()` — 模板生成不属于汇报技能
- `formatTable/List/Compact()` — 合并为 `renderText()`
- Overview 进度条 — 不必要
- Model Breakdown 区 — 不必要
- Next Actions 区 — 不必要
- Per-Task Next Hop — 不必要
- `suggestNextSteps()` — 不属于汇报技能
