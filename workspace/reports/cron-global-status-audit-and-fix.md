# Cron 全量现态复核与修复报告

> 审计时间: 2026-03-06 23:40 CST  
> 审计人: Quality Arbiter (reviewer)  
> 审计范围: 系统 crontab + /etc/cron.d + OpenClaw 托管 cron 全量

---

## 一、总览

| 分类 | 总计 | 正常 | 异常 | 已修复 | 观察中 | 已禁用 |
|------|------|------|------|--------|--------|--------|
| 系统 crontab (用户) | 11 | 11 | 0 | 3处加固 | 0 | 0 |
| /etc/cron.d (系统) | 4 | 4 | 0 | 0 | 0 | 0 |
| OpenClaw 托管 cron | 24 | 15 | 1→0 | 1 | 0 | 8 |
| **合计** | **39** | **30** | **0** | **4** | **0** | **8** |

---

## 二、正常清单 ✅

### 系统 crontab（修复后全部正常）

| # | 频率 | 任务 | 状态 | 备注 |
|---|------|------|------|------|
| 1 | `0 3 * * *` | backup-rotate.sh | ✅ 正常 | 日志正常，最近一次备份成功推送 GitHub |
| 2 | `0 * * * *` | day-completion-scanner.js | ✅ 正常 | 每小时运行，无异常 |
| 3 | `*/5 * * * *` | rework-analyzer.js | ✅ 正常 | 120K 日志，正常检测返工信号 |
| 4 | `*/5 * * * *` | correction-harvester.js | ✅ 正常 | 136K 日志，正常扫描纠偏信号 |
| 5 | `*/10 * * * *` | session-cleanup-governor.sh | ✅ **已加固** | 补 flock + 日志重定向 |
| 6 | `*/5 * * * *` | gateway-memory-governor.sh | ✅ **已加固** | 补 flock + 日志重定向 |
| 7 | `*/5 * * * *` | api-probe.js | ✅ 正常 | 已有 flock |
| 8 | `*/1 * * * *` | git-sensor.js | ✅ **已加固** | 补 flock（高频1分钟，必须防并发） |
| 9 | `*/5 * * * *` | intent-extractor.js | ✅ 正常 | 已有 flock |
| 10 | `*/5 * * * *` | cron-dispatch-runner.js | ✅ 正常 | 已有 flock，328K 日志 |
| 11 | `*/10 * * * *` | threshold-scanner.js | ✅ 正常 | 已有 flock |
| 12 | `*/5 * * * *` | dispatch-reap-cron.js | ✅ 正常 | 已有 flock |

### /etc/cron.d（系统级）

| # | 文件 | 频率 | 状态 | 备注 |
|---|------|------|------|------|
| 1 | sgagenttask | `* * * * *` | ✅ 正常 | 腾讯云 Stargate Agent，flock 保护 |
| 2 | sysstat | `5-55/10` / `59 23` | ✅ 正常 | 系统性能采集 |
| 3 | e2scrub_all | `30 3 * * 0` / `10 3 * * *` | ✅ 正常 | 文件系统检查 |
| 4 | yunjing | `*/30 * * * *` + `@reboot` | ✅ 正常 | 腾讯云安全 Agent |

### OpenClaw 托管 cron（enabled = true）

| # | ID | 名称 | 频率 | 状态 | 连续错误 | 最近执行 |
|---|-----|------|------|------|----------|----------|
| 1 | new-event-dispatcher | event-dispatcher | */5 | ✅ ok | 0 | <1m ago |
| 2 | new-isc-change-detector | ISC变更检测 | */15 | ✅ ok | 0 | 11m ago |
| 3 | merged-system-monitor-hourly | 系统监控-综合 | hourly | ✅ ok | 0 | 40m ago |
| 4 | memory-summary-6h | 记忆摘要 | */6h | ✅ ok | 0 | 6h ago |
| 5 | merged-dto-aeo-hourly | DTO-AEO智能流水线 | hourly | ✅ ok | 0 | 39m ago |
| 6 | merged-capability-pdca-4h | 能力同步与PDCA | */4h | ✅ ok | 0 | 4h ago |
| 7 | merged-system-pipeline-4h | 系统状态与流水线 | */4h | ✅ ok | 0 | 4h ago |
| 8 | merged-ops-maintenance | 运维辅助-清理与向量化 | */6h | ✅ ok | 0 | 5h ago |
| 9 | merged-backup-daily | 自动备份 | 7,19 daily | ✅ ok | 0 | 5h ago |
| 10 | merged-isc-quality-daily | ISC技能质量管理 | 20:00 daily | ✅ ok | 0 | 4h ago |
| 11 | b76c9b20 | CRAS-A-主动学习引擎 | 09:00 daily | ✅ ok | 0 | 15h ago |
| 12 | f6f0ba02 | CRAS-D-战略调研 | 10:00 daily | ✅ ok | 0 | 14h ago |
| 13 | d9d8123d | CRAS-E-自主进化 | 02:00 daily | ✅ ok | 0 | 22h ago |
| 14 | 504ace91 | LEP-韧性日报 | 09:00 daily | ✅ ok | 0 | 15h ago |
| 15 | e4b2a1cb | 系统维护-每日清理 | 02:00 daily | ✅ ok | 0 | 22h ago |

