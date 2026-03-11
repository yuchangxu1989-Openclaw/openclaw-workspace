const fs = require('fs');
const path = require('path');

// Innovation: Self-Correction Analyzer
// Analyze past failures to suggest better future mutations
// Pattern: Meta-learning

function analyzeFailures() {
  const failures = [];

  // Primary: MemOS FTS搜索失败相关记忆
  try {
    const memos = require('/root/.openclaw/workspace/scripts/memos-reader');
    if (memos.isAvailable()) {
      const rows = memos.searchFTS('失败 OR 修复 OR Fix OR failure OR bug', 20);
      for (const r of rows) {
        const text = r.summary || (r.content || '').slice(0, 200);
        if (text) failures.push({ summary: text, detail: 'MemOS' });
      }
    }
  } catch {}

  return {
    status: 'success',
    count: failures.length,
    failures: failures.slice(0, 3)
  };
}

if (require.main === module) {
  console.log(JSON.stringify(analyzeFailures(), null, 2));
}

module.exports = { analyzeFailures };
