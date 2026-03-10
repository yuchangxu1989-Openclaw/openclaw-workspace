# Day2 Gap4 — L3架构变化后的全系统重塑盘点 / 主实现

> 日期：2026-03-07  
> 目标：在 L3 从“旁路监听”升级为“主路处理”后，对全系统进行一次面向运行时的重塑盘点，并补齐主实现缺口。

## 1. 结论摘要

本次在 `/workspace` 的主实现推进，确认 **L3 主路化骨架已基本落地**：

- 已存在 `infrastructure/pipeline/l3-gateway.js`，负责把 `bus-adapter.emit()` 提升为 L3 主路入口。
- 已存在 `user.intent.* -> intent-dispatch` 路由与 `intent-dispatch.js` handler，说明“意图事件 → 执行策略”主干已经接通。
- 已存在 `infrastructure/observability/l3-dashboard.js`，说明 L3 运行报告能力已纳入观测层。
- 已存在 `bus-adapter.js`，承担新旧总线兼容、trace 注入、风暴抑制与 ISC reload hook。

但在“全系统重塑盘点”里也发现了一个**真实主路径残缺点**：

- `routes.json` 中新增了：
  - `file.changed -> skill-system-monitor-handler`
  - `file.changed.* -> skill-system-monitor-handler`
- 但对应 handler 文件 **缺失**，会导致文件变更类事件在 L3 主路/dispatcher 侧形成悬空路由。

因此本次主实现已补齐：

- ✅ 新增 `infrastructure/dispatcher/handlers/skill-system-monitor-handler.js`
- 使 `file.changed` / `file.changed.*` 事件进入稳定消费路径，避免 L3 架构变化后的系统重塑出现“路由存在但执行器缺失”的断点。

---

## 2. 本次盘点范围

### 2.1 已核查的关键 L3 主路模块

1. **主入口 / 主路切换**
   - `infrastructure/pipeline/l3-gateway.js`

2. **事件总线适配**
   - `infrastructure/event-bus/bus-adapter.js`

3. **执行分发**
   - `infrastructure/dispatcher/dispatcher.js`
   - `infrastructure/dispatcher/routes.json`

4. **意图执行落地**
   - `infrastructure/dispatcher/handlers/intent-dispatch.js`
   - `infrastructure/dispatcher/handlers/intent-event-handler.js`

5. **观测与报告**
   - `infrastructure/observability/l3-dashboard.js`

6. **设计对照**
   - `designs/l3-architecture/IMPLEMENTATION.md`

### 2.2 盘点到的系统级变化

L3 架构变化后，系统已经从：

- 旧模式：事件先走 legacy dispatcher，L3 偏旁路分析

转向：

- 新模式：事件可由 `l3-gateway` 拦截进入主路，执行
  - Intent Inline Hook
  - IntentScanner
  - RuleMatcher
  - Dispatcher v2
  - Handler

这意味着全系统需要同步满足三类条件：

1. **入口存在**：事件能进入 L3 主路；
2. **路由完整**：主路产生的新事件类型在 dispatcher 中必须可解析；
3. **handler 完整**：所有新增路由必须有真实消费器。

本次发现的问题属于第 3 类。

---

## 3. 发现的问题

## 3.1 悬空路由：file.changed / file.changed.*

在 `infrastructure/dispatcher/routes.json` 中，已定义：

- `file.changed`
- `file.changed.*`

二者均指向：

- `skill-system-monitor-handler`

但 `infrastructure/dispatcher/handlers/` 下原先并不存在：

- `skill-system-monitor-handler.js`

这会产生以下后果：

- 文件变更类事件被规则/路由命中后，dispatcher 无法 resolve handler；
- 事件会退化为失败 / manual-queue / 噪音日志；
- L3 主路下“文件变更驱动系统响应”的链条不完整；
- Day2 Gap1 的 event-driven trigger 无法在 Day2 Gap4 的全系统重塑中闭环。

---

## 4. 已完成实现

### 4.1 新增 handler

新增文件：

- `infrastructure/dispatcher/handlers/skill-system-monitor-handler.js`

### 4.2 行为说明

该 handler 提供以下能力：

- 消费 `file.changed` / `file.changed.*` 事件；
- 归一化提取：
  - `files`
  - `file_count`
  - `category`
  - `change_type`
  - `summary`
  - `_metadata / event.metadata`
- 将结构化记录写入：
  - `infrastructure/logs/file-change-events.jsonl`
- 返回 dispatcher 友好的执行结果：
  - `status: ok`
  - `handler: skill-system-monitor-handler`
  - `action: log_file_change`

### 4.3 设计意图

这里没有让 handler 直接做复杂治理动作，而是先补齐**稳定消费面**：

- 先确保 L3 重塑后的事件不会掉地上；
- 再保证文件变更类事件有统一日志沉淀；
- 后续若要追加更复杂的系统监控/分类/触发器，可以在这个稳定入口之上继续扩展。

这符合“主实现先补全主链路，再叠加增强逻辑”的原则。

---

## 5. 当前系统重塑状态判断

### 5.1 已接通主链路

- `bus-adapter`：已承担兼容层与 trace/breaker/dedupe 能力
- `l3-gateway`：已把 L3 升级为主路入口
- `intent-dispatch`：已承担 user.intent.* 的执行路由
- `l3-dashboard`：已纳入健康 / metrics / alerts / pipeline / decision log 汇总

### 5.2 仍值得继续检查的次级缺口

虽然本次主实现已补齐一个真实断点，但从“全系统重塑盘点”的角度，后续仍建议继续检查：

1. **routes.json 与 handlers/ 的一致性扫描**
   - 自动找出所有声明了 handler 但文件不存在的路由。

2. **L3 主路事件类型覆盖清单**
   - 核查 `L3_MAINLINE_EVENTS` 默认值是否只覆盖 `user.message`；
   - 如需让更多系统事件进入主路，应明确灰度策略，而不是散落扩张。

3. **manual-queue 历史遗留项清理**
   - 当前 manual queue 中已存在多个历史悬空/旧失败项；
   - 可区分“已修复可重放”与“仅保留审计”的条目。

4. **文件变更事件的上游契约统一**
   - 目前 handler 兼容了 `files/changed_files/paths/file/path` 多种字段；
   - 后续建议收敛到统一 payload contract。

---

## 6. 本次改动清单

### 新增文件

- `infrastructure/dispatcher/handlers/skill-system-monitor-handler.js`

### 新增产出文档

- `reports/day2-gap4-l3-reshape-audit.md`

---

## 7. 结果

本次 Day2 Gap4 主实现完成的核心价值：

- 把“L3 架构变化后的全系统重塑盘点”从文档级检查推进到**真实主路径修复**；
- 补齐了 `file.changed*` 事件的 dispatcher 执行器缺口；
- 使 L3 主路化后新增的系统事件路由更加完整；
- 降低了主路切换后悬空路由导致的 manual queue / 运行噪音风险。

如果继续推进，下一步最值得做的是：

- 增加一个 **route-handler consistency audit** 脚本，把这类缺口自动化发现。
