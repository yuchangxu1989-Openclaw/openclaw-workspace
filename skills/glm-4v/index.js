#!/usr/bin/env node
/**
 * GLM-4.6V 视频理解模型
 * 输入：视频、图像、文本、文件
 * 输出：文本
 */

const https = require('https');
const ZhipuKeys = require('../zhipu-keys/index.js');

class GLM4V {
  constructor() {
    this.apiKey = ZhipuKeys.getKey('vision');
    this.baseURL = 'open.bigmodel.cn';
    this.model = 'glm-4.6v';
  }

  async understandVideo(videoUrl, prompt = '描述这个视频') {
    return this.request('/api/paas/v4/chat/completions', {
      model: this.model,
      messages: [{
        role: 'user',
        content: [
          { type: 'video_url', video_url: { url: videoUrl } },
          { type: 'text', text: prompt }
        ]
      }]
    });
  }

  async understandImage(imageUrl, prompt = '描述这张图片') {
    return this.request('/api/paas/v4/chat/completions', {
      model: this.model,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: prompt }
        ]
      }]
    });
  }

  request(path, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const options = {
        hostname: this.baseURL,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Length': data.length
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(responseData);
            resolve(json.choices?.[0]?.message?.content || json);
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}

module.exports = GLM4V;
