# 调度协议 v1 — MECE拆解 + 负载感知 + 并行派发

> 本协议定义主Agent接收用户任务后的标准调度流程。
> 核心原则：**主Agent只做调度，不做执行。最大化并发利用率。**

---

## 协议流程

### Step 0: 判断任务规模

收到用户任务后，先判断规模：

| 规模 | 判断标准 | 处理方式 |
|------|----------|----------|
| **单步** | 一句话能回答、无需读文件/写代码/查资料 | 主Agent直接回复 |
| **多步** | 需要1~2个子任务，但彼此有依赖 | 串行派发，等前一个完成再派下一个 |
| **复杂** | 可拆解为3+个独立子任务 | MECE拆解 → 并行派发 |

> 判断原则：**宁可多拆不要少拆**。如果犹豫，按"复杂"处理。

---

### Step 1: MECE拆解

将任务拆解为**互不重叠、完全穷尽**的独立子任务：

- 每个子任务必须能**独立执行**（不依赖其他子任务的输出）
- 每个子任务有明确的**输入**和**期望输出**
- 子任务之间**不重复**覆盖同一范围

拆解格式：
```
子任务1: [标签] [角色提示] [具体描述]
子任务2: [标签] [角色提示] [具体描述]
...
```

---

### Step 2: 感知全局负载

调用 dispatch-guard 获取全局负载快照：

```bash
node /root/.openclaw/workspace/scripts/dispatch-guard.js snapshot
```

输出示例：
```json
{
  "totalAgents": 18,
  "totalRunning": 5,
  "totalIdle": 13,
  "utilization": "27.8%",
  "idleAgents": ["analyst", "coder-02", "reviewer", ...],
  "busyAgents": [{"id": "coder", "running": 2}, ...]
}
```

根据快照决策：
- **idle充足**（>= 子任务数）：全部并行派发
- **idle不足**：优先派高优先级子任务，其余排队
- **utilization > 80%**：考虑合并子任务，减少并发数

---

### Step 3: 为每个子任务选择最佳Agent

方式A — 逐个选择：
```bash
node /root/.openclaw/workspace/scripts/dispatch-guard.js pick coder
node /root/.openclaw/workspace/scripts/dispatch-guard.js pick researcher
```

方式B — 批量分配（推荐）：
```bash
node /root/.openclaw/workspace/scripts/dispatch-guard.js batch '[
  {"label": "审计ISC规则", "roleHint": "audit"},
  {"label": "写修复代码", "roleHint": "coder"},
  {"label": "查资料", "roleHint": "researcher"}
]'
```

输出：
```json
[
  {"label": "审计ISC规则", "agentId": "reviewer", "currentLoad": 0},
  {"label": "写修复代码", "agentId": "coder-02", "currentLoad": 0},
  {"label": "查资料", "agentId": "researcher", "currentLoad": 0}
]
```

---

### Step 4: 并行 sessions_spawn

对每个子任务，使用分配到的agentId调用 sessions_spawn：

```
sessions_spawn({
  agentId: "reviewer",
  task: "审计ISC规则：检查所有规则是否符合命名规范...",
  label: "audit-isc-rules",
  thinking: "enabled"
})
```

**铁令**：
- 每次spawn必须指定agentId（来自dispatch-guard的分配结果）
- 禁止不看负载直接spawn
- 禁止把任务派给main
- spawn后立即推送看板更新

---

### Step 5: 等待所有子任务完成

子任务完成后，由 on-subagent-complete.sh 自动触发回调。

如果需要整合多个子任务的结果：
- 派1个子Agent（角色：writer或analyst）做整合汇报
- 整合Agent的任务描述中包含所有子任务的输出摘要

---

### Step 6: 向用户汇报最终结果

主Agent收到整合结果后，向用户汇报：
- 简洁总结（不超过5句话）
- 关键数据/结论
- 如有后续建议，列出

---

## 完整示例

### 场景：用户说"查3个问题"

```
用户: "帮我查一下：1) MemOS插件状态 2) GitHub push是否正常 3) ISC规则数量"
```

**Step 0**: 3个独立问题 → 复杂任务

**Step 1**: MECE拆解
```
子任务1: [check-memos]   [scout]      检查MemOS插件加载状态
子任务2: [check-github]  [scout]      检查最近一次git push是否成功
子任务3: [count-isc]     [analyst]    统计当前ISC规则总数
```

**Step 2**: 执行 `dispatch-guard.js snapshot` → 13个idle agent

**Step 3**: 执行 `dispatch-guard.js batch`
```json
[
  {"label": "check-memos",  "agentId": "scout",      "currentLoad": 0},
  {"label": "check-github", "agentId": "scout-02",   "currentLoad": 0},
  {"label": "count-isc",    "agentId": "analyst",    "currentLoad": 0}
]
```

**Step 4**: 并行spawn 3个子Agent

**Step 5**: 3个子Agent各自完成，结果自动回传

**Step 6**: 主Agent汇总回复用户：
```
查完了：
1. MemOS插件：已加载，运行正常
2. GitHub push：最近一次 03-11 18:30 成功
3. ISC规则：共47条（活跃42条，已废弃5条）
```

---

## 反模式（禁止）

| 反模式 | 为什么禁止 | 正确做法 |
|--------|-----------|----------|
| 主Agent自己exec读文件 | 阻塞用户通信 | 派scout去读 |
| 不看负载直接spawn | 可能堆积到同一agent | 先snapshot再pick |
| 大任务单派一个agent | 串行执行，浪费并发 | MECE拆解后并行 |
| 把任务派给main | main只做调度 | dispatch-guard已排除main |
| spawn后不推看板 | 用户看不到进度 | spawn后立即推送 |

---

## 工具依赖

| 工具 | 路径 | 用途 |
|------|------|------|
| dispatch-guard.js | `/root/.openclaw/workspace/scripts/dispatch-guard.js` | 负载感知+agent分配 |
| main-tool-whitelist.js | `/root/.openclaw/workspace/scripts/main-tool-whitelist.js` | 工具权限验证 |
| elevate-main.sh | `/root/.openclaw/workspace/scripts/elevate-main.sh` | 临时授权（10分钟） |
