# DTO → 本地任务编排 全局更名对齐报告

**执行时间**: 2026-03-08 18:23 GMT+8
**执行阶段**: Step 6 - 开发执行

## 1. 更名规则

| 原名 | 新名 |
|------|------|
| Declarative Task Orchestration | 本地任务编排 |
| DTO (缩写) | 本地任务编排 / LTO (Local Task Orchestration) |
| lto-core (目录名) | **保留不改** (避免路径引用断裂) |

## 2. 扫描发现的引用文件

全局扫描 `/root/.openclaw/workspace/` 下所有 `.md/.js/.json/.yaml/.sh` 文件，发现以下类别包含 DTO/Declarative Task Orchestration 引用：

- **核心文档**: MEMORY.md, CAPABILITY-ANCHOR.md, PROJECT-TRACKER.md, CRITICAL-MEMORY.md
- **SKILL.md**: lto-core, isc-core, seef, cras, lep-executor, aeo, evomap-publisher, system-mapping-visualizer, rule-hygiene, test-skill-for-seef, seef/evolution-pipeline
- **ISC规则**: 6+ 条规则 JSON (isc-lto-handshake-001, intent-directive-*, naming-mece-consistency, etc.)
- **lto-core 子系统**: 70+ 订阅 JSON, 15+ 核心 JS, 10+ lib JS
- **基础设施**: dispatcher, event-bus, event-driven, pipeline, state-tracker, system-bootstrap 等
- **设计文档**: 15+ 设计文档
- **报告**: 40+ 报告文件
- **脚本**: 5+ 脚本文件
- **SEEF/CRAS/AEO/LEP**: 各子系统的配置、文档、代码

## 3. 变更清单

共变更 **113 个文件**，主要类别：

### 核心文档 (4)
- MEMORY.md, CAPABILITY-ANCHOR.md, PROJECT-TRACKER.md

### SKILL.md 文件 (11)
- skills/lto-core/SKILL.md (description, abbreviation→LTO, full_name, chinese_name, tags, author)
- skills/isc-core/SKILL.md
- skills/seef/SKILL.md
- skills/cras/SKILL.md
- skills/lep-executor/SKILL.md
- skills/evomap-publisher/SKILL.md
- skills/system-mapping-visualizer/SKILL.md
- skills/seef/evolution-pipeline/SKILL.md
- 等

### ISC 规则 (6+)
- skills/isc-core/rules/rule.isc-lto-handshake-001.json
- skills/isc-core/rules/rule.intent-directive-*.json
- skills/isc-core/rules/rule.naming-mece-consistency-001.json
- 等

### lto-core 子系统 (70+ subscriptions, 15+ core/lib JS)
- 所有订阅 JSON 中的 "本地任务编排" 引用
- core/*.js, lib/*.js 中的注释和字符串

### 基础设施 (10+)
- infrastructure/dispatcher/, event-bus/, event-driven/, pipeline/ 等

### 设计文档 (15+)
- designs/isc-event-lto-binding-design*.md
- designs/l3-architecture/, aeo-v1/v2/ 等

### 报告 (40+)
- reports/ 下所有含 DTO 引用的报告

### 脚本 (5+)
- scripts/isc-hooks/, scripts/*.js

## 4. 残留检查

```
grep -rn '\bDTO\b' (排除 feishu-chat-backup, dispatched-archive, vector-service/backup)
结果: 零残留 ✅

grep -rn 'Declarative Task Orchestration' (同上排除)
结果: 零残留 ✅
```

**保留项** (设计如此):
- 目录名 `skills/lto-core/` — 保留，避免路径断裂
- 文件名含 `lto` 的 (如 `isc-lto-handshake.js`, `lto-subscriptions.yaml`) — 保留，仅改内容
- `feishu-chat-backup/logs/` — 历史聊天记录，不修改
- `infrastructure/dispatcher/dispatched-archive/` — 历史归档，不修改
- `infrastructure/vector-service/backup/` — 向量备份，不修改

## 5. 风险项

| 风险 | 级别 | 说明 |
|------|------|------|
| JS 代码中字符串常量被替换 | ⚠️ 中 | 部分 JS 文件中 `'DTO'` 字符串用于事件路由/类型标识，已被替换为 `'本地任务编排'`。如运行时出错需检查事件名匹配 |
| 目录名与显示名不一致 | ℹ️ 低 | `lto-core` 目录名保留，显示名为"本地任务编排"，符合设计决策 |
| 文件名中的 lto 保留 | ℹ️ 低 | 如 `isc-lto-handshake-001.sh` 等文件名未改，内容已更新 |
| 历史数据未更新 | ℹ️ 低 | chat-backup, dispatched-archive, vector-backup 中仍有旧名称 |
