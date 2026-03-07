#!/usr/bin/env node
/**
 * 飞书聊天记录备份系统 v2.0 - 人类可读格式
 * 按3天合并，MD格式，图片单独存放
 */

const fs = require('fs');
const path = require('path');
const { SKILLS_DIR, AGENTS_DIR } = require('../shared/paths');

const BACKUP_CONFIG = {
  version: '2.0.0',
  paths: {
    logs: path.join(SKILLS_DIR, 'feishu-chat-backup/logs'),
    archives: path.join(SKILLS_DIR, 'feishu-chat-backup/archives'),
    images: path.join(SKILLS_DIR, 'feishu-chat-backup/images'),
    sessions: path.join(AGENTS_DIR, 'main/sessions')
  },
  retention: {
    logs: 30, // 保留30天
    archives: 90 // 保留90天
  },
  mergeDays: 3 // 3天合并
};

class FeishuChatBackup {
  constructor() {
    this.ensureDirectories();
  }

  ensureDirectories() {
    Object.values(BACKUP_CONFIG.paths).forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * 获取3天周期的时间戳
   */
  getPeriodKey(timestamp) {
    const date = new Date(timestamp);
    const period = Math.floor(date.getTime() / (BACKUP_CONFIG.mergeDays * 24 * 60 * 60 * 1000));
    return period;
  }

  /**
   * 获取周期显示名称
   */
  getPeriodName(timestamp) {
    const date = new Date(timestamp);
    const endDate = new Date(date.getTime() + BACKUP_CONFIG.mergeDays * 24 * 60 * 60 * 1000);
    return `${date.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}`;
  }

  /**
   * 保存图片
   */
  saveImage(imageData, periodName, messageId) {
    const imageDir = path.join(BACKUP_CONFIG.paths.images, periodName);
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }
    
    const imagePath = path.join(imageDir, `img_${messageId}.jpg`);
    
    // 如果是base64，解码保存
    if (imageData.startsWith('data:image')) {
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(imagePath, Buffer.from(base64Data, 'base64'));
    } else {
      // 如果是URL，记录路径
      return imageData; // 返回原URL
    }
    
    // 返回相对路径
    return `./images/${periodName}/img_${messageId}.jpg`;
  }

  /**
   * 将用户名"长煦"改为"长煦"
   */
  normalizeUsername(name) {
    if (name === '长煦' || name === 'ou_a113e465324cc55f9ab3348c9a1a7b9b') {
      return '长煦';
    }
    return name;
  }

