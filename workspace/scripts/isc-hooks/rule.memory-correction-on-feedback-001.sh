#!/usr/bin/env bash
# ISC Hook: rule.memory-correction-on-feedback-001
# 接收用户纠偏信号，通过MemOS搜索相关记忆并输出修正建议（MEMORY.md已废弃）
set -euo pipefail

RULE_ID="rule.memory-correction-on-feedback-001"
WORKSPACE="${WORKSPACE:-/root/.openclaw/workspace}"
MEMOS_READER="$WORKSPACE/scripts/memos-reader.js"

# 从stdin读取JSON事件
INPUT=$(cat)

# 提取纠偏关键词
TOPIC=$(echo "$INPUT" | grep -oP '"correction_topic"\s*:\s*"[^"]*"' | head -1 | sed 's/.*:.*"\(.*\)"/\1/' 2>/dev/null || true)
MESSAGE=$(echo "$INPUT" | grep -oP '"message"\s*:\s*"[^"]*"' | head -1 | sed 's/.*:.*"\(.*\)"/\1/' 2>/dev/null || true)

if [ -z "$TOPIC" ] && [ -z "$MESSAGE" ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"skip\", \"detail\":\"No correction_topic or message in event payload\"}"
  exit 0
fi

SEARCH_TERM="${TOPIC:-$MESSAGE}"

# 通过MemOS搜索相关记忆
if [ ! -f "$MEMOS_READER" ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"fail\", \"detail\":\"memos-reader.js not found\"}"
  exit 1
fi

RESULT=$(node -e "
  const m = require('$MEMOS_READER');
  if (!m.isAvailable()) { console.log(JSON.stringify({count:0,matches:[]})); process.exit(0); }
  const rows = m.searchFTS($(printf '%s' "$SEARCH_TERM" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync('/dev/stdin','utf8')))"), 10);
  const matches = rows.map(r => ({
    time: r.time,
    role: r.role,
    content: (r.summary || (r.content||'').slice(0,200)),
    action: 'review_and_correct'
  }));
  console.log(JSON.stringify({count:matches.length, matches}));
" 2>/dev/null || echo '{"count":0,"matches":[]}')

MATCH_COUNT=$(echo "$RESULT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.count)")

if [ "$MATCH_COUNT" -eq 0 ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"pass\", \"detail\":\"No conflicting memory found in MemOS for topic: $SEARCH_TERM\", \"corrections\":[]}"
  exit 0
fi

echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"action_needed\", \"detail\":\"Found $MATCH_COUNT MemOS entries matching correction topic: $SEARCH_TERM\", \"corrections\":$RESULT}"
exit 1
