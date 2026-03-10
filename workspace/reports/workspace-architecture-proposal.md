# 多 Workspace 架构优化方案

> **一句话结论：推荐方案B「隔离工作 + 统一产出」——保留各 Agent 独立 workspace 的隔离性，但将有价值的产出自动/约定性地回写到主 workspace，兼顾安全与可见性。** （待用户决策）

---

## 1. 现状摘要

### 1.1 Agent 与 Workspace 映射

| Agent | Workspace | 磁盘占用 | 状态 |
|-------|-----------|----------|------|
| main | workspace/ | 1.7G | 活跃，含大量 reports |
| researcher | workspace-researcher/ | 232K | 活跃，有独立报告产出 |
| coder | workspace-coder/ | 1.2M | 活跃，有 skills/dashboard 产出 |
| writer | workspace-writer/ | 7.6M | 活跃，有 evalset/reports 产出 |
| analyst | workspace-analyst/ | 428K | 活跃，有 spec 产出 |
| reviewer | workspace-reviewer/ | 80K | 活跃，有 gap-analysis 产出 |
| scout | workspace-scout/ | 132K | 活跃，有测试脚本/memory |
| cron-worker | workspace/（共用主 workspace） | — | 共用 |
| *-02, worker-03~06 | workspace-*-02/ 等 | **不存在** | 未初始化 |

**总磁盘：** 主 workspace 1.7G，子 workspace 合计 ~10M。子 workspace 开销可忽略。

### 1.2 文件重复分析

| 文件 | 情况 |
|------|------|
| AGENTS.md | 5/6 子 agent 与模板相同（hash `389cb0`），主 workspace 和 coder 不同 |
| SOUL.md | **每个 agent 都不同**（按设计，各有独立人设） |
| TOOLS.md | 6/6 子 agent 完全相同（模板未定制），主 workspace 不同 |
| IDENTITY.md / USER.md | 子 agent 有但未填写 |

### 1.3 产出分布（核心问题）

**子 Agent 的产出确实写在各自 workspace 内：**
- researcher → `reports/` 下多份分析报告
- coder → `skills/`, `dashboard/` 下代码产出
- writer → `output/evalsets/`, `reports/` 下评测内容
- analyst → `principle-e2e-spec/` 下完整 spec
- reviewer → `gap-analysis/` 下审查报告
- scout → 测试脚本、设计文档、memory

**问题：这些产出对主 Agent 和用户不直接可见**，需要知道具体路径才能访问。

### 1.4 设计意图（来自 OpenClaw 文档）

OpenClaw 官方文档明确：
- workspace 是 agent 的「家」，是其 memory 和工作目录
- 多 agent 设计的核心是 **隔离**（workspace + agentDir + sessions 各自独立）
- workspace 是 default cwd，不是硬沙箱——绝对路径可跨 workspace 访问
- 官方建议：保持单一活跃 workspace，避免状态漂移

### 1.5 子 Agent spawn 行为

子 Agent spawn 时，其 `cwd` 被设为配置的 workspace 路径。任务产出默认写入该 workspace。但 spawn 任务可以通过绝对路径写入任意位置（如本报告就是从 researcher workspace 写入主 workspace）。

---

## 2. 方案详述

### 方案 A：统一 Workspace

**核心思路：** 所有 Agent 共用 `/root/.openclaw/workspace`，通过子目录隔离。

**具体改动：**
1. 修改 `openclaw.json`，移除所有 agent 的 `workspace` 配置（或全部指向主 workspace）
2. 在主 workspace 下建立约定目录结构：
   ```
   workspace/
   ├── agents/researcher/   # 各 agent 的私有空间
   ├── agents/coder/
   ├── reports/              # 统一产出
   ├── skills/
   └── output/
   ```
3. 各 agent 的 SOUL.md 移到 `agentDir` 或通过配置注入

**优势：**
1. 所有产出天然可见，无需同步
2. 磁盘零冗余
3. 配置最简单，消除 workspace 扩散

**劣势：**
1. **并发写冲突风险**——多 agent 同时操作同一目录可能冲突
2. **AGENTS.md/SOUL.md 只能有一份**——无法给每个 agent 独立人设（除非改用 agentDir 机制）
3. **违反 OpenClaw 设计意图**——官方文档明确推荐隔离
4. **memory 文件混杂**——各 agent 的 `memory/` 日志会互相干扰
5. 所有 agent 共享上下文文件，token 开销增加

**风险：**
- 并发 agent 写同一文件导致数据丢失
- Agent A 误读/误改 Agent B 的 memory
- SOUL.md 冲突导致人设混乱

**迁移成本：** 中等（2-3 小时）
- 修改 openclaw.json
- 迁移现有子 workspace 产出到主 workspace
- 重新组织目录结构
- 测试各 agent 行为

**适用场景：** 单人单任务场景，agent 很少并发，对隔离性要求低。

---

### 方案 B：保持隔离 + 统一产出（推荐）

**核心思路：** 各 Agent 保留独立 workspace 作为工作空间，但约定产出写入主 workspace 的统一目录。

**具体改动：**
1. **spawn 任务模板规范化**——在 spawn 子 agent 时，task 描述中明确指定产出路径：
   ```
   输出写入 /root/.openclaw/workspace/reports/xxx.md
   ```
2. **主 workspace 建立产出索引**——在 `workspace/reports/INDEX.md` 维护产出清单
3. **可选：添加产出回写脚本**——定期或按需将子 workspace 有价值的产出 symlink/copy 到主 workspace
4. **不改 openclaw.json 的 workspace 配置**

