#!/usr/bin/env node
/**
 * CogView 图像生成技能 v1.0
 * 文生图、图生图
 */

const https = require('https');

class CogView {
  constructor(apiKey) {
    const ZK = require('../zhipu-keys/index.js');
    this.apiKey = apiKey || ZK.getKey('image');
    this.baseURL = 'open.bigmodel.cn';
    this.model = 'cogview-3-plus';
  }

  /**
   * 文生图
   * @param {string} prompt - 图片描述
   * @param {object} options - 尺寸、风格等
   */
  async generate(prompt, options = {}) {
    const body = {
      model: this.model,
      prompt: prompt,
      size: options.size || '1024x1024',
      quality: options.quality || 'standard'
    };

    const result = await this.request('/api/coding/paas/v4/images/generations', body);
    return result.data?.[0]?.url;
  }

  /**
   * 图生图（图像编辑）
   */
  async edit(imageUrl, prompt, options = {}) {
    const body = {
      model: this.model,
      image_url: imageUrl,
      prompt: prompt,
      size: options.size || '1024x1024'
    };

    const result = await this.request('/api/coding/paas/v4/images/edits', body);
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

module.exports = CogView;
