# 全系统闭环修复工程方案

> **版本**: 1.0.0  
> **日期**: 2026-03-03  
> **作者**: 系统架构师 (researcher)  
> **基于**: 三份系统诊断报告 + 两份参考文档评审

---

## TL;DR

1. **系统当前处于"Agent人肉编排"模式**——所有闭环都依赖Agent读取SKILL.md后手动执行，DTO核心因`construdtor`拼写错误完全瘫痪，6个Cron任务持续失败白烧Token。
2. **核心改造是建立一条"信号→调度→执行→评测→反馈"的自动化管道**，用OpenClaw原生能力（cron + sessions_spawn + JSONL事件队列）替代文件扫描式通信，不引入外部基础设施。
3. **分四阶段推进**：P0止血修bug（1-2天）→ P1跑通一条最小闭环（3-5天）→ P2补全所有闭环（1-2周）→ P3实现自主进化（2-4周），每阶段结束有端到端验收场景。
4. **保留复用**AEO双轨评测、ISC 78条规则、向量化服务、SEEF 7个Python子技能、parallel-subagent；**重建**模块间通信机制、事件调度器、状态追踪。
5. **两份参考文档的核心问题**：过度关注SEEF内部重构，忽视了DTO致命bug和系统级通信断裂——修好DTO和建立事件总线比重写SEEF子技能优先级高10倍。

---

## 一、当前系统状态总览

### 1.1 模块健康度矩阵

| 模块 | 代码成熟度 | 可独立运行 | 闭环完整性 | 最大障碍 |
|:-----|:----------:|:----------:|:----------:|:---------|
| ISC (78规则) | ⬛⬛⬛⬛⬜ 80% | ⚠️ 部分 | 60% | 规则是声明式JSON，执行依赖Agent |
| DTO (调度中枢) | ⬛⬛⬛⬜⬜ 60% | ❌ 不可运行 | 0% | **`construdtor`致命拼写错误** |
| SEEF (7子技能) | ⬛⬛⬛⬛⬜ 75% | ⚠️ 部分 | 50% | ISC校验返回模拟值，JS/Python双轨 |
| AEO (双轨评测) | ⬛⬛⬛⬛⬛ 90% | ✅ 可运行 | 60% | DTO信号依赖文件系统 |
| CRAS (学习引擎) | ⬛⬛⬜⬜⬜ 40% | ⚠️ 部分 | 30% | 核心crawlSource()返回模拟数据 |
| LEP (韧性执行) | ⬛⬛⬛⬜⬜ 65% | ⚠️ 部分 | 55% | DTO集成被注释，路径硬编码 |
| 向量化 | ⬛⬛⬛⬛⬜ 80% | ✅ 可运行 | 80% | 文件系统存储，非向量数据库 |
| Cron任务(27个) | — | — | — | 6个失效，24个用Opus模型（严重浪费） |

### 1.2 三大根本性问题

```
┌──────────────────────────────────────────────────────────────────────┐
│  问题1: DTO瘫痪                                                      │
│  construdtor → constructor 拼写错误，4处                               │
│  影响: 整个调度中枢无法实例化，所有编排能力归零                          │
├──────────────────────────────────────────────────────────────────────┤
│  问题2: 模块间通信全部是文件扫描                                       │
│  ISC→DTO: 文件扫描   DTO→AEO: .dto-signals文件                       │
│  SEEF→DTO: events/文件  DTO→SEEF: 未实现                             │
│  真实代码级调用(require)仅2条: LEP→parallel-subagent, ISC→DTO订阅目录  │
├──────────────────────────────────────────────────────────────────────┤
│  问题3: 无常驻进程                                                    │
│  所有模块都是"被调用型"，Agent在会话中手动触发                          │
│  等同于: Agent是人肉编排器，代码只是Agent的工具                         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 二、关键技术决策（5项明确方案）

### 决策1：模块间通信 —— JSONL事件队列 + Cron调度 + sessions_spawn执行

**方案**：不引入Redis/MQ，用OpenClaw原生能力构建轻量事件总线。

```
┌─────────────────────────────────────────────────────────────────┐
│                   事件总线架构（OpenClaw原生）                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐   append   ┌──────────────────┐   read+dispatch  │
│  │ 任意模块  │──────────▶│ events/bus.jsonl  │◀──────────────── │
│  │ (生产者)  │           │ (追加写入)         │    ┌──────────┐ │
│  └──────────┘            └──────────────────┘    │  事件调度器 │ │
│                                                   │ (Cron 5min)│ │
│  事件格式:                                        └─────┬──────┘ │
│  {"id":"e001","type":"isc.rule.updated",                │       │
│   "source":"isc","payload":{...},                       │       │
│   "ts":"2026-03-03T04:00:00Z"}                          ▼       │
│                                                  sessions_spawn │
│                                                  (执行目标模块) │
└─────────────────────────────────────────────────────────────────┘
```

**为什么选这个**：
- ✅ 零外部依赖，JSONL文件即消息队列
- ✅ Cron调度器已是OpenClaw一等公民，5分钟粒度够用
- ✅ sessions_spawn提供隔离执行环境
- ✅ 天然持久化（文件系统），重启不丢事件
- ❌ 不适合毫秒级实时场景（但当前系统根本不需要）

**关键组件**：
- `infrastructure/event-bus/bus.js`：事件生产者SDK（write()方法追加JSONL）
- `infrastructure/event-bus/dispatcher.js`：事件消费者（Cron触发，读取未处理事件，dispatch到对应处理器）
- `infrastructure/event-bus/pointer.json`：已处理事件的偏移量指针

### 决策2：ISC规则变更→自动触发DTO同步 —— 文件监听 + 事件发布

**方案**：ISC规则文件变更 → isc-file-watcher写入事件总线 → 调度器触发DTO alignment-engine。

```
ISC规则目录变更
       │
       ▼ (isc-file-watcher.js，已存在，改造为事件生产者)
写入 events/bus.jsonl: {"type":"isc.rule.changed","payload":{"ruleId":"N036",...}}
       │
       ▼ (Cron 5min调度器读取)
dispatcher 识别 type=isc.rule.changed
       │
       ▼ (sessions_spawn)
执行 isc-dto-alignment-engine.js --rule N036
       │
       ▼ (alignment-engine已存在)
