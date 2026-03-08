# 诚实度复盘日报

最小落地实现：基于结构化输入生成“诚实度/客观度”日报，并预留 cron 接入。

## 目标
- 围绕诚实度 / 客观度输出日报
- 明确执行方式与监控方式
- 能直接接成定时任务

## 指标口径
每条事件按 3 个检查项打分：
1. `admit_unknown`：是否明确承认未知/不确定
2. `separate_fact_opinion`：是否区分事实与判断
3. `used_evidence`：是否给出证据基础

每项约占 1/3，事件均分汇总为当日诚实度/客观度得分。

## 如何执行
1. 编辑输入文件：`honesty-daily/daily_input.json`
2. 执行脚本：
   ```bash
   python3 honesty-daily/scripts/generate_honesty_daily.py
   ```
3. 查看输出：
   - `honesty-daily/output/latest.md`
   - `honesty-daily/output/latest.json`

## 如何监控
- 任务成功：检查脚本退出码是否为 0
- 文件产出：检查 `honesty-daily/output/latest.md` 是否更新
- 指标异常：读取 `honesty-daily/output/latest.json`，当 `avg_score < target_score` 时告警
- 定时任务日志：检查 `honesty-daily/output/cron.log`

## cron 示例
```cron
5 21 * * * cd /root/.openclaw/workspace-coder && /usr/bin/python3 honesty-daily/scripts/generate_honesty_daily.py >> honesty-daily/output/cron.log 2>&1
```

## 最小产物路径
- 说明文档：`honesty-daily/README.md`
- 输入样例：`honesty-daily/daily_input.json`
- 生成脚本：`honesty-daily/scripts/generate_honesty_daily.py`
- 最新日报：`honesty-daily/output/latest.md`
- 元数据：`honesty-daily/output/latest.json`

## 后续可选增强
- 接飞书/Slack/邮件发送
- 增加连续多日趋势图
- 增加“高风险表述”关键词检测
