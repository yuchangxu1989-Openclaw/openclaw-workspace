#!/usr/bin/env node
/**
 * GLM-Image 技能 v1.0
 * 输入：文本(≤1000字符)
 * 输出：图像
 */

const https = require('https');
const ZhipuKeys = require('../zhipu-keys/index.js');

class GLMImage {
  constructor() {
    this.apiKey = ZhipuKeys.getKey('vision');
    this.baseURL = 'open.bigmodel.cn';
    this.apiPath = '/api/coding/paas/v4';
    this.model = 'glm-image';
  }

  /**
   * 文生图
   * @param {string} prompt - 图片描述(≤1000字符)
   * @param {object} options - 选项
   */
  async generate(prompt, options = {}) {
    if (prompt.length > 1000) {
      throw new Error('提示词超过1000字符限制');
    }

    const body = {
      model: this.model,
      prompt: prompt,
      size: options.size || '1024x1024',
      n: options.n || 1
    };

    const result = await this.request(this.apiPath + '/images/generations', body);
    return result.data?.[0]?.url;
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
            resolve(JSON.parse(responseData));
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

module.exports = GLMImage;
