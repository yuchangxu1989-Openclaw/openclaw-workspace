# 监控告警自动根因分析与自动修复落地

时间：2026-03-07 01:14 GMT+8

## 已直接落地的程序化链路

目标链路已从“建议操作”推进为可执行闭环：

`系统监控发现异常 -> 自动根因分析 -> 自动生成/派发修复任务 -> 修复后自动验证/消警`

本次直接接入现有 `system-monitor / dispatcher / cron 状态治理`，新增并改造如下：

### 1. 新增自动根因+修复执行器
- 文件：`infrastructure/monitoring/auto-rootcause-repair.js`
- 功能：
  - 扫描 `infrastructure/cron/jobs.json`
  - 扫描 `infrastructure/resilience/handler-state.json`
  - 识别异常类型并分类：
    - `cron.disabled_stale_error`
    - `cron.active_consecutive_errors`
    - `dispatcher.handler_disabled`
  - 对**可自动修复**的问题直接修复
  - 对**不可自动修复**的问题自动建单到：
    - `infrastructure/dispatcher/state/auto-repair-tasks.json`
  - 写执行日志到：
    - `infrastructure/logs/auto-repair-executions.jsonl`
  - 同步告警结果到：
    - `infrastructure/logs/alerts.jsonl`

### 2. 改造 system-monitor 主检查逻辑
- 文件：`skills/public/system-monitor/index.js`
- 变更：
  - 增加 dispatcher handler 熔断状态检查
  - 增加 `--auto-rootcause-repair` 模式
  - 在健康检查中执行：
    1. 初次扫描
    2. 自动根因修复
    3. 再扫描验证
  - 报告中带出 `autoRepair` 摘要

### 3. 将 cron 健康任务接入自动处置
- 文件：`infrastructure/cron/jobs.json`
- 变更：
  - `system-health-l3` 的参数改为：
    - `health --auto-rootcause-repair`
  - outputs 增加：
    - `infrastructure/logs/auto-repair-executions.jsonl`
    - `infrastructure/dispatcher/state/auto-repair-tasks.json`

---

## 重点场景：已禁用任务仍因历史错误状态误报

这是本次重点处理场景，已程序化落地。

### 已实现规则
当 cron job 满足以下条件时：
- `enabled === false`
- 且存在以下任一历史错误痕迹：
  - `state.consecutiveErrors > 0`
  - `state.lastStatus == error` 或 `state.lastRunStatus == error`
  - `state.lastError` / `job.lastError` 非空

系统判定其根因是：
- `disabled_job_with_historical_error_state`

### 自动修复动作
系统会直接执行：
- `state.consecutiveErrors = 0`
- `state.lastStatus = suppressed_disabled`
- `state.lastRunStatus = suppressed_disabled`
- `state.lastError = ''`
- `job.lastError = ''`（若存在）

### 自动验证/消警逻辑
修复后会再次扫描：
- 该 job 不再满足“活跃失败任务”条件
- 告警写入 `alerts.jsonl` 时标记：
  - `acknowledged: true`
  - `cleared: true`
- `system-monitor` 会重新检查并把该类问题从 error 路径消除

这意味着“禁用任务历史失败状态导致的误报”不再停留在建议人工清理，而是已经自动完成**识别-修复-复检-消警**。

---

## 自动派发修复任务规则

对于当前**不宜自动改写**的问题，已改成自动建单而不是只告警：

### A. 活跃 cron 连续失败
判定条件：
- `job.enabled !== false`
- `state.consecutiveErrors >= 3`

处理动作：
- 生成 repair task 到 `auto-repair-tasks.json`
- finding 类型：`cron.active_consecutive_errors`
- root cause：`active_job_repeated_failure`

### B. dispatcher handler 被熔断禁用
判定条件：
- `infrastructure/resilience/handler-state.json` 中某 handler `disabled === true`

处理动作：
- 生成 repair task 到 `auto-repair-tasks.json`
- finding 类型：`dispatcher.handler_disabled`
- root cause：`handler_circuit_breaker_open`

### 建单结构
每个 repair task 包含：
- 稳定 task id
- source = `auto-rootcause-repair`
- finding 原文
- diagnose / repair / verify runbook
- open 状态

这样 dispatcher 状态治理已有了一个真实的“待修复任务池”，后续可继续接入 worker 或 Feishu 派单器。

---

## 实际落地文件

### 新增
- `infrastructure/monitoring/auto-rootcause-repair.js`
- `reports/monitor-alert-auto-rootcause-and-repair.md`

### 修改
- `skills/public/system-monitor/index.js`
- `infrastructure/cron/jobs.json`

### 自动产生/使用的状态文件
- `infrastructure/logs/auto-repair-executions.jsonl`
- `infrastructure/logs/alerts.jsonl`
- `infrastructure/dispatcher/state/auto-repair-tasks.json`

---

## 当前执行结果

已直接执行：
- `node infrastructure/monitoring/auto-rootcause-repair.js`
- `node skills/public/system-monitor/index.js health --auto-rootcause-repair`

本次执行结果：
- 当前未发现需要处置的 cron / dispatcher 异常建单项
- `system-monitor` 已能执行自动根因修复链路
- 现有环境下健康检查完成，链路可运行

---

## 现在这条链如何工作

### 闭环流程
1. `system-health-l3` 定时触发 `system-monitor`
2. `system-monitor` 先做监控扫描
3. 自动调用 `auto-rootcause-repair.js`
4. 脚本按规则分流：
   - 可自动修复：直接修复并记录
   - 不可自动修复：自动建 repair task
5. `system-monitor` 再次扫描验证
6. 修复成功项进入 cleared/acknowledged
7. 未修复项保留 open task，等待后续执行器消费

---

## 后续可继续接上的最小增量

虽然本次已经不是“只分析”，但还可以继续追加两步，把派单和回写做得更完整：

1. 增加 `auto-repair-task-dispatcher.js`
   - 自动消费 `auto-repair-tasks.json`
   - 派给 coder/researcher/ops 对应 agent

2. 增加 `repair-task-verifier.js`
   - 对 open/in_progress task 复检
   - 成功后回写 `status=verified/closed`
   - 同步写 `alerts.jsonl` cleared 事件

不过就本次要求而言，**核心链路已经程序化并接上现有 system-monitor / dispatcher / cron 治理**，尤其是“已禁用任务因历史错误状态误报”场景已完成自动化修复闭环。
