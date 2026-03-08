# Workspace架构分析与修复报告

**日期**: 2026-03-09 02:45
**执行者**: researcher (subagent)
**任务**: 分析phantom write根因，修复workspace架构

---

## 1. 核心发现：Sandbox是假问题，Workspace隔离是真问题

### 1.1 Sandbox完全不相关

| 检查项 | 结果 |
|--------|------|
| Docker安装状态 | ❌ 未安装 (`docker: command not found`) |
| `agents.defaults.sandbox` | ❌ 未配置（sandbox默认OFF） |
| `/root/.openclaw/sandboxes/` | ❌ 不存在 |
| `sessions_spawn` sandbox参数 | `inherit`（继承OFF=无隔离） |

**结论**：当前系统没有任何Docker sandbox参与。`exec host=sandbox`在sandbox OFF时直接在host上执行，与Docker无关。Sandbox机制对phantom write问题零影响。

### 1.2 真正的根因：Workspace Fragmentation（工作区碎片化）

**现状**：每个Agent有独立workspace：

| Agent | Workspace路径 | 用途 |
|-------|--------------|------|
| main | `/root/.openclaw/workspace` | 主Agent，所有产出的预期存放位置 |
| researcher | `/root/.openclaw/workspace-researcher` | 独立workspace + SOUL.md |
| coder | `/root/.openclaw/workspace-coder` | 独立workspace + SOUL.md |
| reviewer | `/root/.openclaw/workspace-reviewer` | 独立workspace |
| analyst | `/root/.openclaw/workspace-analyst` | 独立workspace |
| scout | `/root/.openclaw/workspace-scout` | 独立workspace |
| writer | `/root/.openclaw/workspace-writer` | 独立workspace |
| cron-worker | `/root/.openclaw/workspace` | 共享main workspace |
| 15个-02/worker系列 | 配置了但**目录不存在** | 完全未使用 |

**问题链**：
1. Main通过 `sessions_spawn(agentId: "analyst", task: "写报告到 reports/xxx.md")` 派发任务
2. Analyst的workspace是 `/root/.openclaw/workspace-analyst/`
3. `reports/xxx.md` 解析为 `/root/.openclaw/workspace-analyst/reports/xxx.md`
4. Main在 `/root/.openclaw/workspace/reports/xxx.md` 找不到文件
5. → **Phantom Write**: 文件存在，但位置错误

### 1.3 Phantom Write的铁证

修复过程中从Agent workspace抢救出的文件数量：

| Agent | 抢救文件数 | 示例 |
|-------|-----------|------|
| analyst | 7个 | `aeo-day2-gap-audit`, `eval-badcase-index-update` 等 |
| writer | 4个 | `evaluation-baseline-guidance`, `gongzhonghao-writer-v2` 等 |
| researcher | 10个 | `aeo-global-autonomy-eval`, `录音设备市场机遇分析` 等 |
| coder | 28个 | `fill-keys-with-debt-lane-*`, `evalset-batch-refresh` 等 |
| **合计** | **49个** | 全部是本应出现在main workspace的产出 |

### 1.4 为什么Coder成功率相对高？

分析coder workspace内容后发现：coder的"成功"是**统计偏差**。实际上coder也有28个文件写到了错误位置。Coder看起来成功率高是因为：
1. Coder任务中有些使用**绝对路径**（如 `cd /root/.openclaw/workspace/skills/...`），这些不受workspace影响
2. Coder执行的exec命令经常通过绝对路径引用脚本
3. 而scout/analyst/writer更多使用**相对路径**写报告

---

## 2. 实施的修复

### 2.1 紧急修复：Symlink统一产出路径（已完成 ✅）

为6个Agent workspace创建symlink，将常用产出目录指向main workspace：

```
# reports/ 目录（所有Agent）
workspace-{analyst,writer,researcher,coder,scout,reviewer}/reports → workspace/reports ✅

# memory/ 目录（非researcher Agent）
workspace-{analyst,writer,scout,reviewer}/memory → workspace/memory ✅

# coder额外目录
workspace-coder/logs → workspace/logs ✅
workspace-coder/designs → workspace/designs ✅

# skills/ 目录
workspace-{scout,analyst}/skills → workspace/skills ✅
```

**效果**：今后任何Agent写 `reports/xxx.md`，文件都会出现在 `/root/.openclaw/workspace/reports/xxx.md`。

