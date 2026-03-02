/**
 * Notification Sender - 通知发送器
 * @version 1.0.0
 * @description 向用户发送飞书通知，包括内存告警等
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class NotificationSender {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      channel: config.channel || 'feishu',
      minLevel: config.minLevel || 'warning',  // debug | info | warning | error
      cooldownMs: config.cooldownMs || 60000,  // 同一类型通知1分钟冷却
      ...config
    };
    
    this.lastNotificationTime = new Map();  // 记录最后通知时间
    this.notificationCount = 0;
  }

  /**
   * 发送内存告警通知
   */
  async sendMemoryAlert(level, data) {
    if (!this.config.enabled) return;
    
    const levelPriority = { debug: 0, info: 1, warning: 2, error: 3, critical: 4 };
    if (levelPriority[level] < levelPriority[this.config.minLevel]) {
      return;
    }
    
    // 检查冷却时间
    const now = Date.now();
    const lastTime = this.lastNotificationTime.get(`memory-${level}`) || 0;
    if (now - lastTime < this.config.cooldownMs) {
      return;
    }
    this.lastNotificationTime.set(`memory-${level}`, now);
    
    const messages = {
      critical: {
        title: '🚨 内存告急！',
        content: `系统内存使用率已达到 **${data.percentage}%**，已自动释放所有沙盒容器。\n\n` +
                 `建议立即检查：\n` +
                 `- 是否有内存泄漏进程\n` +
                 `- 是否可以重启非关键服务\n` +
                 `- 是否需要扩容服务器`
      },
      warning: {
        title: '⚠️ 内存压力',
        content: `系统内存使用率 **${data.percentage}%**，已缩减沙盒容器数量。\n\n` +
                 `当前容器数：${data.containers} → ${data.targetContainers}`
      },
      info: {
        title: 'ℹ️ 内存状态恢复',
        content: `系统内存已恢复正常（${data.percentage}%），沙盒容器已恢复。`
      }
    };
    
    const message = messages[level] || messages.info;
    
    await this._sendToFeishu(message);
    
    this.notificationCount++;
  }

  /**
   * 发送沙盒状态通知
   */
  async sendSandboxStatus(status) {
    if (!this.config.enabled) return;
    
    const message = {
      title: '📊 沙盒池状态',
      content: `容器状态：空闲 ${status.containers.idle} | 忙碌 ${status.containers.busy} | 不健康 ${status.containers.unhealthy}\n` +
               `等待队列：${status.waitQueue} 个任务\n` +
               `内存使用：${status.memory?.current?.system?.percentage || 'N/A'}%`
    };
    
    await this._sendToFeishu(message);
  }

  /**
   * 发送整改完成通知
   */
  async sendRemediationCompleted(remediation) {
    if (!this.config.enabled) return;
    
    const message = {
      title: remediation.status === 'completed' ? '✅ 自动整改完成' : '❌ 自动整改失败',
      content: `技能：**${remediation.issue.skillName}**\n` +
               `问题类型：${remediation.issue.type}\n` +
               `状态：${remediation.status}\n` +
               (remediation.status === 'completed' 
                 ? `耗时：${remediation.duration}ms`
                 : `失败原因：${remediation.failureReason || remediation.error}`)
    };
    
    await this._sendToFeishu(message);
  }

  /**
   * 发送通知到飞书
   */
  async _sendToFeishu(message) {
    try {
      // 方法1: 使用OpenClaw的message工具（如果在OpenClaw环境中）
      if (global.openclaw || process.env.OPENCLAW_SESSION) {
        await this._sendViaOpenClaw(message);
        return;
      }
      
      // 方法2: 使用Webhook（如果有配置）
      if (this.config.webhookUrl) {
        await this._sendViaWebhook(message);
        return;
      }
      
      // 方法3: 降级到控制台输出
      console.log('[Notification]');
      console.log(`Title: ${message.title}`);
      console.log(`Content: ${message.content}`);
      
    } catch (error) {
      console.error('[Notification] Failed to send:', error.message);
    }
  }

  /**
   * 通过OpenClaw发送
   */
  async _sendViaOpenClaw(message) {
    // 这里会调用OpenClaw的message工具
    // 实际实现取决于OpenClaw的API
    console.log(`[Notification→OpenClaw] ${message.title}`);
  }

  /**
   * 通过Webhook发送
   */
  async _sendViaWebhook(message) {
    const https = require('https');
    const url = new URL(this.config.webhookUrl);
    
    const payload = JSON.stringify({
      msg_type: 'post',
      content: {
        post: {
          zh_cn: {
            title: message.title,
            content: [[{ tag: 'text', text: message.content }]]
          }
        }
      }
    });
    
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * 获取通知统计
   */
  getStats() {
    return {
      totalSent: this.notificationCount,
      lastNotifications: Object.fromEntries(this.lastNotificationTime)
    };
  }
}

// ============================================================================
// 导出
// ============================================================================

module.exports = { NotificationSender };

// 测试
if (require.main === module) {
  const sender = new NotificationSender();
  
  sender.sendMemoryAlert('warning', {
    percentage: 78,
    containers: 5,
    targetContainers: 2
  });
}
