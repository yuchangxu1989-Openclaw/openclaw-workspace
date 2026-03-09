#!/usr/bin/env node
// GLM-TTS - 智谱语音合成脚本
// Usage: node glm-tts.js <text> <output_file> [voice] [speed] [volume]

const fs = require('fs');
const path = require('path');
const https = require('https');

// 读取API Key
const envPath = '/root/.openclaw/.secrets/zhipu-keys.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/ZHIPU_API_KEY_1="([^"]+)"/);
if (!match) { console.error('无法读取 ZHIPU_API_KEY_1'); process.exit(1); }
const API_KEY = match[1];

const text = process.argv[2];
const outputFile = process.argv[3] || '/tmp/glm-tts-output.wav';
const voice = process.argv[4] || 'female';
const speed = parseFloat(process.argv[5] || '1.0');
const volume = parseFloat(process.argv[6] || '1.0');

if (!text) {
  console.error('Usage: node glm-tts.js <text> <output_file> [voice] [speed] [volume]');
  console.error('Voices: female, 彤彤, 小陈, 锤锤, jam, kazi, douji, luodo');
  process.exit(1);
}

// 根据输出文件扩展名决定格式
const ext = path.extname(outputFile).slice(1).toLowerCase();
// API只支持wav和pcm，mp3通过ffmpeg转换
const needConvert = ext === 'mp3';
const response_format = 'wav'; // 始终用wav，mp3后转

const body = JSON.stringify({
  model: 'glm-tts',
  input: text,
  voice,
  speed,
  volume,
  response_format,
});

const options = {
  hostname: 'open.bigmodel.cn',
  path: '/api/paas/v4/audio/speech',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
};

console.log(`生成语音: "${text}" → ${outputFile} (voice=${voice}, format=${response_format})`);

const req = https.request(options, (res) => {
  if (res.statusCode !== 200) {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => { console.error(`HTTP ${res.statusCode}: ${data}`); process.exit(1); });
    return;
  }
  const chunks = [];
  res.on('data', chunk => chunks.push(chunk));
  res.on('end', () => {
    const buf = Buffer.concat(chunks);
    if (needConvert) {
      const tmpWav = outputFile + '.tmp.wav';
      fs.writeFileSync(tmpWav, buf);
      const { execSync } = require('child_process');
      execSync(`ffmpeg -i "${tmpWav}" -y "${outputFile}" 2>/dev/null`);
      fs.unlinkSync(tmpWav);
      const stat = fs.statSync(outputFile);
      console.log(`完成! 文件大小: ${(stat.size / 1024).toFixed(1)} KB (wav→mp3)`);
    } else {
      fs.writeFileSync(outputFile, buf);
      console.log(`完成! 文件大小: ${(buf.length / 1024).toFixed(1)} KB`);
    }
  });
});

req.on('error', e => { console.error('请求失败:', e.message); process.exit(1); });
req.write(body);
req.end();
