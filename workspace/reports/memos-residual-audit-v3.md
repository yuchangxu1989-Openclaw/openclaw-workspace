# MemOS 遗留隐患审计 V3

> 审计时间: 2026-03-11 19:42 GMT+8
> 基于: V1审计(10:30) + V2审计(11:42) + 本次V3复查
> MemOS版本: @memtensor/memos-local-openclaw-plugin v1.0.1
> 数据库: /root/.openclaw/memos-local/memos.db — 626 chunks, 626 embeddings (100%覆盖)
> 插件配置: `plugins.slots.memory = "memos-local-openclaw-plugin"` ✅
> memorySearch: 未显式配置（依赖插件默认行为）

---

## 一、V2 P0修复验证

| # | V2 P0项 | V3验证结果 | 状态 |
|---|---------|-----------|------|
| 1 | correction-handler写MemOS | **❌ 未修**。`correction-harvester.js` 不存在。实际纠偏handler是 `rule.memory-correction-on-feedback-001.sh`（shell脚本），仍用 `grep -i "$SEARCH_TERM" "$MEMORY_FILE"` 搜索MEMORY.md，完全不碰MemOS。MemOS中的旧认知不会被标记废弃，新纠偏也不写入MemOS。 | ❌ 未修 |
| 2 | evolver读MemOS | **✅ 已修**。`evolve.js:342-432` 新增 `readMemosMemory()` 函数，通过sqlite3 CLI查询memos.db：(1)最近30条active chunks按时间倒序 (2)FTS5搜索纠偏/铁令/修正/规则关键词top15。与MEMORY.md内容合并后送入进化决策。 | ✅ 已修 |
| 3 | backup含memos.db | **✅ 已修**。`backup.sh` 现在包含 `memos-local/memos.db` + `memos.db-wal` + `memos.db-shm`，且备份前执行 `PRAGMA wal_checkpoint(TRUNCATE)` 确保WAL数据落盘。 | ✅ 已修 |
| 4 | MEMORY.md静态知识导入MemOS | **❌ 未修**。MEMORY.md中的规则/身份/架构等静态知识未导入memos.db。evolver仍需同时读两个数据源。 | ❌ 未修 |

**V2 P0修复率: 2/4 (50%)**

---

## 二、MemOS运行状态

| 检查项 | 结果 | 状态 |
|--------|------|------|
| memos.db存在性 | ✅ 存在，9MB，最后修改 17:50 | ✅ |
| chunks数量 | 626条，全部 `dedup_status='active'` | ✅ |
| embeddings覆盖率 | 626/626 = **100%**（独立`embeddings`表，非chunks列） | ✅ |
| FTS5索引 | ✅ `chunks_fts` 表存在，INSERT/UPDATE/DELETE触发器完整 | ✅ |
| 插件槽位 | `plugins.slots.memory = "memos-local-openclaw-plugin"` | ✅ |
| memorySearch配置 | 未显式设置（`NOT_SET`），依赖插件默认 | ⚠️ |
| Gateway插件加载 | journalctl最近1小时无memos/plugin日志（无法确认） | ⚠️ 不确定 |

**数据库健康：✅ 良好。** 从V2的356 chunks增长到626 chunks，embedding 100%覆盖，FTS5索引完整。

---

## 三、"写新读旧"分裂现状

### 已接入MemOS的组件 ✅

| 组件 | 接入方式 | 备注 |
|------|---------|------|
| MemOS插件 | 自动写入chunks+embeddings | 核心写入通道 |
| evolver evolve.js | sqlite3 CLI读取 | readMemosMemory() — 最近30条+FTS5纠偏 |
| backup.sh | 备份memos.db+WAL | WAL checkpoint后打包 |

### 仍只读MEMORY.md的组件 ❌

| # | 组件 | 文件 | 具体引用 | 风险 |
|---|------|------|---------|------|
| 1 | GEP analyzer | `evolver/src/gep/analyzer.js:9` | `path.join(process.cwd(), 'MEMORY.md')` 解析失败模式F\d+ | P1 |
| 2 | GEP solidify | `evolver/src/gep/solidify.js:480,810-811` | MEMORY.md列为CRITICAL_PROTECTED_FILES，读取做固化输入 | P1 |
| 3 | 纠偏handler | `scripts/isc-hooks/rule.memory-correction-on-feedback-001.sh` | `grep -i "$SEARCH_TERM" "$MEMORY_FILE"` 只搜MEMORY.md | P0 |
| 4 | memory-loss-recovery | `isc-core/handlers/memory-loss-recovery.js:12` | `MEMORY_PATH = path.join(WORKSPACE, 'MEMORY.md')` 只监控MEMORY.md | P1 |
| 5 | daily-report | `lep-executor/src/daily-report.js:109` | `{ path: 'MEMORY.md', name: '长期记忆' }` 健康检查 | P2 |
| 6 | daily-report-glm5 | `lep-executor/src/daily-report-glm5.js:82` | 同上 | P2 |
| 7 | critical-files-check.sh | `ops-maintenance/scripts/critical-files-check.sh:6` | `MEMORY_FILE="/root/.openclaw/workspace/MEMORY.md"` | P2 |
| 8 | startup-self-check.sh | `ops-maintenance/scripts/startup-self-check.sh:25-26` | 检查MEMORY.md+CRITICAL-MEMORY.md，丢失时从git恢复 | P2 |
| 9 | doc-quality-gate | `isc-core/handlers/doc-quality-gate.js:40` | excludeKeywords含'MEMORY.md' | P3 |
| 10 | evolver prompt.js | `evolver/src/gep/prompt.js:360` | "NEVER delete root files: MEMORY.md..." 保护列表 | P3 |

