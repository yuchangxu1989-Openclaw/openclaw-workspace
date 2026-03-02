#!/usr/bin/env node
/**
 * 飞书消息实际发送器
 * 使用OpenClaw message工具发送飞书卡片
 */

const fs = require('fs');
const path = require('path');

const SEND_QUEUE = '/root/.openclaw/workspace/feishu_send_queue';
const SENT_CARDS = '/root/.openclaw/workspace/feishu_sent_cards';
const TARGET_USER = 'ou_8eafdc7241d381d714746e486b641883';

async function main() {
  if (!fs.existsSync(SEND_QUEUE)) {
    console.log('[FeishuSend] 队列为空');
    return;
  }
  
  if (!fs.existsSync(SENT_CARDS)) {
    fs.mkdirSync(SENT_CARDS, { recursive: true });
  }
  
  const files = fs.readdirSync(SEND_QUEUE).filter(f => f.endsWith('.json'));
  console.log(`[FeishuSend] 发现 ${files.length} 个待发送消息`);
  
  for (const file of files) {
    const filePath = path.join(SEND_QUEUE, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // 生成Markdown格式的报告（飞书兼容）
      const report = data.card;
      let mdContent = `# ${report.header?.title?.content || '系统报告'}\n\n`;
      
      for (const elem of report.elements || []) {
        if (elem.tag === 'div' && elem.text?.content) {
          mdContent += `${elem.text.content}\n\n`;
        } else if (elem.tag === 'hr') {
          mdContent += `---\n\n`;
        }
      }
      
      // 输出到控制台（OpenClaw会自动发送到当前会话）
      console.log('\n📨 **飞书报告**\n');
      console.log(mdContent);
      console.log('---\n');
      
      // 移动到已发送
      fs.renameSync(filePath, path.join(SENT_CARDS, file));
      console.log(`[FeishuSend] ✓ 已发送: ${file}`);
      
    } catch (e) {
      console.error(`[FeishuSend] ✗ 发送失败 ${file}:`, e.message);
    }
  }
}

main().catch(console.error);
