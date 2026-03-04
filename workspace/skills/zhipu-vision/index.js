const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.ZHIPU_API_KEY || fs.readFileSync('/root/.openclaw/.secrets/zhipu-keys.env', 'utf8').match(/ZHIPU_API_KEY_1=(.*)/)?.[1]?.trim();
const BASE_URL = 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions';

/**
 * 分析图片内容
 * @param {string} imagePath - 图片文件路径
 * @param {string} prompt - 提问内容
 */
async function analyzeImage(imagePath, prompt = '请描述这张图片的内容') {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  
  const body = JSON.stringify({
    model: 'glm-4v-plus',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
        { type: 'text', text: prompt }
      ]
    }],
    max_tokens: 1024
  });

  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
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
          if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content);
          } else {
            reject(new Error(json.error?.message || '未知错误: ' + data.substring(0, 200)));
          }
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * 从URL分析图片
 */
async function analyzeImageURL(imageUrl, prompt = '请描述这张图片的内容') {
  const body = JSON.stringify({
    model: 'glm-4v-plus',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: prompt }
      ]
    }],
    max_tokens: 1024
  });

  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
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
          if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content);
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

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('用法: node index.js <图片路径> [提问]');
    console.log('示例: node index.js /path/to/image.jpg "这张图片里有什么？"');
    process.exit(0);
  }
  const imagePath = args[0];
  const prompt = args[1] || '请详细描述这张图片的内容，包括文字、数据、UI元素等所有可见信息。';
  
  analyzeImage(imagePath, prompt)
    .then(r => console.log(r))
    .catch(e => console.error('错误:', e.message));
}

module.exports = { analyzeImage, analyzeImageURL };
