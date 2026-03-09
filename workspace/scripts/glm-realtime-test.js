// GLM-Realtime WebSocket 连接测试
// 使用 client VAD 模式，发送文本消息测试连通性

const WebSocket = require('ws');
const crypto = require('crypto');

const API_KEY = 'd6338644b2f141ad88f2cfebb6b48b34.ssIkoiAmxSYTUXst';
const WS_URL = 'wss://open.bigmodel.cn/api/paas/v4/realtime';

// 生成JWT token
function generateToken(apiKey) {
  const [id, secret] = apiKey.split('.');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    api_key: id,
    exp: now + 3600,
    timestamp: now,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const token = generateToken(API_KEY);
console.log('生成JWT token完成');
console.log('连接中...', WS_URL);

const startTime = Date.now();
const ws = new WebSocket(WS_URL, { headers: { Authorization: `Bearer ${token}` } });

let connected = false;
const events = [];

ws.on('open', () => {
  connected = true;
  const connTime = Date.now() - startTime;
  console.log(`WebSocket已连接! 延迟: ${connTime}ms`);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  const elapsed = Date.now() - startTime;
  events.push({ type: msg.type, elapsed });
  console.log(`[${elapsed}ms] 收到事件: ${msg.type}`);

  if (msg.type === 'session.created') {
    console.log('Session信息:', JSON.stringify(msg.session || {}, null, 2).slice(0, 500));
    
    // 发送session.update配置
    ws.send(JSON.stringify({
      type: 'session.update',
      event_id: 'evt_001',
      session: {
        modalities: ['text', 'audio'],
        model: 'glm-realtime-flash',
        turn_detection: { type: 'client_vad' },
        input_audio_format: 'pcm',
        output_audio_format: 'pcm',
        voice: 'douji',
      }
    }));
  }

  if (msg.type === 'session.updated') {
    console.log('会话已更新，发送文本消息...');
    // 通过conversation.item.create发送文本
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      event_id: 'evt_002',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: '你好，请用一句话介绍你自己。' }]
      }
    }));
    // 触发响应
    ws.send(JSON.stringify({
      type: 'response.create',
      event_id: 'evt_003',
    }));
  }

  if (msg.type === 'response.text.delta') {
    process.stdout.write(msg.delta || '');
  }
  if (msg.type === 'response.audio_transcript.delta') {
    process.stdout.write(msg.delta || '');
  }

  if (msg.type === 'response.done') {
    const totalTime = Date.now() - startTime;
    console.log(`\n\n响应完成! 总耗时: ${totalTime}ms`);
    console.log('Usage:', JSON.stringify(msg.response?.usage || {}));
    console.log('\n所有事件:', events.map(e => `${e.type}(${e.elapsed}ms)`).join(', '));
    ws.close();
  }

  if (msg.type === 'error') {
    console.error('错误:', JSON.stringify(msg));
    ws.close();
  }
});

ws.on('error', (err) => {
  console.error('WebSocket错误:', err.message);
});

ws.on('close', (code, reason) => {
  console.log(`连接关闭: code=${code}, reason=${reason.toString()}`);
  process.exit(0);
});

// 30秒超时
setTimeout(() => {
  console.log('超时30秒，关闭连接');
  ws.close();
  process.exit(1);
}, 30000);
