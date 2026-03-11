# 主Agent感知层+规划层 架构级根治方案

> 生成时间: 2026-03-11 18:42 GMT+8
> 北极星指标: **并发利用率最大化**（用户明确表示哪怕100路并发也有key）

---

## 一、现状诊断

### 1.1 openclaw.json 主Agent当前配置

```json
{
  "id": "main",
  "tools": {
    "deny": ["write", "edit", "apply_patch",
             "feishu_bitable_create_record", "feishu_bitable_update_record",
             "feishu_bitable_create_field", "feishu_bitable_create_app"]
  },
  "subagents": { "allowAgents": ["*"] },
  "systemPrompt": null  // ← 没有系统提示词！
}
```

**关键发现：**

| 维度 | 现状 | 问题 |
|------|------|------|
| tools.deny | 封了write/edit/apply_patch | **exec未封！** 主Agent仍可执行任意shell命令 |
| systemPrompt | 空 | 没有任何程序化的行为约束，MECE拆解、调度优先等全靠"认知承诺" |
| hooks/middleware | 不存在 | OpenClaw框架无preSpawn hook、无middleware、无guard机制 |
| agents.list | 19个静态agent | 无dynamicCreate、无maxConcurrent、无pool配置 |
| dispatch-guard.js | 已创建，功能完整 | **未集成到任何自动化流程中**，主Agent不会自动调用 |
| 每agent独立key | 是（claude-main, claude-researcher, claude-coder...） | key隔离已实现，但agent数量是并发天花板 |

### 1.2 三个根因的本质

```
根因1（感知-负载）: 主Agent盲派 → 同一agent堆积 → 并发浪费
根因2（感知-权限）: exec未封 → 主Agent自己干活 → 阻塞用户通信 → 并发=0
根因3（规划-拆解）: 无强制MECE → 大任务单派 → 串行执行 → 并发=1
```

**共同本质：并发利用率远低于可用上限。**

---

## 二、OpenClaw框架能力边界分析

### 2.1 框架原生支持的

| 能力 | 支持情况 | 配置路径 |
|------|----------|----------|
| tools.deny（工具黑名单） | ✅ 已验证生效 | `agents.list[i].tools.deny` |
| tools.allow（工具白名单） | ⚠️ 需验证 | `agents.list[i].tools.allow`（推测存在，deny的对偶） |
| systemPrompt（系统提示词） | ✅ 支持 | `agents.list[i].systemPrompt` |
| subagents.allowAgents | ✅ 支持 | 控制可派遣的agent范围 |
| sessions_spawn agentId | ✅ 支持 | 指定目标agent |
| sessions_spawn thinking | ✅ 支持 | 启用深度思考 |

### 2.2 框架不支持的（需workaround）

| 能力 | 状态 | Workaround |
|------|------|------------|
| preSpawn hook | ❌ 不存在 | 用systemPrompt强制要求spawn前调用dispatch-guard |
| 动态创建agent | ❌ 不存在 | 预注册足够多的agent（agent池化） |
| 并发上限管理 | ❌ 不存在 | dispatch-guard.js实现软限制 |
| 工具临时授权 | ❌ 不存在 | 用户口令 → 主Agent识别 → 切换到特殊agent执行 |
| 任务完成回调 | ⚠️ 部分（on-subagent-complete.sh） | 已有，需确保稳定 |

---

## 三、根治方案

### 问题1：感知层 — 全局负载感知

#### 3.1.1 方案：dispatch-guard 升级为「调度中枢」

当前dispatch-guard.js只做验证和选择，需要升级为完整的调度中枢：

