#!/usr/bin/env node
/**
 * Notion 存储模块
 * 支持Database和Page创建
 */

const https = require('https');

class NotionStorage {
  constructor() {
    this.token = process.env.NOTION_TOKEN;
    this.databaseId = process.env.NOTION_DATABASE_ID;
    this.baseUrl = 'api.notion.com';
  }

  /**
   * 创建页面
   */
  async createPage(title, content, tags = []) {
    const body = {
      parent: { database_id: this.databaseId },
      properties: {
        Name: {
          title: [{ text: { content: title } }]
        },
        Tags: {
          multi_select: tags.map(t => ({ name: t }))
        },
        Date: {
          date: { start: new Date().toISOString().split('T')[0] }
        }
      },
      children: this.markdownToBlocks(content)
    };

    return this.request('/v1/pages', body);
  }

  /**
   * Markdown转Notion Blocks
   */
  markdownToBlocks(markdown) {
    const blocks = [];
    const lines = markdown.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('# ')) {
        blocks.push({
          object: 'block',
          type: 'heading_1',
          heading_1: { rich_text: [{ text: { content: line.slice(2) } }] }
        });
      } else if (line.startsWith('## ')) {
        blocks.push({
          object: 'block',
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: line.slice(3) } }] }
        });
      } else if (line.startsWith('- ')) {
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ text: { content: line.slice(2) } }] }
        });
      } else if (line.trim()) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ text: { content: line } }] }
        });
      }
    }
    
    return blocks.slice(0, 100); // Notion限制100个blocks
  }

  /**
   * 查询数据库
   */
  async queryDatabase(filter = {}) {
    return this.request(`/v1/databases/${this.databaseId}/query`, {
      filter,
      page_size: 100
    });
  }

  request(path, body, method = 'POST') {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      
      const options = {
        hostname: this.baseUrl,
        path: path,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(responseData);
            if (json.object === 'error') {
              reject(new Error(json.message));
            } else {
              resolve({
                id: json.id,
                url: json.url,
                created_time: json.created_time
              });
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
}

module.exports = NotionStorage;
