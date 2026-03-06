#!/usr/bin/env node
/**
 * LEP日报飞书发送器
 * 生成日报并发送到飞书
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { WORKSPACE, REPORTS_DIR } = require('../../shared/paths');

const WORKSPACE_ROOT = WORKSPACE;

// 飞书配置
const FEISHU_WEBHOOK = process.env.FEISHU_WEBHOOK || 'https://open.feishu.cn/open-apis/bot/v2/hook/xxxxx';

/**
 * 生成日报
 */
function generateReport() {
  try {
    const output = execSync('node src/daily-report.js', {
      cwd: path.join(WORKSPACE_ROOT, 'skills/lep-executor'),
      encoding: 'utf8',
      timeout: 30000
    });
    return output;
  } catch (error) {
    console.error('生成日报失败:', error.message);
    return null;
  }
}

/**
 * 发送到飞书
 */
async function sendToFeishu(content) {
  const https = require('https');
  const url = new URL(FEISHU_WEBHOOK);
  
  const data = JSON.stringify({
    msg_type: 'text',
    content: {
      text: content
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(responseData);
          if (json.code === 0) {
            resolve({ success: true });
          } else {
            reject(new Error(`飞书API错误: ${json.msg}`));
          }
        } catch (e) {
          reject(new Error('解析响应失败'));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始生成并发送LEP日报...');
  
  // 生成日报
  const report = generateReport();
  if (!report) {
    console.error('❌ 日报生成失败');
    process.exit(1);
  }
  
  console.log('✅ 日报生成成功');
  console.log(report);
  
  // 尝试发送到飞书（如果配置了webhook）
  if (FEISHU_WEBHOOK.includes('hook/xxxxx')) {
    console.log('ℹ️  未配置飞书Webhook，仅生成本地报告');
    console.log(`💾 报告已保存到: ${REPORTS_DIR}/`);
  } else {
    try {
      await sendToFeishu(report);
      console.log('✅ 日报已发送到飞书');
    } catch (error) {
      console.error('❌ 发送到飞书失败:', error.message);
    }
  }
}

main().catch(console.error);