更新 DTO subscriptions/ 目录
```

**为什么不用chokidar/inotify常驻进程**：
- OpenClaw环境中常驻进程的生命周期管理复杂（需要systemd/pm2）
- Cron 5分钟延迟对ISC规则变更场景完全可接受（规则不会每分钟变）
- 减少运维负担

### 决策3：流水线状态管理 —— JSONL状态日志 + 状态快照文件

**方案**：每个流水线运行实例有唯一ID，状态变更追加写入JSONL。

```json
// infrastructure/pipeline-state/runs/run-20260303-001.jsonl
{"stage":"init","status":"started","ts":"2026-03-03T04:00:00Z","runId":"run-20260303-001"}
{"stage":"isc-check","status":"passed","ts":"2026-03-03T04:00:01Z","data":{"ruleId":"N036"}}
{"stage":"dto-trigger","status":"completed","ts":"2026-03-03T04:00:03Z"}
{"stage":"seef-evaluate","status":"running","ts":"2026-03-03T04:00:05Z"}
{"stage":"seef-evaluate","status":"completed","ts":"2026-03-03T04:00:15Z","data":{"score":0.82}}
{"stage":"aeo-assess","status":"completed","ts":"2026-03-03T04:00:25Z","data":{"track":"ai-effect","score":0.88}}
{"stage":"feedback","status":"completed","ts":"2026-03-03T04:00:30Z"}
```

```json
// infrastructure/pipeline-state/current.json（状态快照，可被任意模块读取）
{
  "lastRun": "run-20260303-001",
  "lastStatus": "completed",
  "lastTimestamp": "2026-03-03T04:00:30Z",
  "totalRuns": 42,
  "successRate": 0.88,
  "activeRuns": []
}
```

**为什么不用SQLite**：
- JSONL在Agent环境中最容易调试（cat/grep即可）
- 无需额外依赖安装
- 状态日志量不大（每天几十到几百条），性能不是瓶颈

### 决策4：错误恢复 —— 三级降级策略

**方案**：

| 级别 | 条件 | 动作 |
|:-----|:-----|:-----|
| L1 自动重试 | 瞬时错误（超时、网络） | 最多重试2次，指数退避(5s, 15s) |
| L2 降级执行 | 依赖模块不可用 | 跳过非关键步骤，标记待补偿 |
| L3 人工介入 | 连续失败≥3次 或 数据不一致 | 写入告警队列，飞书通知 |

```javascript
// infrastructure/resilience/retry-wrapper.js
async function withResilience(fn, options = {}) {
  const { maxRetries = 2, degradeFn = null, alertChannel = null } = options;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i < maxRetries) {
        await sleep(5000 * Math.pow(3, i)); // 5s, 15s
        continue;
      }
      // 重试耗尽
      if (degradeFn) {
        console.warn(`[DEGRADE] ${err.message}, falling back`);
        return await degradeFn();
      }
      // 人工介入
      await writeAlert({ error: err.message, module: options.module });
      throw err;
    }
  }
}
```

**复用LEP已有能力**：LEP的CircuitBreaker和RetryPolicy在P2阶段统一接管，P0/P1先用轻量wrapper。

### 决策5：可观测性 —— 心跳文件 + 日报生成

**方案**：每个关键模块/Cron执行后写入心跳文件，每日生成系统健康日报。

```json
// infrastructure/observability/heartbeats.json
{
  "event-dispatcher": { "lastRun": "2026-03-03T04:00:00Z", "status": "ok", "eventsProcessed": 5 },
  "isc-watcher": { "lastRun": "2026-03-03T03:55:00Z", "status": "ok", "rulesChecked": 78 },
  "dto-orchestrator": { "lastRun": "2026-03-03T04:00:00Z", "status": "ok", "tasksScheduled": 3 },
  "aeo-bridge": { "lastRun": "2026-03-03T03:30:00Z", "status": "ok", "evaluationsRun": 1 },
  "vectorize": { "lastRun": "2026-03-03T02:00:00Z", "status": "ok", "filesProcessed": 3 }
}
```

**健康判定规则**：
- 🟢 healthy: lastRun在预期频率内 且 status=ok
- 🟡 warning: lastRun超过预期频率的2倍 或 status=degraded
- 🔴 critical: lastRun超过预期频率的5倍 或 status=error 或 连续失败≥3

**日报Cron**（每日09:00）：读取heartbeats.json + pipeline-state/current.json，生成markdown日报，飞书推送。

---

## 三、P0：止血（1-2天）

### 目标
> 修复致命bug让代码能跑，清除持续失败的Cron浪费，消除硬编码单点故障。P0结束后：DTO可以实例化，所有Cron任务要么正常运行要么被正确禁用。

### 甘特图

```
Day 1                              Day 2
┌──────────────────────────────┐  ┌──────────────────────────────┐
│ T0.1 DTO construdtor修复     │  │ T0.4 硬编码路径TOP5修复       │
│ ████████ (2h)                │  │ ████████████ (3h)            │
│                              │  │                              │
│ T0.2 Cron失效任务修复/禁用   │  │ T0.5 paths-center实现        │
│ ████████████████ (4h)        │  │ ████████ (2h)                │
│                              │  │                              │
│ T0.3 Cron模型降级            │  │ T0.6 P0验收测试              │
│ ████████ (2h)                │  │ ████ (1h)                    │
└──────────────────────────────┘  └──────────────────────────────┘

依赖: T0.1→T0.6  T0.2→T0.6  T0.3可并行  T0.4→T0.5  T0.5→T0.6
并行: [T0.1, T0.2, T0.3] 可同时开始; [T0.4, T0.5] Day2同时开始
```

### 任务清单

#### T0.1 DTO construdtor拼写修复
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | dto-core |
| 输入 | `dto-core/index.js:25`, `platform-v3.js:7,145,176` |
| 输出 | 4处 `construdtor` → `constructor` |
| 验收标准 | `node -e "const DTO = require('./skills/dto-core'); const d = new DTO.DTOPlatform(); console.log(d.tasks !== undefined)"` 输出 `true` |
| 预估工时 | 0.5h（改4行代码+验证） |
| 风险 | 极低——纯拼写修复 |

#### T0.2 Cron失效任务修复/禁用
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | openclaw cron |
| 输入 | 诊断报告Part 2 C2节6个失效任务 |
| 操作明细 | 见下表 |

| Cron任务 | 操作 | 具体动作 |
|:---------|:-----|:---------|
| CRAS-A-主动学习引擎 | 修复 | 增加timeout到1200s；移除cron环境下不可用的kimi_search依赖，改为离线学习模式 |
| System-Monitor-健康检查 | 修复 | 路径 `/root/.openclaw/skills/` → `/root/.openclaw/workspace/skills/` |
| Elite-Memory-记忆整理 | 禁用 | 技能已删除，`enabled: false` |
| LEP-韧性日报 | 修复 | `glm-5` → `kimi-coding/k2p5`（或当前可用模型） |
| 全局自主决策流水线 | 修复 | 设置 `delivery.to` 为主Agent通道，或改为 `mode: "none"` |
| EvoMap-Evolver-自动进化 | 禁用 | `run.sh`不存在，`enabled: false`；待P2重建evolver入口 |

| 验收标准 | 所有enabled=true的Cron任务单次运行不报错（`openclaw cron run <name>` 测试） |
| 预估工时 | 3h |

#### T0.3 Cron模型降级
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | openclaw cron |
| 输入 | 27个Cron任务，24个使用 `claude-opus-4-6-thinking` |
| 输出 | 脚本执行类任务降级为轻量模型 |
| 操作 | 以下任务改用 `kimi-coding/k2p5` 或 `claude-sonnet`：备份脚本(2个)、System-Monitor(2个)、飞书备份、向量化、系统维护、会话清理、Gateway监控 |
| 验收标准 | 仅需要推理的任务保留opus（CRAS洞察、ISC审计、N023评测标准生成、PDCA引擎、流水线恢复）；其余降级 |
| 预估工时 | 1.5h |

#### T0.4 硬编码路径TOP5修复
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | 全局 |
| 输入 | 诊断报告Part 2 B1节40+处硬编码 |
| 优先修复 | 影响运行的5处关键硬编码（非全部） |

| 文件 | 硬编码 | 修复 |
|:-----|:-------|:-----|
| `lep-executor/src/daily-report-glm5.js` | `/root/.openclaw/.secrets/zhipu-keys.env`（文件不存在） | 改用 `process.env.ZHIPU_API_KEY` 或从OpenClaw secrets读取 |
| `lep-executor/src/daily-report-glm5.js` | `glm-5` 模型 | 改为配置读取 `process.env.DAILY_REPORT_MODEL \|\| 'kimi-coding/k2p5'` |
| `system-monitor/index.js` | 3处绝对路径 | 改为相对于 `__dirname` 的路径 |
| `isc-core/bin/isc-rule-created-hook.sh` | 4处绝对路径 | 使用 `WORKSPACE_ROOT` 环境变量 |
| `parallel-subagent/index.js` | `kimi-coding/k2p5` 硬编码 | 改为 `process.env.DEFAULT_CODING_MODEL \|\| 'kimi-coding/k2p5'` |

| 验收标准 | 修改后的5个文件可正常执行（不因路径/模型/secrets找不到而报错） |
| 预估工时 | 2h |

#### T0.5 paths-center最小实现
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | paths-center（当前空壳） |
| 输入 | 各模块散落的路径常量 |
| 输出 | `skills/paths-center/index.js`——统一路径配置中心 |

```javascript
// skills/paths-center/index.js — 最小实现
const path = require('path');
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || '/root/.openclaw/workspace';

