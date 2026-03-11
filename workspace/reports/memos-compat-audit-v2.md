# MemOS 兼容性审计报告 V2

> 审计时间: 2026-03-11 11:42 GMT+8
> 基于: V1审计（10:30）+ 深入验证
> MemOS版本: @memtensor/memos-local-openclaw-plugin v1.0.1
> 数据库: /root/.openclaw/memos-local/memos.db — 356 chunks, 358 embeddings
> 旧数据源: MEMORY.md (144行/10.6KB) + memory/*.md (12个文件)
> MemOS Viewer: ✅ 运行中 (127.0.0.1:18799, HTTP 200)
> MemOS插件槽位: ✅ `plugins.slots.memory = "memos-local-openclaw-plugin"`

---

## 一、V1审计23项逐条验证状态

### P0 — 数据流断路（4项）

| # | 组件 | V1问题 | V2验证结果 | 当前状态 |
|---|------|--------|-----------|---------|
| 1 | memory-correction-handler | 纠偏写MEMORY.md不进MemOS | **未修复**。代码仍 `const MEMORY_PATH = path.resolve(__dirname, '../../../MEMORY.md')`，`findRelatedParagraphs()` 按双换行切MEMORY.md段落做搜索替换。MemOS中的旧认知不会被标记废弃，新纠偏也不写入MemOS。最后修改: 2026-03-10 01:04。 | 🔴 未修 |
| 2 | 向量化订阅 | `file_pattern: "memory/*.md"` 不触发MemOS | **未修复**。订阅仍只监听 `memory.created` + `file_pattern`。无 `memos.chunk.created` 事件类型。但**影响降级**：MemOS自带embedding表（358条向量，与356 chunks匹配），内部已完成向量化，不依赖外部vectorize.sh。 | 🟡 影响降低 |
| 3 | 向量化服务 | 不扫描memos.db | **未修复**。`vectorize.sh` 仍只扫描 `memory/*.md`。但同#2，MemOS内部已有完整向量索引（FTS5 + RRF + MMR + recency decay），外部向量化对MemOS数据**非必需**。两套向量索引并行，存在冗余但不致命。 | 🟡 影响降低 |
| 4 | Evolver readMemorySnippet | 只读MEMORY.md做进化决策 | **未修复**。`evolve.js:337-366` 仍然 `readMemorySnippet()` → 读 `MEMORY.md`（含scope隔离），最多50000字符。MemOS中356条对话记忆完全不可见。进化决策基于过时的静态MEMORY.md。 | 🔴 未修 |

### P1 — 监控/恢复盲区（6项）

| # | 组件 | V1问题 | V2验证结果 | 当前状态 |
|---|------|--------|-----------|---------|
| 5 | memory-loss-recovery | 不监控memos.db | **未修复**。handler仍只检查 `MEMORY.md` 存在性 + `content.length < 100` 判定损坏。memos.db（5.3MB）损坏或丢失不会触发恢复。 | 🔴 未修 |
| 6 | self-bootstrap-kernel | memoryReady只看MEMORY.md | **未修复**。`memoryReady` 判定条件仍是 `MEMORY.md` 存在。MemOS不可用时bootstrap仍认为记忆就绪。 | 🔴 未修 |
| 7 | memos-memory-guide技能 | index.js空骨架 | **未修复**。`index.js` 仍是 `// TODO: 实现` 骨架。但SKILL.md有完整指南（MemOS插件自带bundled-memory-guide.ts已编译），实际通过SKILL.md生效，index.js空骨架**不影响功能**。 | 🟡 低影响 |
| 8 | GEP analyzer | 从MEMORY.md解析失败模式 | **未修复**。`analyzer.js:9` 仍 `const memoryPath = path.join(process.cwd(), 'MEMORY.md')`，正则匹配 `F\d+` 表格行。MemOS中的失败记录不被分析。 | 🔴 未修 |
| 9 | GEP solidify | 读MEMORY.md做固化输入 | **未修复**。`solidify.js` 仍将 `MEMORY.md` 列为 `CRITICAL_PROTECTED_FILES`，`readRecentSessionInputs()` 读MEMORY.md+当天memory日志。 | 🔴 未修 |
| 10 | 日报生成 | 不检查memos.db | **未修复**。`daily-report.js:109` 和 `daily-report-glm5.js:82` 仍列 `{ path: 'MEMORY.md', name: '长期记忆' }` 做健康检查。不检查memos.db。 | 🔴 未修 |

### P2 — 冗余/过时引用（7项）

| # | 组件 | V2验证 | 状态 |
|---|------|--------|------|
| 11 | critical-files-check.sh | 未修复，仍只检查MEMORY.md | 🔴 |
| 12 | startup-self-check.sh | 未修复 | 🔴 |
| 13 | backup.sh | **未修复**。备份列表仍是 `MEMORY.md` + `memory/`，不含 `memos-local/memos.db`。**数据丢失风险**。 | 🔴 |
| 14 | verify-delegation-guard.sh | 未修复 | 🟡 |
| 15 | 公众号prompt | 未修复 | 🟡 |
| 16 | memory-digest-must-verify | 未修复 | 🟡 |
| 17 | feishu-evolver-wrapper | 心跳写memory/daemon_heartbeat.txt — 无需迁移，确认OK | ✅ 无需修 |

### P2 — ISC规则引用过时（4项）

| # | 规则 | V2验证 | 状态 |
|---|------|--------|------|
| 18 | rule.n036-memory-loss-recovery | 未修复 | 🔴 |
| 19-22 | 其余ISC规则描述 | 未修复 | 🟡 |

### P3 — 架构冗余（1项）

| # | 问题 | V2验证 | 状态 |
|---|------|--------|------|
| 23 | 无memos-health-check cron | 未修复。crontab中无memos相关任务。 | 🔴 |

---

## 二、V2新发现问题

### 新增 N1（P0）：MEMORY.md数据未迁移到MemOS

**现象**：MEMORY.md（144行/10.6KB）包含系统认知、规则清单、身份设定等关键静态知识。memos.db中有34条chunk提到MEMORY.md，但这些是**对话中讨论MEMORY.md的记录**，不是MEMORY.md内容本身的导入。

**影响**：MemOS搜索无法召回MEMORY.md中的静态知识（规则列表、系统架构、身份信息等）。

**建议**：通过MemOS Viewer的Import功能或脚本将MEMORY.md内容分chunk导入memos.db，标记为 `kind: 'knowledge'`。

### 新增 N2（P1）：双向量索引冗余

**现象**：
- 外部向量化服务：128个向量文件（智谱embedding-3, 1024维），最近更新 03-11 06:38，扫描 `memory/*.md` + `skills/` + `knowledge/`
- MemOS内部：358条embedding（内置provider），存储在 `embeddings` 表

两套向量索引独立运行，互不感知。外部向量化不包含MemOS数据，MemOS不包含skills/knowledge数据。

**影响**：搜索结果不完整。MemOS搜索只覆盖对话记忆，外部向量搜索只覆盖文件系统。

**建议**：统一为MemOS内部向量索引，将skills/knowledge文件也导入MemOS；或建立桥接层统一查询两个索引。

### 新增 N3（P1）：memory/*.md日记仍在持续写入

**现象**：`memory/2026-03-11.md`（8.5KB）今天仍在更新（最后修改 10:23）。说明某些组件仍在写入旧的memory日记文件。

**影响**：新产生的日记内容不进入MemOS，只存在于文件系统。MemOS和文件系统记忆持续分裂。

**来源**：feishu-evolver-wrapper lifecycle.js 和可能的其他cron任务。

### 新增 N4（P2）：MemOS插件配置无embedding provider显式声明

**现象**：`openclaw.plugin.json` 的 `configSchema` 只有 `viewerPort` 一个配置项。embedding provider配置不在插件manifest中显式声明，依赖运行时自动检测或内部默认值。

**影响**：不透明。无法从配置文件确认当前使用哪个embedding provider和模型。

---

## 三、统计汇总

| 分类 | 总数 | 已修复 | 未修复 | 影响降低 |
|------|------|--------|--------|---------|
| V1 P0 | 4 | 0 | **2** | 2（#2,#3 MemOS自带向量） |
| V1 P1 | 6 | 0 | **5** | 1（#7 SKILL.md生效） |
| V1 P2 | 11 | 0 | **10** | 1（#17 无需修） |
| V1 P3 | 1 | 0 | **1** | 0 |
| V2 新增 | 4 | — | **4** | — |
| **合计** | **26** | **0** | **22** | **4** |

**V1的23个问题无一修复。** 新增4个问题。

---

## 四、修复优先级建议（更新版）

### 立即修复（本周）

| 优先级 | 编号 | 修复内容 | 预估工时 |
|--------|------|---------|---------|
| **P0** | #1 | memory-correction-handler 改为调用MemOS API | 2h |
| **P0** | #4 | evolve.js readMemorySnippet 增加MemOS查询 | 2h |
| **P0** | N1 | MEMORY.md静态知识导入memos.db | 1h |
| **P1** | #13 | backup.sh 增加memos.db备份 | 15min |
| **P1** | #5 | memory-loss-recovery 增加memos.db监控 | 1h |
| **P1** | #6 | bootstrap-kernel 增加MemOS就绪检查 | 30min |
| **P1** | #23 | 新增memos-health-check cron | 30min |

### 第二批（下周）

| 优先级 | 编号 | 修复内容 |
|--------|------|---------|
| P1 | #8+#9 | GEP analyzer/solidify 增加MemOS数据源 |
| P1 | #10 | 日报增加memos.db健康检查 |
| P1 | N2 | 向量索引统一方案设计 |
| P1 | N3 | 排查并统一memory/*.md写入源 |

### 第三批

剩余P2项（#11,#12,#14,#15,#16,#18-22,N4）批量处理。

---

## 五、关键发现：MemOS内部能力比预期强

V1审计时认为#2和#3是P0（MemOS数据未被向量化），但深入验证发现：

1. **MemOS自带完整的混合搜索引擎**：FTS5全文检索 + 向量搜索（embeddings表358条） + RRF融合 + MMR去重 + 时间衰减
2. **356条chunk全部有对应embedding**（358 embeddings ≥ 356 chunks）
3. **RecallEngine** 实现了 `ftsSearch` → `vectorSearch` → `rrfFuse` → `mmrRerank` → `applyRecencyDecay` 完整pipeline

因此外部向量化服务对MemOS数据**非必需**。真正的P0问题集中在：
- **上游组件读不到MemOS**（#1纠偏、#4进化器）
- **静态知识未导入MemOS**（N1）

---

*V2审计完成。26个问题（V1×23 + V2×4），0个已修复，真正的P0缩减为3个。*
