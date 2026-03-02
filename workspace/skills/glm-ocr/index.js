#!/usr/bin/env node
/**
 * GLM-OCR 技能 v1.0
 * 输入：PDF(≤50MB)、图片(≤10MB)、最多100页
 * 输出：文本、图片链接、Markdown
 */

const https = require('https');
const fs = require('fs');
const ZhipuKeys = require('../zhipu-keys/index.js');

class GLMOCR {
  constructor() {
    this.apiKey = ZhipuKeys.getKey('vision');
    this.baseURL = 'open.bigmodel.cn';
    this.model = 'glm-ocr';
  }

  /**
   * OCR识别 - 支持图片和PDF
   * @param {string} filePath - 本地文件路径
   * @param {object} options - 选项
   */
  async recognize(filePath, options = {}) {
    // 检查文件大小
    const stats = fs.statSync(filePath);
    const ext = filePath.split('.').pop().toLowerCase();
    
    if (['jpg', 'jpeg', 'png'].includes(ext)) {
      if (stats.size > 10 * 1024 * 1024) {
        throw new Error('图片超过10MB限制');
      }
    } else if (ext === 'pdf') {
      if (stats.size > 50 * 1024 * 1024) {
        throw new Error('PDF超过50MB限制');
      }
    } else {
      throw new Error('不支持的文件格式');
    }

    // 转base64
    const data = fs.readFileSync(filePath);
    const base64 = `data:${ext === 'pdf' ? 'application/pdf' : 'image/jpeg'};base64,${data.toString('base64')}`;

    return this.request('/api/paas/v4/chat/completions', {
      model: this.model,
      messages: [{
        role: 'user',
        content: [
          { type: 'file_url', file_url: { url: base64 } },
          { type: 'text', text: options.prompt || '识别这个文件的内容' }
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

module.exports = GLMOCR;
