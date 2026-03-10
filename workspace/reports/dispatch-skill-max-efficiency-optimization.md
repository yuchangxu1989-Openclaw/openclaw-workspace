# 多Agent调度技能极致效率优化方案

> 作者：系统架构师 (researcher)
> 日期：2026-03-06
> 版本：v1.0
> 定位：硬设计文档——架构、状态机、调度循环、触发条件、默认规则、失败回退、验收指标

---

## 0. 现状快照

| 维度 | 当前值 | 目标值 |
|---|---|---|
| boom/gpt-5.4 provider 总数 | 17（含 8 原始 + 9 新增） | 17–19 |
| dispatch-layer 配置 slot 数 | **2**（`defaultSlotCount: 2`） | **17–19** |
| 调度层存在位置 | `infrastructure/dispatcher/dispatch-layer.js` | 同文件升级 |
| 调度触发方式 | 手动 CLI / dispatcher.js 事件驱动 | **主Agent对话流内自动触发** |
| 主Agent → 子Agent 并发上限 | 无程序化限制，完全由主Agent临场判断 | **调度层程序化管理** |
| 实际并发利用率 | 估计 10%–15%（绝大多数时候只有 1-3 路活跃） | ≥ 70% |
| 任务队列深度 | 通常为 0（无预排任务） | **始终 ≥ idle_slot_count** |
| 汇报-调度-验收耦合度 | 高度耦合（主Agent串行处理） | 完全解耦 |

---

## 1. 为什么现有调度导致严重低利用率——根因分析

### 1.1 调度层 slot 数硬编码为 2

```javascript
// dispatch-layer.js 第 54 行
this.defaultSlotCount = Number.isInteger(options.defaultSlotCount) && options.defaultSlotCount > 0
  ? options.defaultSlotCount
  : 2;  // ← 这里！17路资源只用了2个槽
```

**根因**：dispatch-layer 是最小可运行版（报告原文："这是最小可运行版，故意未扩展"），slotCount 默认 2，但从未升级到与实际 provider 数量匹配。

### 1.2 主Agent是唯一的调度入口，且调度与对话互锁

当前任务发出流程：
```
用户说话 → 主Agent解析 → 主Agent思考要做什么 → 逐个 sessions_spawn → 等汇报 → 再发下一批
```

问题链：
1. **对话占用主Agent注意力**：主Agent在与用户交互时，不会同时扫描空槽并补位
2. **批次间串行**：每次只在用户触发时才生成一批任务，中间空闲的 slot 处于闲置
3. **无预排机制**：没有任务队列深度目标——队列为空时没有任何机制生成补充任务
4. **依赖人类输入驱动**：如果用户 10 分钟不说话，所有完成的任务腾出的 slot 就空转

### 1.3 假并发：多路并发的幻觉

现有模式的典型场景：
```
"同时发出 6 路任务"  →  实际 sessions_spawn 6 次
→ 3 个迅速完成（简单任务 <2分钟）
→ 2 个中等任务运行中
→ 1 个卡住但没人发现
→ 空出的 3 个 slot 无人补位，等主Agent下一次"想起来"再发
```

根因：
- 没有**任务完成→自动补位**的闭环
- 没有**僵尸检测**（长时间无进展的任务）
- 没有**槽位利用率监控**

### 1.4 汇报-调度-验收三者串行阻塞

```
子Agent完成 → auto-announce → 主Agent收到
→ 主Agent阅读结果（消耗注意力）
→ 主Agent判断是否通过（消耗注意力）
→ 主Agent决定下一个任务（消耗注意力）
→ 主Agent sessions_spawn（消耗注意力）
```

每个完成的任务需要主Agent做 **4 步串行操作**，期间无法处理其他事务。19 路并发下，这会成为绝对瓶颈。

### 1.5 dispatch-layer.js 的关键缺口

| 缺口 | 影响 |
|---|---|
| 无跨进程文件锁 | 多个进程同时写 state 文件会冲突 |
| 无优先级抢占 | 高优任务无法插队 |
| 无超时回收/僵尸清理 | 卡死任务永占 slot |
| slot 数不跟随 provider 数 | 19路资源只用2个slot |
| 无"队列水位线"机制 | 不会自动生成补充任务 |
| 无任务完成→自动补位回调 | 依赖外部触发 |
| 无并发度监控/告警 | 无法发现利用率低 |
| 无任务分类/路由到特定 agent | 所有任务走同一队列 |
| 不与 sessions_spawn 集成 | 调度层和实际执行层是两个独立世界 |

