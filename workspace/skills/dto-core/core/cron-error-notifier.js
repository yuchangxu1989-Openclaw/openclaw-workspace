#!/usr/bin/env node
/**
 * Cron 错误拦截与通知器
 * 确保所有cron失败/超时都通过飞书卡片通知用户
 */

const { execSync } = require('child_process');

class CronErrorNotifier {
  constructor() {
    this.retryCount = 3;
    this.retryDelay = 5000;
  }

  /**
   * 发送错误通知（飞书卡片格式）
   */
  async notifyError(errorInfo) {
    const card = this.buildErrorCard(errorInfo);
    
    for (let i = 0; i < this.retryCount; i++) {
      try {
        await this.sendFeishuCard(card);
        console.log('[CronNotifier] 错误通知已发送');
        return true;
      } catch (e) {
        console.error(`[CronNotifier] 发送失败(${i+1}/${this.retryCount}):`, e.message);
        await this.sleep(this.retryDelay);
      }
    }
    
    // 最终失败，写入日志
    console.error('[CronNotifier] 通知发送最终失败:', errorInfo);
    return false;
  }

  /**
   * 构建错误通知卡片
   */
  buildErrorCard(info) {
    return {
      config: { wide_screen_mode: true },
      header: {
        template: "red",
        title: { tag: "plain_text", content: "❌ 定时任务执行异常" },
        subtitle: { tag: "plain_text", content: `任务: ${info.taskName}` }
      },
      elements: [
        {
          tag: "div",
          fields: [
            { is_short: true, text: { tag: "lark_md", content: `**异常类型**\n${info.errorType}` } },
            { is_short: true, text: { tag: "lark_md", content: `**发生时间**\n${info.time}` } },
            { is_short: true, text: { tag: "lark_md", content: `**上次成功**\n${info.lastSuccess || '未知'}` } },
            { is_short: true, text: { tag: "lark_md", content: `**连续失败**\n${info.consecutiveErrors || 1}次` } }
          ]
        },
        {
          tag: "div",
          text: { tag: "lark_md", content: `**错误信息**\n\`\`\`\n${info.errorMessage}\n\`\`\`` }
        },
        {
          tag: "hr"
        },
        {
          tag: "note",
          elements: [
            { tag: "plain_text", content: `建议操作: ${info.suggestedAction || '请检查系统日志并手动重试'}` }
          ]
        }
      ]
    };
  }

  /**
   * 发送飞书卡片
   */
  async sendFeishuCard(card) {
    // 使用 openclaw message 发送
    const cmd = `openclaw message send --channel feishu --target user:ou_8eafdc7241d381d714746e486b641883 --message '${JSON.stringify(card)}'`;
    
    execSync(cmd, { timeout: 30000 });
  }

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

// 如果直接运行（被cron错误处理器调用）
if (require.main === module) {
  const notifier = new CronErrorNotifier();
  
  // 从命令行参数获取错误信息
  const errorInfo = JSON.parse(process.argv[2] || '{}');
  
  notifier.notifyError(errorInfo).then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = CronErrorNotifier;
