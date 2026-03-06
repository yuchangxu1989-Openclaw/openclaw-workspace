/**
 * notify-alert handler - N020/N029告警通知处理器
 * 
 * 触发规则: N020 (通用根因分析), N029 (API Key池管理)
 * 职责: 接收分析结果/告警，格式化后投递到通知渠道
 */
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'logs', 'notify-alert-log.jsonl');

module.exports = {
  name: 'notify-alert',
  
  /**
   * 执行告警通知
   * @param {Object} context - 规则触发上下文
   * @param {string} context.type - 告警类型 (root_cause_analysis|key_pool_alert|general)
   * @param {string} context.severity - 严重等级 (info|warning|critical|urgent)
   * @param {string} context.summary - 摘要
   * @param {Object} context.details - 详细信息
   * @param {string[]} context.channels - 通知渠道
   */
  async execute(context = {}) {
    const {
      type = 'general',
      severity = 'info',
      summary = '',
      details = {},
      channels = ['log'],
      rule_id = 'unknown'
    } = context;
    
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      rule_id,
      type,
      severity,
      summary,
      details,
      delivered_to: []
    };
    
    // 投递到各渠道
    for (const channel of channels) {
      try {
        await this.deliverToChannel(channel, alert);
        alert.delivered_to.push(channel);
      } catch (err) {
        console.error(`[notify-alert] 投递到 ${channel} 失败: ${err.message}`);
      }
    }
    
    // 记录日志
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(alert) + '\n');
    
    console.log(`[notify-alert] ${severity.toUpperCase()}: ${summary} → ${alert.delivered_to.join(',')}`);
    return alert;
  },
  
  async deliverToChannel(channel, alert) {
    switch (channel) {
      case 'log':
        console.log(`[ALERT][${alert.severity}] ${alert.summary}`);
        break;
      case 'feishu':
        // feishu delivery placeholder - integrate with feishu-report-sender skill
        console.log(`[notify-alert] feishu投递排队: ${alert.summary}`);
        break;
      case 'file':
        const alertDir = path.join(__dirname, '..', 'logs', 'alerts');
        fs.mkdirSync(alertDir, { recursive: true });
        fs.writeFileSync(
          path.join(alertDir, `${alert.id}.json`),
          JSON.stringify(alert, null, 2)
        );
        break;
      default:
        console.log(`[notify-alert] 未知渠道 ${channel}, 降级到日志`);
    }
  }
};
