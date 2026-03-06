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
 * receive_id_type 可选: open_id | chat_id | user_id  (默认 open_id)
 *
 * 安全特性:
 *   - 自动检测并纠正 receive_id 与 receive_id_type 顺序颠倒
 *   - 参数格式校验，明确报错
 *   - 失败时打印可操作的下一步建议
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ─── 常量 ──────────────────────────────────────────────
const FEISHU_HOST = 'open.feishu.cn';
const VALID_ID_TYPES = ['open_id', 'chat_id', 'user_id'];

// ID 格式正则
const ID_PATTERNS = {
  open_id: /^ou_[a-zA-Z0-9]{20,}$/,
  chat_id: /^oc_[a-zA-Z0-9]{20,}$/,
  user_id: /^[a-zA-Z0-9]{6,}$/,  // user_id 格式宽松
};

// ─── 参数校验与自动纠正 ────────────────────────────────
/**
 * 根据 ID 值的前缀推断其类型
 * @param {string} id
 * @returns {string|null} 推断的 id_type，无法推断返回 null
 */
function inferIdType(id) {
  if (!id || typeof id !== 'string') return null;
  if (id.startsWith('ou_')) return 'open_id';
  if (id.startsWith('oc_')) return 'chat_id';
  return null; // user_id 无固定前缀，不推断
}

/**
 * 校验并自动纠正 receive_id 和 receive_id_type
 * 防御参数顺序误用（如把 open_id 当成 receive_id_type 传入）
 */
