#!/usr/bin/env node
/**
 * CogVideo 视频生成技能 v1.0
 * 文生视频、图生视频
 */

const https = require('https');

class CogVideo {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.ZHIPU_API_KEY;
    this.baseURL = 'open.bigmodel.cn';
    this.model = 'cogvideo';
  }

  /**
   * 文生视频
   * @param {string} prompt - 视频描述
   * @param {object} options - 分辨率、时长等
   */
  async generate(prompt, options = {}) {
    const body = {
      model: this.model,
      prompt: prompt,
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
   * 图生视频
   */
  async imageToVideo(imageUrl, prompt, options = {}) {
    const body = {
      model: this.model,
      image_url: imageUrl,
      prompt: prompt,
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

module.exports = CogVideo;