---

## 2. 最小必须新增的机制

### 2.1 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                         调度层 v2                                │
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐   │
│  │ 任务源    │───▶│ 入队引擎  │───▶│ 调度引擎  │───▶│ 执行桥接  │   │
│  │          │    │          │    │          │    │          │   │
│  │ • 用户指令│    │ • 优先级  │    │ • 槽位管理│    │ • spawn  │   │
│  │ • 自动拆分│    │ • 去重    │    │ • 补位逻辑│    │ • 监控   │   │
│  │ • 完成联动│    │ • 水位线  │    │ • 抢占    │    │ • 回收   │   │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘   │
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                   │
│  │ 验收引擎  │    │ 汇报引擎  │    │ 监控面板  │                   │
│  │          │    │          │    │          │                   │
│  │ • 自动验收│    │ • 异步汇报│    │ • 利用率  │                   │
│  │ • 质量门禁│    │ • 批量聚合│    │ • 僵尸告警│                   │
│  │ • 人工升级│    │ • 分级摘要│    │ • 队列深度│                   │
│  └──────────┘    └──────────┘    └──────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 七个必须机制

#### 机制 1：动态 Slot 池——与 provider 数量对齐

```javascript
// 新增：从 openclaw 配置自动探测 provider 数量
function detectAvailableSlots() {
  // 方案 A: 读 openclaw.json 中 providers 配置
  // 方案 B: 直接传入 slotCount 参数
  // 方案 C: 读环境变量 DISPATCH_SLOT_COUNT
  const count = process.env.DISPATCH_SLOT_COUNT 
    || detectProvidersFromConfig()
    || 17; // 当前已知的 boom provider 数
  return count;
}
```

**变更点**：`DispatchLayer` 构造时 `defaultSlotCount` 改为动态获取，不再硬编码 2。

#### 机制 2：完成→补位闭环（核心！）

```
状态机：
  QUEUED ──dispatch──▶ RUNNING ──complete──▶ DONE
                                    │
                                    ▼
                          释放 slot → 扫描队列 → 有排队任务？
                                                  │
                                    ┌──────YES────┘
                                    ▼
                              立即 dispatch 下一个
                                    │
                                    └────NO───▶ 触发"水位线补充"
```

当前 `markTask()` 方法在状态变更为 done/failed 时释放 slot，但**不会自动 dispatch 下一个**。需要外部调用 `dispatchNext()`。

**修复**：`markTask()` 在释放 slot 后必须自动调用 `dispatchNext()`，并触发水位线检查。

```javascript
// dispatch-layer.js markTask 增强
markTask(taskId, nextStatus, patch = {}, options = {}) {
  // ... 现有逻辑 ...
  
  if (['done', 'failed', 'cancelled'].includes(nextStatus)) {
    // 释放 slot (已有)
    
    // 新增：自动补位
    const dispatchResult = this.dispatchNext(options);
    
    // 新增：水位线检查
    this._checkWaterLevel(state, options);
    
    // 新增：发出事件（通知监控/汇报系统）
    this._emit('task_completed', { taskId, nextStatus, dispatched: dispatchResult.dispatched });
  }
  
  this.save(state);
  return task;
}
```

#### 机制 3：队列水位线（防止空转）

```javascript
const WATER_LEVEL = {
  MIN_QUEUE_DEPTH: 3,        // 队列最少保持 3 个待执行任务
  REFILL_TRIGGER: 'auto',   // 触发方式：auto | manual
  REFILL_SOURCE: 'task_backlog', // 从哪里补充
};

// 新增方法
_checkWaterLevel(state, options) {
  const idleSlots = this.detectIdleSlots(state);
  const queueDepth = state.queue.length;
  
  if (idleSlots.length > 0 && queueDepth < WATER_LEVEL.MIN_QUEUE_DEPTH) {
    // 发出 "需要补充任务" 信号
    this._emit('water_level_low', {
      idleSlotCount: idleSlots.length,
      queueDepth,
      needed: WATER_LEVEL.MIN_QUEUE_DEPTH - queueDepth + idleSlots.length
    });
  }
}
```

**用户侧效果**：当 slot 空闲且队列即将耗尽时，主Agent收到信号，可以：
- 从 backlog 中自动拉取确定性任务
- 提醒用户补充任务
- 触发自动拆分

