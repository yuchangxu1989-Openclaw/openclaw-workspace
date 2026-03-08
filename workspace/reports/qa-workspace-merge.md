# 🔎 Workspace合并深度审查报告

> **审查人**：质量仲裁官 (reviewer)
> **审查对象**：commit d66a33b1 — 19个Agent workspace统一合并到 `/root/.openclaw/workspace`
> **审查时间**：2026-03-09 03:00 CST
> **结论**：**⛔ 存在P0阻塞项，不建议重启gateway生效前先修复**

---

## 隐患清单

### 🔴 P0 — 阻塞项（必须修复才能重启gateway）

#### P0-1: 身份混乱 — 所有Agent将读取战略家的SOUL.md

**现状**：
- 主workspace的 `SOUL.md` 内容是 **"战略家 🎖️ Strategic Commander"** 的完整人格定义
- Runtime会从workspace目录注入 SOUL.md 作为 "Project Context" 到每个Agent的system prompt
- 合并生效后，researcher、coder、reviewer、writer、analyst、scout等**全部18个子Agent都会读到战略家的SOUL.md**

**影响**：
- SOUL.md 开头指令："你是产品与技术的战略决策者"、"别名：焰崽"
- AGENTS.md 中的启动指令："Read SOUL.md — this is who you are"
- **子Agent会认为自己是战略家**，执行战略家的行为模式（如主动感知、规则全链路展开等）
- 子Agent的agentDir里有简短的AGENTS.md（"子Agent工作规范"，仅400字节），但**不含SOUL.md**
- `identity` 字段中的 `name/emoji` 只设置显示名，不会覆盖system prompt中注入的SOUL.md人格

**证据**：
```
# 当前reviewer的workspace注入（workspace-reviewer仍独立时）
## /root/.openclaw/workspace-reviewer/SOUL.md
→ "质量仲裁官 🔎 Quality Arbiter"  ← 正确的身份

# 合并后所有Agent都会读到
## /root/.openclaw/workspace/SOUL.md  
→ "战略家 🎖️ Strategic Commander"  ← 战略家的身份！
```

**修复方案**：
- **方案A（推荐）**：将SOUL.md移入各Agent的 `agentDir`（如 `/root/.openclaw/agents/reviewer/agent/SOUL.md`），workspace只放共享文件
- **方案B**：在共workspace中建子目录（如 `workspace/souls/reviewer.md`），运行时通过hook加载对应文件
- **方案C（最小改动）**：将workspace的SOUL.md改为通用内容（团队共享价值观），各Agent的独特人格靠agentDir的AGENTS.md承载

---

#### P0-2: AGENTS.md 行为指令泄露 — 子Agent会执行战略家的启动流程

**现状**：
- 主workspace的 `AGENTS.md`（19,696字节）包含战略家的专属指令：
  - "你是战略指挥官，不是开发工程师"
  - "需要写代码/改文件 → sessions_spawn 子Agent"（子Agent又去spawn子Agent？）
  - "运行 `/root/.openclaw/workspace/scripts/startup-self-check.sh`"
  - "读 CAPABILITY-ANCHOR.md"、"如果不存在，立即停止并告警"
  - "exec计数提醒"
- 这些指令是面向main agent的行为约束，子Agent执行会导致：
  - coder被要求"不要写代码，delegate给子Agent" → 违背coder的核心职能
  - 每个子Agent启动都跑self-check脚本，浪费token和时间
  - 子Agent尝试读MEMORY.md（AGENTS.md指令："If in MAIN SESSION, also read MEMORY.md"）

**修复方案**：
- 同P0-1，将Agent专属AGENTS.md移入agentDir
- workspace根目录的AGENTS.md保持通用的工作规范（当前各agentDir里400字节版本的内容）

---

#### P0-3: MEMORY.md 敏感信息泄露

**现状**：
- `MEMORY.md`（21,501字节）包含：
  - 系统战略定位、用户与主Agent的私密对话记录
  - 用户教导内容（"长煦对我的称呼"、"我和长煦是共同进化的关系"）
  - 项目决策历史、Bug修复经验
- AGENTS.md中的指令会让主session的Agent读取MEMORY.md
- 虽然有"ONLY load in main session"的提示，但**子Agent无法可靠区分自己是否在main session**
- subagent context中没有明确标记"这不是main session"

**影响**：
- 子Agent读到主Agent的记忆后可能产生角色混淆
- 敏感的用户偏好和系统策略暴露给所有Agent实例

**修复方案**：
- MEMORY.md 移入 main agent 的agentDir或独立路径
- 或在workspace的.gitignore中排除MEMORY.md，每个Agent在自己的agentDir维护记忆

---

### 🟡 P1 — 高优隐患（应尽快修复）

#### P1-1: USER.md 个人信息全员共享

