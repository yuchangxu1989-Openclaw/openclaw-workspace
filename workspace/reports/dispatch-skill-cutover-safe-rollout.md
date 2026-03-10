# 新调度技能灰度切换——安全接线与执行报告

> **日期**: 2026-03-06 23:06 CST  
> **执行者**: engineer (subagent)  
> **基于**: `dispatch-cutover-gap-risk-review.md` (opus 风险复盘)  
> **状态**: ✅ 灰度入口已就绪，等待放量

---

## 0. 执行摘要

按 opus 风险复盘的 P0/P1 优先级，逐项补齐阻断项并建立灰度通道。**不做全量替换**，仅开通安全的灰度入口，保留完整回滚路径。

| 动作 | 状态 | 说明 |
|------|------|------|
| P0-01 旧状态清理 | ✅ 完成 | 僵尸任务 + 脏队列已归档并重置 |
| P0-02 文件锁 | ✅ 完成 | writeJson 改为 flock + atomic rename |
| P0-03 Cron 链路灰度 | ✅ 完成 | Feature flag `DISPATCH_ENGINE` 控制路由 |
| P0-04 onDispatch 协议 | ✅ 完成 | dispatch-bridge.js + pending-dispatches 机制 |
| P1-01 脏队列清理 | ✅ 完成 | 随 P0-01 一起处理 |
| P1-03 回滚机制 | ✅ 完成 | 一键回滚脚本 + 环境变量开关 |
| P1-04 reapStale 自动化 | ✅ 完成 | cron 每 5 分钟执行 |
| P1-07 双轨方案 | ✅ 完成 | shadow 模式 (DISPATCH_ENGINE=dual) |
| 最小验证 | ✅ 23/23 通过 | 全生命周期 + 优先级 + reap + 批量 + bridge |

---

## 1. 逐项修复详情

### P0-01: 旧系统僵尸任务 + P1-01: 脏队列 ✅

**执行**:
- 归档旧 `dispatch-layer-state.json` 到 `dispatched-archive/2026-03-06/dispatch-layer-state-pre-cutover.json`
- 重置旧状态文件（清空 slots/queue/running，保留 history 标记）
- 旧系统有 2 个 running 僵尸（demo-1 从 12:57, evt_mmey401p 从 13:45）+ 21 个 queue 项（含 done 状态脏数据）

**归档路径**: `/infrastructure/dispatcher/dispatched-archive/2026-03-06/`

### P0-02: 文件锁 ✅

**修改文件**: `skills/public/multi-agent-dispatch/dispatch-engine.js`

**方案**: `writeJson()` 重写为三层防御：
1. 先写 `.tmp.PID` 临时文件
2. 用 `flock <file>.lock mv tmp file` 做互斥原子替换
3. 若 flock 不可用，fallback 到 `fs.renameSync`（同文件系统仍原子）
4. 最终 fallback 到直写

**验证**: Test 6 连续 20 次快速写入，状态文件保持有效 JSON。

### P0-03: Cron 事件链灰度切换 ✅

**修改文件**: `infrastructure/dispatcher/dispatcher.js`

**方案**: 添加 Feature Flag `DISPATCH_ENGINE` 环境变量，三种模式：

| 值 | 行为 | 用途 |
|----|------|------|
| `old` (默认) | 仅使用旧 DispatchLayer | 当前状态，零风险 |
| `dual` | 旧引擎正常执行 + 新引擎 shadow 记录 | 灰度观察 |
| `new` | 新引擎接管调度（旧引擎仍保留代码） | 全量切换 |

**灰度起步 slot 数**: `DISPATCH_ENGINE_SLOTS=3`（非 19，降低爆炸半径）

**关键代码变更**:
```javascript
// dispatcher.js line 23-39 (新增)
const DISPATCH_ENGINE_MODE = (process.env.DISPATCH_ENGINE || 'old').toLowerCase();
let _dispatchEngine = null;
function getDispatchEngine() {
  // 懒加载 + 错误隔离，不影响旧系统
  const { DispatchEngine } = require('../../skills/public/multi-agent-dispatch/dispatch-engine');
  _dispatchEngine = new DispatchEngine({
    maxSlots: parseInt(process.env.DISPATCH_ENGINE_SLOTS || '3', 10),
  });
  return _dispatchEngine;
}
```

