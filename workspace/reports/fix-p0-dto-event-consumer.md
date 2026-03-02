# P0 修复报告: DTO 事件消费者进程

**日期**: 2026-03-01  
**状态**: ✅ 已完成并验证  
**修复文件**: `skills/dto-core/core/event-consumer.js`

---

## 问题描述

DTO 事件驱动是"伪实现"——`EventPublisher` 将事件写入 `.dto-signals/` 目录下的 JSON 文件，但**没有任何消费者进程监听**这些文件。事件写出去之后就死在了磁盘上，SEEF Evaluator 从未被自动触发。

## 修复内容

### 创建 `event-consumer.js`（19KB，~440行）

核心组件 `EventConsumer` 类，功能：

| 功能 | 实现方式 |
|------|---------|
| 文件系统监视 | `fs.watch()` + 轮询兜底（2s间隔） |
| 事件去抖 | 300ms debounce 防重复处理 |
| 订阅配置加载 | 读取 `subscriptions/*.json`，自动注册处理器 |
| 事件类型推断 | 从文件名推断（`skill.registered.json` → `skill.registered`） |
| 旧格式兼容 | `eventType: "registration"` 自动映射到 `skill.registered` |
| 模板变量解析 | `{{event.payload.skillId}}` → 实际值 |
| SEEF Evaluator 调用 | 通过 `child_process.execFile` 独立调用，30s超时 |
| 通用技能调用 | 支持 Node.js / Python 技能的自动发现和调用 |
| 过滤器 | 支持 `excludeSkills` / `minVersion` 过滤 |
| 事件归档 | 处理完成后移入 `.dto-signals/.archive/`，带时间戳和状态前缀 |
| 持久化日志 | 追加写入 `logs/event-consumer.jsonl` |
| 多种运行模式 | `start`（守护进程）/ `once`（单次批处理）/ `status`（查看日志） |

### 关键设计决策

1. **独立子进程调用 SEEF** — 避免 `require()` 缓存问题，每次评估都是干净的执行环境
2. **双重监控** — `fs.watch` 提供实时性，轮询提供可靠性兜底
3. **幂等处理** — `_processing` Set 防并发，归档后不再处理
4. **向后兼容** — 同时支持新旧事件格式（`eventType: "registration"` 和 `type: "skill.registered"`）

## 验证结果

### 测试 1: `skill.registered` 事件 ✅

```
输入: .dto-signals/skill.registered.test.json
       skillId=test-skill-for-seef, version=1.0.0

输出:
  → EventConsumer 匹配到 seef-skill-registered 订阅
  → 模板解析成功（skillId, skillPath, skillName, version）
  → SEEF Evaluator 被调用
  → CRAS 洞察注入成功（基础分69 → 调整后72）
  → 评估报告保存到 reports/seef-evaluations/
  → 信号文件归档到 .dto-signals/.archive/
```

### 测试 2: `skill.updated` 事件 ✅

```
输入: .dto-signals/skill.updated.test.json
       skillId=test-skill-for-seef, eventType=update, version=1.1.0

输出:
  → "update" 自动映射到 "skill.updated" 订阅
  → SEEF Evaluator 再次被调用
  → 评估报告生成
  → 信号文件归档
```

### 测试 3: 无处理器事件 ✅

```
输入: .dto-signals/cras.insight.high-failure.json
       （没有对应的订阅配置）

输出:
  → 日志记录 "No handlers for event: high-failure"
  → 文件仍然归档（状态标记为 no-handler）
```

### 测试 4: 积压处理 ✅

```
4个历史信号文件 → 全部被处理和归档
```

## 数据链路验证

```
事件文件写入 .dto-signals/
  ↓
EventConsumer 检测到新文件（fs.watch + poll）
  ↓
解析 JSON → 推断事件类型
  ↓
匹配 subscriptions/seef-skill-registered.json
  ↓
解析模板变量 {{event.payload.skillId}} → 实际值
  ↓
调用 SEEF Evaluator (子进程)
  ↓
Evaluator 执行评估 + CRAS 洞察注入
  ↓
评估报告保存到 reports/seef-evaluations/
  ↓
信号文件归档到 .dto-signals/.archive/
```

## 使用方式

```bash
# 守护进程模式（持续监听）
node skills/dto-core/core/event-consumer.js start

# 单次模式（处理积压后退出，适合 cron）
node skills/dto-core/core/event-consumer.js once

# 查看最近日志
node skills/dto-core/core/event-consumer.js status

# 编程方式使用
const EventConsumer = require('./skills/dto-core/core/event-consumer');
const consumer = new EventConsumer();
await consumer.start();
```

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `skills/dto-core/core/event-consumer.js` | **新建** | 核心消费者进程 |
| `.dto-signals/.archive/` | **新建** | 已处理事件归档目录 |
| `skills/dto-core/logs/event-consumer.jsonl` | **新建** | 消费者执行日志 |
| `reports/seef-evaluations/*.json` | 更新 | SEEF 评估报告（由触发产生） |