#### 机制 4：僵尸任务检测与回收

```javascript
const ZOMBIE_THRESHOLDS = {
  WARNING_MINUTES: 15,    // 15分钟无更新 → 告警
  TIMEOUT_MINUTES: 30,    // 30分钟无更新 → 超时回收
  HEARTBEAT_INTERVAL: 5,  // 每5分钟检查一次
};

detectZombies(state) {
  const now = Date.now();
  const zombies = [];
  
  for (const task of state.running) {
    const lastEvent = task.lastHeartbeatAt || task.startedAt;
    const elapsed = (now - new Date(lastEvent).getTime()) / 60000;
    
    if (elapsed >= ZOMBIE_THRESHOLDS.TIMEOUT_MINUTES) {
      zombies.push({ ...task, action: 'reclaim', elapsedMinutes: elapsed });
    } else if (elapsed >= ZOMBIE_THRESHOLDS.WARNING_MINUTES) {
      zombies.push({ ...task, action: 'warn', elapsedMinutes: elapsed });
    }
  }
  
  return zombies;
}

reclaimZombies(options = {}) {
  const state = this.load();
  const zombies = this.detectZombies(state);
  const reclaimed = [];
  
  for (const z of zombies) {
    if (z.action === 'reclaim') {
      this.markTask(z.taskId, 'failed', { 
        error: `Zombie timeout after ${z.elapsedMinutes.toFixed(0)}m` 
      }, options);
      reclaimed.push(z.taskId);
    }
  }
  
  return { zombies, reclaimed };
}
```

#### 机制 5：执行桥接——dispatch-layer ↔ sessions_spawn 集成

这是**当前最大的断层**：dispatch-layer.js 管理的是抽象 slot/task 状态，但实际执行是通过 `sessions_spawn` 调用。两者之间没有任何连接。

```
当前：
  dispatch-layer: slot-1 → taskId: "demo-1" → status: running
  sessions_spawn: 完全独立运行，不知道 dispatch-layer 的存在
  
目标：
  dispatch-layer: slot-1 → taskId: "t1" → sessionKey: "agent:main:subagent:xxx"
                              ↓ 完成
                  auto-announce → markTask("t1", "done") → dispatchNext()
```

**实现路径**：不修改 OpenClaw gateway（约束已声明），而是在主Agent的调度技能中建立映射：

```markdown
## 调度技能执行协议

当调度引擎指示发出任务时，主Agent必须：
1. 调用 sessions_spawn
2. 将返回的 sessionKey 记录到 dispatch-layer state
3. 当 auto-announce 回来时，用 sessionKey 反查 taskId
4. 调用 markTask(taskId, 'done'/'failed')
5. dispatch-layer 自动补位
```

#### 机制 6：优先级队列与抢占

```javascript
// 优先级定义
const PRIORITY_LEVELS = {
  critical: 0,   // 立即抢占最低优先级 slot
  high: 1,       // 排队头部
  normal: 2,     // 正常排队
  low: 3,        // 排队尾部
  background: 4  // 只有全部空闲时才执行
};

// 入队时按优先级插入
enqueue(task, options = {}) {
  // ... 
  const priority = PRIORITY_LEVELS[task.priority] ?? PRIORITY_LEVELS.normal;
  
  // 按优先级插入正确位置
  const insertIdx = state.queue.findIndex(
    q => (PRIORITY_LEVELS[q.priority] ?? 2) > priority
  );
  
  if (insertIdx === -1) {
    state.queue.push(record);
  } else {
    state.queue.splice(insertIdx, 0, record);
  }
  
  // critical 优先级：尝试抢占
  if (task.priority === 'critical') {
    this._preemptLowestPriority(state, record);
  }
  
  // ...
}
```

#### 机制 7：调度心跳（Dispatch Tick Loop）