module.exports = {
  WORKSPACE,
  SKILLS: path.join(WORKSPACE, 'skills'),
  ISC_RULES: path.join(WORKSPACE, 'skills/isc-core/rules'),
  ISC_STANDARDS: path.join(WORKSPACE, 'skills/isc-core/standards'),
  DTO_SUBSCRIPTIONS: path.join(WORKSPACE, 'skills/dto-core/subscriptions'),
  DTO_SIGNALS: path.join(WORKSPACE, '.dto-signals'),
  EVENTS_BUS: path.join(WORKSPACE, 'infrastructure/event-bus/bus.jsonl'),
  PIPELINE_STATE: path.join(WORKSPACE, 'infrastructure/pipeline-state'),
  VECTORS: path.join(WORKSPACE, 'vectors'),
  CRAS_REPORTS: path.join(WORKSPACE, 'skills/cras/reports'),
  AEO_EVALUATION_SETS: path.join(WORKSPACE, 'skills/aeo/unified-evaluation-sets'),
  SEEF_SUBSKILLS: path.join(WORKSPACE, 'skills/seef/subskills'),
  HEARTBEATS: path.join(WORKSPACE, 'infrastructure/observability/heartbeats.json'),
};
```

| 验收标准 | `node -e "const p = require('./skills/paths-center'); console.log(p.WORKSPACE)"` 输出正确路径 |
| 预估工时 | 1h |

#### T0.6 P0验收测试
| 项目 | 内容 |
|:-----|:-----|
| 验收场景 | 以下全部通过即P0完成 |

```bash
# 1. DTO可实例化
node -e "const {DTOPlatform} = require('./skills/dto-core'); const d = new DTOPlatform(); console.log('DTO OK:', typeof d.registerTask === 'function')"
# 预期: DTO OK: true

# 2. 无连续失败的Cron
openclaw cron list | grep -c 'consecutiveErrors.*[3-9]'
# 预期: 0

# 3. paths-center可用
node -e "const p = require('./skills/paths-center'); console.log(Object.keys(p).length >= 10)"
# 预期: true

# 4. LEP日报模型可用（不报403）
node -e "const m = process.env.DAILY_REPORT_MODEL || 'kimi-coding/k2p5'; console.log('Model:', m)"
# 预期: 非glm-5的模型名
```

---

## 四、P1：最小闭环（3-5天）

### 目标
> 实现一条端到端的最小自动化闭环：ISC规则变更 → 事件总线 → DTO触发 → SEEF evaluator执行 → AEO评测 → 结果写入状态日志 → 飞书通知。选择**最简单的场景**：对`weather`技能执行一次评估闭环。

### 为什么选weather技能？
- weather技能结构简单（单文件），评测集已存在
- AEO unified-evaluation-sets已有weather的评测集（golden级别）
- 评估结果容易人工验证（天气API调用成功/失败）
- 风险最低：失败不影响任何核心功能

### 甘特图

```
Day 3              Day 4              Day 5              Day 6              Day 7
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│T1.1 事件总线  │  │              │  │T1.4 SEEF     │  │T1.5 AEO桥接  │  │T1.7 端到端   │
│基础设施       │  │T1.2 事件调度 │  │evaluator     │  │真实化        │  │集成测试      │
│████████(4h)  │  │器+Cron注册   │  │ISC校验真实化 │  │████████(3h)  │  │████████(4h)  │
│              │  │████████(4h)  │  │████████(4h)  │  │              │  │              │
│T1.3 DTO最小  │  │              │  │              │  │T1.6 状态追踪 │  │              │
│调度器改造    │  │              │  │              │  │+心跳         │  │              │
│████████(4h)  │  │              │  │              │  │████████(3h)  │  │              │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘

依赖链: T1.1 → T1.2 → T1.7
并行组: [T1.1, T1.3] → [T1.2] → [T1.4, T1.5, T1.6] → T1.7
```

### 任务清单

#### T1.1 事件总线基础设施
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | 新建 `infrastructure/event-bus/` |
| 输入 | 决策1的设计方案 |
| 输出 | `bus.js`(生产者SDK)、`dispatcher.js`(消费者)、`pointer.json`(偏移量) |

**bus.js核心接口**：
```javascript
const EventBus = {
  // 发布事件（追加JSONL）
  async publish(type, source, payload) {
    const event = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      type,      // e.g. "isc.rule.changed", "seef.evaluation.completed"
      source,    // e.g. "isc-watcher", "seef-evaluator"
      payload,
      ts: new Date().toISOString()
    };
    fs.appendFileSync(EVENTS_PATH, JSON.stringify(event) + '\n');
    return event.id;
  },
  
  // 读取未处理事件
  async readUnprocessed() {
    const pointer = JSON.parse(fs.readFileSync(POINTER_PATH));
    const lines = fs.readFileSync(EVENTS_PATH, 'utf8').split('\n').filter(Boolean);
    return lines.slice(pointer.offset).map(JSON.parse);
  },
  
  // 更新偏移量
  async ack(count) {
    const pointer = JSON.parse(fs.readFileSync(POINTER_PATH));
    pointer.offset += count;
    pointer.lastAck = new Date().toISOString();
    fs.writeFileSync(POINTER_PATH, JSON.stringify(pointer, null, 2));
  }
};
```

| 验收标准 | 1) publish写入JSONL成功 2) readUnprocessed返回未处理事件 3) ack更新偏移量 |
| 预估工时 | 3h |

#### T1.2 事件调度器 + Cron注册
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | 新建 `infrastructure/event-bus/dispatcher.js` |
| 输入 | bus.jsonl中的未处理事件 |
| 输出 | 根据事件类型dispatch到对应处理器 |

**dispatcher.js核心逻辑**：
```javascript
// 事件路由表
const ROUTES = {
  'isc.rule.changed': {
    handler: 'isc-dto-alignment-engine',
    script: 'skills/isc-core/core/isc-dto-alignment-engine.js',
    args: ['--rule', '${payload.ruleId}']
  },
  'dto.task.triggered': {
    handler: 'seef-evaluator',
    script: 'skills/seef/subskills/evaluator.py',
    args: ['${payload.skillPath}']
  },
  'seef.evaluation.completed': {
    handler: 'aeo-bridge',
    script: 'skills/aeo/src/core/aeo-dto-bridge.cjs',
    args: ['--evaluate', '${payload.skillId}']
  },
  'aeo.assessment.completed': {
    handler: 'feedback-recorder',
    script: 'infrastructure/pipeline-state/record.js',
    args: ['--run', '${payload.runId}']
  }
};