**优势：**
1. 保留完整隔离性——符合 OpenClaw 设计意图
2. 产出集中可见——用户只需查看主 workspace
3. 并发安全——各 agent 在自己的 workspace 工作，不冲突
4. 各 agent 保留独立 SOUL.md / memory——人设和记忆不串
5. 迁移成本最低——只需改 spawn 时的约定

**劣势：**
1. 需要 spawn 时**显式指定产出路径**——依赖调用者遵守约定
2. 子 workspace 仍有模板文件冗余（AGENTS.md/TOOLS.md 等）
3. 约定无法强制执行——agent 可能忘记写到指定路径
4. 子 workspace 中的中间产物仍不可见（但通常不需要）

**风险：**
- 约定不一致导致产出散落（可通过 AGENTS.md 指令缓解）
- 主 workspace reports/ 目录增长需定期治理

**迁移成本：** 低（1 小时）
- 将现有子 workspace 关键产出移动/链接到主 workspace
- 在各 agent 的 AGENTS.md 中加入产出路径约定
- 建立 INDEX.md

**适用场景：** 当前团队规模，多 agent 并发工作，需要产出可见性又不想大改架构。

---

### 方案 C：保持现状 + 治理

**核心思路：** 不改任何架构，仅增加产出发现和索引机制。

**具体改动：**
1. **建立产出扫描脚本** `scan-outputs.sh`：
   ```bash
   find /root/.openclaw/workspace-* -name "*.md" -newer /tmp/last-scan -type f
   ```
2. **主 workspace 维护 `reports/cross-workspace-index.md`**——自动生成的跨 workspace 产出索引
3. **定期 cron 任务**扫描各 workspace 新增文件并更新索引
4. **在主 Agent AGENTS.md 中记录**各 workspace 的产出目录约定

**优势：**
1. 零改动风险——不动任何配置
2. 完全保留现有隔离
3. 可渐进式实施

**劣势：**
1. 产出仍分散——用户需通过索引间接访问
2. 索引可能过时——依赖 cron 及时性
3. 不解决根本问题——只是加了一层发现机制
4. 维护成本持续——脚本和 cron 需要维护
5. 用户体验未根本改善

**风险：**
- 索引脚本失效后无人维护
- 索引 ≠ 真正的可见性

**迁移成本：** 极低（30 分钟）
- 写一个扫描脚本
- 配置 cron 任务

**适用场景：** 对现状基本满意，只需偶尔查找子 agent 产出。

---

## 3. 决策矩阵

| 维度 | 方案 A（统一 workspace） | 方案 B（隔离 + 统一产出）⭐ | 方案 C（现状 + 治理） |
|------|:---:|:---:|:---:|
| 隔离性 | ❌ 差 | ✅ 好 | ✅ 好 |
| 产出可见性 | ✅ 天然可见 | ✅ 约定可见 | ⚠️ 索引间接可见 |
| 磁盘开销 | ✅ 最低 | ⚠️ 略有冗余（~10M 可忽略） | ⚠️ 同 B |
| 配置复杂度 | ✅ 简单 | ⚠️ 需约定但不改配置 | ✅ 不改配置 |
| 迁移风险 | ❌ 高（改核心配置） | ✅ 低（只改约定） | ✅ 无 |
| 并发安全 | ❌ 有冲突风险 | ✅ 安全 | ✅ 安全 |
| 人设独立性 | ❌ 需额外处理 | ✅ 天然支持 | ✅ 天然支持 |
| 可持续性 | ⚠️ 规模大时失控 | ✅ 可扩展 | ⚠️ 治理负担累积 |

---

## 4. 架构师建议

**倾向方案 B：保持隔离 + 统一产出。**

理由：
1. **尊重框架设计**——OpenClaw 的多 agent 隔离是深思熟虑的架构决策，不宜违背
2. **问题本质是「产出路径约定」**，不是架构缺陷——当前子 agent 产出分散是因为 spawn 时没有统一指定输出路径，而非 workspace 隔离有问题
3. **已有成功实践**——本报告本身就是从 researcher workspace spawn、写入主 workspace 的例子，证明跨 workspace 写入是可行的
4. **成本最低收益最高**——只需在 spawn 任务描述中加一行「输出写入 /root/.openclaw/workspace/reports/xxx.md」
5. **磁盘冗余可忽略**——子 workspace 合计 ~10M，vs 主 workspace 1.7G

**具体落地建议：**
- 在主 Agent 的 AGENTS.md 或独立文件中写入 spawn 约定模板
- 对已有的子 workspace 产出，有价值的一次性迁移到主 workspace/reports/
- 清理未使用的 `-02`、`worker-03~06` 等 workspace 配置（目前磁盘上不存在，按需创建即可）
- 统一子 agent 的 TOOLS.md（当前 6 份相同的模板文件，可考虑用 agentDir 减少重复）

---

## 5. 待用户决策项

1. **选择方案**——A / B / C？（架构师倾向 B）
2. **产出路径约定**——统一写入 `workspace/reports/` 还是按类型分 `workspace/reports/`、`workspace/skills/`、`workspace/output/` ？
3. **是否清理 -02 和 worker-03~06 agent**——当前有 12 个 agent 无 workspace 目录，是否保留配置？
4. **子 workspace 历史产出**——是否迁移到主 workspace？还是保持原位、仅建索引？
5. **TOOLS.md / AGENTS.md 去重**——6 份相同的模板文件是否统一管理？

---

*报告生成时间：2026-03-08 17:43 CST*
*生成者：researcher (系统架构师) subagent*