```javascript
// 定时执行的心跳函数
tickLoop(options = {}) {
  const state = this.ensureSlots(this.load(), options.slotCount);
  
  // 1. 检测并回收僵尸
  const { zombies, reclaimed } = this.reclaimZombies(options);
  
  // 2. 自动补位
  const { dispatched } = this.dispatchNext(options);
  
  // 3. 水位线检查
  this._checkWaterLevel(state, options);
  
  // 4. 利用率计算
  const utilization = this._calculateUtilization(state);
  
  // 5. 生成状态报告
  return {
    timestamp: new Date().toISOString(),
    utilization,
    zombies,
    reclaimed,
    dispatched,
    idleSlots: this.detectIdleSlots(state).map(s => s.slotId),
    queueDepth: state.queue.length,
    runningCount: state.running.length,
    alerts: utilization < 0.5 ? ['LOW_UTILIZATION'] : []
  };
}

_calculateUtilization(state) {
  const totalSlots = Object.keys(state.slots).length;
  const runningSlots = Object.values(state.slots).filter(s => s.status === 'running').length;
  return totalSlots > 0 ? runningSlots / totalSlots : 0;
}
```

---

## 3. 哪些机制必须是默认行为

### 必须默认 ✅（不靠主Agent判断）

| 机制 | 触发条件 | 为什么必须默认 |
|---|---|---|
| 完成→补位 | 任何任务状态变为 done/failed/cancelled | 否则空 slot 等人想起来才用 |
| 僵尸检测 | 每 5 分钟自动扫描 | 否则卡死任务永远占 slot |
| 水位线告警 | queue.length < MIN_QUEUE_DEPTH 且有 idle slot | 否则队列耗尽后空转 |
| 利用率监控 | 每次 tick 计算 | 否则无法发现低利用率 |
| 优先级排序 | 入队时自动插入正确位置 | 否则紧急任务排在末尾 |
| Slot 数与 provider 对齐 | 启动时自动检测 | 否则 17 路资源只用 2 个 slot |

### 需要主Agent判断 🔶（保留人机协作）

| 机制 | 原因 |
|---|---|
| 任务拆分 | 需要理解任务语义 |
| 验收通过/不通过 | 需要质量判断 |
| 优先级设定（除默认 normal） | 需要业务上下文 |
| 队列补充（生成新任务） | 需要知道当前目标 |

### 设计原则

> **"调度层做机械决策，主Agent做语义决策"**
> 
> 调度层负责：何时发、往哪个 slot 发、何时回收、何时告警
> 主Agent负责：发什么、验收标准是什么、下一步做什么

---

## 4. 四维无阻塞调度设计

### 4.1 目标

```
旧任务不停 + 新确定性任务即时入队 + 有空槽立即补位 + 对话不阻塞调度
```

### 4.2 实现：事件驱动 + 异步管道

```
┌─────────────┐
│ 对话流       │──── 用户消息 ──────────────────────────┐
│ (同步响应)   │                                         │
└─────────────┘                                         │
                                                        ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ 任务提取器   │───▶│ 调度队列     │───▶│ Slot 分配器  │
│             │    │ (优先级排序) │    │ (空槽检测)   │
│ 从对话中提取 │    │             │    │             │
│ 确定性任务   │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘
                                           │
                         ┌─────────────────┤
                         ▼                 ▼
                   ┌──────────┐     ┌──────────┐
                   │ slot-1   │     │ slot-17  │
                   │ spawn()  │ ... │ spawn()  │
                   └──────────┘     └──────────┘
                         │                 │
                         ▼                 ▼
                   ┌──────────┐     ┌──────────┐
                   │ 完成回调  │     │ 完成回调  │
                   │ markDone │     │ markDone │
                   └──────────┘     └──────────┘
                         │                 │
                         ▼                 ▼
                   ┌──────────────────────────┐
                   │ 验收队列（异步）           │
                   │ 批量处理，不阻塞调度       │
                   └──────────────────────────┘
```

### 4.3 关键协议

#### 协议 A：对话不阻塞调度

```markdown
## 调度技能规则

当主Agent在与用户对话时：
1. 收到 auto-announce（子Agent完成） → 入验收队列，不中断对话
2. 验收队列在对话间隙批量处理
3. 如果验收通过的任务释放了 slot → 自动补位（调度层自动处理）
4. 主Agent只需在对话间隙检查 dispatch-progress-board
```

#### 协议 B：确定性任务即时入队

```markdown
## 任务入队规则

"确定性任务"定义：
- 目标明确（不需要用户进一步澄清）
- 验收标准可编码
- 不依赖其他正在运行的任务结果

当用户给出包含多个可并行任务的指令时：
1. 主Agent拆分为独立子任务
2. 所有子任务同时入队（enqueue N 次）
3. 调度层按 slot 空闲自动分配
4. 不需要等第一个完成再发第二个
```

#### 协议 C：空槽立即补位