在执行 enqueue 的位置（~line 540）增加 shadow enqueue：
```javascript
if (_newEngine) {
  _newEngine.enqueue({ ...task, source: 'dispatcher.execution.greyscale' });
}
```

### P0-04: onDispatch → sessions_spawn 协议 ✅

**新文件**: `skills/public/multi-agent-dispatch/dispatch-bridge.js`

**设计决策**: DispatchEngine 是**纯状态机**（这是正确的设计）。实际 spawn 由 LLM agent 驱动（通过 sessions_spawn 工具调用）。bridge 提供中间层：

```
Engine.onDispatch(task) → dispatch-bridge 写 pending-dispatches.json
Agent 每个 turn 检查 pending → 为每个 pending task 调 sessions_spawn
spawn 成功 → engine.markRunning(taskId, {sessionKey})
subagent 完成 → engine.markDone(taskId)
```

**CLI 操作**:
```bash
# 查看待 spawn 的任务
node skills/public/multi-agent-dispatch/dispatch-bridge.js list

# agent spawn 后确认
node skills/public/multi-agent-dispatch/dispatch-bridge.js ack <taskId>
```

### P1-04: reapStale 自动化 ✅

**新文件**: `skills/public/multi-agent-dispatch/dispatch-reap-cron.js`  
**Cron**: `*/5 * * * *` with flock 互斥

功能：
1. `reapStale()` — 回收超时 spawning/无心跳 running 任务
2. `drain()` — 空余 slot 自动回填
3. 状态摘要日志输出

### P1-03: 回滚机制 ✅

**回滚脚本**: `skills/public/multi-agent-dispatch/rollback-to-old-dispatch.sh`

一键回滚流程：
1. 移除 reap cron job
2. 设 `DISPATCH_ENGINE=old`
3. 归档并重置新引擎状态
4. 重启 gateway

```bash
# 紧急回滚
bash /root/.openclaw/workspace/skills/public/multi-agent-dispatch/rollback-to-old-dispatch.sh
```

---

## 2. 验证结果

```
🔬 Dispatch Engine Greyscale Validation

Test 1: Full lifecycle (enqueue → spawn → running → done → backfill)
  ✅ enqueue auto-dispatches to spawning (slot available)
  ✅ one slot used after enqueue
  ✅ second task also dispatched
  ✅ all slots full
  ✅ third task queued (no free slots)
  ✅ queue depth = 1
  ✅ running count = 1 after markRunning
  ✅ queue drained after slot freed (backfill worked)
  ✅ two slots busy again (t2 + t3 backfilled)
  ✅ one task in finished list
  ✅ finished task has done status

Test 2: Priority ordering
  ✅ 3 tasks queued behind blocker
  ✅ critical-priority task dispatched first

Test 3: Reap stale spawning tasks
  ✅ stale task reaped
  ✅ slot freed after reap

Test 4: Batch enqueue
  ✅ all 5 tasks created
  ✅ 3 slots filled
  ✅ 2 tasks queued

Test 5: Cancel task
  ✅ cancelled task replaced by queued one

Test 6: Atomic file write
  ✅ state file valid JSON after 20 rapid writes

Test 7: Dispatch bridge (onDispatch → pending file)
  ✅ pending dispatch recorded
  ✅ correct taskId in pending
  ✅ pending cleared after ack

══════════════════════════════════════════════════
Results: 23 passed, 0 failed
══════════════════════════════════════════════════
```

**额外验证**:
- `dispatcher.js` 正常加载 (`require('./infrastructure/dispatcher/dispatcher')` ✅)
- 新引擎 + bridge 组合加载正常 ✅
- 旧状态已安全归档 ✅

---

## 3. 灰度放量计划

### Phase 1: Shadow 观察（当前状态，即可启用）

```bash
# 开启 shadow 模式：旧系统正常工作，新系统仅记录
export DISPATCH_ENGINE=dual
export DISPATCH_ENGINE_SLOTS=3
# 重启 gateway 使环境变量生效
openclaw gateway restart
```

