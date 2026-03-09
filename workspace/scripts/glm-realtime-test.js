// GLM-Realtime WebSocket 连接测试 v2
const WebSocket = require('ws');
const crypto = require('crypto');

const API_KEY = 'd6338644b2f141ad88f2cfebb6b48b34.ssIkoiAmxSYTUXst';
const WS_URL = 'wss://open.bigmodel.cn/api/paas/v4/realtime';

function generateToken(apiKey) {
  const [id, secret] = apiKey.split('.');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ api_key: id, exp: now + 3600, timestamp: now })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const token = generateToken(API_KEY);
const startTime = Date.now();
const ws = new WebSocket(WS_URL, { headers: { Authorization: `Bearer ${token}` } });
const events = [];
let textResult = '';
let audioTranscript = '';

ws.on('open', () => console.log(`[${Date.now()-startTime}ms] WebSocket已连接`));

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  const t = Date.now() - startTime;
  events.push({ type: msg.type, t });
  console.log(`[${t}ms] ${msg.type}`, msg.type === 'error' ? JSON.stringify(msg) : '');

  if (msg.type === 'session.created') {
    console.log('Session:', JSON.stringify(msg.session, null, 2).slice(0, 300));
    // 直接发消息，不做session.update
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      event_id: 'evt_001',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '你好' }] }
    }));
    ws.send(JSON.stringify({ type: 'response.create', event_id: 'evt_002' }));
  }

  if (msg.type === 'response.text.delta') textResult += (msg.delta || '');
  if (msg.type === 'response.audio_transcript.delta') audioTranscript += (msg.delta || '');

  if (msg.type === 'response.done') {
    console.log(`\n=== 响应完成 [${t}ms] ===`);
    console.log('文本:', textResult);
    console.log('音频转录:', audioTranscript);
    console.log('Usage:', JSON.stringify(msg.response?.usage));
    console.log('事件序列:', events.map(e => `${e.type}(${e.t}ms)`).join(' → '));
    ws.close();
  }
});

ws.on('error', (err) => console.error('错误:', err.message));
ws.on('close', (code) => { console.log(`关闭: code=${code}`); process.exit(0); });
setTimeout(() => { console.log('超时'); ws.close(); process.exit(1); }, 30000);
