# 系统运营日报生成器

## 描述
从真实运行时数据源采集指标，生成系统运营日报。支持变化对比（delta）、异常检测、主动建议。

## 触发方式
- Cron 定时任务（建议 08:00 / 20:00）
- 手动执行：`node /root/.openclaw/workspace/skills/daily-ops-report/generate.cjs`

## 数据源
| 数据源 | 路径/命令 |
|--------|-----------|
| Cron 执行记录 | `/root/.openclaw/cron/runs/*.jsonl` |
| Cron 任务配置 | `/root/.openclaw/cron/jobs.json` |
| 子 Agent 执行记录 | `/root/.openclaw/subagents/runs.json` |
| Git 提交历史 | `cd /root/.openclaw && git log` |
| 系统内存 | `free -m` |
| 磁盘使用 | `df -h /` |
| 系统运行时长 | `uptime` |
| Gateway 进程 | `ps aux \| grep openclaw` |

## 输出
- Markdown 格式报告输出到 stdout
- 状态文件保存至 `/root/.openclaw/workspace/reports/.daily-report-state.json`（供下次 delta 计算）

## 异常检测阈值
- 内存使用 > 80%：🔴 HIGH
- 内存使用 > 60%：🟡 WARN
- 磁盘使用 > 85%：🔴 HIGH
- 磁盘使用 > 70%：🟡 WARN
- Cron 任务失败：🔴 HIGH
- Cron 任务持续跳过：🟡 WARN
- Gateway 进程不存在：🔴 CRITICAL
- 系统负载 > 4.0：🟡 WARN
- 子 Agent 失败：🟡 WARN