```markdown
## 补位规则（调度层默认行为）

触发条件：任何时候 idle_slot_count > 0 且 queue.length > 0
动作：立即 dispatchNext()
无需等待：不等主Agent确认，不等用户指令

补位顺序：
1. critical 优先级任务
2. high 优先级任务
3. normal 优先级任务（FIFO）
4. low 优先级任务
5. background 任务
```

---

## 5. 防止假并发的机制

### 5.1 假并发的定义

```
假并发 = 名义并发路数 ≠ 实际活跃任务数
```

常见形态：
- 标题写"同时发出 8 路"，实际 5 个已完成、2 个在等待、1 个在跑
- slot 显示 running，但实际 session 已超时/卡死
- 任务太简单，2 分钟内完成，但 slot 直到下一次 tick 才释放

### 5.2 解决方案：三层验真

#### 层 1：Session 存活检测（ground truth）

```javascript
// 每次 tick 时验证 running task 对应的 session 是否存活
async verifyRunningTasks(state) {
  const phantoms = [];
  
  for (const task of state.running) {
    if (!task.sessionKey) {
      phantoms.push({ taskId: task.taskId, reason: 'no_session_key' });
      continue;
    }
    
    // 通过 subagents list 检查 session 状态
    const sessionStatus = await checkSessionAlive(task.sessionKey);
    
    if (sessionStatus === 'completed' || sessionStatus === 'not_found') {
      phantoms.push({ taskId: task.taskId, reason: 'session_dead', sessionStatus });
      // 自动标记为完成/失败
      this.markTask(task.taskId, sessionStatus === 'completed' ? 'done' : 'failed', {
        error: sessionStatus === 'not_found' ? 'Session disappeared' : null
      });
    }
  }
  
  return phantoms;
}
```

#### 层 2：利用率仪表盘（可观测性）

```markdown
## Dispatch Utilization Dashboard

每次 tick 输出：

```
[ 2026-03-06 21:13 ] Dispatch Tick
├── Slots: 17 total │ 12 running │ 2 queued │ 3 idle
├── Utilization: 70.6% (12/17)
├── Queue depth: 2 (below water level 3 ⚠️)
├── Zombies: 0
├── Last 5min completed: 4 tasks
├── Avg task duration: 6m 23s
└── Est. time to drain queue: 3m 12s (need 5+ new tasks)
```
```

#### 层 3：并发度时序追踪

```javascript
// 记录每分钟的实际并发度，防止假并发蒙混
trackConcurrency(state) {
  const datapoint = {
    ts: Date.now(),
    nominal: state.running.length,
    verified: state.running.filter(t => t.lastHeartbeatAt && 
      (Date.now() - new Date(t.lastHeartbeatAt).getTime()) < 5 * 60 * 1000
    ).length,
    idle: this.detectIdleSlots(state).length,
    queued: state.queue.length
  };
  
  // 追加到时序文件
  appendToTimeseries(datapoint);
  
  // 如果 nominal vs verified 差距 > 30%，告警
  if (datapoint.verified / datapoint.nominal < 0.7) {
    this._emit('phantom_concurrency_alert', datapoint);
  }
}
```

### 5.3 强制规则

```markdown
## 防假并发规则（默认强制）

1. 每个 running 任务必须关联一个 sessionKey
2. 没有 sessionKey 的 running 任务在下一次 tick 时自动降级为 failed
3. 利用率低于 50% 持续 10 分钟 → 触发 LOW_UTILIZATION 告警
4. zombie 检测默认开启，15 分钟无心跳 → 告警，30 分钟 → 回收
5. 禁止主Agent在汇报中虚报并发数——必须从 dispatch-progress-board 读取实际值
```

---

## 6. 汇报-调度-验收三者解耦

### 6.1 当前耦合模式（问题）

```
时间线：
t=0   子Agent-1 完成 → auto-announce → 主Agent收到
t=1   主Agent读结果 → 验收判断（消耗 30s-2min 注意力）
t=2   主Agent标记 done → 想下一个任务 → spawn → 回复用户
      ↑ 在 t=0 到 t=2 期间，新完成的 Agent-2、Agent-3 的结果排队等待
      ↑ 空出的 slot 无人补位
      ↑ 用户可能在等回复
```

### 6.2 解耦后模式

