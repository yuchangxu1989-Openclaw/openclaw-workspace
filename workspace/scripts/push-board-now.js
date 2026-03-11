#!/usr/bin/env node
/**
 * Agent任务看板 - 飞书推送脚本 (v8 - 最近完成可见性 + 去hash去重)
 *
 * 核心设计：
 * 1. done-sessions.json 真相源，带时间戳
 * 2. 扫描 ALL agent目录的 sessions.json
 * 3. 三重完成检测：aborted标记 + board.json状态 + transcript stopReason
 * 4. today统计基于 done registry 时间戳，不依赖 session updatedAt
 * 5. running判定：未完成 + 活跃度在2小时内（取 updatedAt 和 transcript mtime 的较大值）
 * 6. 模型名：session.model → openclaw.json agent配置 → 全局默认 → 硬编码agent映射 → 硬编码默认值，去provider前缀
 * 7. Agent列：从agent目录名提取
 * 8. 复活机制：transcript仍在写入的session从doneRegistry中移除（防止误标done）
 *
 * v7 变更：
 * - 删除 Signal D（10分钟超时自动标记done）— 该逻辑过于激进，导致活跃session被永久隐藏
 * - 新增 transcript mtime 活跃度检测 — 比 session.updatedAt 更准确
 * - 新增复活机制 — doneRegistry不再单调递增，活跃session可被恢复
 *
 * v8 变更：
 * - 新增"最近完成"区块 — 30分钟内完成的任务在看板可见，解决快速完成任务"从未出现"的问题
 * - 去除content hash去重 — 改为时间去重（60秒内不重复推送），确保每次cron都能推送

 */
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

const AGENTS_DIR = '/root/.openclaw/agents';
const DEDUP_DIR      = '/tmp/feishu-board-push-dedup';
const DONE_JSON      = `${DEDUP_DIR}/done-sessions.json`;
const DONE_TXT       = `${DEDUP_DIR}/done-sessions.txt`;
const LAST_HASH_FILE = `${DEDUP_DIR}/last-push-hash`;
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

// ── 0b. Load model defaults from openclaw.json ──
// Note: openclaw.json may have trailing commas (valid JS, invalid JSON).
// We strip them before parsing. chattr +i prevents us from fixing the file directly.
let defaultModel = '';
const agentModels = {};
try {
  const raw = fs.readFileSync('/root/.openclaw/openclaw.json', 'utf8');
  const cleaned = raw.replace(/,(\s*[}\]])/g, '$1');
  const oc = JSON.parse(cleaned);
  const agents = oc.agents || {};
  defaultModel = (agents.defaults?.model?.primary || '').replace(/^[\w-]+\//, '');
  // agents.list is an array of { id, model: { primary }, ... }
  const agentList = agents.list || [];
  for (const cfg of agentList) {
    const m = cfg.model?.primary;
    if (m && cfg.id) agentModels[cfg.id] = m.replace(/^[\w-]+\//, '');
  }
  console.log(`[config] openclaw.json loaded: defaultModel=${defaultModel}, agents=${Object.keys(agentModels).length}`);
} catch (e) {
  console.error(`[config] Failed to parse openclaw.json: ${e.message}`);
}

// ── 0c. Hardcoded agent→model fallback (when openclaw.json is unreadable/corrupt) ──
const AGENT_MODEL_FALLBACK = {
  'scout': 'claude-opus-4-6',
  'cron-worker': 'glm-5',
};
const DEFAULT_MODEL_FALLBACK = 'claude-opus-4-6-thinking';

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
          return sr === 'stop' || sr === 'length' || sr === 'end_turn' || sr === 'error';
        }
      } catch {}
    }
  } catch {}
  return false;
}

// Check transcript for ALL non-done sessions (no staleness gate)
for (const [label, { val, sessDir }] of Object.entries(allSessions)) {
  if (doneRegistry[label]) continue;
  const age = now - (val.updatedAt || 0);
  if (isCompletedByTranscript(val, sessDir)) {
    doneRegistry[label] = val.updatedAt || now;
    console.log(`[done:transcript] ${label} (age ${Math.floor(age / 60000)}m)`);
  }
}

// Signal D: REMOVED in v7
// 10-minute timeout was too aggressive — subagent tasks routinely run 30-60+ minutes.
// Sessions are now only marked done by explicit signals (aborted, board status, transcript stopReason).

// ── 3b. Resurrection: revive sessions wrongly marked done ──
// If a session's transcript file was modified recently, it's still active — remove from doneRegistry
function getTranscriptMtime(sessionVal, sessDir) {
  try {
    const sid = sessionVal.sessionId;
    if (!sid) return 0;
    const tp = `${sessDir}/${sid}.jsonl`;
    if (!fs.existsSync(tp)) return 0;
    return fs.statSync(tp).mtimeMs;
  } catch { return 0; }
}