async function dispatch() {
  const events = await EventBus.readUnprocessed();
  if (events.length === 0) return;
  
  for (const event of events) {
    const route = ROUTES[event.type];
    if (!route) { console.warn(`No route for: ${event.type}`); continue; }
    
    try {
      // 用sessions_spawn或child_process执行
      await executeHandler(route, event);
      updateHeartbeat('event-dispatcher', 'ok');
    } catch (err) {
      await withResilience(() => executeHandler(route, event), {
        maxRetries: 2, module: 'dispatcher'
      });
    }
  }
  
  await EventBus.ack(events.length);
}
```

**Cron注册**：`openclaw cron add` 添加"事件调度器"任务，每5分钟执行一次 `dispatcher.js`。

| 验收标准 | 1) 手动写入一条事件到bus.jsonl 2) 运行dispatcher 3) 事件被正确dispatch且偏移量更新 |
| 预估工时 | 4h |

#### T1.3 DTO最小调度器改造
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | dto-core |
| 输入 | P0修复后的DTOPlatform |
| 输出 | DTO能接收ISC对齐事件后，发布dto.task.triggered事件到事件总线 |

**最小改造**：不重写DTO，只在现有代码基础上：
1. `isc-dto-alignment-engine.js` 执行完毕后，调用 `EventBus.publish('dto.task.triggered', 'dto', { skillId, skillPath })` 
2. `global-auto-decision-pipeline.js` 中的变更检测逻辑保留，但输出改为写入事件总线而非直接执行

| 验收标准 | ISC规则变更 → DTO收到对齐通知 → DTO发布task.triggered事件到bus.jsonl |
| 预估工时 | 3h |

#### T1.4 SEEF evaluator ISC校验真实化
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | seef/subskills/evaluator.py |
| 输入 | 当前返回模拟值的 `_check_standard_compliance()` |
| 输出 | 真正读取ISC规则文件进行校验 |

**改造范围**：
```python
# 改造前（模拟值）
def _check_standard_compliance(self):
    return {'status': 'passed', 'compliance_score': 0.85}

# 改造后（真实校验）
def _check_standard_compliance(self, skill_path):
    isc_rules_dir = os.environ.get('ISC_RULES_DIR', 
        '/root/.openclaw/workspace/skills/isc-core/rules')
    
    # 1. 检查SKILL.md是否存在
    has_skillmd = os.path.exists(os.path.join(skill_path, 'SKILL.md'))
    
    # 2. 检查命名规范（ISC命名规则）
    skill_name = os.path.basename(skill_path)
    naming_valid = bool(re.match(r'^[a-z][a-z0-9-]*$', skill_name))
    
    # 3. 检查必要文件（根据ISC creation-gate-001规则）
    gate_rule = self._load_rule('rule.isc-creation-gate-001.json')
    required_files = gate_rule.get('required_files', ['SKILL.md'])
    files_present = sum(1 for f in required_files 
                       if os.path.exists(os.path.join(skill_path, f)))
    
    score = (0.4 * has_skillmd + 0.3 * naming_valid + 
             0.3 * (files_present / max(len(required_files), 1)))
    
    return {
        'status': 'passed' if score >= 0.7 else 'failed',
        'compliance_score': round(score, 2),
        'details': {
            'has_skillmd': has_skillmd,
            'naming_valid': naming_valid,
            'files_present': files_present,
            'files_required': len(required_files)
        }
    }
```

**同时改造evaluator输出**：执行完成后调用EventBus发布事件（通过子进程调用bus.js或直接写JSONL）。

| 验收标准 | 1) `python3 evaluator.py /path/to/weather` 返回真实ISC校验分数 2) 完成后bus.jsonl中出现seef.evaluation.completed事件 |
| 预估工时 | 4h |

#### T1.5 AEO-DTO桥接真实化
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | aeo/src/core/aeo-dto-bridge.cjs |
| 输入 | 当前依赖`.dto-signals/`文件的subscribe逻辑 |
| 输出 | 改为从事件总线读取seef.evaluation.completed事件，触发AEO评测 |

**最小改造**：
- `aeo-dto-bridge.cjs`的输入源从文件信号改为接收dispatcher传入的事件参数
- 执行完AEO评测后，发布`aeo.assessment.completed`事件到事件总线
- 保留现有的双轨选择器（selector.cjs）和评测器逻辑不变

| 验收标准 | 1) 手动触发bridge，传入weather技能ID 2) 正确选择评测轨道 3) 输出评测结果 4) 事件写入bus.jsonl |
| 预估工时 | 3h |

#### T1.6 状态追踪 + 心跳机制
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | 新建 `infrastructure/pipeline-state/` 和 `infrastructure/observability/` |
| 输入 | 决策3和决策5的设计方案 |
| 输出 | `record.js`(状态记录器)、`heartbeat.js`(心跳更新器) |

**record.js**：接收流水线阶段事件，追加写入runs/JSONL + 更新current.json快照
**heartbeat.js**：各模块执行结束时调用，更新heartbeats.json中对应模块的时间戳和状态

| 验收标准 | 1) 一次完整流水线运行后，runs/目录有对应JSONL 2) current.json反映最新状态 3) heartbeats.json有各模块时间戳 |
| 预估工时 | 3h |

#### T1.7 端到端集成测试
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | 全链路 |
| 输入 | 模拟ISC规则变更事件 |
| 测试场景 | 见下方 |

**端到端测试场景**：

```bash
# Step 1: 模拟ISC规则变更（手动写入事件）
node -e "
const bus = require('./infrastructure/event-bus/bus');
bus.publish('isc.rule.changed', 'test', {
  ruleId: 'N023',
  skillId: 'weather',
  skillPath: './skills/weather'
});
console.log('Event published');
"

# Step 2: 运行调度器（模拟Cron触发）
node ./infrastructure/event-bus/dispatcher.js

# Step 3: 验证链路完成
# 3a. 检查DTO对齐是否执行
cat ./skills/dto-core/subscriptions/isc-N023.json | head -5

# 3b. 检查SEEF evaluator是否执行（查看事件）
grep 'seef.evaluation.completed' ./infrastructure/event-bus/bus.jsonl

# 3c. 检查AEO评测是否执行
grep 'aeo.assessment.completed' ./infrastructure/event-bus/bus.jsonl

# 3d. 检查状态日志
cat ./infrastructure/pipeline-state/current.json

# 3e. 检查心跳
cat ./infrastructure/observability/heartbeats.json
```

**预期结果**：
- ✅ bus.jsonl中有完整的事件链（isc.rule.changed → dto.task.triggered → seef.evaluation.completed → aeo.assessment.completed）
- ✅ pipeline-state/current.json显示最新运行为completed
- ✅ heartbeats.json中dispatcher/seef/aeo都有最近时间戳

| 验收标准 | 上述5项检查全部通过 |
| 预估工时 | 4h |

### P1阶段验收标准（汇总）

```
┌──────────────────────────────────────────────────────────────────────┐
│  P1验收：最小闭环端到端测试                                          │
│                                                                      │
│  ISC规则变更(模拟)                                                   │
│       │                                                              │
│       ▼ [事件总线 bus.jsonl]                                         │
│  DTO isc-dto-alignment-engine 执行                                   │
│       │                                                              │
│       ▼ [事件总线 bus.jsonl]                                         │
│  SEEF evaluator.py 对 weather 技能执行真实ISC校验                    │
│       │                                                              │
│       ▼ [事件总线 bus.jsonl]                                         │
│  AEO 双轨评测 (选择正确轨道，执行评测)                               │
│       │                                                              │
│       ▼ [事件总线 bus.jsonl]                                         │
│  结果写入 pipeline-state + heartbeats                                │
│       │                                                              │
│       ▼                                                              │
│  ✅ 全链路JSONL事件可追溯                                            │
│  ✅ 状态日志记录完整                                                 │
│  ✅ 心跳文件更新                                                     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 五、P2：补全闭环（1-2周）