### 2.2 抢救的stranded文件（已完成 ✅）

49个文件已从Agent独立workspace复制到main workspace的reports/和memory/目录。

### 2.3 未修改的部分

- **Config未改**：未修改 `openclaw.json` 中的workspace配置，因为每个Agent需要保留自己的AGENTS.md和SOUL.md作为身份文件
- **Researcher workspace**：保留独立memory目录（researcher有独立的架构师身份）
- **Coder workspace**：保留其独立的infrastructure/和scripts/目录（已有内容，不宜覆盖）

---

## 3. 剩余风险与建议

### 3.1 Symlink只覆盖已知目录

如果subagent写到非reports/memory的新目录（如 `data/`, `output/`），symlink不起作用。

**建议**：main的AGENTS.md中添加spawn规则：
```
sessions_spawn时，task描述中所有文件路径必须使用绝对路径：
/root/.openclaw/workspace/reports/xxx.md（报告）
/root/.openclaw/workspace/memory/xxx.md（记忆）
/root/.openclaw/workspace/logs/xxx（日志）
```

### 3.2 sessions_spawn的cwd参数

`sessions_spawn` 支持 `cwd` 参数，可以覆盖subagent的工作目录。但根据文档，`cwd` 可能同时影响workspace context file的加载路径（AGENTS.md等），这意味着subagent会加载main的AGENTS.md而非自己的。

**建议**：谨慎使用cwd参数。如果测试确认cwd只影响file tool cwd而不影响context loading，则推荐所有spawn调用加上 `cwd: "/root/.openclaw/workspace"`。

### 3.3 清理15个未使用Agent

当前config中有15个-02/worker系列Agent，其workspace目录全部不存在，占用配置空间。

**建议**：从 `openclaw.json` 中移除这些未使用的Agent配置：
- analyst-02, coder-02, researcher-02, reviewer-02, scout-02, writer-02
- cron-worker-02, worker-03~06
- auditor, codex, engineer, strategist

### 3.4 长期方案

| 方案 | 适用场景 | 推荐度 |
|------|---------|--------|
| **A. 当前symlink方案** | 已实施，覆盖reports/memory | ⭐⭐⭐ 立即生效 |
| **B. 绝对路径规范** | 补充A，覆盖所有路径 | ⭐⭐⭐⭐ 推荐 |
| **C. cwd参数方案** | 需验证副作用 | ⭐⭐⭐ 需测试 |
| **D. 全部共享workspace** | 放弃Agent身份隔离 | ⭐⭐ 牺牲过大 |

---

## 4. OpenClaw Sandbox机制速查（备忘）

虽然当前不使用sandbox，记录要点以备未来需要：

- **模式**：`agents.defaults.sandbox.mode` = `off`(默认) / `non-main` / `all`
- **范围**：`agents.defaults.sandbox.scope` = `session`(默认) / `agent` / `shared`
- **Workspace访问**：`workspaceAccess` = `none`(默认, 用sandbox workspace) / `ro` / `rw`
- **前提**：需要Docker + 构建sandbox镜像 (`scripts/sandbox-setup.sh`)
- **sessions_spawn sandbox参数**：`inherit`(默认) / `require`
  - `inherit`：继承父session的sandbox状态
  - `require`：强制要求子session必须在sandbox中运行
  - 当sandbox OFF时，`inherit` = 无隔离，`require` = 报错

---

## 5. 执行清单

| # | 操作 | 状态 |
|---|------|------|
| 1 | 分析sandbox机制 | ✅ 确认不相关 |
| 2 | 定位phantom write根因 | ✅ workspace fragmentation |
| 3 | 抢救stranded文件（49个） | ✅ 已复制到main workspace |
| 4 | 创建reports/ symlink（6个Agent） | ✅ |
| 5 | 创建memory/ symlink（4个Agent） | ✅ |
| 6 | 创建额外symlink（coder: logs/designs, scout/analyst: skills） | ✅ |
| 7 | 写分析报告 | ✅ 本文件 |
| 8 | 建议：AGENTS.md添加绝对路径规范 | 📋 待main执行 |
| 9 | 建议：清理15个unused Agent配置 | 📋 待确认后执行 |
| 10 | 建议：测试cwd参数副作用 | 📋 待测试 |

---

*报告结束。核心结论：问题不在sandbox，在workspace碎片化。已通过symlink修复主要产出路径。*
