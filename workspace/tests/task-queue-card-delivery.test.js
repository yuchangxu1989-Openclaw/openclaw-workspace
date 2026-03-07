#!/usr/bin/env node
/**
 * tests/task-queue-card-delivery.test.js
 * 
 * 任务队列 Interactive Card 送达链端对端测试
 * 
 * 测试覆盖：
 *   T1. Feishu token 获取是否成功
 *   T2. 文本消息能否发送到当前会话
 *   T3. Interactive Card 能否发送到当前会话
 *   T4. live-task-queue-report.js 生成的 card 格式是否合规
 *   T5. send-task-queue-card.js 使用真实报告数据发送
 *   T6. 发送日志正确写入
 *   T7. 降级路径（无 report.json 时）正常工作
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const WORKSPACE = path.resolve(__dirname, '..');
const APP_ID = 'cli_a92f2a545838dcc8';
const APP_SECRET = 'r5ERTp7T0JdxwzuEJ4HkzeCdAr7GLpeC';
const TARGET_OPEN_ID = 'ou_a113e465324cc55f9ab3348c9a1a7b9b';
const REPORT_FILE = path.join(WORKSPACE, 'reports', 'task-queue', 'live-task-queue-report.json');
const LOG_FILE = path.join(WORKSPACE, 'infrastructure', 'logs', 'card-send.jsonl');

// ─── 工具 ─────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    const result = await fn();
    console.log(`  ✅ ${name}`);
    if (result) console.log(`     ${result}`);
    results.push({ name, status: 'pass', detail: result });
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    results.push({ name, status: 'fail', error: e.message });
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

async function httpPost(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers }
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { resolve({ raw }); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── 测试 ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n📋 任务队列 Interactive Card 送达链测试\n');
  console.log('─'.repeat(60));

  let token = null;

  // T1: Token 获取
  await test('T1 - Feishu tenant_access_token 获取', async () => {
    const res = await httpPost(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      { app_id: APP_ID, app_secret: APP_SECRET }
    );
    assert(res.code === 0, `token 获取失败: code=${res.code} msg=${res.msg}`);
    assert(res.tenant_access_token, 'token 为空');
    token = res.tenant_access_token;
    return `token前缀: ${token.slice(0, 20)}...`;
  });

  // T2: 文本消息发送
  await test('T2 - 文本消息直接API送达', async () => {
    assert(token, '需要先获取 token (T1 failed?)');
    const res = await httpPost(
      'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',
      {
        receive_id: TARGET_OPEN_ID,
        msg_type: 'text',
        content: JSON.stringify({ text: `[TEST-T2] 文本消息API验证 ${new Date().toLocaleTimeString('zh-CN')}` })
      },
      { Authorization: `Bearer ${token}` }
    );
    assert(res.code === 0, `发送失败: code=${res.code} msg=${res.msg}`);
    return `msg_id=${res.data?.message_id}`;
  });

  // T3: Interactive Card 发送
  await test('T3 - Interactive Card 直接API送达', async () => {
    assert(token, '需要先获取 token (T1 failed?)');
    const card = {
      config: { wide_screen_mode: true },
      header: { template: 'green', title: { tag: 'plain_text', content: '✅ TEST-T3 Card 验证' } },
      elements: [
        { tag: 'markdown', content: `**测试时间**: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}` },
        { tag: 'hr' },
        { tag: 'markdown', content: '这是自动化测试发送的 Interactive Card，验证送达链是否正常。' }
      ]
    };
    const res = await httpPost(
      'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',
      { receive_id: TARGET_OPEN_ID, msg_type: 'interactive', content: JSON.stringify(card) },
      { Authorization: `Bearer ${token}` }
    );
    assert(res.code === 0, `发送失败: code=${res.code} msg=${res.msg}`);
    return `msg_id=${res.data?.message_id}`;
  });

  // T4: live-task-queue-report.json 格式验证
  await test('T4 - live-task-queue-report.json 格式合规', async () => {
    // 先重新生成
    execSync('node scripts/live-task-queue-report.js', { cwd: WORKSPACE, stdio: 'pipe' });
    assert(fs.existsSync(REPORT_FILE), 'report 文件不存在');
    const data = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
    assert(data.card, '缺少 card 字段');
    assert(data.card.header, '缺少 card.header');
    assert(data.card.elements && Array.isArray(data.card.elements), '缺少 card.elements');
    assert(data.stats, '缺少 stats 字段');
    assert(typeof data.stats.total === 'number', 'stats.total 不是数字');
    return `tasks=${data.stats.total}, elements=${data.card.elements.length}`;
  });

  // T5: send-task-queue-card.js 使用真实报告数据发送
  await test('T5 - send-task-queue-card.js 端到端发送', async () => {
    const logsBefore = fs.existsSync(LOG_FILE)
      ? fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').length
      : 0;
    
    const output = execSync('node scripts/send-task-queue-card.js', {
      cwd: WORKSPACE,
      encoding: 'utf8'
    });
    
    assert(output.includes('✅ 成功发送'), `发送未成功: ${output}`);
    assert(output.includes('live-task-queue-report.json'), `未使用真实报告: ${output}`);
    
    // 提取 msg_id
    const match = output.match(/msg_id=(\S+)/);
    return match ? `msg_id=${match[1]}` : output.trim().slice(-60);
  });

  // T6: 发送日志写入验证
  await test('T6 - 发送日志正确写入', async () => {
    assert(fs.existsSync(LOG_FILE), `日志文件不存在: ${LOG_FILE}`);
    const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n');
    const lastEntry = JSON.parse(lines[lines.length - 1]);
    assert(lastEntry.type === 'card_send', `type 不对: ${lastEntry.type}`);
    assert(lastEntry.status === 'success', `status 不对: ${lastEntry.status}`);
    assert(lastEntry.msg_id, '缺少 msg_id');
    assert(lastEntry.target === TARGET_OPEN_ID, `target 不对: ${lastEntry.target}`);
    return `${lines.length} 条日志，最新: ${lastEntry.msg_id.slice(0, 20)}...`;
  });

  // T7: 降级路径（dry-run 无 report.json）
  await test('T7 - 降级路径 fallback 卡片构建', async () => {
    // 备份并临时删除 report 文件
    let backup = null;
    if (fs.existsSync(REPORT_FILE)) {
      backup = fs.readFileSync(REPORT_FILE);
      fs.unlinkSync(REPORT_FILE);
    }
    try {
      const output = execSync('node scripts/send-task-queue-card.js --dry-run', {
        cwd: WORKSPACE,
        encoding: 'utf8'
      });
      assert(output.includes('fallback-tasks'), `未进入降级路径: ${output.slice(0, 200)}`);
      assert(output.includes('"header"'), '卡片 JSON 格式不对');
      return '降级路径正常，构建了 fallback 卡片';
    } finally {
      // 恢复 report 文件
      if (backup) fs.writeFileSync(REPORT_FILE, backup);
    }
  });

  // ─── 汇总 ─────────────────────────────────────────────────────────────────

  console.log('\n' + '─'.repeat(60));
  console.log(`\n📊 结果: ${passed} 通过 / ${failed} 失败 / ${passed + failed} 总计\n`);

  if (failed > 0) {
    console.log('❌ 失败项:');
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('✅ 所有测试通过！Interactive Card 送达链验证完毕。\n');
  }
}

main().catch(err => {
  console.error('Test runner fatal:', err.message);
  process.exit(1);
});
