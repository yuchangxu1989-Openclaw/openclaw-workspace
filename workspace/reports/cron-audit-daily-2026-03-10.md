# Cron 任务每日审计报告 — 2026-03-10

| # | 任务 | 调度时间 | 最后运行 | 判定 | 说明 |
|---|------|---------|---------|------|------|
| 1 | evalset-cron-daily | 05:00 | 03-10 05:00 | ✅ 正常产出 | 03-09 生成3条用例；03-10 采样0条候选（正常跳过） |
| 2 | orphaned-task-scanner | 06:00 | 03-10 06:00 | ✅ 正常产出 | 今日扫描115个过期文件，连续3天正常输出 |
| 3 | cras-daily-aggregator | 06:30 | 03-10 06:30 | ✅ 正常产出 | 北极星评分3.2/5，报告已生成。日志有重复行（每行打印两次），不影响功能 |
| 4 | research-signal-harvester | 07:00 | 03-10 07:00 | ✅ 正常产出 | 每日稳定产出10条信号，连续运行正常 |
| 5 | directed-research-harvester | 07:30 | 03-10 07:30 | ✅ 正常产出 | 03-09: 15篇论文/3条可操作洞察，已写入事件总线 |
| 6 | unknown-unknowns-scanner | 08:00 | 03-10 08:00 | ⚠️ 正常产出(有风险) | 发现1个高风险盲区：Handler能力缺失(360次失败)，需关注 |
| 7 | auto-skill-discovery | 09:00 | — | ❌ 未运行 | 日志文件不存在（仅有JSON状态文件，最后更新03-09 21:44，非cron产出） |
| 8 | evolution-daily-report | 22:00 | 03-09 22:00 | ✅ 正常产出 | 日报已生成，提交=1 badcase=1，沉淀0条 |
| 9 | entropy-index-calculator | 00:05 | 03-10 00:05 | ✅ 正常产出 | order_score=495.90，rules=2530，commits_24h=161 |
| 10 | log-archive-rotator | 03:10 | 03-10 03:10 | ✅ 正常产出 | 连续4天正常归档清理 |

## 汇总

- **正常产出**: 8/10
- **正常但有风险**: 1/10 (unknown-unknowns-scanner 发现高风险盲区)
- **未运行**: 1/10 (auto-skill-discovery 日志文件缺失)
- **空转**: 0
- **报错**: 0

## 需要关注

1. **auto-skill-discovery** — 日志文件 `logs/wild-scripts-discovery.log` 不存在，cron可能未配置或输出路径不匹配。JSON状态文件存在但最后更新在03-09 21:44，非标准cron输出。
2. **unknown-unknowns-scanner** — 检测到8种Handler能力缺失类型，共360次失败，标记为HIGH风险。建议排查 `rule-equals-code-audit` 等缺失handler。
3. **cras-daily-aggregator** — 日志每行重复打印两次，疑似stdout被双重捕获，建议检查cron脚本的日志重定向。
