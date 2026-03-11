#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');

const SESSIONS_FILE = '/root/.openclaw/agents/main/sessions/sessions.json';
const DONE_FILE = '/tmp/feishu-board-push-dedup/done-sessions.txt';
const BOARD_FILE = '/root/.openclaw/workspace/logs/subagent-task-board.json';
const APP_ID = 'cli_a92f2a545838dcc8';
const APP_SECRET = 'r5ERTp7T0JdxwzuEJ4HkzeCdAr7GLpeC';
const RECEIVE_ID = 'ou_a113e465324cc55f9ab3348c9a1a7b9b';

// 1. Compute active
const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
let doneSet = new Set();
try { doneSet = new Set(fs.readFileSync(DONE_FILE, 'utf8').split('\n').filter(Boolean)); } catch(e) {}
const board = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
const now = Date.now();

const rows = [];
for (const [key, val] of Object.entries(sessions)) {
  if (!key.includes(':subagent:')) continue;
  const age = now - (val.updatedAt || 0);
  if (age > 45 * 60 * 1000) continue;
  if (val.abortedLastRun === true) continue;
  const label = val.label || key.split(':subagent:')[1].substring(0, 12);
  if (doneSet.has(label)) continue;
  const ageMin = Math.floor(age / 60000);
  const duration = ageMin >= 60 ? Math.floor(ageMin/60)+'h'+ageMin%60+'m' : ageMin+'m';
  const rawModel = (val.model || val.config?.model || '-');
  const model = rawModel.replace(/^[\w-]+\//, '');
  rows.push({task: label, model, status: '🟢运行中', duration});
}

// Only count today's tasks (Asia/Shanghai)
const todayStr = new Date(now + 8*3600*1000).toISOString().slice(0, 10);
const isToday = (t) => {
  const ts = t.completedAt || t.updatedAt || t.startedAt || 0;
  return new Date(ts + 8*3600*1000).toISOString().slice(0, 10) === todayStr;
};
const boardDone = board.filter(t => t.status === 'done' && isToday(t)).length;
const boardTimeout = board.filter(t => t.status === 'timeout' && isToday(t)).length;
const boardFailed = board.filter(t => t.status === 'failed' && isToday(t)).length;
const doneCount = boardDone;
const timeoutCount = boardTimeout;
const failedCount = boardFailed;
const summary = `今日：✅${doneCount} | ⏰${timeoutCount} | ❌${failedCount} | 🟢${rows.length}`;

// 2. Get token
const tokenResp = JSON.parse(execSync(`curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" -H "Content-Type: application/json" -d '{"app_id":"${APP_ID}","app_secret":"${APP_SECRET}"}'`).toString());
const token = tokenResp.tenant_access_token;
if (!token) { console.error('Token failed'); process.exit(1); }

// 3. Build card
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

// 4. Send via curl
const sendResp = JSON.parse(execSync(`curl -s -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '${payload.replace(/'/g, "'\\''")}'`).toString());

if (sendResp.code === 0) {
  fs.writeFileSync('/tmp/feishu-board-push-dedup/last-push-ts', String(Math.floor(Date.now()/1000)));
  console.log(`✅ 看板已推送 (running=${rows.length})`);
} else {
  console.error('❌ 推送失败:', JSON.stringify(sendResp));
}
