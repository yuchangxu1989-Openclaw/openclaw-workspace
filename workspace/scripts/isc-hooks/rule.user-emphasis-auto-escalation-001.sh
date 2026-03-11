#!/usr/bin/env bash
# ISC Handler: rule.user-emphasis-auto-escalation-001
# 通过MemOS检测用户反复强调的概念 → 建议升级到AGENTS.md或代码层（MEMORY.md已废弃）
#
# Input (stdin): JSON with optional { "concept": "<keyword>" }
# Output (stdout): JSON { "status", "concept", "count", "recommendation", "escalation_level" }
# Exit codes: 0=escalation needed, 1=no escalation, 2=error

set -euo pipefail

WORKSPACE="${ISC_WORKSPACE:-/root/.openclaw/workspace}"
MEMOS_READER="$WORKSPACE/scripts/memos-reader.js"

# --- Parse input ---
INPUT="$(cat -)"
CONCEPT=""
if [ -n "$INPUT" ] && [ "$INPUT" != "{}" ]; then
  CONCEPT="$(echo "$INPUT" | jq -r '.concept // empty' 2>/dev/null || true)"
fi

# --- Validate ---
if [ ! -f "$MEMOS_READER" ]; then
  echo '{"status":"error","message":"memos-reader.js not found"}'
  exit 2
fi

# --- Core logic via MemOS ---
node -e "
  const m = require('$MEMOS_READER');
  if (!m.isAvailable()) {
    console.log(JSON.stringify({status:'error',message:'MemOS not available'}));
    process.exit(2);
  }
  const concept = $(printf '%s' "${CONCEPT:-}" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync('/dev/stdin','utf8')))");
  if (concept) {
    // 单概念模式
    const rows = m.searchFTS(concept, 50);
    const count = rows.length;
    if (count >= 2) {
      const level = count >= 4 ? 'level_3_code' : 'level_2_agents';
      const rec = count >= 4
        ? 'Concept appears ' + count + ' times — high emphasis. Escalate to code-level hook.'
        : 'Concept appears ' + count + ' times in MemOS. Escalate to AGENTS.md or SOUL.md.';
      console.log(JSON.stringify({status:'escalation_needed',concept,count,recommendation:rec,escalation_level:level}));
      process.exit(0);
    } else {
      console.log(JSON.stringify({status:'ok',concept,count,recommendation:'No escalation needed yet.',escalation_level:'level_1_memory'}));
      process.exit(1);
    }
  } else {
    // 自动扫描模式
    const rows = m.searchFTS('铁令 OR 必须 OR 禁止 OR 务必 OR 强调 OR 纠偏 OR 反复', 50);
    const freq = {};
    for (const r of rows) {
      const text = (r.summary || r.content || '').slice(0, 300);
      const words = text.match(/[\u4e00-\u9fff]{2,6}/g) || [];
      for (const w of words) freq[w] = (freq[w] || 0) + 1;
    }
    const candidates = Object.entries(freq)
      .filter(([,c]) => c >= 2)
      .sort((a,b) => b[1]-a[1])
      .slice(0, 20)
      .map(([concept, count]) => ({concept, count, escalation_level: count >= 4 ? 'level_3_code' : 'level_2_agents'}));
    if (candidates.length > 0) {
      console.log(JSON.stringify({status:'escalation_needed',message:'Repeated concepts detected in MemOS',candidates}));
      process.exit(0);
    } else {
      console.log(JSON.stringify({status:'ok',message:'No repeated concepts found.',candidates:[]}));
      process.exit(1);
    }
  }
"