```
┌──────────────────────────────────────────────────────────┐
│ 管道 1：调度管道（最高优先级，零延迟）                       │
│                                                          │
│ 任务完成 → markTask(done) → dispatchNext() → spawn()    │
│ 全自动，不等验收，不等汇报                                 │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ 管道 2：验收管道（异步批处理）                               │
│                                                          │
│ 任务完成 → 入验收队列 → 批量验收（每 3-5 个一批）           │
│ 验收不阻塞调度，只可能追加"返工任务"入队列                   │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ 管道 3：汇报管道（定时/按需，最低优先级）                    │
│                                                          │
│ 每 N 分钟 或 用户问 → 从 progress-board 生成摘要          │
│ 汇报不阻塞调度，不阻塞验收                                 │
└──────────────────────────────────────────────────────────┘
```

### 6.3 验收队列设计

```javascript
// 新增：验收队列（独立于调度队列）
const acceptanceQueue = {
  pending: [],      // 待验收任务
  passed: [],       // 已通过
  rework: [],       // 需返工（返工任务自动入调度队列）
  
  enqueue(taskResult) {
    this.pending.push({
      taskId: taskResult.taskId,
      result: taskResult.result,
      receivedAt: new Date().toISOString(),
      autoAcceptable: taskResult.autoAcceptCriteria ? true : false
    });
  },
  
  // 批量验收：一次处理多个
  processBatch(batchSize = 5) {
    const batch = this.pending.splice(0, batchSize);
    const results = [];
    
    for (const item of batch) {
      if (item.autoAcceptable && this._autoAccept(item)) {
        this.passed.push(item);
        results.push({ taskId: item.taskId, verdict: 'auto_passed' });
      } else {
        // 需要主Agent人工验收
        results.push({ taskId: item.taskId, verdict: 'needs_review' });
      }
    }
    
    return results;
  }
};
```

### 6.4 汇报聚合设计

```markdown
## 汇报规则

### 自动汇报触发条件（不等用户问）
- 所有 slot 首次满载时，汇报一次
- 利用率从 >70% 跌到 <30% 时，汇报一次（可能有批量完成）
- 每 15 分钟如果有任务完成/失败，汇报一次

### 汇报格式（精简版，不展开细节）
```
📊 调度状态 [21:13]
Running: 14/17 | Queue: 5 | Done(15min): 6 | Failed: 1
⚠️ 低水位线：需补充 3+ 任务
```

### 详细汇报（用户主动问或按需）
使用 multi-agent-reporting 技能的 dashboard 格式
```

---

## 7. 可实验版设计

### 7.1 实验目标

验证假设：**通过调度层优化，相同时间内完成的任务数可提升 3-5x**

### 7.2 实验设计

```markdown
## A/B 对照实验

### A 组（当前基线）
- 主Agent手动判断何时发任务
- 手动判断何时补位
- 串行汇报-验收-调度
- 记录：30分钟内完成的独立任务数

### B 组（优化后）
- dispatch-layer v2 管理 17 slots
- 自动补位 + 水位线 + 僵尸检测
- 异步验收 + 批量汇报
- 记录：30分钟内完成的独立任务数

### 控制变量
- 使用相同的 10 个预定义任务（难度可控）
- 相同的 model (boom/gpt-5.4)
- 相同的主Agent
- 不计入用户交互时间
```

### 7.3 验收指标

| 指标 | 基线（当前） | 目标（优化后） | 测量方式 |
|---|---|---|---|
| Slot 利用率 | ~10-15% | ≥ 70% | running_slots / total_slots 时间加权 |
| 30分钟任务完成数 | 3-5 个 | 15-20 个 | dispatch-layer history 计数 |
| 平均空 slot 等待时间 | 5-10 分钟 | < 30 秒 | 从 slot 变 idle 到下一次 dispatch 的时间 |
| 僵尸任务数 | 未知（无检测） | 0（自动回收） | zombie 检测日志 |
| 汇报延迟 | 每次完成都阻塞 | 批量/定时，不阻塞 | 汇报间调度是否暂停 |
| 假并发率 | 高（无检测） | < 5% | nominal vs verified concurrency |

### 7.4 最小可实验版（MVP）

```markdown
## MVP 范围（不改 gateway，只改 workspace 层）

1. 修改 dispatch-layer.js：slotCount 改为 17
2. 增加 markTask 自动补位
3. 增加 zombie 检测
4. 增加利用率计算
5. 写一个 dispatch-skill.md 技能文件，定义主Agent调度协议
6. 准备 10 个标准化测试任务
7. 跑 30 分钟对照实验
```