**现状**：
- `USER.md` 包含用户 **长煦** 的详细个人信息：
  - "AI产品共创合伙人"、"全时段警觉"
  - 工作风格偏好（"三轮迭代制"、"直接、立即、严厉"的纠偏风格）
  - 数据诚实性红线
- 虽然子Agent需要知道基本规范，但MEMORY.md级别的私人上下文不应暴露

**修复建议**：
- USER.md可以保留在shared workspace（子Agent需要知道用户的基本偏好）
- 但应精简为通用版本，移除战略家专属的关系描述

---

#### P1-2: 并发文件写入 Race Condition

**高风险文件**：

| 文件 | 风险类型 | 并发场景 |
|------|----------|----------|
| `logs/subagent-task-board.json` | 读写竞争 | 多个Agent同时记录任务状态 |
| `.pipeline-feedback.jsonl` | 追加竞争 | 多个pipeline同时写入 |
| `.pipeline-states.json` | 覆盖竞争 | 多个Agent同时更新状态 |
| `memory/2026-03-09.md` | 覆盖竞争 | 多Agent同时写daily note |
| `infrastructure/event-bus/events.jsonl` | 追加竞争 | 事件并发产生 |
| `reports/` 目录 | 文件名冲突 | 已有344个文件，多Agent同时写入 |

**分析**：
- JSONL文件的并发追加在Linux上**通常是原子的**（小于PIPE_BUF=4096字节的write系统调用），但大型追加可能交错
- JSON文件的读-改-写**完全不是原子的**，`task-board.json`、`.pipeline-states.json`存在丢失更新风险
- `memory/YYYY-MM-DD.md` 如果多Agent同时写，后写的会覆盖前写的

**修复建议**：
- 状态文件使用 flock 锁或原子重命名（write-to-tmp + rename）
- reports/ 目录文件名加agent-id前缀：`{agent-id}-{task-name}-{timestamp}.md`
- 每个Agent的memory日志放在子目录：`memory/{agent-id}/`
- 或接受"只有main agent写memory"的规则

---

#### P1-3: Git并发操作风险

**现状**：
- workspace下有 `.git` 目录（活跃的git仓库）
- Git status显示有未提交的修改
- 多个Agent可能同时执行 `git add / git commit / git push`

**影响**：
- `.git/index` 不支持并发写入 → 可能损坏index
- 多Agent同时commit → 一方成功另一方失败（需要rebase）
- git lock文件冲突 → 操作报错 `fatal: Unable to create '.git/index.lock': File exists`

**修复建议**：
- 子Agent默认禁止直接git操作，只通过main agent的任务队列提交
- 或使用git worktree给不同Agent分离工作树
- 最小方案：在共享脚本中加 flock 互斥锁

---

### 🟢 P2 — 建议改进

#### P2-1: 11个Agent曾配置了不存在的workspace目录

**现状**：
- researcher-02、coder-02等11个"-02"和"worker-0x" Agent之前配置的workspace目录**从未创建**：
  ```
  MISSING: /root/.openclaw/workspace-researcher-02
  MISSING: /root/.openclaw/workspace-coder-02
  ... (共11个)
  ```
- 这些Agent之前可能已经在报错或使用了某种fallback

**影响**：低。合并后统一指向真实存在的目录，反而修复了这个问题。

---

#### P2-2: 4个孤儿Agent目录未在配置中注册

**现状**：
- `/root/.openclaw/agents/` 下有4个目录不在 `agents.list` 中：
  - `auditor` — 有AGENTS.md
  - `codex` — 有AGENTS.md
  - `engineer` — 有AGENTS.md
  - `strategist` — 有AGENTS.md
- 这些可能是历史遗留或计划中的Agent

**影响**：无直接影响，但增加维护混乱。建议清理或注释说明用途。

---

#### P2-3: workspace根目录文件过度膨胀

**现状**：
- workspace根目录有 **60+个文件/目录**，包括：
  - 中文文件名（`小米手机购买策略指南 2026.md`、`小红书运营攻略.md`）
  - 临时脚本（`test_keys.sh`、`test_keys_v2.sh`、`test_keys_v3.sh`）
  - 一次性报告（`council-decision-20260225.md`）
  - node_modules/（161KB package-lock.json）
- 合并后文件会更多

**修复建议**：
- 建立目录约定：`docs/`、`tmp/`、`archive/`
- 清理一次性文件到archive
- node_modules加入.gitignore（已在）

---

#### P2-4: Gateway重启时机和影响

**现状**：
- Gateway PID 1831918，启动于 00:25
- 配置修改于 02:58（commit d66a33b1）
- **配置尚未生效** — 当前Agent仍使用旧的独立workspace
- 本次审查本身就运行在旧的 `workspace-reviewer` 上

**关键问题**：
- openclaw.json的修改通常需要**重启gateway**才能生效
- 重启会终止所有运行中的session
- 当前如果有活跃的主session或子Agent任务，重启会中断它们

