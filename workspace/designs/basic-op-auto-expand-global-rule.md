# 基操类任务按用户口径自动扩列、自动派生、立即执行 — 全局固化钢印

版本：v1
日期：2026-03-07

## 正式规则

当用户请求满足以下任一条件时，系统必须将其视为“基操类任务自动扩列执行”信号，而非仅停留在主线程分析：

1. 明示要求：包含“基操 / 扩列 / 自动扩列 / 自动派生 / 立即执行 / 同类请求 / 按用户口径 / 批量 / 一并处理”等词；
2. 结构信号：同一条请求内出现多个并列子目标、同口径项、验收项；
3. 动作信号：请求目标指向“补规则 / 接入链路 / 执行 / 修复 / 落地 / 验证”等可执行动作。

## 执行钢印

命中后必须执行以下动作：

- 自动派生同口径子任务；
- 直接进入 dispatch engine enqueue/enqueueBatch；
- 发出 intent.directive / workflow.requested 事件；
- 不允许仅返回分析、方案、理解、主线程停留态；
- 若存在可落地执行链，则优先走执行链。

## 接入位置

- user-message-router：识别 basic-op auto-expand signal；
- dev-task-handler：将派生任务批量 enqueue 到 DispatchEngine；
- event-bus：补发 intent.directive 与 workflow.requested；
- routes.json：补 user.message.received → user-message-router 别名，避免 ingress 漏接。

## 最小验收

给定请求：
“立即把基操类任务按用户口径自动扩列、自动派生、立即执行推进为全局固化。要求：1) 补正式钢印/规则；2) 接入 ISC / 意图 / 事件 / 执行链；3) 至少让同类请求能自动命中扩列执行而不是停留在主线程分析；4) 给最小验证。”

期望：

- 命中 auto_expand.signal.hit = true；
- 自动派生至少 4 个任务；
- DispatchEngine busy/spawning 数增加；
- 事件链出现 intent.directive 与 workflow.requested；
- 请求不再停留为纯分析态。