---

## 8. 当前版本 → 优化后版本对照

| 维度 | 当前版本 | 优化后版本 |
|---|---|---|
| **Slot 数** | 硬编码 2 | 动态检测，默认 17 |
| **补位方式** | 手动调用 dispatchNext | markTask 自动触发 |
| **僵尸检测** | 无 | 每 5 分钟自动扫描，30分钟回收 |
| **水位线** | 无（队列经常为空） | queue < 3 时告警 |
| **优先级** | 只有 normal | critical/high/normal/low/background |
| **抢占** | 无 | critical 可抢占最低优先级 slot |
| **session 关联** | 无（dispatch-layer 不知道 session） | taskId ↔ sessionKey 双向映射 |
| **假并发检测** | 无 | nominal vs verified 比对 + 告警 |
| **验收流程** | 串行阻塞 | 异步队列 + 批量处理 |
| **汇报** | 每次完成都汇报（阻塞） | 定时聚合 + 按需详情 |
| **利用率可观测** | 无 | 每次 tick 计算 + 时序追踪 |
| **状态持久化** | JSON 文件，无锁 | JSON 文件 + 简单文件锁 |
| **对话阻塞调度** | 是 | 否（三管道分离） |

---

## 9. dispatch-layer.js 缺口点名

### 必须补的缺口（阻塞优化目标）

| # | 缺口 | 当前状态 | 优先级 |
|---|---|---|---|
| 1 | `defaultSlotCount` 硬编码为 2 | 阻塞 | **P0** |
| 2 | `markTask()` 不自动调用 `dispatchNext()` | 阻塞 | **P0** |
| 3 | 无 `sessionKey` 字段关联 sessions_spawn | 缺失 | **P0** |
| 4 | 无僵尸检测方法 | 缺失 | **P0** |
| 5 | 无利用率计算方法 | 缺失 | **P1** |
| 6 | 无水位线检查 | 缺失 | **P1** |
| 7 | 无优先级排序逻辑 | 缺失 | **P1** |
| 8 | 无文件锁（跨进程安全） | 缺失 | **P2** |
| 9 | 无事件发射（emit）接口 | 缺失 | **P2** |
| 10 | 无并发度时序追踪 | 缺失 | **P2** |

### dispatch-layer.js 不缺但现有实现已具备的

| 能力 | 状态 |
|---|---|
| 基本状态机 (queued→running→done/failed/cancelled) | ✅ |
| enqueue / dispatchNext / markTask | ✅ |
| progress board 生成 | ✅ |
| CLI 入口 | ✅ |
| 与 dispatcher.js 集成 | ✅ |

---

## 10. 调度技能（Dispatch Skill）设计

除了 dispatch-layer.js 的代码改进，还需要一个**调度技能文件**来规范主Agent行为。

### 文件：`skills/dispatch/SKILL.md`

```markdown
---
name: dispatch
description: 多Agent并行调度管理——自动补位、水位线、僵尸检测、异步验收
version: 2.0.0
---

# 调度技能 v2

## 核心原则
1. 先发后议——有确定性任务立即入队，不等讨论完
2. 空槽零容忍——任何 idle slot 存在超过 30 秒必须有行动
3. 调度不等验收——验收失败产生返工任务重新入队
4. 汇报不阻塞——定时聚合，不逐个汇报

## 调度循环（主Agent必须执行）

每次主Agent获得注意力时（收到消息、heartbeat、auto-announce）：

### Step 1: Tick
读取 dispatch-progress-board.json，了解当前状态

### Step 2: 补位
如果 idle_slots > 0 且 queue.length > 0 → 调度层已自动处理
如果 idle_slots > 0 且 queue.length == 0 → 主Agent需要生成新任务或从 backlog 拉取

### Step 3: 验收（批量）
如果验收队列有 pending 项 → 批量验收（3-5个一批）
通过 → 标记 passed
不通过 → 生成返工任务入队

### Step 4: 汇报（按需）
用户问了 → 输出 dashboard
定时器到了 → 输出精简状态行
什么都没问 → 不汇报

## 默认行为清单

| 行为 | 触发条件 | 动作 |
|---|---|---|
| 自动补位 | slot idle + queue non-empty | dispatchNext() |
| 僵尸告警 | running task 15min 无更新 | 告警 |
| 僵尸回收 | running task 30min 无更新 | markTask(failed) |
| 水位线告警 | queue < 3 + idle slots | 提醒补充任务 |
| 利用率告警 | utilization < 50% 持续 10min | 告警 |

## 任务发出模板

sessions_spawn 调用时必须：
1. 设置 label 为 taskId（用于反查）
2. 设置 runTimeoutSeconds（防止无限运行）
3. 任务描述中包含验收标准
4. 记录 sessionKey → taskId 映射

## 禁止行为

1. 禁止在对话中逐个汇报每个子Agent结果（用 dashboard）
2. 禁止等验收完再发下一批（验收和调度并行）
3. 禁止手动计算并发数（从 progress-board 读）
4. 禁止空 slot 存在超过 2 分钟不作为（必须补位或说明原因）
```

