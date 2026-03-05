const fs = require('fs');
const path = require('path');
const https = require('https');

const ZhipuKeys = require('../zhipu-keys/index.js');
const API_KEY = ZhipuKeys.getKey('image');

async function generateImage(prompt, options = {}) {
  const body = JSON.stringify({
    model: options.model || 'cogview-3-plus',
    prompt: prompt,
    size: options.size || '1024x1024',
    n: options.n || 1
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'open.bigmodel.cn',
      path: '/api/coding/paas/v4/images/generations',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.data && json.data[0]) {
            resolve(json.data.map(d => d.url));
          } else {
            reject(new Error(json.error?.message || data.substring(0, 200)));
          }
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function generateAndSave(prompt, outputPath, options = {}) {
  const urls = await generateImage(prompt, options);
  const url = urls[0];
  
  // 下载图片
  return new Promise((resolve, reject) => {
    const followRedirect = (targetUrl) => {
      https.get(targetUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          followRedirect(res.headers.location);
          return;
        }
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          fs.writeFileSync(outputPath, buffer);
          resolve({ url, saved: outputPath, size: buffer.length });
        });
      }).on('error', reject);
    };
    followRedirect(url);
  });
}

if (require.main === module) {
  const prompt = process.argv[2];
  const output = process.argv[3] || '/tmp/generated.png';
  if (!prompt) { console.log('用法: node index.js "描述" [输出路径]'); process.exit(0); }
  
  generateAndSave(prompt, output)
    .then(r => console.log('✅ 生成完成:', JSON.stringify(r)))
    .catch(e => console.error('错误:', e.message));
}

module.exports = { generateImage, generateAndSave };
