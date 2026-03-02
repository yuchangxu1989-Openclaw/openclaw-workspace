#!/usr/bin/env node
/**
 * 飞书文档存储模块
 * 支持文档创建、更新、同步
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

class FeishuDocStorage {
  constructor() {
    this.appId = process.env.FEISHU_APP_ID || 'cli_a911a148cbb89bde';
    this.appSecret = process.env.FEISHU_APP_SECRET;
    this.baseUrl = 'open.feishu.cn';
    this.accessToken = null;
    this.tokenExpiry = 0;
  }

  /**
   * 获取 tenant_access_token
   */
  async getToken() {
    // 缓存token，避免频繁请求
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        app_id: this.appId,
        app_secret: this.appSecret
      });

      const options = {
        hostname: this.baseUrl,
        path: '/open-apis/auth/v3/tenant_access_token/internal',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.tenant_access_token) {
              this.accessToken = json.tenant_access_token;
              this.tokenExpiry = Date.now() + (json.expire - 60) * 1000;
              resolve(this.accessToken);
            } else {
              reject(new Error(json.msg || '获取token失败'));
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
   * 创建文档
   */
  async createDoc(title, content) {
    const token = await this.getToken();
    
    // 创建空白文档
    const docId = await this.createBlankDoc(token, title);
    
    // 写入内容
    await this.writeContent(token, docId, content);
    
    return {
      document_id: docId,
      url: `https://open.feishu.cn/open-apis/doc/v2/${docId}`
    };
  }

  async createBlankDoc(token, title) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({ title });
      
      const options = {
        hostname: this.baseUrl,
        path: '/open-apis/doc/v2/create',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.data?.document?.document_id) {
              resolve(json.data.document.document_id);
            } else {
              reject(new Error(json.msg || '创建文档失败'));
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

  async writeContent(token, docId, content) {
    // 飞书文档写入实现
    // 将内容分块写入（飞书有单块大小限制）
    const chunks = this.splitContent(content, 50000); // 50KB per chunk
    
    for (let i = 0; i < chunks.length; i++) {
      await this.writeBlock(token, docId, chunks[i], i);
    }
  }

  splitContent(content, maxSize) {
    if (content.length <= maxSize) return [content];
    
    const chunks = [];
    for (let i = 0; i < content.length; i += maxSize) {
      chunks.push(content.slice(i, i + maxSize));
    }
    return chunks;
  }

  async writeBlock(token, docId, content, index) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        document_id: docId,
        content: content,
        position: index === 0 ? 'start' : 'end'
      });

      const options = {
        hostname: this.baseUrl,
        path: '/open-apis/doc/v2/content',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(body));
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}

module.exports = FeishuDocStorage;
