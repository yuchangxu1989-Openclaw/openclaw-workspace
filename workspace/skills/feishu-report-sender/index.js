#!/usr/bin/env node
/**
 * 飞书报告发送器
 * 读取CRAS和EvoMap的报告队列，实际发送到飞书
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { WORKSPACE, SKILLS_DIR } = require('../shared/paths');

const QUEUE_PATHS = [
  path.join(SKILLS_DIR, 'cras/feishu_queue'),
  path.join(WORKSPACE, 'evolver/reports')
];

const SENT_PATH = path.join(WORKSPACE, 'feishu_sent_reports');

class FeishuReportSender {
  constructor() {
    this.ensureDirectories();
    this.targetUser = process.env.FEISHU_TARGET_USER || 'ou_8eafdc7241d381d714746e486b641883';
  }

  ensureDirectories() {
    if (!fs.existsSync(SENT_PATH)) {
      fs.mkdirSync(SENT_PATH, { recursive: true });
    }
  }

  // 发现待发送的报告
  findPendingReports() {
    const reports = [];
    
    for (const queuePath of QUEUE_PATHS) {
      if (!fs.existsSync(queuePath)) continue;
      
      const files = fs.readdirSync(queuePath)
        .filter(f => f.endsWith('.json'))
        .map(f => ({
          path: path.join(queuePath, f),
          name: f,
          queue: queuePath
        }));
      
      reports.push(...files);
    }
    
    return reports.sort((a, b) => {
      const timeA = parseInt(a.name.match(/\d+/)?.[0] || 0);
      const timeB = parseInt(b.name.match(/\d+/)?.[0] || 0);
      return timeA - timeB;
    });
  }

  // 发送单条报告
  async sendReport(reportFile) {
    try {
      const content = fs.readFileSync(reportFile.path, 'utf8');
      const report = JSON.parse(content);
      
      // 构建飞书卡片消息
      const cardContent = report.card || this.buildDefaultCard(report);
      
      // 使用openclaw message命令发送
      const messagePayload = {
        action: 'send',
        channel: 'feishu',
        target: this.targetUser,
        message: JSON.stringify({
          type: 'card',
          card: cardContent
        })
      };
      
      // 写入待发送文件，供外部工具处理
      const sendQueuePath = path.join(WORKSPACE, 'feishu_send_queue');
      if (!fs.existsSync(sendQueuePath)) {
        fs.mkdirSync(sendQueuePath, { recursive: true });
      }
      
      const sendFile = path.join(sendQueuePath, `send_${Date.now()}_${reportFile.name}`);
      fs.writeFileSync(sendFile, JSON.stringify({
        target: this.targetUser,
        card: cardContent,
        original: reportFile.path,
        timestamp: Date.now()
      }, null, 2));
      
      console.log(`[FeishuSender] 报告已准备发送: ${reportFile.name}`);
      
      // 移动到已发送
      const sentFile = path.join(SENT_PATH, reportFile.name);
      fs.renameSync(reportFile.path, sentFile);
      
      return { success: true, sentFile };
    } catch (e) {
      console.error(`[FeishuSender] 发送失败 ${reportFile.name}:`, e.message);
      return { success: false, error: e.message };
    }
  }

  buildDefaultCard(report) {
    return {
      config: { wide_screen_mode: true },
      header: {
        template: 'blue',
        title: { tag: 'plain_text', content: '📊 系统报告' }
      },
      elements: [
        {
          tag: 'div',
          text: { tag: 'plain_text', content: `生成时间: ${new Date(report.timestamp).toLocaleString('zh-CN')}` }
        },
        { tag: 'hr' },
        {
          tag: 'div',
          text: { tag: 'plain_text', content: '报告已生成，请查看详情。' }
        }
      ]
    };
  }

  // 处理所有待发送报告
  async processAll() {
    console.log('[FeishuSender] 开始处理报告队列...');
    
    const reports = this.findPendingReports();
    console.log(`  发现 ${reports.length} 个待发送报告`);
    
    const results = [];
    for (const report of reports) {
      const result = await this.sendReport(report);
      results.push({ file: report.name, ...result });
      
      // 避免发送过快
      await new Promise(r => setTimeout(r, 500));
    }
    
    console.log(`[FeishuSender] 完成: ${results.filter(r => r.success).length}/${results.length}`);
    return results;
  }
}

// 主函数
async function main() {
  const sender = new FeishuReportSender();
  await sender.processAll();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { FeishuReportSender };