const RESURRECT_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
let resurrected = 0;
for (const [label, { val, sessDir }] of Object.entries(allSessions)) {
  if (!doneRegistry[label]) continue;
  const tmtime = getTranscriptMtime(val, sessDir);
  const lastActivity = Math.max(val.updatedAt || 0, tmtime);
  const age = now - lastActivity;
  if (age < RESURRECT_THRESHOLD_MS && !val.abortedLastRun) {
    // Double-check: only resurrect if transcript does NOT have a final stopReason
    if (!isCompletedByTranscript(val, sessDir)) {
      delete doneRegistry[label];
      resurrected++;
      console.log(`[resurrect] ${label} (active ${Math.floor(age / 60000)}m ago, transcript still open)`);
    }
  }
}
if (resurrected > 0) console.log(`[resurrect] Revived ${resurrected} sessions from doneRegistry`);

// ── 4. Persist done registry ──
const newCount = Object.keys(doneRegistry).length;
fs.writeFileSync(DONE_JSON, JSON.stringify(doneRegistry, null, 2));
// Keep txt in sync for backward compat
fs.writeFileSync(DONE_TXT, Object.keys(doneRegistry).join('\n') + '\n');
if (newCount > prevCount) {
  console.log(`[done] Registry grew: ${prevCount} → ${newCount} (+${newCount - prevCount})`);
}

// ── 5. Compute running sessions ──
// Use max(updatedAt, transcript mtime) as activity indicator — transcript mtime is more accurate
const RUNNING_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
const rows = [];
for (const [label, { val, sessDir, agent }] of Object.entries(allSessions)) {
  if (doneRegistry[label]) continue;
  const tmtime = getTranscriptMtime(val, sessDir);
  const lastActivity = Math.max(val.updatedAt || 0, tmtime);
  const age = now - lastActivity;
  if (age > RUNNING_MAX_AGE_MS) continue;
  const ageMin = Math.floor(age / 60000);
  const duration = ageMin >= 60
    ? Math.floor(ageMin / 60) + 'h' + (ageMin % 60) + 'm'
    : ageMin + 'm';
  const rawModel = val.model || val.config?.model || '';
  const model = rawModel ? rawModel.replace(/^[\w-]+\//, '') : (agentModels[agent] || defaultModel || AGENT_MODEL_FALLBACK[agent] || DEFAULT_MODEL_FALLBACK);
  // agent="main"时用label推断角色，避免看板全显示main
  const displayAgent = agent === 'main' ? (label.match(/^(fix|batch|auto|refactor)/) ? 'coder' : label.match(/^(backlog|review|audit|check)/) ? 'analyst' : label.match(/^(doc|write)/) ? 'writer' : 'worker') : agent;
  rows.push({ task: label, agent: displayAgent, model, status: '🟢运行中', duration, _age: age });
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
const summary = `今日：✅${todayDone} ⏰${todayTimeout} ❌${todayFailed} 🟢${rows.length}`;

// ── 6b. Recently completed (last 30 min, for board visibility) ──
const RECENT_DONE_MS = 30 * 60 * 1000;
const recentDone = [];
for (const [label, completedAt] of Object.entries(doneRegistry)) {
  if (!completedAt || completedAt < (now - RECENT_DONE_MS)) continue;
  const sess = allSessions[label];
  if (!sess) continue;
  const { val, agent } = sess;
  const rawModel = val.model || val.config?.model || '';
  const model = rawModel ? rawModel.replace(/^[\w-]+\//, '') : (agentModels[agent] || defaultModel || AGENT_MODEL_FALLBACK[agent] || DEFAULT_MODEL_FALLBACK);
  const boardStatus = boardStatusMap[label];
  let status;
  if (val.abortedLastRun || boardStatus === 'timeout') status = '⏰超时';
  else if (boardStatus === 'failed') status = '❌失败';
  else status = '✅完成';
  const agoMin = Math.floor((now - completedAt) / 60000);
  recentDone.push({ task: label, agent, model, status, duration: agoMin + 'm前', _completedAt: completedAt });
}
recentDone.sort((a, b) => b._completedAt - a._completedAt);
const recentDoneDisplay = recentDone.slice(0, 10).map(({ task, agent, model, status, duration }) => ({ task, agent, model, status, duration }));

console.log(`[stats] running=${rows.length} todayDone=${todayDone} todayTimeout=${todayTimeout} todayFailed=${todayFailed} totalDone=${totalDone} recentDone=${recentDoneDisplay.length}`);
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
const displayRows = rows.map(({ task, agent, model, status, duration }) => ({ task, agent, model, status, duration }));

let elements;
if (displayRows.length > 0) {
  elements = [
    { tag: 'markdown', content: `**🤖 Agent并行数：${displayRows.length}**` },
    { tag: 'table', page_size: 50, row_height: 'low',
      header_style: { text_align: 'left', bold: true, background_style: 'blue' },
      columns: [
        { name: 'task', display_name: '任务', width: 'auto', data_type: 'text' },
        { name: 'agent', display_name: 'Agent', width: 'auto', data_type: 'text' },
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
// Content dedup: skip if unchanged
const cardHash = crypto.createHash('md5').update(payload).digest('hex');
let lastHash = '';
try { lastHash = fs.readFileSync(LAST_HASH_FILE, 'utf8').trim(); } catch {}
if (cardHash === lastHash) {
  console.log('[skip] 看板内容无变化，跳过推送');
  process.exit(0);
}
fs.writeFileSync(LAST_HASH_FILE, cardHash);

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
