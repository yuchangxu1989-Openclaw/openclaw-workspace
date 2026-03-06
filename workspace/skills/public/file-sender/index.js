#!/usr/bin/env node
/**
 * file-sender — 通过飞书 API 发送本地文件
 *
 * 流程:
 *   1. 用 appId + appSecret 获取 tenant_access_token
 *   2. POST /open-apis/im/v1/files 上传文件 → file_key
 *   3. POST /open-apis/im/v1/messages 发送 msg_type=file 消息
 *
 * 用法:
 *   node index.js <文件路径> <receive_id> [receive_id_type] [显示文件名]
 *
 * receive_id_type 可选: open_id | chat_id | user_id  (默认 chat_id)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ─── 配置 ──────────────────────────────────────────────
const FEISHU_HOST = 'open.feishu.cn';

function loadFeishuConfig() {
  const cfgPath = process.env.OPENCLAW_CONFIG || '/root/.openclaw/openclaw.json';
  if (!fs.existsSync(cfgPath)) {
    throw new Error(`配置文件不存在: ${cfgPath}`);
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const feishuCfg = cfg?.channels?.feishu?.accounts?.default;
  if (!feishuCfg?.appId || !feishuCfg?.appSecret) {
    throw new Error('未找到飞书 appId/appSecret，请检查 openclaw.json');
  }
  return { appId: feishuCfg.appId, appSecret: feishuCfg.appSecret };
}

// ─── HTTP 工具 ─────────────────────────────────────────
function request(options, body) {
  return new Promise((resolve, reject) => {
    const mod = options.protocol === 'http:' ? http : https;
    const req = mod.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// multipart/form-data 手动构建（避免外部依赖）
function buildMultipart(fields, fileField) {
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const parts = [];

  // 普通字段
  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
      `${value}\r\n`
    );
  }

  // 文件字段
  const { name, filename, contentType, data } = fileField;
  const fileHeader =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${name}"; filename="${filename}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`;
  const fileFooter = `\r\n--${boundary}--\r\n`;

  const headerBuf = Buffer.from(parts.join('') + fileHeader, 'utf8');
  const footerBuf = Buffer.from(fileFooter, 'utf8');
  const body = Buffer.concat([headerBuf, data, footerBuf]);

  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

// ─── 1. 获取 tenant_access_token ──────────────────────
async function getTenantToken(appId, appSecret) {
  const payload = JSON.stringify({ app_id: appId, app_secret: appSecret });
  const resp = await request({
    hostname: FEISHU_HOST,
    path: '/open-apis/auth/v3/tenant_access_token/internal',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
    },
  }, payload);

  if (resp.code !== 0) {
    throw new Error(`获取 tenant_access_token 失败: ${JSON.stringify(resp)}`);
  }
  return resp.tenant_access_token;
}

// ─── 2. 上传文件 → file_key ───────────────────────────
function detectFileType(ext) {
  switch (ext.toLowerCase()) {
    case '.opus': case '.ogg': return 'opus';
    case '.mp4': case '.mov': case '.avi': return 'mp4';
    case '.pdf': return 'pdf';
    case '.doc': case '.docx': return 'doc';
    case '.xls': case '.xlsx': return 'xls';
    case '.ppt': case '.pptx': return 'ppt';
    default: return 'stream';
  }
}

async function uploadFile(token, filePath, fileName) {
  const ext = path.extname(fileName);
  const fileType = detectFileType(ext);
  const fileData = fs.readFileSync(filePath);

  // 获取 MIME type
  const mimeMap = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.mp4': 'video/mp4',
    '.opus': 'audio/opus',
    '.ogg': 'audio/ogg',
    '.zip': 'application/zip',
    '.gz': 'application/gzip',
    '.tar': 'application/x-tar',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.py': 'text/x-python',
    '.sh': 'application/x-sh',
  };
  const mime = mimeMap[ext.toLowerCase()] || 'application/octet-stream';

  const { body, contentType } = buildMultipart(
    { file_type: fileType, file_name: fileName },
    { name: 'file', filename: fileName, contentType: mime, data: fileData }
  );

  const resp = await request({
    hostname: FEISHU_HOST,
    path: '/open-apis/im/v1/files',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
      'Content-Length': body.length,
    },
  }, body);

  if (resp.code !== 0) {
    throw new Error(`文件上传失败: ${JSON.stringify(resp)}`);
  }
  const fileKey = resp.data?.file_key;
  if (!fileKey) {
    throw new Error(`上传成功但未返回 file_key: ${JSON.stringify(resp)}`);
  }
  return fileKey;
}

// ─── 3. 发送文件消息 ─────────────────────────────────
async function sendFileMessage(token, receiveId, receiveIdType, fileKey) {
  const payload = JSON.stringify({
    receive_id: receiveId,
    msg_type: 'file',
    content: JSON.stringify({ file_key: fileKey }),
  });

  const resp = await request({
    hostname: FEISHU_HOST,
    path: `/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
    },
  }, payload);

  if (resp.code !== 0) {
    throw new Error(`发送文件消息失败: ${JSON.stringify(resp)}`);
  }
  return resp.data;
}

// ─── 主流程 ───────────────────────────────────────────
class FileSender {
  constructor(options = {}) {
    const cfg = loadFeishuConfig();
    this.appId = options.appId || cfg.appId;
    this.appSecret = options.appSecret || cfg.appSecret;
    this._token = null;
    this._tokenExpiry = 0;
  }

  async getToken() {
    const now = Date.now();
    // token 有效期 2h，提前 5min 刷新
    if (this._token && now < this._tokenExpiry) {
      return this._token;
    }
    this._token = await getTenantToken(this.appId, this.appSecret);
    this._tokenExpiry = now + 110 * 60 * 1000; // 110 min
    return this._token;
  }

  /**
   * 发送本地文件到飞书
   * @param {Object} params
   * @param {string} params.filePath   - 本地文件绝对路径
   * @param {string} params.receiveId  - 接收方 ID（chat_id / open_id / user_id）
   * @param {string} [params.receiveIdType='chat_id'] - ID 类型
   * @param {string} [params.filename] - 显示文件名（默认取 basename）
   */
  async sendFile({ filePath, receiveId, receiveIdType = 'chat_id', filename }) {
    // 检查文件
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    const stat = fs.statSync(filePath);
    if (stat.size > 30 * 1024 * 1024) {
      throw new Error(`文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，飞书上限 30MB`);
    }

    const displayName = filename || path.basename(filePath);
    const sizeStr = stat.size < 1024
      ? `${stat.size}B`
      : stat.size < 1024 * 1024
        ? `${(stat.size / 1024).toFixed(1)}KB`
        : `${(stat.size / 1024 / 1024).toFixed(1)}MB`;

    console.log(`[file-sender] 文件: ${displayName} (${sizeStr})`);

    // Step 1: 获取 token
    const token = await this.getToken();
    console.log('[file-sender] ✓ tenant_access_token 已获取');

    // Step 2: 上传文件
    const fileKey = await uploadFile(token, filePath, displayName);
    console.log(`[file-sender] ✓ 文件已上传, file_key=${fileKey}`);

    // Step 3: 发送消息
    const result = await sendFileMessage(token, receiveId, receiveIdType, fileKey);
    console.log(`[file-sender] ✓ 文件消息已发送, message_id=${result?.message_id || 'unknown'}`);

    return {
      success: true,
      fileKey,
      messageId: result?.message_id,
      filePath,
      filename: displayName,
      size: sizeStr,
    };
  }
}

// ─── CLI 入口 ─────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('用法: node index.js <文件路径> <receive_id> [receive_id_type] [显示文件名]');
    console.log('');
    console.log('参数:');
    console.log('  文件路径         本地文件的绝对路径');
    console.log('  receive_id       飞书接收方 ID（群聊 chat_id 或用户 open_id）');
    console.log('  receive_id_type  ID 类型: chat_id (默认) | open_id | user_id');
    console.log('  显示文件名       发送时显示的文件名（默认取文件 basename）');
    console.log('');
    console.log('示例:');
    console.log('  node index.js /tmp/report.pdf oc_xxx');
    console.log('  node index.js /tmp/data.xlsx oc_xxx chat_id data.xlsx');
    console.log('  node index.js /tmp/code.zip ou_xxx open_id code.zip');
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  const receiveId = args[1];
  const receiveIdType = args[2] || 'chat_id';
  const filename = args[3];

  const sender = new FileSender();

  try {
    const result = await sender.sendFile({ filePath, receiveId, receiveIdType, filename });
    console.log(`\n✅ 发送成功!`);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`\n❌ 发送失败: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { FileSender };