### 目标
> CRAS学习引擎真正工作，ISC规则变更自动同步到全链路，评测结果入库向量化，用户反馈收录，全部7个SEEF子技能通过事件总线接入闭环。P2结束后：系统能自动处理任意技能的评估-优化-评测-反馈全流程。

### 甘特图

```
Week 1                                              Week 2
Day 8    Day 9    Day 10   Day 11   Day 12   Day 13   Day 14   Day 15   Day 16   Day 17
┌────────┬────────┬────────┬────────┬────────┐┌────────┬────────┬────────┬────────┬────────┐
│ T2.1   │ T2.1   │ T2.2   │ T2.2   │ T2.3   ││ T2.5   │ T2.5   │ T2.6   │ T2.7   │ T2.8   │
│ CRAS   │ CRAS   │ ISC    │ ISC    │ 评测   ││ SEEF   │ SEEF   │ 反馈   │ Cron   │ 集成   │
│ 学习   │ 学习   │ 同步   │ 同步   │ 入库   ││ 7子技  │ 7子技  │ 收录   │ 整合   │ 测试   │
│████    │████    │████    │████    │████    ││████    │████    │████    │████    │████    │
│        │        │        │        │        ││        │        │        │        │        │
│ T2.4   │ T2.4   │        │        │        ││        │        │        │        │        │
│ DTO    │ DTO    │        │        │        ││        │        │        │        │        │
│ 路由   │ 路由   │        │        │        ││        │        │        │        │        │
│████    │████    │        │        │        ││        │        │        │        │        │
└────────┴────────┴────────┴────────┴────────┘└────────┴────────┴────────┴────────┴────────┘

并行组A: [T2.1, T2.4] (Day 8-9)
并行组B: [T2.2] (Day 10-11, 依赖T2.4)
并行组C: [T2.3] (Day 12, 独立)
并行组D: [T2.5] (Day 13-14, 依赖T2.2)
并行组E: [T2.6, T2.7] (Day 15-16, 部分独立)
最终:    [T2.8] (Day 17, 依赖全部)
```

### 任务清单

#### T2.1 CRAS学习引擎真实化（2天）
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | cras |
| 核心问题 | `crawlSource()`返回模拟数据；Cron环境无法调用kimi_search |
| 改造方案 | 两条路径并存：1) **离线学习**：读取已有向量文件+CRAS洞察报告做知识整理（Cron安全）；2) **在线学习**：仅在Agent会话中可用时调用web_search（通过sessions_spawn触发） |
| 输出 | 1) CRAS洞察报告自动生成（基于已有数据） 2) 洞察→事件总线发布`cras.insight.generated` |
| 验收标准 | `node cras/index.js --learn --offline` 不超时完成，输出洞察报告到reports/目录 |
| 预估工时 | 8h |

#### T2.2 ISC规则变更全链路自动同步（2天）
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | isc-core + 事件总线 |
| 改造 | 1) `isc-file-watcher.js`改造为事件生产者（变更→bus.jsonl） 2) 注册为Cron每15分钟执行 3) dispatcher路由表添加ISC变更→DTO同步→SEEF通知 |
| 新增事件类型 | `isc.rule.created`, `isc.rule.updated`, `isc.rule.deleted`, `isc.standard.updated` |
| 验收标准 | 1) 新增一条ISC规则 2) 15分钟内DTO订阅自动更新 3) bus.jsonl记录完整事件链 |
| 预估工时 | 8h |

#### T2.3 评测结果入库向量化（1天）
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | aeo + 向量化服务 |
| 改造 | AEO评测完成后：1) 结果写入`aeo/reports/`（已有） 2) 发布`aeo.assessment.completed`事件 3) 事件触发向量化服务增量处理 |
| 新增事件路由 | `aeo.assessment.completed` → `vectorize.sh --incremental --path aeo/reports/latest.json` |
| 验收标准 | 评测完成后，`vectors/`目录新增对应向量文件 |
| 预估工时 | 4h |

#### T2.4 DTO事件路由扩展（2天）
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | dto-core + 事件总线 |
| 改造 | 扩展dispatcher路由表，支持完整的事件类型矩阵 |

**完整路由表**：
| 事件类型 | 目标处理器 | 动作 |
|:---------|:----------|:-----|
| `isc.rule.changed` | isc-dto-alignment-engine | 同步DTO订阅 |
| `isc.rule.created` | isc-dto-alignment-engine | 创建新订阅 |
| `dto.task.triggered` | seef-evaluator | 执行评估 |
| `seef.evaluation.completed` | aeo-dto-bridge | 执行评测 |
| `seef.optimization.completed` | seef-validator | 执行验证 |
| `aeo.assessment.completed` | pipeline-recorder + vectorize | 记录+向量化 |
| `aeo.quality.threshold_breach` | seef-discoverer | 触发问题分析 |
| `cras.insight.generated` | isc-smart-creator | 洞察→规则提案 |
| `pipeline.stage.failed` | resilience/retry-wrapper | 重试/降级 |

| 验收标准 | 路由表覆盖所有9种事件类型，每种类型有对应handler |
| 预估工时 | 8h |

#### T2.5 全部7个SEEF子技能接入事件总线（2天）
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | seef |
| 改造 | 7个Python子技能统一改造为：1) 接收JSON参数（stdin或命令行） 2) 输出标准JSON到stdout 3) 执行完成后写入事件到bus.jsonl |

**统一接口规范**：
```python
# 所有子技能的标准输入输出
# 输入: python3 subskill.py --input '{"skillPath":"...","context":{...}}'
# 输出: {"subskill":"evaluator","status":"completed","score":0.85,"findings":[...],"nextAction":"optimize"}
```

**事件发布映射**：
| 子技能 | 完成事件 | 触发下一步 |
|:-------|:---------|:----------|
| evaluator | `seef.evaluation.completed` | → AEO评测 或 → discoverer |
| discoverer | `seef.discovery.completed` | → optimizer 或 → creator |
| optimizer | `seef.optimization.completed` | → validator |
| creator | `seef.creation.completed` | → validator |
| aligner | `seef.alignment.completed` | → validator |
| validator | `seef.validation.completed` | → recorder |
| recorder | `seef.recording.completed` | → 流水线结束 |

| 验收标准 | 每个子技能可独立执行，输出标准JSON，事件写入bus.jsonl |
| 预估工时 | 8h |

#### T2.6 用户反馈收录机制（1天）
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | cras + aeo |
| 新建 | `infrastructure/feedback/collector.js` |
| 功能 | 1) 从飞书聊天备份中提取反馈信号（关键词匹配：bug/问题/不好用/出错） 2) 分类（bug/体验/需求） 3) 写入`infrastructure/feedback/inbox.jsonl` 4) 发布`feedback.collected`事件 |
| Cron | 每日一次，扫描最近24小时聊天记录 |
| 验收标准 | 聊天记录中包含"bug"关键词时，inbox.jsonl中出现对应条目 |
| 预估工时 | 4h |

#### T2.7 Cron体系整合（1天）
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | openclaw cron |
| 操作 | 1) 合并功能重叠的Cron（CRAS 5个→3个） 2) 新增事件调度器Cron（5min） 3) 新增ISC文件监听Cron（15min） 4) 新增反馈收集Cron（每日） 5) 新增健康日报Cron（每日09:00） |