**观察 24h**:
- 检查 `skills/public/multi-agent-dispatch/state/engine-state.json` 是否正常记录
- 对比新旧引擎的 enqueue 数量是否一致
- 确认无异常错误日志

### Phase 2: 3-slot 灰度（Shadow 通过后）

```bash
export DISPATCH_ENGINE=new
export DISPATCH_ENGINE_SLOTS=3
openclaw gateway restart
```

**手动测试**:
```bash
# 入队一个测试任务
node skills/public/multi-agent-dispatch/cli.js enqueue '{"title":"灰度测试","priority":"normal"}'
# 查看状态
node skills/public/multi-agent-dispatch/cli.js board
# 模拟生命周期
node skills/public/multi-agent-dispatch/cli.js running <taskId>
node skills/public/multi-agent-dispatch/cli.js done <taskId> '{"result":"ok"}'
```

### Phase 3: 放量到 19-slot

```bash
export DISPATCH_ENGINE=new
export DISPATCH_ENGINE_SLOTS=19
openclaw gateway restart
```

### 回滚（任何阶段）

```bash
bash skills/public/multi-agent-dispatch/rollback-to-old-dispatch.sh
```

---

## 4. 变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `infrastructure/dispatcher/dispatcher.js` | 修改 | 添加 feature flag + shadow enqueue |
| `infrastructure/dispatcher/state/dispatch-layer-state.json` | 重置 | 清理僵尸 + 脏队列 |
| `skills/public/multi-agent-dispatch/dispatch-engine.js` | 修改 | writeJson 加 flock + atomic rename |
| `skills/public/multi-agent-dispatch/dispatch-bridge.js` | 新增 | onDispatch → pending file 桥接 |
| `skills/public/multi-agent-dispatch/dispatch-reap-cron.js` | 新增 | cron reap + drain 脚本 |
| `skills/public/multi-agent-dispatch/greyscale-validation.js` | 新增 | 23 项最小验证套件 |
| `skills/public/multi-agent-dispatch/rollback-to-old-dispatch.sh` | 新增 | 一键回滚脚本 |
| `skills/public/multi-agent-dispatch/state/` | 新增 | 引擎状态目录（3-slot 初始化） |
| `crontab` | 新增行 | dispatch-reap cron (*/5 min) |
| `dispatched-archive/2026-03-06/` | 新增 | 旧状态归档 |

---

## 5. 剩余事项（不阻断灰度，后续迭代）

| 项目 | 优先级 | 建议时间 |
|------|--------|---------|
| P1-02 任务 ID 格式统一 | P1 | 灰度期间约定 |
| P1-05 spawning 假活跃看板修正 | P1 | 放量前 |
| P1-06 断路器/失败风暴保护 | P1 | 放量到 19 前 |
| P2-01 审计日志格式统一 | P2 | 全量切换后 |
| P2-02 parallel-subagent 收口 | P2 | 全量切换后 |
| P2-04 历史数据 archive 机制 | P2 | 持续运行 2 天后 |
| P2-05 metrics 埋点 | P2 | 全量切换后 |
| P2-06 liveBoard debounce | P2 | 19-slot 放量后评估 |

---

## 6. 回滚保证

| 场景 | 操作 | 恢复时间 |
|------|------|---------|
| 新引擎 bug | `bash rollback-to-old-dispatch.sh` | < 1 分钟 |
| 状态文件损坏 | 回滚脚本自动归档 + 重置 | < 1 分钟 |
| cron 异常 | `crontab -e` 注释 reap 行 | < 30 秒 |
| dispatcher.js 加载失败 | `git checkout infrastructure/dispatcher/dispatcher.js` | < 30 秒 |
| 全部回退 | 回滚脚本 + git checkout dispatcher.js | < 2 分钟 |

**关键设计原则**: 所有变更都是 additive（新增代码路径），不是 destructive（删除旧代码）。旧 DispatchLayer 的代码和引用完全保留，feature flag 默认值 `old` 确保不改变任何现有行为。

---

*Generated at 2026-03-06T23:07+08:00 by engineer (subagent)*
