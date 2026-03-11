# long-horizon-autonomy

长周期自治技能——覆盖研究信号采集、系统演化追踪、系统卫生清理三大子系统。

## 入口

```bash
node index.js --action <research|evolution|hygiene> [--dry-run]
```

## 三子系统

### 1. research — 研究信号采集

将外部学术/开源信号转化为内部可操作洞察和ISC规则草稿。

| 脚本 | 频率 | 功能 |
|------|------|------|
| research-signal-harvester.js | 每天 07:00 | HuggingFace/GitHub公开信号采集 |
| directed-research-harvester.js | 每天 | 定向课题（元认知、Agent自进化、多Agent协同）arXiv探针 |
| theory-to-rule-pipeline.js | 每周二 10:00 | 近7天信号→ISC规则草稿转化 |

数据流：外部API → reports/research-signals/ → theory-to-rule-pipeline → 规则草稿

### 2. evolution — 演化指标追踪

量化系统能力增长和有序度变化，生成周期性检查点报告。

| 脚本 | 频率 | 功能 |
|------|------|------|
| capability-growth-tracker.js | 每月1号 09:00 | 四维能力指数（知识/自动化/输出/演化） |
| entropy-index-calculator.sh | 每天 00:05 | 系统熵值/有序度日指标 |
| evolution-checkpoint-audit.js | 每周五 17:00 | 核心进化系统健康检查（ISC/CRAS/cron/git/MemOS） |
| weekly-evolution-report.sh | 每周一 09:00 | 进化周报（git活动/技能增长/信号摘要） |

数据流：系统状态 → reports/trends/*.jsonl → 检查点审计 → 周报

### 3. hygiene — 系统卫生清理

定期清理死文件、孤儿任务、陈旧backlog、过期日志，防止系统熵增。

| 脚本 | 频率 | 功能 |
|------|------|------|
| dead-skill-detector.sh | 每周六 10:00 | 检测>30天未引用的技能 |
| orphaned-task-scanner.sh | 每天 06:00 | 扫描>48h未推进的任务文档 |
| stale-backlog-pruner.sh | 每周三 10:00 | 标记>30天未触碰的backlog条目 |
| log-archive-rotator.sh | 每天 03:10 | 归档>7天日志，清理>30天归档 |

数据流：文件系统扫描 → reports/daily|weekly/ → 归档/清理建议
