/**
 * feishu-common — 飞书 API 通用模块
 * 
 * 提供 fetchWithAuth: 自动获取/缓存 tenant_access_token, 附加到请求
 * 
 * 被 feishu-evolver-wrapper/feishu-helper.js 和 report.js 依赖
 */

const https = require('https');
const fs = require('fs');

const FEISHU_HOST = 'open.feishu.cn';
const CONFIG_PATH = '/root/.openclaw/openclaw.json';

let _tokenCache = { token: null, expiresAt: 0 };

function loadCredentials() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const acct = config.channels?.feishu?.accounts?.default || {};
  return { appId: acct.appId, appSecret: acct.appSecret };
}

function httpsRequest(url, options, postData) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const mod = urlObj.protocol === 'https:' ? https : require('http');
    const req = mod.request(url, { ...options, timeout: 15000 }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: buf, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timeout')));
    if (postData) req.write(postData);
    req.end();
  });
}

async function getTenantToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }
  const { appId, appSecret } = loadCredentials();
  const resp = await httpsRequest(
    `https://${FEISHU_HOST}/open-apis/auth/v3/tenant_access_token/internal`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    JSON.stringify({ app_id: appId, app_secret: appSecret })
  );
  const data = JSON.parse(resp.body);
  if (data.code !== 0) throw new Error(`Feishu token error: ${data.msg}`);
  _tokenCache = { token: data.tenant_access_token, expiresAt: Date.now() + 110 * 60 * 1000 };
  return _tokenCache.token;
}

/**
 * fetchWithAuth — 带自动 token 的 Feishu API 请求
 * @param {string} url - 完整 API URL
 * @param {object} options - { method, headers, body }
 * @returns {Promise<{json: Function, status: number}>}
 */
async function fetchWithAuth(url, options = {}) {
  const token = await getTenantToken();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {})
  };
  
  const resp = await httpsRequest(url, { ...options, headers }, options.body);
  
  return {
    status: resp.status,
    headers: resp.headers,
    json: () => JSON.parse(resp.body),
    text: () => resp.body,
  };
}

module.exports = { fetchWithAuth, getTenantToken, loadCredentials };
