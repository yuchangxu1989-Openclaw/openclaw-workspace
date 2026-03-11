# MemOS 接入上下游不对齐审计报告

> 审计时间: 2026-03-11 10:30 GMT+8
> 审计范围: /root/.openclaw/workspace/ 全目录
> MemOS数据源: /root/.openclaw/memos-local/memos.db (338 chunks, 5.3MB)
> 旧数据源: MEMORY.md (10.6KB) + memory/*.md (12个文件)

## 背景

MemOS Local 插件已替换 memory-core，对话记忆存储迁移到 SQLite（FTS5+向量搜索）。
但大量上下游组件仍在读写旧的 MEMORY.md / memory/*.md，导致：
- 新记忆写入MemOS但上游组件读不到
- 旧组件写入MEMORY.md但MemOS不知道
- 向量化服务对着旧文件做，MemOS数据未被向量化

## 审计结果

### 一、数据流断路（P0 — 记忆丢失/不一致）

| # | 组件 | 文件 | 问题 | 严重度 | 建议修复 |
|---|------|------|------|--------|----------|
| 1 | memory-correction-handler | `infrastructure/event-bus/handlers/memory-correction-handler.js` | 用户纠偏事件(user.feedback.correction)直接读写MEMORY.md，纠偏结果**不会进入MemOS**。MemOS中的旧认知不会被标记废弃，新认知也不会写入MemOS。 | **P0** | 改为调用MemOS API写入纠偏记录；同时在MemOS中标记旧chunk为deprecated |
| 2 | 向量化订阅 | `skills/lto-core/subscriptions/vectorization-memory-created.json` | 订阅条件 `file_pattern: "memory/*.md"` — 只在memory目录创建md文件时触发向量化。**MemOS新写入的chunk永远不会触发向量化**。 | **P0** | 新增订阅 `memos.chunk.created` 事件类型；或在MemOS写入时直接调用智谱embedding |
| 3 | 向量化服务 | `infrastructure/vector-service/vectorize.sh` + `batch-vectorize.cjs` | 扫描源包含 `MEMORY_DIR="/root/.openclaw/workspace/memory"`，对memory/*.md做向量化。**MemOS SQLite中的338条chunk从未被向量化**。 | **P0** | 新增MemOS数据源：从memos.db导出chunk文本→送入batch-vectorize |
| 4 | Evolver核心 | `skills/evolver/src/evolve.js:337-366` | `readMemorySnippet()` 直接读MEMORY.md（含scope隔离逻辑），作为进化决策的上下文。**进化器看不到MemOS中的对话记忆**，决策基于过时数据。 | **P0** | 在readMemorySnippet中增加MemOS查询，合并MEMORY.md静态内容+MemOS动态记忆 |

### 二、监控/恢复盲区（P1 — 功能降级）

| # | 组件 | 文件 | 问题 | 严重度 | 建议修复 |
|---|------|------|------|--------|----------|
| 5 | memory-loss-recovery | `skills/isc-core/handlers/memory-loss-recovery.js` | 只监控MEMORY.md是否丢失/损坏（<100字节判定损坏）。**memos.db损坏或丢失不会触发恢复流程**。 | **P1** | 增加memos.db存在性+完整性检查（`PRAGMA integrity_check`） |
| 6 | self-bootstrap-kernel | `infrastructure/self-bootstrap-kernel.js:106` | `memoryReady` 判定条件是 `MEMORY.md` 存在。**MemOS不可用时bootstrap仍认为记忆就绪**。 | **P1** | 增加memos.db可读性检查作为memoryReady的必要条件 |
| 7 | memos-memory-guide技能 | `skills/memos-memory-guide/index.js` | 已注册到CAPABILITY-ANCHOR但**index.js是空骨架**（只有TODO），无实际逻辑。SKILL.md有完整指南但代码层无执行能力。 | **P1** | 实现核心逻辑：封装memory_search/task_summary/memory_timeline调用 |
| 8 | GEP analyzer | `skills/evolver/src/gep/analyzer.js:9` | `analyzeFailures()` 从MEMORY.md解析失败模式（正则匹配F\d+表格行）。**MemOS中的失败记录不会被分析**。 | **P1** | 增加从MemOS搜索failure/error相关chunk的逻辑 |
| 9 | GEP solidify | `skills/evolver/src/gep/solidify.js:810-815` | `readRecentSessionInputs()` 读MEMORY.md+当天memory日志作为固化输入。**MemOS对话上下文被忽略**。 | **P1** | 合并MemOS最近N条chunk作为session input |
| 10 | 日报生成 | `skills/lep-executor/src/daily-report.js:109` + `daily-report-glm5.js:82` | 将MEMORY.md列为关键系统文件做健康检查。**不检查memos.db状态**，可能报告"记忆正常"但MemOS实际不可用。 | **P1** | 增加memos.db文件大小+最近写入时间检查 |

### 三、冗余/过时引用（P2 — 数据不完整）

| # | 组件 | 文件 | 问题 | 严重度 | 建议修复 |
|---|------|------|------|--------|----------|
| 11 | critical-files-check.sh | `skills/public/ops-maintenance/scripts/critical-files-check.sh` | 只检查MEMORY.md存在性，不检查memos.db | **P2** | 增加memos.db检查项 |
| 12 | startup-self-check.sh | `skills/public/ops-maintenance/scripts/startup-self-check.sh:25-26` | 检查MEMORY.md和CRITICAL-MEMORY.md，不检查memos.db | **P2** | 增加memos.db检查项 |
| 13 | backup.sh | `skills/public/ops-maintenance/scripts/backup.sh:25,30` | 备份MEMORY.md和memory/目录，**不备份memos.db** | **P2** | 增加 `/root/.openclaw/memos-local/memos.db` 到备份列表 |
| 14 | verify-delegation-guard.sh | `skills/isc-core/scripts/verify-delegation-guard.sh:57-58` | grep MEMORY.md检查委派规则是否记录。应改为查MemOS或代码层。 | **P2** | 改为检查代码层（ISC规则JSON）而非MEMORY.md文本 |
| 15 | 公众号prompt | `skills/public/daily-gongzhonghao/prompt.md:10-11` | 指示读取 `memory/YYYY-MM-DD.md` 和 `MEMORY.md` 作为素材。**MemOS中的当天对话记忆不会被采用**。 | **P2** | 增加指示：调用memory_search获取当天对话亮点 |
| 16 | memory-digest-must-verify | `skills/isc-core/handlers/memory-digest-must-verify.js` | 扫描 `memory/` 目录下的md文件验证引用完整性。不扫描MemOS数据。 | **P2** | 增加MemOS chunk中文件引用的验证 |
| 17 | feishu-evolver-wrapper | `skills/feishu-evolver-wrapper/lifecycle.js:198` | 写入 `memory/daemon_heartbeat.txt` 作为心跳。这个不需要迁移到MemOS（运维数据），但应确认不被误向量化。 | **P3** | 无需修改，确认vectorize排除.txt文件即可 |

### 四、ISC规则引用过时（P2）

| # | 规则 | 问题 | 建议 |
|---|------|------|------|
| 18 | rule.n036-memory-loss-recovery | 触发条件和恢复逻辑全部基于MEMORY.md文件 | 增加memos.db检测分支 |
| 19 | rule.user-emphasis-auto-escalation-001 | 描述中"记MEMORY.md"作为level_1动作 | 改为"记入MemOS" |
| 20 | rule.failure-pattern-code-escalation-001 | 描述中"记录到MEMORY.md"作为failure_1动作 | 改为"记入MemOS" |
| 21 | rule.capability-anchor-auto-register-001 | handler中"记录到memory/architecture-changelog.md" | 改为写入MemOS或保留（架构变更日志可保留文件形式） |

### 五、Cron任务

| # | 任务 | 频率 | 问题 |
|---|------|------|------|
| 22 | gateway-memory-governor.sh | 每5分钟 | 监控Gateway进程内存，与MemOS无关，**无需修改** |
| 23 | 无MemOS健康检查cron | — | **缺失**：没有定时检查memos.db健康状态的cron任务 |

### 六、事件总线

| # | 事件类型 | 问题 |
|---|----------|------|
| 24 | `memory.created` | 订阅条件绑定 `file_pattern: "memory/*.md"`，MemOS写入不产生此事件 → 向量化断路 |
| 25 | `user.feedback.correction` | handler直接操作MEMORY.md → MemOS中的记忆不会被纠偏 |
| 26 | 缺失 `memos.chunk.created` | MemOS写入新chunk时没有对应的事件类型，无法触发下游（向量化、纠偏、统计） |

## 统计摘要

| 严重度 | 数量 | 说明 |
|--------|------|------|
| **P0** | 4 | 数据流断路，记忆丢失/不一致 |
| **P1** | 6 | 监控盲区，功能降级 |
| **P2** | 12 | 冗余引用，数据不完整 |
| **P3** | 1 | 无需修改 |
| **合计** | **23** | |

## 建议修复优先级

### 第一批（立即）
1. **#2+#3+#24+#26**: 向量化服务接入MemOS — 新增 `memos.chunk.created` 事件 + 订阅 + 从memos.db导出chunk做向量化
2. **#1+#25**: memory-correction-handler 改为读写MemOS
3. **#4**: evolver readMemorySnippet 增加MemOS查询

### 第二批（本周）
4. **#5+#18**: memory-loss-recovery 增加memos.db监控
5. **#6**: self-bootstrap-kernel 增加MemOS就绪检查
6. **#7**: memos-memory-guide 实现核心逻辑
7. **#13**: backup.sh 增加memos.db备份
8. **#23**: 新增memos-health-check cron任务

### 第三批（下周）
9. **#8+#9**: GEP analyzer/solidify 增加MemOS数据源
10. **#10+#11+#12**: 健康检查脚本增加memos.db
11. **#14+#15+#16**: 其余组件适配
12. **#19+#20+#21**: ISC规则描述更新

## 架构建议

当前MEMORY.md和memory/*.md不应立即删除，应作为**静态知识层**保留（长期认知、规则、身份设定等不变内容）。
MemOS作为**动态记忆层**（对话记忆、纠偏、时序事件）。

建议的双层架构：
```
┌─────────────────────────────────────────┐
│           上游组件（evolver/ISC/日报）      │
│                    ↓                     │
│  ┌──────────────┐  ┌──────────────────┐  │
│  │ MEMORY.md    │  │ MemOS SQLite     │  │
│  │ (静态知识层)  │  │ (动态记忆层)      │  │
│  │ 规则/认知/身份│  │ 对话/纠偏/事件    │  │
│  └──────────────┘  └──────────────────┘  │
│         ↓                  ↓             │
│  ┌─────────────────────────────────────┐ │
│  │     向量化服务（智谱embedding-3）     │ │
│  │     统一索引两个数据源               │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---
*审计完成。共发现23个不对齐问题，其中4个P0需立即修复。*
