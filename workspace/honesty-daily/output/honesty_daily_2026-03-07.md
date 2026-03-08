# 诚实度复盘日报 - 2026-03-07

## 1. 指标总览
- 诚实度/客观度均分: **1.00**
- 目标阈值: **0.90**
- 当日状态: **达标**
- 评分口径: 承认未知 / 区分事实与判断 / 给出证据，各占约 1/3

## 2. 逐条复盘
### 1. 回答项目进度是否乐观
- 渠道: team-sync
- 原始表述: 当前看起来本周大概率能完成，但仍缺少最终联调证据。
- 得分: **1.00**
- 证据: 核心功能已自测通过；联调尚未完成
- 风险: 容易把主观乐观当成确定性判断
- 检查项: admit_unknown=True, separate_fact_opinion=True, used_evidence=True

### 2. 解释线上问题原因
- 渠道: incident-review
- 原始表述: 初步怀疑是缓存失效策略问题，尚未完全确认。
- 得分: **1.00**
- 证据: 日志显示命中率异常下降
- 风险: 根因未完全确认前表述可能过强
- 检查项: admit_unknown=True, separate_fact_opinion=True, used_evidence=True

## 3. 执行方式
1. 每天将待复盘事件写入 `honesty-daily/daily_input.json`。
2. 运行 `python3 honesty-daily/scripts/generate_honesty_daily.py` 生成日报。
3. 将输出文件接入消息/飞书/邮件发送。

## 4. 监控方式
- 监控文件是否生成: `honesty-daily/output/latest.md`
- 监控脚本退出码，非 0 说明任务失败
- 监控均分是否低于阈值，低于则告警

## 5. 定时任务建议
```cron
5 21 * * * cd /root/.openclaw/workspace-coder && /usr/bin/python3 honesty-daily/scripts/generate_honesty_daily.py >> honesty-daily/output/cron.log 2>&1
```

## 6. 最小落地产物
- 输入样例: `honesty-daily/daily_input.json`
- 生成脚本: `honesty-daily/scripts/generate_honesty_daily.py`
- 最新日报: `honesty-daily/output/latest.md`
- 历史归档: `honesty-daily/output/honesty_daily_<date>.md`