**分裂比: 3:10（接入MemOS : 仍读MEMORY.md）**

---

## 四、缺失的基础设施

| # | 缺失项 | 说明 | 风险 |
|---|--------|------|------|
| 1 | `memos.chunk.created` 事件 | ISC事件总线中无此事件类型注册，无法触发下游订阅 | P1 |
| 2 | memos健康检查cron | crontab中无memos相关定时任务，memos.db损坏/锁死无人发现 | P1 |
| 3 | AGENTS.md记忆路径 | AGENTS.md中无memory/MemOS相关描述，子Agent不知道记忆系统存在 | P2 |
| 4 | memorySearch显式配置 | openclaw.json中 `memorySearch` 未设置，依赖插件默认行为 | P2 |

---

## 五、V2→V3变化汇总

| 指标 | V2 (11:42) | V3 (19:42) | 变化 |
|------|-----------|-----------|------|
| chunks数量 | 356 | 626 | +270 (+76%) |
| embeddings | 358 | 626 | +268 (+75%) |
| embedding覆盖率 | ~100% | 100% | 持平 |
| evolver读MemOS | ❌ | ✅ | **已修** |
| backup含memos.db | ❌ | ✅ | **已修** |
| 纠偏写MemOS | ❌ | ❌ | 未修 |
| MEMORY.md导入MemOS | ❌ | ❌ | 未修 |
| 仍读MEMORY.md的组件 | 23个 | 10个 | -13 (部分清理) |

---

## 六、风险优先级排序

### P0 — 数据流断路（1项）

| # | 问题 | 影响 |
|---|------|------|
| 1 | 纠偏handler只操作MEMORY.md | 用户纠偏不进MemOS，MemOS中的错误认知永远不会被标记废弃。纠偏效果随MEMORY.md被覆盖而丢失。 |

### P1 — 功能盲区（4项）

| # | 问题 | 影响 |
|---|------|------|
| 2 | GEP analyzer/solidify只读MEMORY.md | 进化分析和固化决策看不到MemOS中的626条对话记忆，失败模式分析不完整 |
| 3 | memory-loss-recovery不监控memos.db | memos.db损坏/丢失不触发恢复流程，9MB数据无保护 |
| 4 | 无memos.chunk.created事件 | 新chunk写入无法触发下游订阅（如向量化、统计、告警） |
| 5 | 无memos健康检查cron | memos.db锁死/损坏/空间不足无人发现 |

### P2 — 配置/文档缺失（4项）

| # | 问题 | 影响 |
|---|------|------|
| 6 | MEMORY.md静态知识未导入MemOS | 两套数据源并行，evolver需同时读两处 |
| 7 | daily-report/critical-files-check不检查memos.db | 日报和启动检查对MemOS状态无感知 |
| 8 | AGENTS.md无记忆系统描述 | 子Agent不知道MemOS存在 |
| 9 | memorySearch未显式配置 | 依赖插件默认行为，行为不透明 |

### P3 — 低影响冗余（2项）

| # | 问题 | 影响 |
|---|------|------|
| 10 | prompt.js/doc-quality-gate仍引用MEMORY.md | 保护列表和排除规则过时，但不影响功能 |
| 11 | MEMORY.md与MemOS数据冗余 | 两套记忆系统并行运行，维护成本高 |

---

## 七、结论

**MemOS核心运行正常**（626 chunks, 100% embedding, FTS5完整），V2的4个P0修了2个（evolver读MemOS、backup含memos.db）。

**最大遗留风险**：纠偏流程仍完全绕过MemOS（P0），加上10个组件仍只读MEMORY.md形成的"写新读旧"分裂。系统处于**双轨并行**状态——MemOS在积累数据但多数消费者看不到。

**建议修复顺序**：P0纠偏handler → P1 GEP+recovery+事件+cron → P2配置文档 → P3清理。
