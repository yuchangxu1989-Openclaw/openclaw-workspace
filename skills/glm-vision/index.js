#!/usr/bin/env node
/**
 * GLM-4V-Plus 图像理解技能 v1.0
 * 多模态视觉理解，支持图像问答、描述、分析
 */

const https = require('https');

class GLMVision {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.ZHIPU_API_KEY || process.env.KIMI_API_KEY;
    this.baseURL = 'open.bigmodel.cn';
    this.model = 'glm-4v-plus';
  }

  /**
   * 图像理解 - 支持URL或Base64
   * @param {string} imageUrl - 图片URL或Base64
   * @param {string} prompt - 问题/提示词
   */
  async understand(imageUrl, prompt = '描述这张图片') {
    const body = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: prompt }
          ]
        }
      ]
    };

    return this.request('/api/paas/v4/chat/completions', body);
  }

  /**
   * 批量图像分析
   */
  async batchAnalyze(images, prompt) {
    const results = [];
    for (const image of images) {
      try {
        const result = await this.understand(image, prompt);
        results.push({ image, success: true, result });
      } catch (err) {
        results.push({ image, success: false, error: err.message });
      }
    }
    return results;
  }

  /**
   * 通用请求方法
   */
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
            if (json.choices && json.choices[0]) {
              resolve(json.choices[0].message.content);
            } else {
              reject(new Error(json.error?.message || '未知错误'));
            }
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

  /**
   * 文件转Base64
   */
  async fileToBase64(filePath) {
    const fs = require('fs');
    const data = fs.readFileSync(filePath);
    return `data:image/jpeg;base64,${data.toString('base64')}`;
  }
}

module.exports = GLMVision;
