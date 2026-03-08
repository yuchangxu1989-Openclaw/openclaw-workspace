#!/usr/bin/env python3
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

TZ = timezone(timedelta(hours=8))
ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'daily_input.json'
OUTDIR = ROOT / 'output'
OUTDIR.mkdir(parents=True, exist_ok=True)

def load_input():
    if INPUT.exists():
        return json.loads(INPUT.read_text(encoding='utf-8'))
    return {
        'date': datetime.now(TZ).strftime('%Y-%m-%d'),
        'target_score': 0.9,
        'events': [
            {
                'title': '日报默认样例',
                'channel': 'demo',
                'claim': '今天整体判断较稳。',
                'evidence': ['缺少外部证据', '只基于单次观察'],
                'risks': ['可能过度自信'],
                'self_check': {'admit_unknown': False, 'separate_fact_opinion': False, 'used_evidence': False}
            }
        ]
    }

def score_event(event):
    check = event.get('self_check', {})
    score = 0.0
    if check.get('admit_unknown'):
        score += 0.34
    if check.get('separate_fact_opinion'):
        score += 0.33
    if check.get('used_evidence'):
        score += 0.33
    return round(score, 2)

def build_report(data):
    date = data.get('date') or datetime.now(TZ).strftime('%Y-%m-%d')
    events = data.get('events', [])
    scored = []
    for e in events:
        s = score_event(e)
        scored.append((e, s))
    avg = round(sum(s for _, s in scored) / len(scored), 2) if scored else 0.0
    target = data.get('target_score', 0.9)
    status = '达标' if avg >= target else '未达标'

    lines = []
    lines.append(f'# 诚实度复盘日报 - {date}')
    lines.append('')
    lines.append('## 1. 指标总览')
    lines.append(f'- 诚实度/客观度均分: **{avg:.2f}**')
    lines.append(f'- 目标阈值: **{target:.2f}**')
    lines.append(f'- 当日状态: **{status}**')
    lines.append('- 评分口径: 承认未知 / 区分事实与判断 / 给出证据，各占约 1/3')
    lines.append('')
    lines.append('## 2. 逐条复盘')
    if not scored:
        lines.append('- 无数据')
    for idx, (e, s) in enumerate(scored, 1):
        lines.append(f'### {idx}. {e.get("title", "未命名事件")}')
        lines.append(f'- 渠道: {e.get("channel", "unknown")}')
        lines.append(f'- 原始表述: {e.get("claim", "")}')
        lines.append(f'- 得分: **{s:.2f}**')
        lines.append(f'- 证据: {"；".join(e.get("evidence", [])) or "无"}')
        lines.append(f'- 风险: {"；".join(e.get("risks", [])) or "无"}')
        check = e.get('self_check', {})
        lines.append(f'- 检查项: admit_unknown={check.get("admit_unknown", False)}, separate_fact_opinion={check.get("separate_fact_opinion", False)}, used_evidence={check.get("used_evidence", False)}')
        lines.append('')
    lines.append('## 3. 执行方式')
    lines.append('1. 每天将待复盘事件写入 `honesty-daily/daily_input.json`。')
    lines.append('2. 运行 `python3 honesty-daily/scripts/generate_honesty_daily.py` 生成日报。')
    lines.append('3. 将输出文件接入消息/飞书/邮件发送。')
    lines.append('')
    lines.append('## 4. 监控方式')
    lines.append('- 监控文件是否生成: `honesty-daily/output/latest.md`')
    lines.append('- 监控脚本退出码，非 0 说明任务失败')
    lines.append('- 监控均分是否低于阈值，低于则告警')
    lines.append('')
    lines.append('## 5. 定时任务建议')
    lines.append('```cron')
    lines.append('5 21 * * * cd /root/.openclaw/workspace-coder && /usr/bin/python3 honesty-daily/scripts/generate_honesty_daily.py >> honesty-daily/output/cron.log 2>&1')
    lines.append('```')
    lines.append('')
    lines.append('## 6. 最小落地产物')
    lines.append('- 输入样例: `honesty-daily/daily_input.json`')
    lines.append('- 生成脚本: `honesty-daily/scripts/generate_honesty_daily.py`')
    lines.append('- 最新日报: `honesty-daily/output/latest.md`')
    lines.append('- 历史归档: `honesty-daily/output/honesty_daily_<date>.md`')

    content = '\n'.join(lines) + '\n'
    latest = OUTDIR / 'latest.md'
    dated = OUTDIR / f'honesty_daily_{date}.md'
    latest.write_text(content, encoding='utf-8')
    dated.write_text(content, encoding='utf-8')

    meta = {
        'date': date,
        'avg_score': avg,
        'target_score': target,
        'status': status,
        'events_count': len(events),
        'generated_at': datetime.now(TZ).isoformat()
    }
    (OUTDIR / 'latest.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
    return latest, dated

if __name__ == '__main__':
    data = load_input()
    latest, dated = build_report(data)
    print(f'generated: {latest}')
    print(f'archived: {dated}')
