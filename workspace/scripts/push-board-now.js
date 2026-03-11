#!/usr/bin/env node
/**
 * Agent任务看板 - 飞书推送脚本 (v5 - 根治版)
 *
 * 核心设计：
 * 1. done-sessions.json 单一真相源，带时间戳，单调递增（只增不减）
 * 2. 扫描 ALL agent目录的 sessions.json
 * 3. 三重完成检测：aborted标记 + board.json状态 + transcript stopReason
 * 4. today统计基于 done registry 时间戳，不依赖 session updatedAt
 * 5. running判定：未完成 + updatedAt在2小时内
 */
const fs = require('fs');
const { execSync } = require('child_process');

const AGENTS_DIR = '/root/.openclaw/agents';
const DEDUP_DIR  = '/tmp/feishu-board-push-dedup';
const DONE_JSON  = `${DEDUP_DIR}/done-sessions.json`;
const DONE_TXT   = `${DEDUP_DIR}/done-sessions.txt`;
const BOARD_FILE = '/root/.openclaw/workspace/logs/subagent-task-board.json';
const TZ_OFFSET  = 8 * 3600 * 1000; // Asia/Shanghai

// ── 0. Feishu credentials ──
function loadEnvFeishu() {
  const lines = fs.readFileSync('/root/.openclaw/workspace/.env.feishu', 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const m = line.match(/^(\w+)=(.+)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
const _fenv = loadEnvFeishu();
const APP_ID     = process.env.FEISHU_APP_ID     || _fenv.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET  || _fenv.FEISHU_APP_SECRET;
const RECEIVE_ID = process.env.FEISHU_RECEIVE_ID  || _fenv.FEISHU_RECEIVE_ID;

const now = Date.now();
const todayStr     = new Date(now + TZ_OFFSET).toISOString().slice(0, 10);
const todayStartMs = new Date(todayStr + 'T00:00:00+08:00').getTime();

// ── 1. Load ALL subagent sessions from ALL agent directories ──
// Keyed by label; if duplicate labels, keep the most recently updated one
const allSessions = {};
const agentDirs = fs.readdirSync(AGENTS_DIR).filter(d => {
  try { return fs.statSync(`${AGENTS_DIR}/${d}/sessions/sessions.json`).isFile(); }
  catch { return false; }
});

for (const agent of agentDirs) {
  try {
    const sessFile = `${AGENTS_DIR}/${agent}/sessions/sessions.json`;
    const data = JSON.parse(fs.readFileSync(sessFile, 'utf8'));
    for (const [key, val] of Object.entries(data)) {
      if (!key.includes(':subagent:')) continue;
      const label = val.label || key.split(':subagent:')[1].substring(0, 12);
      const existing = allSessions[label];
      if (!existing || (val.updatedAt || 0) > (existing.val.updatedAt || 0)) {
        allSessions[label] = { val, sessDir: `${AGENTS_DIR}/${agent}/sessions`, agent };
      }
    }
  } catch {}
}

console.log(`[scan] ${Object.keys(allSessions).length} subagent sessions across ${agentDirs.length} agents`);

// ── 2. Load done registry (monotonic: only adds, never removes) ──
// Format: { "label": completedAtMs, ... }
fs.mkdirSync(DEDUP_DIR, { recursive: true });
let doneRegistry = {};
try {
  doneRegistry = JSON.parse(fs.readFileSync(DONE_JSON, 'utf8'));
} catch {
  // First run or corrupt — migrate from old done-sessions.txt
  try {
    const oldLabels = fs.readFileSync(DONE_TXT, 'utf8').split('\n').filter(Boolean);
    for (const label of oldLabels) {
      // Use session updatedAt as best-effort completion timestamp
      const sess = allSessions[label];
      doneRegistry[label] = sess?.val.updatedAt || 0;
    }
    console.log(`[migrate] Migrated ${oldLabels.length} entries from done-sessions.txt`);
  } catch {}
}

const prevCount = Object.keys(doneRegistry).length;

// ── 3. Discover newly completed sessions (three signals) ──

// Signal A: abortedLastRun flag
for (const [label, { val }] of Object.entries(allSessions)) {
  if (val.abortedLastRun === true && !doneRegistry[label]) {
    doneRegistry[label] = val.updatedAt || now;
    console.log(`[done:aborted] ${label}`);
  }
}

// Signal B: board.json status (done/timeout/failed)
try {
  const board = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
  for (const t of board) {
    if (!t.label) continue;
    if (!['done', 'timeout', 'failed'].includes(t.status)) continue;
    if (doneRegistry[t.label]) continue;
    const ts = t.completeTime || t.completedAt;
    doneRegistry[t.label] = ts ? new Date(ts).getTime() : 0;
    console.log(`[done:board] ${t.label} (${t.status})`);
  }
} catch {}

// Signal C: transcript-based completion (for stale sessions only)
function isCompletedByTranscript(sessionVal, sessDir) {
  try {
    const sid = sessionVal.sessionId;
    if (!sid) return false;
    const tp = `${sessDir}/${sid}.jsonl`;
    if (!fs.existsSync(tp)) return false;
    const stat = fs.statSync(tp);
    if (stat.size === 0) return false;
    const readSize = Math.min(stat.size, 16384);
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
          const sr = msg.stopReason;
          return sr === 'stop' || sr === 'length' || sr === 'end_turn';
        }
      } catch {}
    }
  } catch {}
  return false;
}

