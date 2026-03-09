const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocket, WebSocketServer } = require('ws');

const PORT = 8765;
const API_KEY = process.env.GLM_API_KEY || 'd6338644b2f141ad88f2cfebb6b48b34.ssIkoiAmxSYTUXst';
const WS_URL = 'wss://open.bigmodel.cn/api/paas/v4/realtime';
const VOICE = 'douji';

function generateToken(apiKey) {
  const [id, secret] = apiKey.split('.');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ api_key: id, exp: now + 3600, timestamp: now })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};

// SSL for WSS support (GitHub Pages requires secure WebSocket)
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'cert.pem')),
};

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// HTTPS server for WSS (port 8765)
const httpsServer = https.createServer(sslOptions, (req, res) => {
  res.writeHead(200); res.end('WSS OK');
});

const wss = new WebSocketServer({ server: httpsServer });

wss.on('connection', (clientWs) => {
  console.log('[客户端] 已连接');
  let glmWs = null;
  let sessionReady = false;

  function connectGLM() {
    const token = generateToken(API_KEY);
    glmWs = new WebSocket(WS_URL, { headers: { Authorization: `Bearer ${token}` } });

    glmWs.on('open', () => console.log('[GLM] 已连接'));

    glmWs.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      // console.log('[GLM]', msg.type);

      if (msg.type === 'session.created') {
        // Configure session for audio
        glmWs.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: '你是焰崽，一个热情友好的AI助手。用简短、自然的口语回复。',
            voice: VOICE,
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            turn_detection: null, // Manual turn detection
          }
        }));
        sessionReady = true;
        clientWs.send(JSON.stringify({ type: 'ready' }));
      }

      if (msg.type === 'response.audio.delta' && msg.delta) {
        clientWs.send(JSON.stringify({ type: 'audio', data: msg.delta }));
      }

      if (msg.type === 'response.audio_transcript.delta' && msg.delta) {
        clientWs.send(JSON.stringify({ type: 'transcript', text: msg.delta }));
      }

      if (msg.type === 'response.done') {
        clientWs.send(JSON.stringify({ type: 'response_done' }));
      }

      if (msg.type === 'error') {
        console.error('[GLM] 错误:', JSON.stringify(msg));
        clientWs.send(JSON.stringify({ type: 'error', message: msg.error?.message || '未知错误' }));
      }

      if (msg.type === 'input_audio_buffer.speech_started') {
        clientWs.send(JSON.stringify({ type: 'speech_started' }));
      }

      if (msg.type === 'input_audio_buffer.speech_stopped') {
        clientWs.send(JSON.stringify({ type: 'speech_stopped' }));
      }
    });

    glmWs.on('error', (err) => {
      console.error('[GLM] 连接错误:', err.message);
      clientWs.send(JSON.stringify({ type: 'error', message: '服务连接失败' }));
    });

    glmWs.on('close', () => {
      console.log('[GLM] 连接关闭');
      sessionReady = false;
    });
  }

  connectGLM();

  clientWs.on('message', (data) => {
    if (!glmWs || glmWs.readyState !== WebSocket.OPEN || !sessionReady) return;

    // Check if binary (audio data) or text (JSON command)
    if (typeof data === 'string' || data instanceof Buffer) {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'audio') {
          // PCM16 audio as base64
          glmWs.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: msg.data,
          }));
        } else if (msg.type === 'commit') {
          // User finished speaking
          glmWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
          glmWs.send(JSON.stringify({ type: 'response.create' }));
        } else if (msg.type === 'cancel') {
          glmWs.send(JSON.stringify({ type: 'response.cancel' }));
        }
      } catch (e) {
        // Binary audio data - base64 encode and send
        const b64 = Buffer.from(data).toString('base64');
        glmWs.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: b64,
        }));
      }
    }
  });

  clientWs.on('close', () => {
    console.log('[客户端] 断开');
    if (glmWs && glmWs.readyState === WebSocket.OPEN) glmWs.close();
  });
});

server.listen(8080, '0.0.0.0', () => {
  console.log(`🔥 焰崽语音服务已启动 (HTTP)`);
  console.log(`📡 本地访问: http://localhost:8080`);
});

httpsServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🔒 WSS服务已启动`);
  console.log(`📡 WSS地址: wss://43.160.213.199:${PORT}`);
});