  /**
   * 备份当前会话（按3天合并）
   */
  async backupCurrentSession() {
    console.log('[飞书备份] 备份当前会话...');
    
    const sessionsPath = BACKUP_CONFIG.paths.sessions;
    if (!fs.existsSync(sessionsPath)) {
      console.log('  无会话目录');
      return;
    }
    
    const files = fs.readdirSync(sessionsPath)
      .filter(f => f.endsWith('.jsonl'))
      .sort();
    
    // 按3天周期分组消息
    const periodMessages = {};
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(sessionsPath, file), 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (this.isFeishuMessage(msg)) {
            const period = this.getPeriodKey(msg.timestamp || Date.now());
            if (!periodMessages[period]) {
              periodMessages[period] = [];
            }
            periodMessages[period].push(this.extractMessage(msg));
          }
        } catch {}
      }
    }
    
    // 每个周期生成一个MD文件
    for (const [period, messages] of Object.entries(periodMessages)) {
      if (messages.length === 0) continue;
      
      const periodName = this.getPeriodName(messages[0].timestamp);
      const mdContent = this.generateMarkdown(periodName, messages);
      const mdFile = path.join(BACKUP_CONFIG.paths.logs, `feishu-chat-${periodName}.md`);
      
      fs.writeFileSync(mdFile, mdContent);
      console.log(`  生成MD: ${mdFile} (${messages.length}条消息)`);
    }
    
    return Object.values(periodMessages).flat().length;
  }

  /**
   * 生成Markdown内容
   */
  generateMarkdown(periodName, messages) {
    let md = `# 飞书会话记录\n\n`;
    md += `**时间范围**: ${periodName.replace('_to_', ' 至 ')}\n\n`;
    md += `**记录数**: ${messages.length} 条\n\n`;
    md += `---\n\n`;
    
    for (const msg of messages) {
      const time = new Date(msg.timestamp).toLocaleString('zh-CN');
      const user = this.normalizeUsername(msg.user || '系统');
      
      md += `## ${time}\n\n`;
      md += `**${user}**: ${msg.content || '(无文本内容)'}\n\n`;
      
      if (msg.images && msg.images.length > 0) {
        md += `**图片**: \n`;
        for (const img of msg.images) {
          md += `![图片](${img})\n`;
        }
        md += '\n';
      }
      
      md += '\n---\n\n';
    }
    
    return md;
  }

  /**
   * 转换存量jsonl文件为MD格式
   */
  async migrateLegacyLogs() {
    console.log('[飞书备份] 转换存量日志...');
    
    const jsonlFiles = fs.readdirSync(BACKUP_CONFIG.paths.logs)
      .filter(f => f.endsWith('.jsonl') && f.startsWith('feishu-'));
    
    if (jsonlFiles.length === 0) {
      console.log('  无存量jsonl文件');
      return;
    }
    
    console.log(`  发现 ${jsonlFiles.length} 个存量文件`);
    
    // 读取所有消息
    const periodMessages = {};
    
    for (const file of jsonlFiles) {
      const filePath = path.join(BACKUP_CONFIG.paths.logs, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          const timestamp = msg.timestamp || Date.now();
          const period = this.getPeriodKey(timestamp);
          
          if (!periodMessages[period]) {
            periodMessages[period] = [];
          }
          
          periodMessages[period].push({
            timestamp: timestamp,
            user: msg.role === 'toolResult' ? '系统' : (msg.user || '用户'),
            content: this.extractContent(msg),
            images: msg.images || []
          });
        } catch {}
      }
      
      // 删除旧文件
      fs.unlinkSync(filePath);
    }
    
    // 生成MD文件
    for (const [period, messages] of Object.entries(periodMessages)) {
      if (messages.length === 0) continue;
      
      const periodName = this.getPeriodName(messages[0].timestamp);
      const mdContent = this.generateMarkdown(periodName, messages);
      const mdFile = path.join(BACKUP_CONFIG.paths.logs, `feishu-chat-${periodName}.md`);
      
      fs.writeFileSync(mdFile, mdContent);
      console.log(`  转换: ${mdFile} (${messages.length}条消息)`);
    }
    
    console.log(`  完成: ${jsonlFiles.length} 个文件已转换`);
  }

  extractContent(msg) {
    if (typeof msg.content === 'string') {
      return msg.content;
    }
    if (msg.content && msg.content.text) {
      return msg.content.text;
    }
    if (msg.message && msg.message.content) {
      return JSON.stringify(msg.message.content).substring(0, 200);
    }
    return '(复杂内容)';
  }

  isFeishuMessage(msg) {
    if (msg.type === 'message' && msg.message) {
      const content = JSON.stringify(msg.message);
      return content.includes('feishu') || 
             content.includes('ou_a113e465324cc55f9ab3348c9a1a7b9b');
    }
    return false;
  }

  extractMessage(msg) {
    return {
      timestamp: msg.timestamp || Date.now(),
      user: msg.message?.user || (msg.role === 'toolResult' ? '系统' : '用户'),
      content: this.extractContent(msg),
      images: []
    };
  }

  /**
   * 主运行
   */
  async run() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     飞书聊天记录备份系统 v2.0 - 人类可读格式              ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    // 1. 转换存量日志
    await this.migrateLegacyLogs();
    
    // 2. 备份当前会话
    const count = await this.backupCurrentSession();
    
    // 3. 归档旧日志
    await this.archiveOldLogs();
    
    console.log('\n备份完成');
    return { migrated: true, count };
  }

  async archiveOldLogs() {
    // 归档7天前的MD文件
    const logsPath = BACKUP_CONFIG.paths.logs;
    if (!fs.existsSync(logsPath)) return;
    
    const files = fs.readdirSync(logsPath).filter(f => f.endsWith('.md'));
    const now = Date.now();
    const archiveAge = BACKUP_CONFIG.retention.logs * 24 * 60 * 60 * 1000;
    
    for (const file of files) {
      const filePath = path.join(logsPath, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtime.getTime();
      
      if (age > archiveAge) {
        const archivePath = path.join(BACKUP_CONFIG.paths.archives, file);
        fs.renameSync(filePath, archivePath);
        console.log(`  归档: ${file}`);
      }
    }
  }
}

// 运行
if (require.main === module) {
  const backup = new FeishuChatBackup();
  backup.run();
}

module.exports = FeishuChatBackup;