```javascript
// /root/.openclaw/workspace/scripts/dispatch-guard.js v2
// 核心变化：支持动态agent池 + 并发度量 + 最优分配

const fs = require('fs'), path = require('path');
const AGENTS_DIR = '/root/.openclaw/agents';

// ===== 动态发现所有可用agent（不再硬编码） =====
function discoverAgents() {
  const dirs = fs.readdirSync(AGENTS_DIR).filter(d => {
    return d !== 'main' && fs.existsSync(path.join(AGENTS_DIR, d, 'sessions', 'sessions.json'));
  });
  return dirs;
}

// ===== 获取agent的running数 =====
function getRunning(id) {
  try {
    const d = JSON.parse(fs.readFileSync(
      path.join(AGENTS_DIR, id, 'sessions', 'sessions.json'), 'utf8'));
    return Object.entries(d)
      .filter(([k, v]) => k.includes(':subagent:') && v.status === 'running').length;
  } catch { return 0; }
}

// ===== 全局负载快照 =====
function globalSnapshot() {
  const agents = discoverAgents();
  const snapshot = agents.map(id => ({ id, running: getRunning(id) }));
  const totalRunning = snapshot.reduce((s, a) => s + a.running, 0);
  const totalCapacity = agents.length; // 每agent 1并发为基准
  const idle = snapshot.filter(a => a.running === 0);
  return {
    agents: snapshot,
    totalAgents: agents.length,
    totalRunning,
    totalIdle: idle.length,
    utilization: totalCapacity > 0 ? (totalRunning / totalCapacity * 100).toFixed(1) + '%' : '0%',
    idleAgents: idle.map(a => a.id)
  };
}

// ===== 按角色标签分配（支持模糊匹配） =====
// 角色标签从agent id前缀推断，或从openclaw.json的role字段读取
function pickBest(roleHint) {
  const agents = discoverAgents();
  // 按roleHint过滤候选
  let candidates = agents;
  if (roleHint) {
    const prefix = roleHint.toLowerCase();
    const matched = agents.filter(id => id.startsWith(prefix));
    if (matched.length > 0) candidates = matched;
    // 如果没匹配到，用worker-*作为通用池
    else {
      const workers = agents.filter(id => id.startsWith('worker'));
      if (workers.length > 0) candidates = workers;
    }
  }
  // 选running最少的
  let minRunning = Infinity, pick = candidates[0];
  for (const id of candidates) {
    const r = getRunning(id);
    if (r === 0) return { agentId: id, running: 0, reason: 'idle' };
    if (r < minRunning) { minRunning = r; pick = id; }
  }
  return { agentId: pick, running: minRunning, reason: 'least-loaded' };
}

// ===== 批量分配（MECE拆解后一次性分配N个任务） =====
function allocateBatch(tasks) {
  // tasks = [{ label, roleHint }, ...]
  const allocated = [];
  const tempLoad = {}; // 临时负载计数，避免全分到同一个agent
  
  for (const task of tasks) {
    const agents = discoverAgents();
    let candidates = agents;
    if (task.roleHint) {
      const matched = agents.filter(id => id.startsWith(task.roleHint.toLowerCase()));
      if (matched.length > 0) candidates = matched;
      else {
        const workers = agents.filter(id => id.startsWith('worker'));
        if (workers.length > 0) candidates = workers;
      }
    }
    
    let minLoad = Infinity, pick = candidates[0];
    for (const id of candidates) {
      const realLoad = getRunning(id) + (tempLoad[id] || 0);
      if (realLoad < minLoad) { minLoad = realLoad; pick = id; }
    }
    
    tempLoad[pick] = (tempLoad[pick] || 0) + 1;
    allocated.push({ label: task.label, agentId: pick, currentLoad: minLoad });
  }
  
  return allocated;
}

// CLI
if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'snapshot') {
    console.log(JSON.stringify(globalSnapshot(), null, 2));
  } else if (cmd === 'pick') {
    const role = process.argv[3];
    console.log(JSON.stringify(pickBest(role), null, 2));
  } else if (cmd === 'batch') {
    // node dispatch-guard.js batch '[{"label":"t1","roleHint":"coder"},...]'
    const tasks = JSON.parse(process.argv[3]);
    console.log(JSON.stringify(allocateBatch(tasks), null, 2));
  } else {
    console.log('Usage: node dispatch-guard.js <snapshot|pick [role]|batch [json]>');
  }
}

module.exports = { discoverAgents, getRunning, globalSnapshot, pickBest, allocateBatch };
```

#### 3.1.2 主Agent如何"必须"调用它

OpenClaw没有preSpawn hook，**唯一可靠的强制手段是systemPrompt**：

```
在systemPrompt中写入铁令：
"在每次调用sessions_spawn之前，你必须先执行：
node /root/.openclaw/workspace/scripts/dispatch-guard.js snapshot
查看全局负载，然后用pick或batch选择目标agent。
绝对禁止不看负载直接spawn。"
```

**为什么这够用：** 主Agent的tools.deny已经封了write/edit/exec（见问题2方案），所以主Agent唯一能做的"动作"就是sessions_spawn。systemPrompt对这单一动作的约束是有效的。

#### 3.1.3 并发扩展方案：Agent池化

当前19个agent是并发天花板。要支持100路并发：

