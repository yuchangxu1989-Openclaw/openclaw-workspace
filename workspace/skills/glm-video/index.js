#!/usr/bin/env node
/**
 * GLM-Video 技能 v1.0
 * 输入：图片+文字
 * 输出：视频
 */

const https = require('https');
const fs = require('fs');
const ZhipuKeys = require('../zhipu-keys/index.js');

class GLMVideo {
  constructor() {
    this.apiKey = ZhipuKeys.getKey('vision');
    this.baseURL = 'open.bigmodel.cn';
    this.model = 'cogvideo';
  }

  /**
   * 图生视频
   * @param {string} imagePath - 图片路径
   * @param {string} prompt - 视频描述
   * @param {object} options - 选项
   */
  async generate(imagePath, prompt, options = {}) {
    // 转base64
    const data = fs.readFileSync(imagePath);
    const base64 = `data:image/jpeg;base64,${data.toString('base64')}`;

    const body = {
      model: this.model,
      prompt: prompt,
      image_url: base64,
      resolution: options.resolution || '720p',
      duration: options.duration || 6
    };

    const result = await this.request('/api/coding/paas/v4/videos/generations', body);
    return {
      taskId: result.id,
      status: result.status,
      videoUrl: result.video_url
    };
  }

  /**
   * 查询任务状态
   */
  async queryStatus(taskId) {
    return this.request(`/api/coding/paas/v4/videos/${taskId}`, null, 'GET');
  }

  request(path, body, method = 'POST') {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseURL,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
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
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
}

module.exports = GLMVideo;
