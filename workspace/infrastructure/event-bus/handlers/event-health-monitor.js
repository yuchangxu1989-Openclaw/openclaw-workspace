const fs = require('fs');
const path = require('path');

module.exports = async function(event, rule, context) {
  const root = (context && (context.workspaceRoot || context.cwd || context.rootDir)) || process.cwd();
  const eventFile = path.join(root, 'infrastructure', 'event-bus', 'events.jsonl');

  if (!fs.existsSync(eventFile)) {
    return { ok: false, reason: 'events.jsonl不存在', closeLoopRate: 0 };
  }

  const lines = fs.readFileSync(eventFile, 'utf8').split('\n').filter(Boolean);
  let total = 0;
  let closed = 0;

  for (const line of lines.slice(-500)) {
    try {
      const e = JSON.parse(line);
      total += 1;
      const payload = JSON.stringify(e).toLowerCase();
      if (payload.includes('ack') || payload.includes('done') || payload.includes('closed') || payload.includes('resolved')) {
        closed += 1;
      }
    } catch (_) {
      // ignore malformed lines
    }
  }

  const closeLoopRate = total === 0 ? 1 : closed / total;
  return {
    ok: closeLoopRate >= 0.6,
    total,
    closed,
    closeLoopRate,
    message: `反馈闭环率 ${(closeLoopRate * 100).toFixed(1)}%`
  };
};