**整合后Cron清单**：
| 类别 | 任务 | 频率 | 模型 |
|:-----|:-----|:-----|:-----|
| 核心调度 | 事件调度器 | 5min | sonnet（仅执行脚本） |
| 核心调度 | ISC文件监听 | 15min | sonnet |
| 核心调度 | DTO声明式编排 | 1h | sonnet |
| 评测 | AEO-DTO桥接 | 1h | sonnet |
| 评测 | N023评测标准生成 | 每日06:00 | opus |
| 学习 | CRAS离线学习 | 每日09:00 | opus |
| 学习 | CRAS用户洞察 | 每日21:00 | opus |
| 学习 | CRAS知识治理 | 6h | sonnet |
| 治理 | ISC技能使用审计 | 每日20:00 | sonnet |
| 治理 | PDCA-C执行引擎 | 4h | sonnet |
| 治理 | 流水线健康监控 | 4h | sonnet |
| 治理 | 能力锚点同步 | 4h | sonnet |
| 可观测 | 健康日报 | 每日09:00 | sonnet |
| 可观测 | 系统峰值记录 | 4h | sonnet |
| 基础设施 | 向量化 | 6h | sonnet |
| 基础设施 | 飞书备份 | 30min | sonnet |
| 基础设施 | 自动备份 | 每日07:00/19:00 | sonnet |
| 基础设施 | 系统维护 | 每日02:00 | sonnet |
| 反馈 | 用户反馈收集 | 每日22:00 | sonnet |

**从27个→19个，opus使用从24个→2个**

| 验收标准 | 1) `openclaw cron list` 显示整合后清单 2) 所有任务单次运行不报错 3) opus任务仅2个 |
| 预估工时 | 4h |

#### T2.8 P2集成测试（1天）
| 项目 | 内容 |
|:-----|:-----|
| 测试场景 | 3个端到端场景 |

**场景1：完整评估闭环**
```
ISC规则变更 → DTO同步 → SEEF evaluator → AEO评测 → 结果向量化 → 状态记录
```

**场景2：CRAS洞察驱动**
```
CRAS离线学习 → 洞察生成 → 事件总线 → ISC规则提案 → (人工确认) → DTO同步
```

**场景3：用户反馈闭环**
```
飞书聊天(含bug反馈) → 反馈收集器 → inbox.jsonl → 事件总线 → CRAS关联分析
```

| 验收标准 | 3个场景均端到端跑通，bus.jsonl中有完整事件链，pipeline-state有记录 |
| 预估工时 | 6h |

### P2阶段验收标准（汇总）

```
┌──────────────────────────────────────────────────────────────────────────┐
│  P2验收：补全闭环                                                        │
│                                                                          │
│  ✅ CRAS离线学习模式可用，洞察报告自动生成                                │
│  ✅ ISC规则变更15分钟内自动同步到DTO订阅                                  │
│  ✅ AEO评测结果自动向量化入库                                            │
│  ✅ 用户反馈从飞书聊天自动收录                                           │
│  ✅ 7个SEEF子技能均可通过事件总线独立触发                                 │
│  ✅ Cron从27个整合到19个，opus使用从24个降到2个                           │
│  ✅ 事件总线路由覆盖9种事件类型                                          │
│  ✅ 3个端到端集成测试通过                                                │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 六、P3：自主进化（2-4周）

### 目标
> 实现完整的自主决策执行闭环：SEEF自动发现→评估→优化→发布，CRAS洞察自动生成ISC规则，全系统可观测性仪表盘。P3结束后：系统能在无人干预下持续自我优化。

### 甘特图

```
Week 3                                    Week 4
Day 18-19    Day 20-21    Day 22-23    Day 24-25    Day 26-27    Day 28-29
┌────────────┬────────────┬────────────┬────────────┬────────────┬────────────┐
│ T3.1       │ T3.2       │ T3.3       │ T3.4       │ T3.5       │ T3.6       │
│ 决策引擎   │ CRAS→ISC   │ 多模态     │ 全系统     │ SEEF自动   │ 端到端     │
│ 动态路由   │ 规则生成   │ 接入流水线 │ 可观测性   │ 发现发布   │ 验收       │
│████████    │████████    │████████    │████████    │████████    │████████    │
└────────────┴────────────┴────────────┴────────────┴────────────┴────────────┘

Week 5 (如需)
Day 30-31    Day 32-33
┌────────────┬────────────┐
│ T3.7       │ T3.8       │
│ LEP统一    │ 文档更新   │
│ 韧性层     │ + 收尾     │
│████████    │████████    │
└────────────┴────────────┘

依赖: T3.1→T3.5  T3.2→T3.5  T3.3独立  T3.4独立
并行: [T3.1, T3.3, T3.4] → [T3.2] → [T3.5] → [T3.6] → [T3.7, T3.8]
```

### 任务清单

#### T3.1 SEEF决策引擎——动态路由替代固定流水线（2天）
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | seef |
| 核心改造 | 基于evaluator结果动态决定后续子技能组合（而非固定7步全执行） |
| 设计 | 见下方决策树 |

**决策树实现**：
```
evaluator结果
├── score ≥ 90 且 无critical issue
│   └── 路径A: recorder → 完成（优秀，仅记录）
├── score 70-89 且 有fixable issue
│   └── 路径B: optimizer → validator → recorder → 完成
├── score < 70 或 有critical issue
│   └── 路径C: discoverer → (根据根因选择)
│       ├── 根因=能力缺口: creator → validator → recorder
│       ├── 根因=质量问题: optimizer → validator → recorder
│       └── 根因=标准偏移: aligner → validator → recorder
└── 评估无法完成（依赖缺失等）
    └── 路径D: 写入告警队列 → 人工介入
```

**实现为dispatcher路由的动态版本**：
```javascript
// infrastructure/event-bus/dynamic-router.js
function routeByEvaluationResult(evalResult) {
  const { score, issues, findings } = evalResult;
  const criticalCount = (issues || []).filter(i => i.severity === 'critical').length;
  
  if (score >= 90 && criticalCount === 0) {
    return [{ type: 'seef.record', handler: 'recorder' }];
  }
  if (score >= 70 && findings.some(f => f.fixable)) {
    return [
      { type: 'seef.optimize', handler: 'optimizer' },
      { type: 'seef.validate', handler: 'validator' },
      { type: 'seef.record', handler: 'recorder' }
    ];
  }
  if (score < 70 || criticalCount > 0) {
    return [
      { type: 'seef.discover', handler: 'discoverer' },
      // discoverer完成后，根据结果再路由
    ];
  }
  return [{ type: 'pipeline.alert', handler: 'alert-notifier' }];
}
```

| 验收标准 | 1) 高分技能(weather)走路径A(仅record) 2) 低分技能走路径C(discover→optimize→validate→record) 3) 路径选择有日志可追溯 |
| 预估工时 | 8h |

#### T3.2 CRAS洞察→ISC规则自动生成（2天）
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | cras + isc-core |
| 新建 | `isc-core/generators/rule-generator.js` |
| 功能 | 1) 订阅`cras.insight.generated`事件 2) 分析洞察中的可规则化模式 3) 生成ISC规则草案JSON 4) 低风险规则自动注册，高风险规则进入审核队列 |

**触发条件**：CRAS洞察中识别出"同一问题出现≥2次"的模式

**风险分级自动/人工决策**：
| 规则类型 | 风险 | 处理 |
|:---------|:-----|:-----|
| 检测类（文件缺失、格式错误） | 低 | 自动注册 |
| 通知类（告警、日志） | 低 | 自动注册 |
| 修复类（自动修改代码/配置） | 中 | 草案→飞书通知→人工确认 |
| 决策类（架构变更、权限） | 高 | 草案→飞书通知→人工确认 |

| 验收标准 | 1) 模拟一条"检测类"洞察→自动生成ISC规则并注册 2) 模拟一条"修复类"洞察→生成草案并发送飞书审核通知 |
| 预估工时 | 8h |

#### T3.3 多模态能力接入流水线（2天）
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | seef + dto-core |
| 功能 | 将现有多模态技能（glm-4v/cogview/glm-video/glm-asr等）纳入SEEF评估范围 |
| 改造 | 1) SEEF evaluator支持多模态技能的评估（API可达性、响应时间、输出质量） 2) AEO为多模态技能创建评测集 3) DTO路由支持多模态技能触发 |
| 验收标准 | `python3 evaluator.py /path/to/cogview` 能输出有效评估结果（API可达、基础质量评分） |
| 预估工时 | 8h |

#### T3.4 全系统可观测性（2天）
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | 新建 `infrastructure/observability/dashboard.js` |
| 功能 | 1) 读取heartbeats.json + pipeline-state/current.json 2) 生成健康日报（markdown） 3) 飞书卡片推送 4) 异常自动告警 |

**日报内容**：
```markdown
# 🔍 系统健康日报 2026-03-15