**方案A：预注册Agent池（推荐，立即可行）**

```
在openclaw.json中预注册100个agent：
- worker-01 到 worker-80（通用池）
- coder-01 到 coder-10（代码专用池）
- researcher-01 到 researcher-05（研究专用池）
- reviewer-01 到 reviewer-05（审计专用池）

每个agent绑定独立的API key（provider）。
dispatch-guard.js的discoverAgents()已经是动态发现，无需改代码。
```

**方案B：Agent模板 + 按需克隆（需框架支持）**

```
如果OpenClaw未来支持dynamicCreate：
{
  "agents": {
    "templates": {
      "worker": { "model": {...}, "tools": {...} }
    },
    "pool": {
      "minIdle": 5,
      "maxTotal": 100,
      "scaleUp": "on-demand"
    }
  }
}
目前不支持，记录为未来演进方向。
```

**方案A的具体操作（不执行，仅记录）：**

1. 准备N个API key，每个key对应一个provider
2. 在openclaw.json的models.providers中注册每个provider
3. 在agents.list中注册每个agent，指向对应的provider
4. dispatch-guard.js自动发现新agent，无需改动

---

### 问题2：感知层 — 工具权限硬隔离

#### 3.2.1 方案：扩展tools.deny封死exec

**当前deny列表缺失项分析：**

```
已封: write, edit, apply_patch, feishu_bitable_create_record/update_record/create_field/create_app
未封但必须封: exec, read (大文件读取也会阻塞)
应保留: sessions_spawn, subagents, memory_search, memory_write_public,
        message, web_search, web_fetch, feishu_doc(read), feishu_wiki,
        feishu_bitable_list_records, feishu_bitable_list_fields,
        feishu_bitable_get_meta, feishu_bitable_get_record,
        skill_search, skill_get, memory_timeline, task_summary,
        tts, sessions_list, sessions_history
```

**推荐的tools.deny配置：**

```json
{
  "tools": {
    "deny": [
      "exec",
      "write",
      "edit",
      "apply_patch",
      "read",
      "feishu_bitable_create_record",
      "feishu_bitable_update_record",
      "feishu_bitable_create_field",
      "feishu_bitable_create_app",
      "feishu_doc_write",
      "feishu_doc_append",
      "feishu_doc_insert",
      "feishu_doc_create",
      "feishu_doc_update_block",
      "feishu_doc_delete_block"
    ]
  }
}
```

**注意：** `feishu_doc` 是单一工具名，action参数在运行时指定。如果OpenClaw的deny是按工具名粒度（不支持action级别），则需要：
- 要么整个封掉 `feishu_doc`（主Agent不能直接操作文档）
- 要么保留 `feishu_doc`（允许read action，接受write action的风险）

**推荐：封掉feishu_doc**，所有文档操作都派子Agent。主Agent只需要通过web_fetch读飞书链接即可获取信息。

**最终精简deny列表：**

```json
{
  "tools": {
    "deny": [
      "exec",
      "write", 
      "edit",
      "apply_patch",
      "read",
      "feishu_doc",
      "feishu_bitable_create_record",
      "feishu_bitable_update_record",
      "feishu_bitable_create_field",
      "feishu_bitable_create_app",
      "canvas"
    ]
  }
}
```

#### 3.2.2 临时授权机制

OpenClaw不支持运行时动态修改tools配置。Workaround：

**方案：双身份Agent**

```
在agents.list中注册一个特殊agent：
{
  "id": "main-elevated",
  "model": { /* 与main相同 */ },
  "tools": { "deny": [] },  // 全权限
  "systemPrompt": "你是主Agent的提权模式，仅在用户明确授权时被调用。执行完立即返回结果。"
}

当用户说"授权主Agent执行"时：
主Agent → sessions_spawn(agentId="main-elevated", task="用户授权执行: xxx")
```

这样主Agent本身永远不碰exec，但可以通过"提权代理"完成紧急操作。

#### 3.2.3 read工具的特殊处理

封掉read会导致主Agent无法查看dispatch-guard的输出。但dispatch-guard是通过exec调用的，exec已经被封了。

**解决方案：** dispatch-guard的调用也派给子Agent。

```
主Agent的调度流程变为：
1. spawn一个scout做"负载快照" → 返回JSON
2. 根据JSON决定分配方案
3. 并行spawn N个子Agent
```

**但这引入了额外延迟（scout要启动、执行、返回）。**

**更优方案：保留exec但限制为只读命令**