**建议**：
- 先修复P0问题
- 选择低活跃时段重启（如凌晨4点的session自动重置窗口）
- 重启后验证：新session的workspace路径是否正确

---

## 回滚方案

### 快速回滚（<1分钟）

```bash
cd /root/.openclaw
git revert d66a33b1 --no-edit
# 然后重启gateway
openclaw gateway restart
```

### 手动回滚

```bash
cd /root/.openclaw
git checkout d66a33b1^ -- openclaw.json
openclaw gateway restart
```

### 旧workspace目录保留建议

| 目录 | 是否保留 | 原因 |
|------|----------|------|
| workspace-researcher | ✅ 保留7天 | 含独立SOUL.md/IDENTITY.md |
| workspace-coder | ✅ 保留7天 | 含独立SOUL.md/IDENTITY.md |
| workspace-reviewer | ✅ 保留7天 | 含独立SOUL.md/IDENTITY.md |
| workspace-writer | ✅ 保留7天 | 含独立SOUL.md/IDENTITY.md |
| workspace-analyst | ✅ 保留7天 | 含独立SOUL.md/IDENTITY.md |
| workspace-scout | ✅ 保留7天 | 含独立SOUL.md/IDENTITY.md |
| workspace-cron-worker | ✅ 保留7天 | 含独立SOUL.md/IDENTITY.md |

确认合并正常工作后，统一归档：
```bash
mkdir -p /root/.openclaw/backups/workspace-archive-20260309
mv /root/.openclaw/workspace-{researcher,coder,reviewer,writer,analyst,scout,cron-worker} \
   /root/.openclaw/backups/workspace-archive-20260309/
```

---

## 配置完整性校验

### Agent清单对比

| 序号 | Agent ID | 在config中 | 有agentDir | 有model | 有identity |
|------|----------|-----------|------------|---------|-----------|
| 1 | main | ✅ | ❌(默认) | ✅ | ✅ |
| 2 | researcher | ✅ | ✅ | ✅ | ✅ |
| 3 | coder | ✅ | ✅ | ✅ | ✅ |
| 4 | reviewer | ✅ | ✅ | ✅ | ✅ |
| 5 | writer | ✅ | ✅ | ✅ | ✅ |
| 6 | analyst | ✅ | ✅ | ✅ | ✅ |
| 7 | scout | ✅ | ✅ | ✅ | ✅ |
| 8 | cron-worker | ✅ | ✅ | ✅ | ✅ |
| 9 | researcher-02 | ✅ | ✅ | ✅ | ✅ |
| 10 | coder-02 | ✅ | ✅ | ✅ | ✅ |
| 11 | reviewer-02 | ✅ | ✅ | ✅ | ✅ |
| 12 | writer-02 | ✅ | ✅ | ✅ | ✅ |
| 13 | analyst-02 | ✅ | ✅ | ✅ | ✅ |
| 14 | scout-02 | ✅ | ✅ | ✅ | ✅ |
| 15 | cron-worker-02 | ✅ | ✅ | ✅ | ✅ |
| 16 | worker-03 | ✅ | ✅ | ✅ | ✅ |
| 17 | worker-04 | ✅ | ✅ | ✅ | ✅ |
| 18 | worker-05 | ✅ | ✅ | ✅ | ✅ |
| 19 | worker-06 | ✅ | ✅ | ✅ | ✅ |

✅ 19个Agent均在配置中，无误删遗漏。
✅ `defaults.workspace` 正确设置，无其他配置会覆盖它（各Agent已移除workspace字段）。

---

## 总结

| 严重等级 | 数量 | 关键问题 |
|----------|------|----------|
| **P0** | 3 | 身份混乱、行为指令泄露、记忆隐私泄露 |
| **P1** | 3 | USER.md共享、文件并发竞争、Git并发冲突 |
| **P2** | 4 | 幽灵workspace、孤儿Agent目录、根目录膨胀、重启时机 |

**核心矛盾**：workspace合并的初衷是"文件可见性"，但workspace同时承担了**身份定义**（SOUL.md）和**行为指令**（AGENTS.md）的职能。合并workspace等于合并身份，这是架构上的根本冲突。

**建议的正确架构**：
```
/root/.openclaw/workspace/          ← 共享工作区（文件、reports、scripts、skills）
  ├── AGENTS.md                      ← 通用工作规范（子Agent版本，精简）
  ├── USER.md                        ← 用户基本偏好（精简公共版）
  ├── reports/
  ├── skills/
  └── ...

/root/.openclaw/agents/{id}/agent/   ← 各Agent专属配置
  ├── AGENTS.md                      ← Agent专属行为指令（已存在，需扩充）
  ├── SOUL.md                        ← Agent专属人格（需新增）
  ├── MEMORY.md                      ← Agent专属记忆（如需要）
  └── ...
```

这样workspace负责共享文件可见性，agentDir负责身份隔离，两全其美。
