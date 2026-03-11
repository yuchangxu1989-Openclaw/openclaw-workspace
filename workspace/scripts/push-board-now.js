#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');

const AGENTS_DIR = '/root/.openclaw/agents';
const DONE_FILE = '/tmp/feishu-board-push-dedup/done-sessions.txt';
const BOARD_FILE = '/root/.openclaw/workspace/logs/subagent-task-board.json';

// 从.env.feishu读取密钥
function loadEnvFeishu() {
  const envPath = '/root/.openclaw/workspace/.env.feishu';
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const m = line.match(/^(\w+)=(.+)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
const _fenv = loadEnvFeishu();
const APP_ID = process.env.FEISHU_APP_ID || _fenv.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET || _fenv.FEISHU_APP_SECRET;
const RECEIVE_ID = process.env.FEISHU_RECEIVE_ID || _fenv.FEISHU_RECEIVE_ID;

// ── 1. Load sessions from ALL agent directories ──
// Each entry: { val, sessDir } keyed by session key
const allSessions = {};
const agentDirs = fs.readdirSync(AGENTS_DIR).filter(d => {
  try { return fs.statSync(`${AGENTS_DIR}/${d}/sessions/sessions.json`).isFile(); } catch(e) { return false; }
});
for (const agent of agentDirs) {
  try {
    const sessFile = `${AGENTS_DIR}/${agent}/sessions/sessions.json`;
    const sess = JSON.parse(fs.readFileSync(sessFile, 'utf8'));
    for (const [key, val] of Object.entries(sess)) {
      if (!key.includes(':subagent:')) continue;
      allSessions[key] = { val, sessDir: `${AGENTS_DIR}/${agent}/sessions` };
    }
  } catch(e) {}
}

let doneSet = new Set();
try { doneSet = new Set(fs.readFileSync(DONE_FILE, 'utf8').split('\n').filter(Boolean)); } catch(e) {}
const board = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
const now = Date.now();
const todayStr = new Date(now + 8*3600*1000).toISOString().slice(0, 10);
const STALE_MS = 45 * 60 * 1000;

// ── 2. Build comprehensive "finished" set ──
// Sources: done-sessions.txt, abortedLastRun, board status, transcript detection
const finishedSet = new Set(doneSet);
const abortedLabels = new Set();

for (const [key, {val}] of Object.entries(allSessions)) {
  const label = val.label || key.split(':subagent:')[1].substring(0, 12);
  if (val.abortedLastRun === true) {
    finishedSet.add(label);
    abortedLabels.add(label);
  }
}
for (const t of board) {
  if (['done', 'timeout', 'failed'].includes(t.status) && t.label) {
    finishedSet.add(t.label);
  }
}

// Transcript-based completion: check if last assistant message has stopReason='stop'
function isCompletedByTranscript(sessionVal, sessDir) {
  try {
    const sid = sessionVal.sessionId;
    if (!sid) return false;
    const tp = `${sessDir}/${sid}.jsonl`;
    if (!fs.existsSync(tp)) return false;
    const stat = fs.statSync(tp);
    const readSize = Math.min(stat.size, 8192);
    const buf = Buffer.alloc(readSize);
    const fd = fs.openSync(tp, 'r');
    fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        const msg = entry.message || entry;
        if (msg.role === 'assistant') {
          // Terminal stopReasons: stop=completed, length/end_turn=hit limit
          // Non-terminal: toolUse=still running (waiting for tool result)
          const sr = msg.stopReason;
          return sr === 'stop' || sr === 'length' || sr === 'end_turn';
        }
      } catch(e) {}
    }
  } catch(e) {}
  return false;
}

const newlyDiscoveredDone = [];
for (const [key, {val, sessDir}] of Object.entries(allSessions)) {
  const age = now - (val.updatedAt || 0);
  if (age > STALE_MS) continue;
  const label = val.label || key.split(':subagent:')[1].substring(0, 12);
  if (finishedSet.has(label)) continue;
  if (isCompletedByTranscript(val, sessDir)) {
    finishedSet.add(label);
    newlyDiscoveredDone.push(label);
  }
}

// Self-heal done-sessions.txt
if (newlyDiscoveredDone.length > 0) {
  try {
    fs.mkdirSync('/tmp/feishu-board-push-dedup', {recursive: true});
    fs.appendFileSync(DONE_FILE, newlyDiscoveredDone.join('\n') + '\n');
    console.log(`[self-heal] 发现${newlyDiscoveredDone.length}个已完成未记录: ${newlyDiscoveredDone.join(', ')}`);
  } catch(e) {}
}