---

## 11. 24 小时内可落地优化清单

### 第一阶段：0-4 小时（核心代码修改）

- [ ] **修改 dispatch-layer.js `defaultSlotCount`**：从 2 改为 17（或从环境变量读取）
- [ ] **修改 `markTask()`**：在释放 slot 后自动调用 `dispatchNext()`
- [ ] **新增 `detectZombies()` 方法**：15 分钟告警，30 分钟回收
- [ ] **新增 `_calculateUtilization()` 方法**
- [ ] **新增 `tickLoop()` 方法**：整合僵尸检测 + 补位 + 利用率 + 水位线
- [ ] **task 记录增加 `sessionKey` 字段**
- [ ] **更新测试 `dispatch-layer.test.js`**：覆盖新增方法

### 第二阶段：4-8 小时（技能与协议）

- [ ] **创建 `skills/dispatch/SKILL.md`**：完整调度技能定义
- [ ] **创建 `skills/dispatch/config.json`**：可调参数（slot 数、zombie 阈值、水位线等）
- [ ] **修改 multi-agent-reporting 集成**：dashboard 增加利用率和僵尸显示
- [ ] **创建 `infrastructure/dispatcher/acceptance-queue.js`**：验收队列独立模块
- [ ] **更新 dispatch-layer-cli.js**：支持 `zombie`、`utilization`、`waterLevel` 子命令

### 第三阶段：8-16 小时（集成与验证）

- [ ] **准备 10 个标准化测试任务**：定义在 `tests/fixtures/standard-tasks.json`
- [ ] **跑基线实验**：当前模式，30 分钟，记录完成任务数和利用率
- [ ] **跑优化后实验**：新模式，30 分钟，记录完成任务数和利用率
- [ ] **编写实验报告**：A/B 对照，量化改进幅度

### 第四阶段：16-24 小时（打磨与文档）

- [ ] **修复实验中发现的问题**
- [ ] **优化 progress-board 输出格式**：增加利用率、僵尸、水位线信息
- [ ] **写操作手册**：主Agent如何使用新调度技能
- [ ] **配置 heartbeat 集成**：在 HEARTBEAT.md 中加入调度 tick 检查

---

## 12. 风险与约束

| 风险 | 缓解措施 |
|---|---|
| 17 路并发可能超出 boom API rate limit | 按 provider 独立计数，单 provider 不超过 1 并发 |
| JSON 文件锁竞争 | 短期用 rename-based 原子写入；中期考虑 SQLite |
| 主Agent上下文窗口被 17 路 auto-announce 淹没 | 批量聚合，不逐个处理 |
| 任务质量因并发过多而下降 | 验收门禁 + 返工机制 |
| 实验结果不如预期 | 渐进式增加并发度（2→8→14→17），找到甜点 |

---

## 13. 总结

当前系统的核心矛盾：**17 路资源的供给侧 vs 2 slot + 手动调度的需求侧**。

优化的核心不是写更多代码，而是：
1. **把 slot 数对齐到资源数**（1 行代码改动，效果翻 8x）
2. **让完成→补位成为默认行为**（5 行代码改动，消除人工延迟）
3. **把汇报-调度-验收解耦**（架构层改动，消除串行瓶颈）
4. **用数据说话**（利用率监控，防止假并发）

这不是一个大型重构——而是一组外科手术式的精准优化，每一个都可以独立落地、独立验证。

---

*文档生成时间：2026-03-06 21:13 GMT+8*
*作者：系统架构师 (researcher)*
*状态：可执行方案，待用户验证后分批落地*