## 概览
- 流水线运行: 12次 (成功10, 失败2)
- 活跃事件: 47条已处理
- 模块健康: 🟢5 🟡1 🔴0

## 模块状态
| 模块 | 状态 | 上次心跳 | 备注 |
|:-----|:----:|:---------|:-----|
| event-dispatcher | 🟢 | 5min前 | 正常 |
| isc-watcher | 🟢 | 12min前 | 正常 |
| dto-orchestrator | 🟢 | 55min前 | 正常 |
| seef-evaluator | 🟡 | 6h前 | 超过预期频率 |
| aeo-bridge | 🟢 | 1h前 | 正常 |
| vectorize | 🟢 | 4h前 | 正常 |

## 最近失败
- run-20260315-003: seef-evaluate阶段超时 (已自动重试成功)
- run-20260315-007: aeo-assess轨道选择失败 (已降级跳过)

## 关键指标
- ISC规则覆盖率: 78/78 (100%)
- DTO订阅同步率: 73/78 (93.6%)
- 评测结果向量化率: 45/47 (95.7%)
```

| 验收标准 | 1) 日报自动生成并推送飞书 2) 包含模块健康、流水线统计、失败明细 3) 异常模块有告警 |
| 预估工时 | 8h |

#### T3.5 SEEF自动发现→评估→优化→发布（2天）
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | seef + dto-core |
| 功能 | 定期（Cron触发）SEEF discoverer扫描全量技能，发现需要评估/优化的技能，自动进入闭环 |
| 流程 | discoverer扫描 → 生成待评估列表 → 逐个触发evaluator → 决策引擎路由 → 完整闭环 |
| 新增Cron | "SEEF全量扫描"，每周一次（周日02:00），使用opus模型 |
| 验收标准 | 1) discoverer扫描全量技能（~30+个） 2) 自动识别出需要评估的技能 3) 至少1个技能完成完整闭环 |
| 预估工时 | 8h |

#### T3.6 P3端到端验收（1天）
| 项目 | 内容 |
|:-----|:-----|
| 验收场景 | 完整自主决策闭环 |

**验收场景**：在不进行人工干预的情况下，系统完成以下流程：

```
1. CRAS离线学习 → 发现"某技能连续2天评估失败"的模式
2. CRAS发布洞察事件
3. ISC规则生成器自动创建"检测类"规则（自动注册）
4. ISC规则变更 → DTO同步
5. DTO触发SEEF evaluator对该技能评估
6. 决策引擎根据评估结果选择optimizer
7. optimizer生成修复方案
8. validator验证修复
9. AEO评测修复后的技能
10. 结果向量化入库
11. 状态日志完整记录
12. 健康日报反映此次闭环
```

| 验收标准 | 上述12步中至少前9步自动完成（10-12可异步） |
| 预估工时 | 6h |

#### T3.7 LEP统一韧性层（2天，可选）
| 项目 | 内容 |
|:-----|:-----|
| 负责模块 | lep-executor |
| 改造 | 1) 取消注释DTO集成代码 2) 修复CRAS路径硬编码 3) 将P1的轻量retry-wrapper替换为LEP的CircuitBreaker+RetryPolicy 4) 通过事件总线接入（而非require路径） |
| 验收标准 | 1) LEP熔断器在连续失败3次后触发 2) 重试策略正确执行 3) WAL日志记录所有操作 |
| 预估工时 | 8h |

#### T3.8 文档更新 + 收尾（1天）
| 项目 | 内容 |
|:-----|:-----|
| 更新范围 | 1) 各模块SKILL.md与代码对齐 2) 新增architecture.md描述事件总线架构 3) 清理空壳技能（capability-anchor删除或实现、evomap-uploader重命名为data） 4) ISC移除不存在技能引用（charglm-video/charglm-voice） 5) DTO清理异常订阅文件名（isc-$rule.json） |
| 验收标准 | 所有SKILL.md与代码一致率≥90% |
| 预估工时 | 4h |

### P3阶段验收标准（汇总）

```
┌──────────────────────────────────────────────────────────────────────────┐
│  P3验收：自主进化                                                        │
│                                                                          │
│  ✅ 决策引擎根据评估结果动态选择子技能组合（4条路径可验证）                │
│  ✅ CRAS洞察自动生成ISC规则（低风险自动，高风险人工确认）                  │
│  ✅ 多模态技能纳入评估范围                                               │
│  ✅ 全系统健康日报每日自动生成并飞书推送                                  │
│  ✅ SEEF全量扫描→自动发现→自动闭环（每周执行）                           │
│  ✅ 完整自主决策闭环端到端跑通（12步中至少9步自动）                       │
│  ✅ LEP韧性层统一接管（熔断/重试/WAL）                                   │
│  ✅ 所有文档与代码一致率≥90%                                             │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 七、对参考文档的评价

### 文档1：SEEF重构现状分析报告（Claude Sonnet 4.5，2026-03-01）

**✅ 可采纳的设计**：
1. **子进程桥接方案**（§2.2 方案A）：用`child_process.spawn`调用Python子技能，输出标准JSON——这是最务实的跨语言方案，P2阶段直接采用
2. **状态机简化为5状态**（§3.4）：IDLE→PROCESSING→COMPLETED→FAILED→ARCHIVED，比10状态设计实用得多
3. **保留Python/JS混合架构**（§7 决策1）：正确判断，Python子技能已有实际代码（182-920行），重写为JS得不偿失
4. **输出格式标准化**（§2.3）：统一JSON输出格式是P2子技能改造的基础

**❌ 过度工程化/不切实际的设计**：
1. **"P0-1: 7个子技能中6个完全缺失"——诊断错误**：Part 1诊断明确发现7个Python子技能文件均存在且有实际代码（discoverer 669行、optimizer 895行、creator 920行等），并非"完全缺失"。该文档可能只检查了JS侧而忽略了Python侧
2. **方案B HTTP微服务**（§2.2）：当前系统连基本的事件总线都没有，引入Flask微服务是过度工程化
3. **ISC Gateway三级门禁的Check-in/Checkpoint/Check-out全套实现**（§9.3）：设计太重，P1只需要evaluator读取ISC规则文件即可，不需要完整的Gateway服务
4. **"8-10周1人全职"的工时估计**：基于"6个子技能缺失"的错误诊断，实际工时应大幅缩减
5. **ISCClient HTTP API接口设计**（§9.5、§9.6）：ISC规则是本地JSON文件，直接读取即可，不需要HTTP API层