如果OpenClaw的deny不支持条件过滤，那么：
- **保留exec**，在systemPrompt中严格限制：`"exec只允许用于调用dispatch-guard.js，禁止用于任何其他目的"`
- **封掉write/edit/apply_patch/read**（这些是文件修改的主要工具）

这是一个务实的折中：exec用于调度感知（调用dispatch-guard），但不用于实际工作。

**最终推荐deny列表（务实版）：**

```json
{
  "tools": {
    "deny": [
      "write",
      "edit", 
      "apply_patch",
      "read",
      "feishu_doc",
      "feishu_bitable_create_record",
      "feishu_bitable_update_record",
      "feishu_bitable_create_field",
      "feishu_bitable_create_app",
      "canvas"
    ]
  }
}
```

exec保留但systemPrompt严格限制用途。

---

### 问题3：规划层 — 强制MECE拆解

#### 3.3.1 方案：systemPrompt注入强制规划协议

这是三个问题中最关键的。没有MECE拆解，并发永远上不去。

**强制规划协议（写入main agent的systemPrompt）：**

```markdown
## 铁令：调度协议 v1

你是战略家（🎖️），你的唯一职责是：接收任务 → 拆解 → 派遣 → 汇报。
你绝对不自己执行任何具体工作。

### 收到任何任务后的强制流程：

**Step 0: 判断任务规模**
- 如果是简单问答（不需要读文件、不需要执行命令、不需要修改代码）→ 直接回答
- 否则 → 进入Step 1

**Step 1: MECE拆解**
将任务拆解为互不重叠、完全穷尽的独立子任务。
输出格式：
```
拆解结果：
1. [子任务1] → 角色: coder/researcher/reviewer/writer/scout
2. [子任务2] → 角色: ...
3. [整合任务] → 角色: analyst（等前面全部完成后执行）
```

**Step 2: 负载感知**
执行: `node /root/.openclaw/workspace/scripts/dispatch-guard.js batch '[{"label":"子任务1","roleHint":"coder"},...]'`
获取每个子任务的最优agent分配。

**Step 3: 并行派遣**
对所有独立子任务，在同一轮对话中并行调用sessions_spawn。
每次spawn后立即执行看板推送。

**Step 4: 等待结果**
不要主动poll。子Agent完成后会自动通知。
如果用户问进度，用subagents list查看。

**Step 5: 整合汇报**
所有子任务完成后，派1个analyst做整合，然后向用户汇报最终结果。

### exec使用限制
exec只允许用于以下用途：
1. 调用dispatch-guard.js查看负载
2. 调用push-board-now.js推送看板
3. 调用subagents list查看进度
禁止用exec执行任何其他命令（grep/sed/cat/node脚本编写等）。

### 并发最大化原则
- 能并行的绝不串行
- 一个大任务至少拆成3个子任务
- 如果空闲agent > 待派任务数，考虑是否可以进一步拆解
- 并发利用率 = running_agents / total_agents，目标 > 60%
```

#### 3.3.2 拆解质量保障

光有流程不够，还需要拆解质量的约束：

```markdown
### MECE拆解质量标准

1. **互斥性（ME）**：任意两个子任务的工作范围不重叠
   - 反例：子任务A"修复登录bug" + 子任务B"重构认证模块" → 重叠
   - 正例：子任务A"修复登录bug" + 子任务B"修复注册bug" → 互斥

2. **完全穷尽（CE）**：所有子任务合起来覆盖原始任务的100%
   - 检查方法：如果所有子任务都完成，原始任务是否100%完成？

3. **独立性**：每个子任务可以独立执行，不依赖其他子任务的输出
   - 如果有依赖，必须标注依赖关系，串行执行
   - 尽量通过任务重新定义消除依赖

4. **粒度适中**：每个子任务应该在1个agent的单次session内可完成
   - 太大：需要进一步拆解
   - 太小：合并到相邻任务
```

#### 3.3.3 并发度量与反馈

在systemPrompt中加入并发度量意识：

```markdown
### 并发度量

每次派遣完成后，输出并发度量：
- 本次派出: N个子Agent
- 当前running: M个
- 总agent数: T个
- 并发利用率: M/T = X%
- 空闲浪费: T-M个agent闲置

如果并发利用率 < 30%，反思是否可以进一步拆解任务。
```

---

## 四、完整改动清单

### 4.1 openclaw.json 改动（不执行，仅记录）