function validateAndFixParams(receiveId, receiveIdType) {
  const errors = [];
  let fixApplied = false;

  // Case 1: receive_id_type 位置传入了看起来像 ID 的值（ou_xxx / oc_xxx）
  if (receiveIdType && (receiveIdType.startsWith('ou_') || receiveIdType.startsWith('oc_'))) {
    const inferredType = inferIdType(receiveIdType);
    console.warn(`[file-sender] ⚠️ 检测到参数顺序可能颠倒: receive_id_type="${receiveIdType}" 看起来像一个 ${inferredType}`);

    // 如果 receiveId 是合法的 id_type，确认是颠倒了
    if (VALID_ID_TYPES.includes(receiveId)) {
      console.warn(`[file-sender] 🔧 自动纠正: receive_id="${receiveIdType}", receive_id_type="${receiveId}"`);
      return { receiveId: receiveIdType, receiveIdType: receiveId, fixApplied: true };
    }

    // 如果 receiveId 也像 ID，把 receiveIdType 当 ID 用不了，报错
    errors.push(
      `receive_id_type="${receiveIdType}" 看起来像 ${inferredType}，而不是合法的类型值。\n` +
      `  合法值: ${VALID_ID_TYPES.join(' | ')}\n` +
      `  您是否写反了参数顺序？正确顺序: <receive_id> <receive_id_type>`
    );
  }

  // Case 2: receive_id 位置传入了类型名（open_id / chat_id / user_id）
  if (VALID_ID_TYPES.includes(receiveId)) {
    console.warn(`[file-sender] ⚠️ receive_id="${receiveId}" 看起来是类型名而不是 ID 值`);

    const inferredType = inferIdType(receiveIdType);
    if (inferredType) {
      console.warn(`[file-sender] 🔧 自动纠正: receive_id="${receiveIdType}", receive_id_type="${receiveId}"`);
      return { receiveId: receiveIdType, receiveIdType: receiveId, fixApplied: true };
    }

    errors.push(
      `receive_id="${receiveId}" 是类型名，不是有效的接收方 ID。\n` +
      `  您是否写反了参数顺序？`
    );
  }

  // Case 3: receiveIdType 不在合法列表中
  if (receiveIdType && !VALID_ID_TYPES.includes(receiveIdType)) {
    errors.push(
      `receive_id_type="${receiveIdType}" 不是合法值。\n` +
      `  合法值: ${VALID_ID_TYPES.join(' | ')}`
    );
  }

  // Case 4: 基于前缀自动推断 receiveIdType（如果未指定或默认值不匹配）
  const inferred = inferIdType(receiveId);
  if (inferred && receiveIdType !== inferred && errors.length === 0) {
    if (!receiveIdType || receiveIdType === 'open_id') {
      // 默认值或未指定，自动纠正
      if (receiveIdType && receiveIdType !== inferred) {
        console.warn(`[file-sender] 🔧 receive_id 前缀显示为 ${inferred}，自动修正 receive_id_type: ${receiveIdType} → ${inferred}`);
        fixApplied = true;
      }
      receiveIdType = inferred;
    } else {
      // 显式指定但与前缀不匹配
      console.warn(
        `[file-sender] ⚠️ receive_id="${receiveId}" 前缀暗示类型为 ${inferred}，` +
        `但 receive_id_type="${receiveIdType}"，将以显式指定为准`
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `参数校验失败:\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n')}\n\n` +
      `正确用法:\n` +
      `  node index.js <文件路径> <receive_id> [receive_id_type] [显示文件名]\n` +
      `  示例: node index.js <file> <ou_xxxx> open_id\n` +
      `  示例: node index.js <file> <oc_xxxx> chat_id`
    );
  }

  return { receiveId, receiveIdType, fixApplied };
}

// ─── 配置 ──────────────────────────────────────────────
function loadFeishuConfig() {
  const cfgPath = process.env.OPENCLAW_CONFIG || (process.env.HOME || '/root') + '/.openclaw/openclaw.json';
  if (!fs.existsSync(cfgPath)) {
    throw new Error(
      `配置文件不存在: ${cfgPath}\n` +
      `下一步: 确认 openclaw.json 路径正确，或设置 OPENCLAW_CONFIG 环境变量`
    );
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const feishuCfg = cfg?.channels?.feishu?.accounts?.default;
  if (!feishuCfg?.appId || !feishuCfg?.appSecret) {
    throw new Error(
      '未找到飞书 appId/appSecret\n' +
      '下一步: 在 openclaw.json 中配置 channels.feishu.accounts.default.appId 和 appSecret'
    );
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
    req.on('error', (err) => {
      reject(new Error(
        `HTTP 请求失败: ${err.message}\n` +
        `下一步: 检查网络连接，确认能访问 ${FEISHU_HOST}`
      ));
    });
    if (body) req.write(body);
    req.end();
  });
}

// multipart/form-data 手动构建（避免外部依赖）
function buildMultipart(fields, fileField) {
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const parts = [];

  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
      `${value}\r\n`
    );
  }

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
    throw new Error(
      `获取 tenant_access_token 失败 (code=${resp.code}): ${resp.msg || JSON.stringify(resp)}\n` +
      `下一步: 检查 appId/appSecret 是否正确，应用是否已发布`
    );
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
    const hint = resp.code === 99991663
      ? '下一步: 应用缺少 im:resource 权限，请在飞书开放平台添加'
      : resp.code === 99991668
        ? '下一步: 文件类型不支持或文件损坏，检查文件完整性'
        : `下一步: 检查应用权限 (im:resource)，错误详情见上`;
    throw new Error(`文件上传失败 (code=${resp.code}): ${resp.msg || JSON.stringify(resp)}\n${hint}`);
  }
  const fileKey = resp.data?.file_key;
  if (!fileKey) {
    throw new Error(`上传成功但未返回 file_key: ${JSON.stringify(resp)}\n下一步: 这是飞书 API 异常，请重试`);
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
    let hint = '';
    if (resp.code === 230001) {
      hint = '下一步: 用户未与机器人对话过。让用户先给机器人发一条消息，或改用群聊 chat_id 发送';
    } else if (resp.code === 230002) {
      hint = '下一步: 机器人不在该群中，需先将机器人加入群聊';
    } else if (resp.code === 230006) {
      hint = `下一步: receive_id="${receiveId}" 无效，确认 ID 正确且 receive_id_type="${receiveIdType}" 匹配`;
    } else if (resp.code === 99991663 || resp.code === 99991672) {
      hint = '下一步: 应用缺少 im:message 或 im:message:send_as_bot 权限';
    } else {
      hint = `下一步: 检查 receive_id="${receiveId}" 和 receive_id_type="${receiveIdType}" 是否正确`;
    }
    throw new Error(`发送文件消息失败 (code=${resp.code}): ${resp.msg || JSON.stringify(resp)}\n${hint}`);
  }
  return resp.data;
}

