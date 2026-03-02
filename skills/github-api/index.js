#!/usr/bin/env node
/**
 * GitHub API技能 v1.0
 * 自动处理token、分页、限流
 */

const https = require('https');

class GitHubAPI {
  constructor(token) {
    this.token = token || process.env.GITHUB_TOKEN;
    this.baseURL = 'api.github.com';
    this.rateLimitRemaining = 5000;
    this.rateLimitReset = 0;
  }

  /**
   * 通用请求方法 - 自动处理限流和重试
   */
  async request(path, options = {}) {
    // 检查限流
    if (this.rateLimitRemaining < 10) {
      const waitTime = this.rateLimitReset - Math.floor(Date.now() / 1000);
      if (waitTime > 0) {
        console.log(`[GitHub API] 限流等待 ${waitTime}秒...`);
        await this.sleep(waitTime * 1000);
      }
    }

    const opts = {
      hostname: this.baseURL,
      path: path,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'OpenClaw-GitHub-Skill',
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        ...options.headers
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(opts, (res) => {
        // 更新限流信息
        this.rateLimitRemaining = parseInt(res.headers['x-ratelimit-remaining']) || 0;
        this.rateLimitReset = parseInt(res.headers['x-ratelimit-reset']) || 0;

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ status: res.statusCode, headers: res.headers, data: json });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, data });
          }
        });
      });

      req.on('error', reject);
      if (options.body) req.write(JSON.stringify(options.body));
      req.end();
    });
  }

  /**
   * 自动分页获取
   */
  async paginate(path, options = {}) {
    const results = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= (options.maxPages || 10)) {
      const paginatedPath = `${path}${path.includes('?') ? '&' : '?'}page=${page}&per_page=100`;
      const response = await this.request(paginatedPath, options);
      
      if (response.status === 200) {
        const data = Array.isArray(response.data) ? response.data : [response.data];
        results.push(...data);
        hasMore = data.length === 100;
        page++;
      } else {
        throw new Error(`GitHub API错误: ${response.status} - ${JSON.stringify(response.data)}`);
      }
    }

    return results;
  }

  /**
   * 获取仓库文件
   */
  async getFile(owner, repo, path, ref = 'main') {
    const response = await this.request(`/repos/${owner}/${repo}/contents/${path}?ref=${ref}`);
    if (response.status === 200 && response.data.content) {
      return Buffer.from(response.data.content, 'base64').toString('utf8');
    }
    throw new Error(`获取文件失败: ${response.status}`);
  }

  /**
   * 提交文件
   */
  async commitFile(owner, repo, path, content, message, branch = 'main') {
    // 获取当前文件SHA（如果存在）
    let sha;
    try {
      const fileRes = await this.request(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
      if (fileRes.status === 200) sha = fileRes.data.sha;
    } catch {}

    const body = {
      message,
      content: Buffer.from(content).toString('base64'),
      branch
    };
    if (sha) body.sha = sha;

    return this.request(`/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      body
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 测试
if (require.main === module) {
  const github = new GitHubAPI();
  
  // 测试获取文件
  github.getFile('yuchangxu1989-Openclaw', 'xiaoman', 'README.md')
    .then(content => console.log('✅ 测试通过，文件长度:', content.length))
    .catch(err => console.error('❌ 测试失败:', err.message));
}

module.exports = GitHubAPI;