```jsonc
// agents.list[0] (main) 改动：
{
  "id": "main",
  "model": { /* 不变 */ },
  "identity": { "name": "战略家", "emoji": "🎖️" },
  "subagents": { "allowAgents": ["*"] },
  "tools": {
    "deny": [
      "write", "edit", "apply_patch", "read",
      "feishu_doc",
      "feishu_bitable_create_record", "feishu_bitable_update_record",
      "feishu_bitable_create_field", "feishu_bitable_create_app",
      "canvas"
    ]
  },
  "systemPrompt": "<<< 上面第3.3.1节的完整调度协议 >>>"
}

// 新增 main-elevated agent：
{
  "id": "main-elevated",
  "model": { "primary": "claude-main/claude-opus-4-6-thinking" },
  "identity": { "name": "提权执行器", "emoji": "🔓" },
  "tools": { "deny": [] },
  "systemPrompt": "你是主Agent的提权代理。仅在用户明确授权时被调用。执行完立即返回结果，不做额外操作。"
}
```

### 4.2 dispatch-guard.js 升级

替换 `/root/.openclaw/workspace/scripts/dispatch-guard.js` 为上面3.1.1节的v2版本。

### 4.3 Agent池扩展（按需）

当需要更高并发时：
1. 准备新的API key
2. 在models.providers中注册新provider
3. 在agents.list中注册新agent
4. dispatch-guard.js自动发现，无需改动

### 4.4 看板集成

dispatch-guard.js的globalSnapshot()输出可直接用于看板推送，替代当前的手动统计逻辑。

---

## 五、风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| systemPrompt约束不是硬限制，LLM可能违反 | 主Agent偶尔自己干活 | tools.deny是硬限制，封掉write/edit/apply_patch/read后，即使违反也做不了什么 |
| exec保留带来的风险 | 主Agent可能用exec写文件（echo > file） | systemPrompt严格限制 + 定期审计exec调用记录 |
| 过度拆解导致overhead | 简单任务也要走MECE流程 | Step 0的规模判断：简单问答直接回答 |
| Agent池扩展需要大量API key | 成本 | 用户已确认key充足 |
| dispatch-guard.js的sessions.json读取有竞态 | 偶尔负载数据不准 | 可接受，最坏情况是多派一个任务给已有负载的agent |

---

## 六、实施优先级

```
P0（立即）: 
  1. main agent的tools.deny加入exec → 不加，保留exec用于dispatch-guard
     改为：tools.deny加入read（防止主Agent读文件自己干活）
  2. main agent写入systemPrompt（调度协议v1）
  3. dispatch-guard.js升级为v2

P1（本周）:
  4. 注册main-elevated agent（临时授权机制）
  5. Agent池扩展到30-50个（根据可用key数量）
  6. 看板集成dispatch-guard的globalSnapshot

P2（下周）:
  7. exec调用审计机制（记录主Agent每次exec的命令）
  8. 并发利用率仪表盘（实时显示utilization%）
  9. 自动扩缩容探索（根据任务队列深度动态启用agent）
```

---

## 七、验证方案

实施后用以下场景验证：

**场景1：大任务拆解**
```
用户: "审计所有ISC规则的合规性"
期望: 主Agent拆解为5+个子任务，并行派出，利用率>50%
```

**场景2：主Agent不自己干活**
```
用户: "帮我看看xxx文件的内容"
期望: 主Agent派scout去读，而不是自己read/exec cat
```

**场景3：负载均衡**
```
连续派10个任务
期望: 分散到不同agent，不堆积在同一个上
```

**场景4：临时授权**
```
用户: "授权主Agent执行: ls /tmp"
期望: 主Agent通过main-elevated代理执行，而不是自己exec
```

---

## 八、总结

三个问题的根治路径：

1. **感知-负载** → dispatch-guard v2（动态发现 + 批量分配 + 全局快照）+ systemPrompt强制调用
2. **感知-权限** → tools.deny扩展（封read，保留exec仅用于调度）+ main-elevated提权代理
3. **规划-拆解** → systemPrompt注入强制MECE协议 + 并发度量反馈

**核心思路：用tools.deny做硬隔离，用systemPrompt做行为引导，用dispatch-guard做调度智能。三层防线，确保主Agent只做调度、最大化并发。**

并发扩展路径：当前19 agent → 预注册扩展到50-100 agent → 未来框架支持动态创建后无上限。dispatch-guard.js的动态发现机制确保扩展时零代码改动。