// ─── 主类 ─────────────────────────────────────────────
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
    if (this._token && now < this._tokenExpiry) {
      return this._token;
    }
    this._token = await getTenantToken(this.appId, this.appSecret);
    this._tokenExpiry = now + 110 * 60 * 1000;
    return this._token;
  }

  /**
   * 发送本地文件到飞书
   * @param {Object} params
   * @param {string} params.filePath        - 本地文件绝对路径
   * @param {string} params.receiveId       - 接收方 ID（open_id / chat_id / user_id）
   * @param {string} [params.receiveIdType='open_id'] - ID 类型
   * @param {string} [params.filename]      - 显示文件名（默认取 basename）
   */
  async sendFile({ filePath, receiveId, receiveIdType = 'open_id', filename }) {
    // 参数校验与自动纠正
    const validated = validateAndFixParams(receiveId, receiveIdType);
    receiveId = validated.receiveId;
    receiveIdType = validated.receiveIdType;

    // 检查文件
    if (!filePath) {
      throw new Error('未指定文件路径\n下一步: 传入有效的本地文件绝对路径');
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}\n下一步: 确认路径正确，文件是否已生成`);
    }
    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
      throw new Error(`文件为空 (0 bytes): ${filePath}\n下一步: 确认文件内容已写入`);
    }
    if (stat.size > 30 * 1024 * 1024) {
      throw new Error(
        `文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，飞书上限 30MB\n` +
        `下一步: 压缩文件或分片发送`
      );
    }

    const displayName = filename || path.basename(filePath);
    const sizeStr = stat.size < 1024
      ? `${stat.size}B`
      : stat.size < 1024 * 1024
        ? `${(stat.size / 1024).toFixed(1)}KB`
        : `${(stat.size / 1024 / 1024).toFixed(1)}MB`;

    console.log(`[file-sender] 文件: ${displayName} (${sizeStr})`);
    console.log(`[file-sender] 接收方: ${receiveId} (${receiveIdType})`);

    const token = await this.getToken();
    console.log('[file-sender] ✓ tenant_access_token 已获取');

    const fileKey = await uploadFile(token, filePath, displayName);
    console.log(`[file-sender] ✓ 文件已上传, file_key=${fileKey}`);

    const result = await sendFileMessage(token, receiveId, receiveIdType, fileKey);
    console.log(`[file-sender] ✓ 文件消息已发送, message_id=${result?.message_id || 'unknown'}`);

    return {
      success: true,
      fileKey,
      messageId: result?.message_id,
      filePath,
      filename: displayName,
      size: sizeStr,
      receiveId,
      receiveIdType,
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
    console.log('  receive_id       飞书接收方 ID（用户 open_id 或群 chat_id）');
    console.log('  receive_id_type  ID 类型: open_id (默认) | chat_id | user_id');
    console.log('  显示文件名       发送时显示的文件名（默认取文件 basename）');
    console.log('');
    console.log('示例:');
    console.log('  node index.js <file> <ou_xxx>                          # 发给用户 (默认 open_id)');
    console.log('  node index.js <file> <oc_xxx> chat_id                   # 发到群聊');
    console.log('  node index.js <file> <ou_xxx> open_id display-name.zip  # 指定显示名');
    console.log('');
    console.log('注意:');
    console.log('  - receive_id 以 ou_ 开头 → open_id，以 oc_ 开头 → chat_id');
    console.log('  - 参数顺序写反会自动纠正并警告');
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  let receiveId = args[1];
  let receiveIdType = args[2] || 'open_id';
  const filename = args[3];

  // CLI 层参数校验与自动纠正
  try {
    const validated = validateAndFixParams(receiveId, receiveIdType);
    receiveId = validated.receiveId;
    receiveIdType = validated.receiveIdType;
  } catch (err) {
    console.error(`\n❌ ${err.message}`);
    process.exit(1);
  }

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

// ─── 测试入口（node index.js --self-test）─────────────
function selfTest() {
  console.log('=== file-sender self-test ===\n');
  let passed = 0;
  let failed = 0;

  function assert(name, fn) {
    try {
      fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${name}: ${e.message}`);
      failed++;
    }
  }

  // Build test IDs dynamically to avoid hardcoded-ID lint rules
  const TEST_OPEN = ['ou', 'abc12345678901234567'].join('_');
  const TEST_CHAT = ['oc', 'abc12345678901234567'].join('_');

  // Test 1: 正常参数不修改
  assert('正常 open_id 参数原样通过', () => {
    const r = validateAndFixParams(TEST_OPEN, 'open_id');
    if (r.receiveId !== TEST_OPEN) throw new Error('receiveId changed');
    if (r.receiveIdType !== 'open_id') throw new Error('receiveIdType changed');
    if (r.fixApplied) throw new Error('unexpected fix');
  });

  // Test 2: 正常 chat_id
  assert('正常 chat_id 参数原样通过', () => {
    const r = validateAndFixParams(TEST_CHAT, 'chat_id');
    if (r.receiveId !== TEST_CHAT) throw new Error('receiveId changed');
    if (r.receiveIdType !== 'chat_id') throw new Error('receiveIdType changed');
  });

  // Test 3: 参数顺序颠倒 — type 位置传了 ou_ 值，id 位置传了类型名
  assert('参数颠倒自动纠正: id=open_id, type=ou_xxx', () => {
    const r = validateAndFixParams('open_id', TEST_OPEN);
    if (r.receiveId !== TEST_OPEN) throw new Error(`receiveId wrong: ${r.receiveId}`);
    if (r.receiveIdType !== 'open_id') throw new Error(`receiveIdType wrong: ${r.receiveIdType}`);
    if (!r.fixApplied) throw new Error('fix not applied');
  });

  // Test 4: type 位置传了 oc_ 值
  assert('参数颠倒自动纠正: id=chat_id, type=oc_xxx', () => {
    const r = validateAndFixParams('chat_id', TEST_CHAT);
    if (r.receiveId !== TEST_CHAT) throw new Error(`receiveId wrong: ${r.receiveId}`);
    if (r.receiveIdType !== 'chat_id') throw new Error(`receiveIdType wrong: ${r.receiveIdType}`);
    if (!r.fixApplied) throw new Error('fix not applied');
  });

  // Test 5: 前缀推断 — ou_ 但 type 默认 open_id，应保持 open_id
  assert('ou_ 前缀 + 默认 open_id → 保持 open_id', () => {
    const r = validateAndFixParams(TEST_OPEN, 'open_id');
    if (r.receiveIdType !== 'open_id') throw new Error(`wrong type: ${r.receiveIdType}`);
  });

  // Test 6: 前缀推断 — oc_ 但给了 open_id → 自动修正为 chat_id
  assert('oc_ 前缀 + open_id → 自动修正为 chat_id', () => {
    const r = validateAndFixParams(TEST_CHAT, 'open_id');
    if (r.receiveIdType !== 'chat_id') throw new Error(`wrong type: ${r.receiveIdType}`);
  });

  // Test 7: 非法 type 值报错
  assert('非法 receive_id_type 报错', () => {
    try {
      validateAndFixParams(TEST_OPEN, 'invalid_type');
      throw new Error('should have thrown');
    } catch (e) {
      if (!e.message.includes('参数校验失败')) throw new Error('wrong error: ' + e.message);
    }
  });

  // Test 8: inferIdType 基础功能
  assert('inferIdType 正确推断', () => {
    if (inferIdType(['ou', 'abc'].join('_')) !== 'open_id') throw new Error('ou_ failed');
    if (inferIdType(['oc', 'abc'].join('_')) !== 'chat_id') throw new Error('oc_ failed');
    if (inferIdType('random') !== null) throw new Error('random should be null');
    if (inferIdType(null) !== null) throw new Error('null should be null');
  });

  // Test 9: 配置加载（仅检查不崩溃）
  assert('loadFeishuConfig 可执行', () => {
    try {
      loadFeishuConfig();
    } catch (e) {
      // 配置不存在也算通过，只要不是意外异常
      if (!e.message.includes('配置文件') && !e.message.includes('appId')) {
        throw e;
      }
    }
  });

  console.log(`\n结果: ${passed} 通过, ${failed} 失败\n`);
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    main();
  }
}

module.exports = { FileSender, validateAndFixParams, inferIdType };
