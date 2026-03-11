---
name: system-monitor
description: 系统健康监控中心 — 健康检查、告警根因分析、未响应告警扫描、主Agent违规检测、Git push探针
version: "1.2.0"
status: active
tags: [system, monitoring, health, alert, watchdog, git-probe]
author: OpenClaw
---

# System Monitor

统一系统监控技能，整合所有健康检查和告警响应能力。

## 模块

| 模块 | 脚本 | 说明 |
|------|------|------|
| health | index.js | 系统健康检查（cron/dispatcher/磁盘） |
| alert-rootcause | scripts/alert-auto-rootcause.js | 告警根因自动分析，生成RCA模板 |
| alert-guard | scripts/alert-response-guard.js | 未响应告警扫描+标记已响应 |
| watchdog | scripts/main-agent-watchdog.sh | 主Agent文件操作违规检测 |
| git-probe | scripts/git-push-health-check.sh | Git push健康探针 |

## 使用

```bash
# 系统健康检查
node index.js health
node index.js health --auto-rootcause-repair

# 告警根因分析
node index.js alert-rootcause

# 未响应告警扫描
node index.js alert-guard
node index.js alert-guard resolve <rule_id> [resolution]

# 主Agent违规检测
node index.js watchdog
node index.js watchdog --watch --interval 10

# Git push探针
node index.js git-probe
```

## 原路径兼容

以下原路径已替换为symlink，cron任务无需修改：
- `infrastructure/self-check/alert-auto-rootcause.js` → 本技能
- `infrastructure/self-check/alert-response-guard.js` → 本技能
- `scripts/main-agent-watchdog.sh` → 本技能
- `scripts/git-push-health-check.sh` → 本技能
