#!/bin/bash
# CRAS每日洞察报告汇总脚本
# 每天19:00由OpenClaw cron触发，汇总5大模块报告推送到飞书
set -euo pipefail

TODAY=$(date +%Y-%m-%d)
INSIGHTS_DIR="/root/.openclaw/workspace/skills/cras/insights"
REPORT_FILE="/tmp/cras-daily-report-${TODAY}.md"

# 初始化报告
cat > "$REPORT_FILE" <<EOF
📊 CRAS每日洞察报告 - ${TODAY}

EOF

# 模块A: 学习洞察
echo "## 🎓 学习洞察（今日学到了什么）" >> "$REPORT_FILE"
LEARNING_FILE="${INSIGHTS_DIR}/learning-${TODAY}.json"
if [ -f "$LEARNING_FILE" ]; then
  python3 -c "
import json, sys
try:
    data = json.load(open('$LEARNING_FILE'))
    insights = data if isinstance(data, list) else data.get('insights', data.get('results', [data]))
    if not isinstance(insights, list): insights = [insights]
    for i, item in enumerate(insights[:5], 1):
        title = item.get('title', item.get('topic', '未命名'))
        summary = item.get('summary', item.get('insight', item.get('description', '无摘要')))
        source = item.get('source_url', item.get('source', 'knowledge_inference'))
        print(f'- **{title}**: {summary}')
        print(f'  来源: {source}')
except Exception as e:
    print(f'数据解析异常: {e}')
" >> "$REPORT_FILE" 2>/dev/null || echo "暂无数据" >> "$REPORT_FILE"
else
  echo "暂无数据" >> "$REPORT_FILE"
fi
echo "" >> "$REPORT_FILE"

# 模块B: 用户洞察
echo "## 👤 用户洞察（对话模式变化）" >> "$REPORT_FILE"
USER_FILE="${INSIGHTS_DIR}/user-${TODAY}.json"
if [ -f "$USER_FILE" ]; then
  python3 -c "
import json
try:
    data = json.load(open('$USER_FILE'))
    patterns = data if isinstance(data, list) else data.get('patterns', data.get('insights', [data]))
    if not isinstance(patterns, list): patterns = [patterns]
    for p in patterns[:5]:
        label = p.get('pattern', p.get('title', '未分类'))
        desc = p.get('description', p.get('summary', '无描述'))
        print(f'- **{label}**: {desc}')
except Exception as e:
    print(f'数据解析异常: {e}')
" >> "$REPORT_FILE" 2>/dev/null || echo "暂无数据" >> "$REPORT_FILE"
else
  echo "暂无数据" >> "$REPORT_FILE"
fi
echo "" >> "$REPORT_FILE"

# 模块C: 知识治理
echo "## 📚 知识治理（知识库健康度）" >> "$REPORT_FILE"
KNOWLEDGE_FILE="${INSIGHTS_DIR}/knowledge-${TODAY}.json"
if [ -f "$KNOWLEDGE_FILE" ]; then
  python3 -c "
import json
try:
    data = json.load(open('$KNOWLEDGE_FILE'))
    metrics = data.get('metrics', data)
    if isinstance(metrics, dict):
        for k, v in list(metrics.items())[:8]:
            print(f'- **{k}**: {v}')
    elif isinstance(metrics, list):
        for m in metrics[:5]:
            label = m.get('metric', m.get('name', '指标'))
            val = m.get('value', m.get('score', 'N/A'))
            print(f'- **{label}**: {val}')
except Exception as e:
    print(f'数据解析异常: {e}')
" >> "$REPORT_FILE" 2>/dev/null || echo "暂无数据" >> "$REPORT_FILE"
else
  echo "暂无数据" >> "$REPORT_FILE"
fi
echo "" >> "$REPORT_FILE"

# 模块D: 战略行研
echo "## 🔭 战略行研（外部趋势）" >> "$REPORT_FILE"
STRATEGY_FILE="${INSIGHTS_DIR}/strategy-${TODAY}.json"
if [ -f "$STRATEGY_FILE" ]; then
  python3 -c "
import json
try:
    data = json.load(open('$STRATEGY_FILE'))
    trends = data if isinstance(data, list) else data.get('trends', data.get('insights', [data]))
    if not isinstance(trends, list): trends = [trends]
    for t in trends[:5]:
        title = t.get('title', t.get('trend', '未命名'))
        summary = t.get('summary', t.get('description', '无摘要'))
        source = t.get('source_url', t.get('source', ''))
        print(f'- **{title}**: {summary}')
        if source: print(f'  来源: {source}')
except Exception as e:
    print(f'数据解析异常: {e}')
" >> "$REPORT_FILE" 2>/dev/null || echo "暂无数据" >> "$REPORT_FILE"
else
  echo "暂无数据" >> "$REPORT_FILE"
fi
echo "" >> "$REPORT_FILE"

# 模块E: 进化建议
echo "## 🧬 进化建议（系统优化方向）" >> "$REPORT_FILE"
EVOLUTION_FILE="${INSIGHTS_DIR}/evolution-${TODAY}.json"
if [ -f "$EVOLUTION_FILE" ]; then
  python3 -c "
import json
try:
    data = json.load(open('$EVOLUTION_FILE'))
    suggestions = data if isinstance(data, list) else data.get('suggestions', data.get('recommendations', [data]))
    if not isinstance(suggestions, list): suggestions = [suggestions]
    for s in suggestions[:5]:
        title = s.get('title', s.get('area', '未分类'))
        desc = s.get('description', s.get('suggestion', '无描述'))
        priority = s.get('priority', '')
        prefix = f'[{priority}] ' if priority else ''
        print(f'- **{prefix}{title}**: {desc}')
except Exception as e:
    print(f'数据解析异常: {e}')
" >> "$REPORT_FILE" 2>/dev/null || echo "暂无数据" >> "$REPORT_FILE"
else
  echo "暂无数据" >> "$REPORT_FILE"
fi

# 输出报告内容（供cron agent读取并发送）
cat "$REPORT_FILE"
