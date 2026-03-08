#!/bin/bash
# 每日公众号复盘文章触发器
# 由cron每天23:00调用
# 读取prompt.md，派发3个Agent并行执行

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
PROMPT=$(cat "$SKILL_DIR/prompt.md")
TODAY=$(date +%Y-%m-%d)

# 替换日期占位符
PROMPT_TODAY=$(echo "$PROMPT" | sed "s/YYYY-MM-DD/$TODAY/g")

echo "📝 每日公众号复盘文章 - $TODAY"
echo "🚀 将派发3个Agent并行执行"
echo ""
echo "请主Agent读取 $SKILL_DIR/prompt.md 并派发以下3个任务："
echo "1. sessions_spawn agentId=writer label=gongzhonghao-$TODAY-writer task='...' thinking=high"
echo "2. sessions_spawn agentId=researcher label=gongzhonghao-$TODAY-researcher task='...'"
echo "3. sessions_spawn agentId=coder label=gongzhonghao-$TODAY-coder task='...'"
