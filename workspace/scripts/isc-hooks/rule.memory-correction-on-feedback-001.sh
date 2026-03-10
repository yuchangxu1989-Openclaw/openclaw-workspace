#!/usr/bin/env bash
# ISC Hook: rule.memory-correction-on-feedback-001
# 接收用户纠偏信号，扫描MEMORY.md中相关内容并输出修正建议
set -euo pipefail

RULE_ID="rule.memory-correction-on-feedback-001"
WORKSPACE="${WORKSPACE:-/root/.openclaw/workspace}"
MEMORY_FILE="$WORKSPACE/MEMORY.md"

# 从stdin读取JSON事件
INPUT=$(cat)

# 提取纠偏关键词（correction_topic字段或message中的关键内容）
TOPIC=$(echo "$INPUT" | grep -oP '"correction_topic"\s*:\s*"[^"]*"' | head -1 | sed 's/.*:.*"\(.*\)"/\1/' 2>/dev/null || true)
MESSAGE=$(echo "$INPUT" | grep -oP '"message"\s*:\s*"[^"]*"' | head -1 | sed 's/.*:.*"\(.*\)"/\1/' 2>/dev/null || true)

# 必须有纠偏信号
if [ -z "$TOPIC" ] && [ -z "$MESSAGE" ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"skip\", \"detail\":\"No correction_topic or message in event payload\"}"
  exit 0
fi

SEARCH_TERM="${TOPIC:-$MESSAGE}"

# 检查MEMORY.md是否存在
if [ ! -f "$MEMORY_FILE" ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"fail\", \"detail\":\"MEMORY.md not found at $MEMORY_FILE\"}"
  exit 1
fi

# 扫描MEMORY.md中与纠偏主题相关的行
MATCHES=$(grep -n -i "$SEARCH_TERM" "$MEMORY_FILE" 2>/dev/null || true)
MATCH_COUNT=$(echo "$MATCHES" | grep -c . 2>/dev/null || echo 0)

if [ "$MATCH_COUNT" -eq 0 ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"pass\", \"detail\":\"No conflicting memory found for topic: $SEARCH_TERM\", \"corrections\":[]}"
  exit 0
fi

# 有匹配内容，输出修正建议
# 将匹配行转为JSON数组
CORRECTIONS="["
FIRST=true
while IFS= read -r line; do
  [ -z "$line" ] && continue
  LINE_NUM=$(echo "$line" | cut -d: -f1)
  LINE_CONTENT=$(echo "$line" | cut -d: -f2- | sed 's/"/\\"/g' | sed 's/\t/ /g')
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    CORRECTIONS+=","
  fi
  CORRECTIONS+="{\"line\":$LINE_NUM,\"content\":\"$LINE_CONTENT\",\"action\":\"review_and_correct\"}"
done <<< "$MATCHES"
CORRECTIONS+="]"

echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"action_needed\", \"detail\":\"Found $MATCH_COUNT memory entries matching correction topic: $SEARCH_TERM\", \"corrections\":$CORRECTIONS}"
exit 1
