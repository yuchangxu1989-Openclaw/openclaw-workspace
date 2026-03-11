#!/usr/bin/env bash
set -euo pipefail

# user-emphasis-auto-escalation-001.sh
# 扫描MemOS记忆中用户反复强调的概念，建议升级到代码实现（MEMORY.md已废弃）

WORKSPACE="${WORKSPACE:-/root/.openclaw/workspace}"
MEMOS_READER="$WORKSPACE/scripts/memos-reader.js"
MIN_REPEAT="${MIN_REPEAT:-2}"
TOP_N="${TOP_N:-20}"

if [ ! -f "$MEMOS_READER" ]; then
  echo '{"ok":false,"error":"memos-reader.js not found","concepts":[]}'
  exit 2
fi

# 通过MemOS提取用户强调的概念
RESULT=$(node -e "
  const m = require('$MEMOS_READER');
  if (!m.isAvailable()) { console.log(JSON.stringify({ok:true,source:'MemOS',escalation_candidates:0,concepts:[]})); process.exit(0); }
  const rows = m.searchFTS('铁令 OR 必须 OR 禁止 OR 务必 OR 强调 OR 纠偏 OR 反复', 50);
  // 统计高频词
  const freq = {};
  for (const r of rows) {
    const text = (r.summary || r.content || '').slice(0, 300);
    const words = text.match(/[\u4e00-\u9fff]{2,6}/g) || [];
    for (const w of words) { freq[w] = (freq[w] || 0) + 1; }
  }
  const minRepeat = ${MIN_REPEAT};
  const topN = ${TOP_N};
  const concepts = Object.entries(freq)
    .filter(([,c]) => c >= minRepeat)
    .sort((a,b) => b[1]-a[1])
    .slice(0, topN)
    .map(([concept, count]) => ({concept, count, suggestion:'升级到AGENTS.md或代码实现'}));
  if (concepts.length > 0) {
    console.log(JSON.stringify({ok:false,source:'MemOS',escalation_candidates:concepts.length,concepts}));
  } else {
    console.log(JSON.stringify({ok:true,source:'MemOS',escalation_candidates:0,concepts:[]}));
  }
" 2>/dev/null)

if [ -z "$RESULT" ]; then
  echo '{"ok":false,"error":"MemOS query failed","concepts":[]}'
  exit 2
fi

echo "$RESULT"
# 如果有需要升级的概念，exit 1
echo "$RESULT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.exit(d.ok ? 0 : 1)"
