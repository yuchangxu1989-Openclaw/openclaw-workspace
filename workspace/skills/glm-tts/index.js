#!/usr/bin/env node
/**
 * GLM-TTS 技能 v1.0
 * 输入：文本
 * 输出：音频
 */

const https = require('https');
const fs = require('fs');
const ZhipuKeys = require('../zhipu-keys/index.js');

class GLMTTS {
  constructor() {
    this.apiKey = ZhipuKeys.getKey('vision');
    this.baseURL = 'open.bigmodel.cn';
    this.model = 'glm-tts';
  }

  /**
   * 文本转语音
   * @param {string} text - 要转换的文本
   * @param {object} options - 选项
   */
  async synthesize(text, options = {}) {
    const body = {
      model: 'glm-tts',
      input: text,
      voice: options.voice || 'female',
      speed: options.speed || 1.0,
      volume: options.volume || 1.0,
      response_format: options.format || 'mp3'
    };

    return this.request('/api/coding/paas/v4/audio/speech', body);
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
        // 检查内容类型
        const contentType = res.headers['content-type'];
        
        if (contentType && contentType.includes('audio')) {
          // 二进制音频流
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const outputPath = `/tmp/tts-${Date.now()}.mp3`;
            require('fs').writeFileSync(outputPath, buffer);
            resolve({ path: outputPath, size: buffer.length, format: body.response_format });
          });
        } else {
          // JSON响应
          let responseData = '';
          res.on('data', chunk => responseData += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(responseData));
            } catch (e) {
              resolve({ raw: responseData });
            }
          });
        }
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}

module.exports = GLMTTS;