**❓ 关键问题它没有发现**：
1. **DTO construdtor致命bug** —— 整个文档未提及这个让DTO完全瘫痪的拼写错误
2. **6个Cron任务持续失败** —— 未涉及Cron系统的健康问题
3. **40+处硬编码路径** —— 未提及
4. **24个Cron任务用opus模型的Token浪费** —— 未涉及运营成本
5. **模块间通信全局方案** —— 只关注SEEF内部，未提出系统级事件总线设计

### 文档2：SEEF重构-引擎与集成设计路线图（v1.0.0，2026-03-01）

**✅ 可采纳的设计**：
1. **动态决策引擎设计**（§1）：4阶段核心流程（评估→发现→优化→创建）+ 决策树路由——这是P3决策引擎的设计基础
2. **AEO-SEEF集成架构**（§4.4）：evaluator调用AEO轨道选择器→评测器的流程设计清晰可用
3. **CRAS 7个知识注入点**（§4.2）：每个子技能都有CRAS注入点的设计理念正确
4. **Agent效果指标体系**（§4.5）：执行效率/质量指标/用户体验三维度分类合理
5. **LEP符号链接方案**（§2.1）：`ln -s` 创建 `@openclaw/lep` 解决require路径问题——简单有效
6. **DTO-ISC-CRAS消息协议**（§4.1）：事件类型定义（skill.registered等）可直接用于事件总线路由表

**❌ 过度工程化/不切实际的设计**：
1. **"100并发稳定"性能目标**（§5 P2验收）：当前系统连单次端到端闭环都跑不通，100并发是远期目标
2. **Prometheus指标**：当前系统是单机Agent环境，Prometheus监控栈引入成本高于收益，JSONL+心跳文件足够
3. **Flask微服务+Docker容器化**：与当前OpenClaw原生环境不匹配
4. **5-8周P2周期**：过度估计，核心闭环打通后扩展并不需要这么久
5. **ISC Gateway checkIn/checkpoint/checkOut三阶段全部实现**：P1只需checkIn（准入），checkOut可P2补充，checkpoint是P3的事
6. **完整的规则模板库+人工审核工作流+审核界面**（§9.1.6）：过早考虑审核UI，飞书消息通知+人工确认即可

**❓ 关键问题它没有发现**：
1. **DTO construdtor致命bug** —— 同样未提及
2. **Cron系统问题** —— 未涉及
3. **事件总线的实际实现方案** —— 提出了消息协议但未给出具体实现（用什么？Redis？文件？），本方案用JSONL+Cron明确回答了这个问题
4. **paths-center空壳问题** —— 40+处硬编码的根因未触及
5. **CRAS核心crawlSource()是空壳** —— 提到了CRAS注入但未诊断CRAS自身的空壳问题

### 总评

两份文档的共同盲点是**只看SEEF，不看全局**。系统最大的问题不是SEEF内部子技能的排列组合，而是：
1. DTO瘫痪（construdtor），调度中枢不工作
2. 模块间没有通信机制，事件驱动无从谈起
3. CRAS自身是空壳，谈不上"CRAS洞察注入SEEF"

本方案的核心差异：**先修基础设施（DTO+事件总线+Cron），再谈模块间集成（SEEF+AEO+CRAS），最后做高级功能（决策引擎+自主进化）**。

---

## 八、风险清单与缓解措施

| # | 风险 | 概率 | 影响 | 缓解措施 |
|:-:|:-----|:----:|:----:|:---------|
| R1 | **事件总线JSONL文件增长过大** | 中 | 中 | 每日Cron清理已处理事件（保留7天），归档到events/archive/ |
| R2 | **Cron 5分钟粒度不够实时** | 低 | 低 | 当前场景无毫秒级需求；如未来需要，升级为chokidar文件监听常驻进程 |
| R3 | **Python子技能执行超时** | 中 | 中 | 设置30秒超时，超时则降级跳过并记录告警 |
| R4 | **DTO修复后仍有其他隐藏bug** | 中 | 高 | P0结束后立即运行DTO完整功能自测（registerTask/execute/validateTask） |
| R5 | **事件调度器自身Cron失败** | 低 | 高 | 健康日报检测dispatcher心跳，超过15分钟无心跳则飞书告警 |
| R6 | **向量化API（智谱）限流/故障** | 中 | 低 | 向量化作为非关键路径，失败不阻塞主流水线，待下次Cron补偿 |
| R7 | **P2阶段7个子技能改造工作量超预期** | 中 | 中 | 优先改造evaluator+discoverer+optimizer（最关键的3个），其余可延后到P3 |
| R8 | **CRAS离线学习模式效果不佳** | 中 | 低 | CRAS是非关键路径，洞察质量不影响核心评估闭环；在线模式作为补充 |
| R9 | **模型API变更/不可用** | 低 | 高 | 所有模型引用改为环境变量/配置文件，可快速切换 |
| R10 | **sessions_spawn资源竞争** | 低 | 中 | 事件调度器串行处理，不并发spawn；parallel-subagent在P3接管并发控制 |

---

## 九、总工时估算

| 阶段 | 任务数 | 总工时 | 日历时间 | 关键交付 |
|:-----|:------:|:------:|:--------:|:---------|
| **P0 止血** | 6 | ~12h | 1-2天 | DTO可用、Cron健康、paths-center |
| **P1 最小闭环** | 7 | ~24h | 3-5天 | 端到端事件驱动闭环（weather场景） |
| **P2 补全闭环** | 8 | ~54h | 7-10天 | 全模块接入、CRAS真实化、反馈收录 |
| **P3 自主进化** | 8 | ~58h | 10-14天 | 决策引擎、规则自动生成、全系统可观测 |
| **总计** | 29 | ~148h | 21-31天 | 完整自主决策执行闭环 |

**注**：工时估算按单人全职计算。如使用sessions_spawn并行多个子Agent开发，日历时间可压缩30-40%。

---

## 十、执行优先级速查表

```
                        紧急度
                 高 ←─────────────→ 低
           ┌─────────────────────────────────┐
     高    │ P0: DTO bug修复    │ P2: CRAS   │
     ↑     │ P0: Cron修复      │     真实化  │
     影    │ P1: 事件总线      │ P2: 反馈   │
     响    │ P1: evaluator     │     收录    │
     度    │     真实化         │             │
     ↓     ├─────────────────────────────────┤
     低    │ P0: 模型降级      │ P3: 可观测  │
           │ P0: paths-center  │ P3: 文档    │
           │ P1: 状态追踪      │     更新    │
           └─────────────────────────────────┘
```

---

> **最终结论**：这个系统的架构设计是宏伟的，模块分工是合理的，但被三个基础性问题（DTO瘫痪、无事件总线、无常驻调度）卡住了咽喉。修复方案的核心思路不是"重写一切"，而是**用最轻量的基础设施（JSONL事件队列 + Cron调度 + sessions_spawn执行）把已经写好的模块串联起来**。当这条链路跑通后，系统会从"Agent人肉编排"模式进化为"事件驱动自动编排"模式——这才是真正的闭环。