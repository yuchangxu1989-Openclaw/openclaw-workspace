// collect-and-report-progress.js
// Collects real session data from agents/*/sessions/sessions.json
// Builds and sends a Feishu Interactive Card with global progress snapshot
//
// Usage:
//   node collect-and-report-progress.js              -> send to current user
//   node collect-and-report-progress.js oc_xxx        -> send to group chat
//   node collect-and-report-progress.js --dry-run     -> print card JSON only

const fs = require('fs');
const path = require('path');
const { sendCard, getCurrentSessionReceiveId } = require('/root/.openclaw/workspace/skills/feishu-card-sender/index.js');

const AGENTS_DIR = '/root/.openclaw/agents';
const CUTOFF_MS = 60 * 60 * 1000; // 1 hour

function collectSessions() {
  const results = [];
  const now = Date.now();
  const agentDirs = fs.readdirSync(AGENTS_DIR).filter(d => {
    return fs.statSync(path.join(AGENTS_DIR, d)).isDirectory();
  });

  for (const agentName of agentDirs) {
    const sessionsFile = path.join(AGENTS_DIR, agentName, 'sessions', 'sessions.json');
    if (!fs.existsSync(sessionsFile)) continue;
    try {
      const sessions = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
      for (const [key, sess] of Object.entries(sessions)) {
        if (sess.updatedAt && (now - sess.updatedAt) < CUTOFF_MS) {
          results.push({
            key,
            agent: agentName,
            label: sess.label || key.split(':').pop(),
            model: sess.model || 'unknown',
            updatedAt: sess.updatedAt,
            totalTokens: sess.totalTokens || 0,
            aborted: sess.abortedLastRun || false,
            isSubagent: key.includes(':subagent:'),
            isCron: key.includes(':cron:'),
            isMain: key === 'agent:' + agentName + ':main',
          });
        }
      }
    } catch (e) { /* skip */ }
  }
  return results.sort((a, b) => b.updatedAt - a.updatedAt);
}

function buildCard(sessions) {
  const subagents = sessions.filter(s => s.isSubagent);
  const crons = sessions.filter(s => s.isCron);
  const mains = sessions.filter(s => s.isMain);
  const totalTokens = sessions.reduce((sum, s) => sum + s.totalTokens, 0);
  const uniqueAgents = [...new Set(sessions.map(s => s.agent))];
  const uniqueModels = [...new Set(sessions.map(s => s.model))];
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const aborted = sessions.filter(s => s.aborted);

  const overview = [
    '**Active Sessions**: ' + sessions.length,
    '**Agents**: ' + uniqueAgents.length + ' (' + uniqueAgents.join(', ') + ')',
    '**Models**: ' + uniqueModels.join(', '),
    '**Total Tokens**: ' + (totalTokens / 1000).toFixed(1) + 'k',
    'Subagents **' + subagents.length + '** | Main **' + mains.length + '** | Cron **' + crons.length + '**',
  ].join('\n');

  const elements = [
    { tag: 'div', text: { tag: 'lark_md', content: overview } },
    { tag: 'hr' },
  ];

  // Subagent details (top 10)
  if (subagents.length > 0) {
    const lines = subagents.slice(0, 10).map(s => {
      const ago = Math.round((Date.now() - s.updatedAt) / 60000);
      const tok = s.totalTokens > 0 ? ' ' + (s.totalTokens/1000).toFixed(1) + 'k tok' : '';
      return '- **' + s.agent + '** `' + s.label + '` `' + s.model + '`' + tok + ' ' + ago + 'm ago';
    }).join('\n');
    const extra = subagents.length > 10 ? '\n...and ' + (subagents.length - 10) + ' more' : '';
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: '**Subagents (' + subagents.length + ')**\n' + lines + extra } });
    elements.push({ tag: 'hr' });
  }

  // Cron details
  if (crons.length > 0) {
    const lines = crons.map(s => {
      const ago = Math.round((Date.now() - s.updatedAt) / 60000);
      return '- **' + s.label + '** `' + s.model + '` ' + ago + 'm ago';
    }).join('\n');
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: '**Cron (' + crons.length + ')**\n' + lines } });
    elements.push({ tag: 'hr' });
  }

  // Alerts
  if (aborted.length > 0) {
    const lines = aborted.map(s => '- **' + s.agent + '** `' + s.label + '` last run aborted').join('\n');
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: '**Alerts (' + aborted.length + ')**\n' + lines } });
    elements.push({ tag: 'hr' });
  }

  elements.push({
    tag: 'note',
    elements: [{ tag: 'plain_text', content: 'Source: agents/*/sessions.json | ' + ts + ' | Window: 1h' }]
  });

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: 'Global Progress Snapshot - ' + ts },
      template: aborted.length > 0 ? 'orange' : 'blue'
    },
    elements
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const targetId = args.find(a => a.startsWith('ou_') || a.startsWith('oc_'));

  const sessions = collectSessions();
  console.log('Collected ' + sessions.length + ' active sessions');

  if (sessions.length === 0) {
    console.log('No active sessions. Nothing to report.');
    return;
  }

  const card = buildCard(sessions);

  if (dryRun) {
    console.log(JSON.stringify(card, null, 2));
    return;
  }

  const receiveId = targetId || getCurrentSessionReceiveId();
  if (!receiveId) {
    console.error('No receiveId available');
    process.exit(1);
  }

  console.log('Sending to ' + receiveId + '...');
  const result = await sendCard({ receiveId, card });
  if (result.success) {
    console.log('Sent! messageId=' + result.messageId);
  } else {
    console.error('Failed: ' + result.error);
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
