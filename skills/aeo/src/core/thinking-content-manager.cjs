/**
 * Thinking Content Separator - 推理内容分离存储器
 * @version 1.0.0
 * @description 将推理内容与会话历史分离存储，减少主会话文件大小
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// 配置
const CONFIG = {
  // 主会话目录
  mainSessionDir: '/root/.openclaw/agents/main/sessions',
  // 推理内容存储目录
  thinkingDir: '/root/.openclaw/agents/main/thinking',
  // 归档存储目录
  archiveDir: '/data/archive/thinking',
  // 保留最近N条推理内容
  retainCount: 10,
  // 压缩阈值（字节）
  compressThreshold: 1024 * 1024, // 1MB
  // 最大单文件大小
  maxFileSize: 5 * 1024 * 1024, // 5MB
};

/**
 * 推理内容管理器
 */
class ThinkingContentManager {
  constructor() {
    this.ensureDirs();
  }

  ensureDirs() {
    [CONFIG.thinkingDir, CONFIG.archiveDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * 从消息中提取推理内容
   */
  extractThinking(message) {
    const thinking = [];
    const mainContent = [];

    // 递归遍历消息内容
    const traverse = (obj) => {
      if (typeof obj !== 'object' || obj === null) return;

      // 检查是否有reasoning/thinking字段
      if (obj.reasoning || obj.thinking) {
        thinking.push({
          type: 'reasoning',
          content: obj.reasoning || obj.thinking,
          timestamp: obj.timestamp || Date.now()
        });
      }

      // 检查content中是否包含推理标记
      if (obj.content && typeof obj.content === 'string') {
        const content = obj.content;
        // 提取 [思考] [推理] 等标记的内容
        const patterns = [
          /【思考】([\s\S]*?)(?=【|$)/g,
          /【推理】([\s\S]*?)(?=【|$)/g,
          /\[thinking\]([\s\S]*?)(?=\[|$)/gi,
          /\[reasoning\]([\s\S]*?)(?=\[|$)/gi,
        ];

        let hasThinking = false;
        patterns.forEach(pattern => {
          const matches = content.matchAll(pattern);
          for (const match of matches) {
            thinking.push({
              type: 'thinking_block',
              content: match[1].trim(),
              timestamp: obj.timestamp || Date.now()
            });
            hasThinking = true;
          }
        });

        // 保留非推理内容
        if (!hasThinking || content.length < thinking.length * 10) {
          mainContent.push(obj);
        } else {
          // 有推理内容，提取后保留摘要
          mainContent.push({
            ...obj,
            content: `[含推理内容，已分离存储 - ${thinking.length}条]`,
            thinkingRef: true
          });
        }
      } else {
        mainContent.push(obj);
      }

      // 递归处理子对象
      Object.values(obj).forEach(traverse);
    };

    traverse(message);
    return { thinking, mainContent };
  }

  /**
   * 存储推理内容
   */
  async storeThinking(sessionId, thinkingContent) {
    if (!thinkingContent || thinkingContent.length === 0) return;

    const filePath = path.join(CONFIG.thinkingDir, `${sessionId}.thinking.jsonl`);
    
    // 追加写入
    const lines = thinkingContent.map(t => JSON.stringify(t)).join('\n') + '\n';
    fs.appendFileSync(filePath, lines);

    // 检查文件大小，超限则归档
    await this.checkAndArchive(sessionId);
  }

  /**
   * 检查并归档
   */
  async checkAndArchive(sessionId) {
    const filePath = path.join(CONFIG.thinkingDir, `${sessionId}.thinking.jsonl`);
    
    if (!fs.existsSync(filePath)) return;

    const stats = fs.statSync(filePath);
    
    // 超过阈值则压缩归档
    if (stats.size > CONFIG.maxFileSize) {
      await this.archiveThinking(sessionId);
    }
  }

  /**
   * 归档推理内容
   */
  async archiveThinking(sessionId) {
    const sourcePath = path.join(CONFIG.thinkingDir, `${sessionId}.thinking.jsonl`);
    const archiveDir = path.join(CONFIG.archiveDir, new Date().toISOString().slice(0, 7));
    
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    const archivePath = path.join(archiveDir, `${sessionId}.thinking.jsonl.gz`);

    // 读取并压缩
    const content = fs.readFileSync(sourcePath);
    const compressed = await gzip(content);
    fs.writeFileSync(archivePath, compressed);

    // 清空原文件，只保留最近N条
    const lines = fs.readFileSync(sourcePath, 'utf8').trim().split('\n');
    const recent = lines.slice(-CONFIG.retainCount);
    fs.writeFileSync(sourcePath, recent.join('\n') + '\n');

    console.log(`[ThinkingManager] 归档完成: ${sessionId}, 原始大小: ${content.length}, 压缩后: ${compressed.length}`);
  }

  /**
   * 清理旧推理内容
   */
  cleanup() {
    const files = fs.readdirSync(CONFIG.thinkingDir)
      .filter(f => f.endsWith('.thinking.jsonl'));

    for (const file of files) {
      const filePath = path.join(CONFIG.thinkingDir, file);
      const stats = fs.statSync(filePath);
      
      // 超过7天未修改的归档
      if (Date.now() - stats.mtime.getTime() > 7 * 24 * 60 * 60 * 1000) {
        const sessionId = file.replace('.thinking.jsonl', '');
        this.archiveThinking(sessionId).catch(console.error);
      }
    }
  }

  /**
   * 获取推理内容（按需加载）
   */
  async getThinking(sessionId, options = {}) {
    const { limit = 10, offset = 0 } = options;
    
    const filePath = path.join(CONFIG.thinkingDir, `${sessionId}.thinking.jsonl`);
    
    if (!fs.existsSync(filePath)) {
      // 检查归档
      const archivePattern = path.join(CONFIG.archiveDir, '*', `${sessionId}.thinking.jsonl.gz`);
      // TODO: 实现归档检索
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    
    return lines
      .slice(-limit - offset, -offset || undefined)
      .map(line => JSON.parse(line));
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const stats = {
      activeFiles: 0,
      totalSize: 0,
      archivedFiles: 0,
      archivedSize: 0
    };

    // 活跃文件
    if (fs.existsSync(CONFIG.thinkingDir)) {
      fs.readdirSync(CONFIG.thinkingDir)
        .filter(f => f.endsWith('.thinking.jsonl'))
        .forEach(f => {
          const stat = fs.statSync(path.join(CONFIG.thinkingDir, f));
          stats.activeFiles++;
          stats.totalSize += stat.size;
        });
    }

    // 归档文件
    if (fs.existsSync(CONFIG.archiveDir)) {
      const walk = (dir) => {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.name.endsWith('.gz')) {
            stats.archivedFiles++;
            stats.archivedSize += fs.statSync(fullPath).size;
          }
        });
      };
      walk(CONFIG.archiveDir);
    }

    return stats;
  }
}

/**
 * 会话拦截器 - 在写入会话文件前分离推理内容
 */
class SessionInterceptor {
  constructor() {
    this.thinkingManager = new ThinkingContentManager();
  }

  /**
   * 处理消息 - 分离推理内容后返回清理后的消息
   */
  processMessage(sessionId, message) {
    const { thinking, mainContent } = this.thinkingManager.extractThinking(message);
    
    if (thinking.length > 0) {
      // 异步存储推理内容
      this.thinkingManager.storeThinking(sessionId, thinking).catch(console.error);
      
      // 返回清理后的消息（含引用标记）
      return {
        ...message,
        _thinking: {
          separated: true,
          count: thinking.length,
          stored: true
        }
      };
    }
    
    return message;
  }
}

// 导出
module.exports = {
  ThinkingContentManager,
  SessionInterceptor
};

// CLI测试
if (require.main === module) {
  const manager = new ThinkingContentManager();
  
  console.log('推理内容管理器统计:');
  console.log(manager.getStats());
  
  // 测试提取
  const testMessage = {
    role: 'assistant',
    content: '【思考】我需要分析这个问题\n【推理】第一步是...\n最终结论',
    timestamp: Date.now()
  };
  
  const { thinking, mainContent } = manager.extractThinking(testMessage);
  console.log('\n提取的推理内容:', thinking.length, '条');
  console.log('清理后的内容:', mainContent[0]?.content);
}