const STALE_CHECK_MS = 30 * 60 * 1000; // check transcript for sessions idle >30min
for (const [label, { val, sessDir }] of Object.entries(allSessions)) {
  if (doneRegistry[label]) continue;
  const age = now - (val.updatedAt || 0);
  if (age > STALE_CHECK_MS && isCompletedByTranscript(val, sessDir)) {
    doneRegistry[label] = val.updatedAt || now;
    console.log(`[done:transcript] ${label} (idle ${Math.floor(age / 60000)}m)`);
  }
}

// ── 4. Persist done registry ──
const newCount = Object.keys(doneRegistry).length;
fs.writeFileSync(DONE_JSON, JSON.stringify(doneRegistry, null, 2));
// Keep txt in sync for backward compat
fs.writeFileSync(DONE_TXT, Object.keys(doneRegistry).join('\n') + '\n');
if (newCount > prevCount) {
  console.log(`[done] Registry grew: ${prevCount} → ${newCount} (+${newCount - prevCount})`);
}

// ── 5. Compute running sessions ──
const RUNNING_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
const rows = [];
for (const [label, { val, agent }] of Object.entries(allSessions)) {
  if (doneRegistry[label]) continue;
  const age = now - (val.updatedAt || 0);
  if (age > RUNNING_MAX_AGE_MS) continue;
  const ageMin = Math.floor(age / 60000);
  const duration = ageMin >= 60
    ? Math.floor(ageMin / 60) + 'h' + (ageMin % 60) + 'm'
    : ageMin + 'm';
  const rawModel = val.model || val.config?.model || '';
  const model = rawModel ? rawModel.replace(/^[\w-]+\//, '') : '-';
  rows.push({ task: label, model, status: '🟢运行中', duration, _age: age });
}
// Sort: newest activity first
rows.sort((a, b) => a._age - b._age);

// ── 6. Today stats (from done registry timestamps) ──
let todayDone = 0, todayTimeout = 0, todayFailed = 0;
const boardStatusMap = {};
try {
  const board = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
  for (const t of board) {
    if (t.label) boardStatusMap[t.label] = t.status;
  }
} catch {}

for (const [label, ts] of Object.entries(doneRegistry)) {
  if (ts < todayStartMs) continue; // before today or unknown(0)
  const sess = allSessions[label];
  const boardStatus = boardStatusMap[label];
  if (sess?.val.abortedLastRun || boardStatus === 'timeout') {
    todayTimeout++;
  } else if (boardStatus === 'failed') {
    todayFailed++;
  } else {
    todayDone++;
  }
}

const totalDone = Object.keys(doneRegistry).length;
const summary = `今日：✅${todayDone} ⏰${todayTimeout} ❌${todayFailed} 🟢${rows.length}｜累计完成：${totalDone}`;

console.log(`[stats] running=${rows.length} todayDone=${todayDone} todayTimeout=${todayTimeout} todayFailed=${todayFailed} totalDone=${totalDone}`);
console.log(`[stats] running: ${rows.map(r => r.task).join(', ') || '(none)'}`);

// ── 7. Get Feishu token ──
const tokenResp = JSON.parse(execSync(
  `curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" ` +
  `-H "Content-Type: application/json" ` +
  `-d '{"app_id":"${APP_ID}","app_secret":"${APP_SECRET}"}'`
).toString());
const token = tokenResp.tenant_access_token;
if (!token) { console.error('❌ Token获取失败'); process.exit(1); }

// ── 8. Build card ──
const dateStr = new Date(now + TZ_OFFSET).toISOString().slice(0, 16).replace('T', ' ');
const displayRows = rows.map(({ task, model, status, duration }) => ({ task, model, status, duration }));

let elements;
if (displayRows.length > 0) {
  elements = [
    { tag: 'markdown', content: `**🤖 Agent并行数：${displayRows.length}**` },
    { tag: 'table', page_size: 50, row_height: 'low',
      header_style: { text_align: 'left', bold: true, background_style: 'blue' },
      columns: [
        { name: 'task', display_name: '任务', width: 'auto', data_type: 'text' },
        { name: 'model', display_name: '模型', width: 'auto', data_type: 'text' },
        { name: 'status', display_name: '状态', width: 'auto', data_type: 'text' },
        { name: 'duration', display_name: '耗时', width: 'auto', data_type: 'text' }
      ],
      rows: displayRows },
    { tag: 'markdown', content: summary }
  ];
} else {
  elements = [
    { tag: 'markdown', content: '**🤖 Agent并行数：0**' },
    { tag: 'markdown', content: '暂无运行中任务' },
    { tag: 'markdown', content: summary }
  ];
}

const payload = JSON.stringify({
  receive_id: RECEIVE_ID,
  msg_type: 'interactive',
  content: JSON.stringify({
    config: { wide_screen_mode: true },
    header: { title: { tag: 'plain_text', content: `📋 Agent任务看板（${dateStr}）` }, template: 'blue' },
    elements
  })
});

// ── 9. Send ──
const sendResp = JSON.parse(execSync(
  `curl -s -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id" ` +
  `-H "Authorization: Bearer ${token}" ` +
  `-H "Content-Type: application/json" ` +
  `-d '${payload.replace(/'/g, "'\\''")}'`
).toString());

if (sendResp.code === 0) {
  fs.writeFileSync(`${DEDUP_DIR}/last-push-ts`, String(Math.floor(Date.now() / 1000)));
  console.log(`✅ 看板已推送 (running=${displayRows.length}, totalDone=${totalDone})`);
} else {
  console.error('❌ 推送失败:', JSON.stringify(sendResp));
}