// ── 3. Compute running rows ──
const rows = [];
for (const [key, {val}] of Object.entries(allSessions)) {
  const age = now - (val.updatedAt || 0);
  if (age > STALE_MS) continue;
  const label = val.label || key.split(':subagent:')[1].substring(0, 12);
  if (finishedSet.has(label)) continue;
  const ageMin = Math.floor(age / 60000);
  const duration = ageMin >= 60 ? Math.floor(ageMin/60)+'h'+ageMin%60+'m' : ageMin+'m';
  const rawModel = (val.model || val.config?.model || '-');
  const model = rawModel.replace(/^[\w-]+\//, '');
  rows.push({task: label, model, status: '🟢运行中', duration});
}

// ── 4. Today stats ──
const todayDoneLabels = new Set();
const todayTimeoutLabels = new Set();
const todayFailedLabels = new Set();

// Source A: board
for (const t of board) {
  const ts = t.completeTime || t.completedAt || '';
  if (!String(ts).startsWith(todayStr)) continue;
  if (t.status === 'done') todayDoneLabels.add(t.label);
  else if (t.status === 'timeout') todayTimeoutLabels.add(t.label);
  else if (t.status === 'failed') todayFailedLabels.add(t.label);
}

// Source B: sessions — aborted today → timeout, done today → done
for (const [key, {val}] of Object.entries(allSessions)) {
  const updated = val.updatedAt || 0;
  const updatedDate = new Date(updated + 8*3600*1000).toISOString().slice(0, 10);
  if (updatedDate !== todayStr) continue;
  const label = val.label || key.split(':subagent:')[1].substring(0, 12);
  if (abortedLabels.has(label)) {
    todayTimeoutLabels.add(label);
  } else if (doneSet.has(label) || newlyDiscoveredDone.includes(label)) {
    todayDoneLabels.add(label);
  }
}

// Source C: done-sessions.txt entries matching sessions updated today
for (const label of doneSet) {
  for (const [key, {val}] of Object.entries(allSessions)) {
    const sLabel = val.label || key.split(':subagent:')[1].substring(0, 12);
    if (sLabel !== label) continue;
    const updatedDate = new Date((val.updatedAt||0) + 8*3600*1000).toISOString().slice(0, 10);
    if (updatedDate === todayStr) todayDoneLabels.add(label);
    break;
  }
}

// Dedup: timeout/failed wins over done
for (const l of todayTimeoutLabels) todayDoneLabels.delete(l);
for (const l of todayFailedLabels) todayDoneLabels.delete(l);

const doneCount = todayDoneLabels.size;
const timeoutCount = todayTimeoutLabels.size;
const failedCount = todayFailedLabels.size;
const summary = `今日：✅${doneCount} | ⏰${timeoutCount} | ❌${failedCount} | 🟢${rows.length}`;
console.log(`[debug] running=${rows.length}, done=${doneCount}, timeout=${timeoutCount}, failed=${failedCount}`);
console.log(`[debug] running labels: ${rows.map(r=>r.task).join(', ')}`);

// ── 5. Get Feishu token ──
const tokenResp = JSON.parse(execSync(`curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" -H "Content-Type: application/json" -d '{"app_id":"${APP_ID}","app_secret":"${APP_SECRET}"}'`).toString());
const token = tokenResp.tenant_access_token;
if (!token) { console.error('Token failed'); process.exit(1); }

// ── 6. Build card ──
const dateStr = new Date(now + 8*3600*1000).toISOString().slice(0, 16).replace('T', ' ');
let elements;
if (rows.length > 0) {
  elements = [
    {tag: 'markdown', content: `**🤖 Agent并行数：${rows.length}**`},
    {tag: 'table', page_size: 50, row_height: 'low',
     header_style: {text_align: 'left', bold: true, background_style: 'blue'},
     columns: [
       {name: 'task', display_name: '任务', width: 'auto', data_type: 'text'},
       {name: 'model', display_name: '模型', width: 'auto', data_type: 'text'},
       {name: 'status', display_name: '状态', width: 'auto', data_type: 'text'},
       {name: 'duration', display_name: '耗时', width: 'auto', data_type: 'text'}
     ],
     rows},
    {tag: 'markdown', content: summary}
  ];
} else {
  elements = [
    {tag: 'markdown', content: '**🤖 Agent并行数：0**'},
    {tag: 'markdown', content: '暂无运行中任务'},
    {tag: 'markdown', content: summary}
  ];
}

const payload = JSON.stringify({
  receive_id: RECEIVE_ID,
  msg_type: 'interactive',
  content: JSON.stringify({
    config: {wide_screen_mode: true},
    header: {title: {tag: 'plain_text', content: `📋 Agent任务看板（${dateStr}）`}, template: 'blue'},
    elements
  })
});

// ── 7. Send ──
const sendResp = JSON.parse(execSync(`curl -s -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '${payload.replace(/'/g, "'\\''")}'`).toString());

if (sendResp.code === 0) {
  fs.writeFileSync('/tmp/feishu-board-push-dedup/last-push-ts', String(Math.floor(Date.now()/1000)));
  console.log(`✅ 看板已推送 (running=${rows.length})`);
} else {
  console.error('❌ 推送失败:', JSON.stringify(sendResp));
}
