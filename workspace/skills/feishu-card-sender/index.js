#!/usr/bin/env node
/**
 * feishu-card-sender — 可复用的飞书 Interactive Card 发送模块
 * 
 * 已验证成功路径：
 *   tenant_access_token → POST /im/v1/messages (msg_type=interactive)
 * 
 * 用法:
 *   const { sendCard, sendTaskQueueCard, getToken } = require('./feishu-card-sender');
 *   
 *   // 发送自定义卡片
 *   await sendCard({ receiveId, card });
 *   
 *   // 发送任务队列看板卡片
 *   await sendTaskQueueCard({ receiveId, tasks, risks, decisions });
 * 
 * 环境自适应:
 *   - 自动从 openclaw.json 读取 appId/appSecret
 *   - 自动推断 receive_id_type (ou_ → open_id, oc_ → chat_id)
 *   - token 缓存 (110分钟有效期)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const FEISHU_HOST = 'open.feishu.cn';
const CONFIG_PATH = '/root/.openclaw/openclaw.json';

// ─── Token cache ────────────────────────────────────────
let _tokenCache = { token: null, expiresAt: 0 };

function loadCredentials() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const acct = config.channels?.feishu?.accounts?.default || {};
  if (!acct.appId || !acct.appSecret) {
    throw new Error('Missing appId/appSecret in openclaw.json → channels.feishu.accounts.default');
  }
  return { appId: acct.appId, appSecret: acct.appSecret };
}

function inferReceiveIdType(id) {
  if (id.startsWith('ou_')) return 'open_id';
  if (id.startsWith('oc_')) return 'chat_id';
  if (id.includes('@')) return 'email';
  return 'open_id';
}

function httpsPost(hostname, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname, path: urlPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers }
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch { resolve({ raw: buf }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }
  const { appId, appSecret } = loadCredentials();
  const resp = await httpsPost(FEISHU_HOST, '/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: appId, app_secret: appSecret
  });
  if (resp.code !== 0) throw new Error(`Feishu token error: ${resp.msg || JSON.stringify(resp)}`);
  _tokenCache = { token: resp.tenant_access_token, expiresAt: Date.now() + 110 * 60 * 1000 };
  return _tokenCache.token;
}

/**
 * 发送飞书 Interactive Card
 * @param {object} params
 * @param {string} params.receiveId - 接收者ID (ou_xxx / oc_xxx)
 * @param {object} params.card - 飞书卡片JSON对象
 * @param {string} [params.receiveIdType] - 可选，自动推断
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendCard({ receiveId, card, receiveIdType }) {
  const token = await getToken();
  const idType = receiveIdType || inferReceiveIdType(receiveId);
  
  const resp = await httpsPost(
    FEISHU_HOST,
    `/open-apis/im/v1/messages?receive_id_type=${idType}`,
    {
      receive_id: receiveId,
      msg_type: 'interactive',
      content: JSON.stringify(card)
    },
    { Authorization: `Bearer ${token}` }
  );
  
  if (resp.code === 0) {
    return { success: true, messageId: resp.data?.message_id, chatId: resp.data?.chat_id };
  }
  return { success: false, error: resp.msg, code: resp.code, detail: resp.error };
}

/**
 * 构建并发送任务队列看板卡片
 * @param {object} params
 * @param {string} params.receiveId
 * @param {Array} params.tasks - [{agent, task, model, status, duration}]
 * @param {Array} [params.risks] - [{agent, description}]
 * @param {Array} [params.decisions] - [{agent, description}]
 * @param {string} [params.title]
 * @param {string} [params.color] - blue/orange/red/green
 */
async function sendTaskQueueCard({ receiveId, tasks = [], risks = [], decisions = [], title, color }) {
  const running = tasks.filter(t => t.status === 'running' || t.status === '执行中');
  const completed = tasks.filter(t => t.status === 'completed' || t.status === '完成');
  const waiting = tasks.filter(t => t.status === 'waiting' || t.status === '等待');
  
  const statusLine = `🔄执行 **${running.length}** · ✅完成 **${completed.length}** · ⏳等待 **${waiting.length}**`;
  
  const taskLines = tasks.map((t, i) => {
    const statusEmoji = { running: '🔄', completed: '✅', waiting: '⏳', blocked: '⏸️', '执行中': '🔄', '完成': '✅', '等待': '⏳' }[t.status] || '❓';
    return `**#${i+1}** ${t.agent} · ${t.task} · \`${t.model || '-'}\` · ${statusEmoji}${t.status} · ${t.duration || '-'}`;
  }).join('\n');

  const elements = [
    { tag: 'div', text: { tag: 'lark_md', content: statusLine } },
    { tag: 'hr' },
    { tag: 'div', text: { tag: 'lark_md', content: taskLines } },
  ];

  if (risks.length > 0) {
    elements.push({ tag: 'hr' });
    const riskLines = risks.map(r => `⏸️ ${r.agent}「${r.description}」`).join('\n');
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `**⚠️ 关键风险 (${risks.length})**\n${riskLines}` } });
  }

  if (decisions.length > 0) {
    elements.push({ tag: 'hr' });
    const decLines = decisions.map(d => `${d.agent}「${d.description}」`).join('\n');
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `**⚖️ 待决策 (${decisions.length})**\n${decLines}` } });
  }

  elements.push({
    tag: 'note',
    elements: [{ tag: 'plain_text', content: `🕐 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} | 自动生成` }]
  });

  const card = {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: title || `📊 任务队列看板 (${tasks.length} agents)` },
      template: color || (risks.length > 0 ? 'orange' : 'blue')
    },
    elements
  };

  return sendCard({ receiveId, card });
}

/**
 * 从 OpenClaw session 状态获取当前会话的 receiveId
 */
function getCurrentSessionReceiveId() {
  try {
    const sessions = JSON.parse(fs.readFileSync('/root/.openclaw/agents/main/sessions/sessions.json', 'utf8'));
    const mainSession = sessions['agent:main:main'];
    if (mainSession?.deliveryContext?.to) {
      // "user:ou_xxx" → "ou_xxx"
      return mainSession.deliveryContext.to.replace(/^user:/, '');
    }
  } catch {}
  return null;
}

// CLI 模式
if (require.main === module) {
  const receiveId = process.argv[2] || getCurrentSessionReceiveId();
  if (!receiveId) {
    console.error('Usage: node feishu-card-sender.js [receive_id]');
    process.exit(1);
  }

  sendTaskQueueCard({
    receiveId,
    tasks: [
      { agent: 'Scout', task: '卡片路径验证', model: 'opus-4', status: 'running', duration: '5m' },
      { agent: 'Researcher', task: '文档分析', model: 'gpt-5.4', status: 'completed', duration: '3m' },
      { agent: 'Writer', task: '报告撰写', model: 'sonnet-4', status: 'waiting', duration: '-' },
    ],
    risks: [{ agent: 'Coordinator', description: '向量服务响应延迟' }],
  }).then(result => {
    console.log(result.success ? '✅ Card sent!' : `❌ Failed: ${result.error}`);
    console.log(JSON.stringify(result, null, 2));
  }).catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}

module.exports = { sendCard, sendTaskQueueCard, getToken, getCurrentSessionReceiveId };
