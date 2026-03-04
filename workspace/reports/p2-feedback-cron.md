# P2-5 报告：用户反馈收录机制 + Cron 任务合并优化

生成时间：2026-03-03

---

## 任务A：用户反馈收录系统 ✅

### 实现位置
`workspace/infrastructure/feedback/collector.js`

### 功能概述
| 功能 | 说明 |
|------|------|
| `submit(feedback)` | 手动提交反馈，写入 items/ 并更新 index.json |
| `autoCollectFromEvents()` | 从 event-bus 自动收录 AEO 失败和系统错误 |
| `query(filters)` | 按 source/status/priority 过滤查询 |
| `updateStatus(id, status)` | 更新单条反馈状态 |

### 数据结构
- **来源（source）**：user / aeo / system / cras / evomap
- **优先级（priority）**：critical / high / medium / low
- **状态（status）**：new / triaged / in_progress / resolved / wontfix

### 存储结构
```
infrastructure/feedback/
├── collector.js       # 主模块
├── index.json         # 汇总索引（含统计）
└── items/
    └── fb_<ts>_<rnd>.json  # 每条反馈独立文件
```

### 测试结果
- 手动提交 1 条测试反馈：✅ 成功写入
- 自动收录（event-bus 不可用时）：✅ 优雅跳过，返回 `{ collected: 0 }`
- index.json 统计字段生成正确：✅

---

## 任务B：Cron 任务合并优化分析

### 当前状态
- **总任务数**：29
- **启用**：27
- **禁用**：2

### 按调度分组

| 调度表达式 | 任务数 | 任务列表 |
|-----------|--------|---------|
| `*/30 * * * *` | 1 | 全局自主决策流水线 |
| `0 * * * *`（整点） | 2 | DTO-Declarative-Orchestration、System-Monitor-健康检查 |
| `30 * * * *`（半点） | 1 | Gateway内存监控增强 |
| `35 * * * *` | 1 | 会话文件自动清理 |
| `40 * * * *` | 1 | AEO-DTO闭环衔接 |
| `0 */4 * * *` | 1 | EvoMap-Evolver-自动进化 |
| `5 */4 * * *` | 1 | 能力锚点自动同步 |
| `10 */4 * * *` | 1 | System-Monitor-峰值记录 |
| `20 */4 * * *` | 1 | PDCA-C执行引擎 |
| `25 */4 * * *` | 1 | 流水线健康监控 |
| `0 */6 * * *` | 3 | CRAS-C-知识治理、统一向量化服务、CRAS-四维意图仪表盘 |
| `0 2 * * *` | 2 | CRAS-E-自主进化、系统维护-每日清理 |
| `0 9 * * *` | 2 | CRAS-A-主动学习引擎、LEP-韧性日报 |
| `0 7 * * *` | 1 | OpenClaw-自动备份-每日0700 |
| `0 19 * * *` | 1 | OpenClaw-自动备份-每日1900 |
| 其他每日单任务 | 6 | 各自独立时间点 |

### 合并建议

#### 🔴 高价值合并机会

**1. 每小时监控任务（4个任务，时间分散）**
- `0 * * * *`：DTO-Orchestration + System-Monitor-健康检查
- `30 * * * *`：Gateway内存监控
- `35 * * * *`：会话文件自动清理
- `40 * * * *`：AEO-DTO闭环

**建议**：创建 `hourly-maintenance` 汇总任务，统一在 `0 * * * *` 执行，内部顺序调用各子模块。预计减少 API 调用 ~75%（4次→1次/小时）。

**2. 每4小时监控任务（5个任务，错开5分钟）**
- `0/5/10/20/25 */4 * * *`：5个任务错开执行

**观察**：错开设计是为了避免并发冲击，已是合理设计。建议保持错开，但可考虑合并 EvoMap(0) + 能力锚点(5) 为一个顺序执行任务，System-Monitor(10) + PDCA(20) + 流水线监控(25) 合并为第二个任务，减少到 2 个。

**3. 每6小时任务（3个任务同时触发）**
- `0 */6 * * *`：CRAS-C-知识治理、统一向量化服务、CRAS-四维意图仪表盘

**建议**：3个任务同时触发可能造成资源冲击。建议错开为 `0/10/20 */6 * * *`，或合并为串行执行。

**4. 每日凌晨2点（2个任务）**
- `0 2 * * *`：CRAS-E-自主进化 + 系统维护-每日清理

**建议**：可合并为一个任务，先清理再进化，逻辑顺序更合理。

**5. 每日9点（2个任务）**
- `0 9 * * *`：CRAS-A-主动学习引擎 + LEP-韧性日报

**建议**：可合并为晨间汇总任务，串行执行。

#### 🟡 潜在问题

- `飞书会话实时备份-每30分钟` 调度字段格式异常（unknown），需检查 JSON 结构
- `ISC-技能使用审计` 标注为每周但调度为 `0 20 * * *`（每日），需确认是否正确

### 优化效果预估

| 指标 | 当前 | 优化后 |
|------|------|--------|
| 启用任务数 | 27 | ~18（减少 33%）|
| 每小时 API 调用峰值 | 4-6次 | 1-2次 |
| 每4小时并发任务 | 5个错开 | 2个错开 |
| 每6小时并发 | 3个同时 | 3个错开 |

---

## Git 提交

```
[P2] User feedback collection system + cron consolidation analysis
```

文件变更：
- `workspace/infrastructure/feedback/collector.js` ← 新增
- `workspace/infrastructure/feedback/index.json` ← 自动生成
- `workspace/infrastructure/feedback/items/` ← 自动生成
- `workspace/reports/p2-feedback-cron.md` ← 本报告