---

## 三、异常清单 ❌ → 已修复

### 3.1 `event-dispatch-runner` — 空 payload 导致连续超时 ⚡ 已修复

- **问题**: payload 仅有 `"kind": "agentTurn"`，无 message 字段，Agent 无任务可执行 → 60s 超时
- **影响**: consecutiveErrors = 5，每5分钟白耗一次 Agent session
- **根因**: 创建时遗漏 message 字段，且与系统 crontab 的 `cron-dispatch-runner.js` 功能重复
- **修复**: `openclaw cron disable event-dispatch-runner` ✅
- **建议**: 后续确认不需要后 `openclaw cron rm event-dispatch-runner` 彻底清除

---

## 四、本次修复动作汇总

| # | 修复项 | 类型 | 动作 | 风险 |
|---|--------|------|------|------|
| 1 | event-dispatch-runner | OpenClaw cron | disabled（空 payload 致连续超时） | 低：系统 crontab 已有等效任务 |
| 2 | stargate 重复条目 | 系统 crontab | 移除用户 crontab 的 `*/5` 条目（/etc/cron.d 每分钟已覆盖） | 无：flock 保护，功能完全冗余 |
| 3 | session-cleanup-governor.sh | 系统 crontab | 补 `flock -xn` + 日志重定向 | 无：仅加固 |
| 4 | gateway-memory-governor.sh | 系统 crontab | 补 `flock -xn` + 日志重定向 | 无：仅加固 |
| 5 | git-sensor.js | 系统 crontab | 补 `flock -xn`（1分钟高频必须防并发） | 无：仅加固 |

---

## 五、已禁用任务清单（不动）

| # | ID | 名称 | 禁用原因 |
|---|-----|------|----------|
| 1 | 5f7cc02f | ClawHub-Skills-批量安装 | 一次性任务，已完成 |
| 2 | e9ca2582 | CRAS-B-用户洞察分析 | Module B 全是 mock 代码，等 v4 重建 |
| 3 | 23b6618c | CRAS-洞察复盘-每周 | 已禁用 |
| 4 | 00f760d7 | 全局自主决策流水线 | 用户手动暂停，等代码同步 |
| 5 | dd8f4da9 | 飞书会话实时备份 | 已禁用 |
| 6 | 1c3f0f9a | EvoMap-Evolver-自动进化 | 上次 error(timeout 600s)，已禁用 |
| 7 | merged-cras-knowledge-6h | CRAS-知识治理与洞察 | 已禁用 |
| 8 | d2-03-cron-healer | D2-03-自愈守卫 | 已禁用 |

> 以上 8 项均为预期禁用状态，无需干预。

---

## 六、观察项与建议

### 6.1 日志膨胀风险 🔍

| 日志 | 当前大小 | 增长速率估算 | 建议 |
|------|----------|-------------|------|
| cron-dispatch.log | 328K | ~50K/day | 加入 logrotate 或按日切割 |
| correction-harvester.log | 136K | ~20K/day | 同上 |
| rework-analyzer.log | 120K | ~20K/day | 同上 |
| api-probe.log (/tmp) | 60K | 中 | 迁移到 infrastructure/logs/ 统一管理 |
| git-sensor.log (/tmp) | 28K | ~5K/day | 同上 |

### 6.2 频率分布分析

```
每分钟(×1):  git-sensor
每5分钟(×7): rework-analyzer, correction-harvester, gateway-mem-governor,
             api-probe, intent-extractor, cron-dispatch-runner, dispatch-reap
每10分钟(×2): session-cleanup, threshold-scanner
每15分钟(×2): ISC变更检测, (系统cron内无)
每小时(×4):  day-completion-scanner, system-monitor, DTO-AEO, (OC event-dispatcher)
每4小时(×3): capability-pdca, system-pipeline, (已禁用:evolver)
每6小时(×3): memory-summary, ops-maintenance, (已禁用:cras-knowledge)
每日(×7):    backup-rotate(03:00), CRAS-E(02:00), 系统维护(02:00),
             CRAS-A(09:00), LEP日报(09:00), CRAS-D(10:00),
             backup(07/19:00), ISC质量(20:00)
```

**峰值时段**: 每5分钟整点同时触发 7 个任务。建议对非关键任务加 `staggerMs` 或错开秒级偏移减少瞬时 fork 压力。

### 6.3 cron 服务本身

- **systemd cron.service**: ✅ active (running)，enabled，运行 10h+
- **内存**: 268MB（含子进程 sgagent/barad_agent），正常范围
- **无孤儿进程**: Tasks=10，合理

---

## 七、结论

全量 39 条 cron 任务复核完毕。发现 **1 个异常**（空 payload 超时）+ **3 个安全加固项**（缺 flock）+ **1 个冗余条目**，均已当场修复。当前全部 cron **零异常运行**。

8 个已禁用任务为预期状态，无需干预。日志膨胀和频率峰值为中期优化建议，不影响当前运行。
