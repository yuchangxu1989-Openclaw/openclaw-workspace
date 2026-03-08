#!/usr/bin/env node
/**
 * 本地任务编排 ISC规则创建监听器
 * 监听ISC规则创建事件，自动订阅新规则
 */

const fs = require('fs');
const path = require('path');
const { SKILLS_DIR } = require('../../shared/paths');

const LISTENER_CONFIG = {
  eventPath: path.join(SKILLS_DIR, 'lto-core/events/isc-rule-created.jsonl'),
  subscriptionsPath: path.join(SKILLS_DIR, 'lto-core/subscriptions')
};

class ISCRuleCreatedListener {
  constructor() {
    this.processedEvents = new Set();
  }

  /**
   * 监听并处理ISC规则创建事件
   */
  async listen() {
    console.log('[本地任务编排-ISC监听] 检查ISC规则创建事件...');
    
    if (!fs.existsSync(LISTENER_CONFIG.eventPath)) {
      console.log('  无新事件');
      return [];
    }
    
    const lines = fs.readFileSync(LISTENER_CONFIG.eventPath, 'utf8')
      .trim().split('\n').filter(Boolean);
    
    const newSubscriptions = [];
    
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        
        // 检查是否已处理
        const eventId = `${event.timestamp}-${event.data?.ruleId}`;
        if (this.processedEvents.has(eventId)) continue;
        this.processedEvents.add(eventId);
        
        // 处理规则创建事件
        if (event.event === 'rule_created' && event.data) {
          const subscription = await this.createSubscription(event.data);
          if (subscription) {
            newSubscriptions.push(subscription);
          }
        }
      } catch (e) {
        console.error('  解析事件失败:', e.message);
      }
    }
    
    console.log(`  处理完成: ${newSubscriptions.length} 个新订阅`);
    return newSubscriptions;
  }

  /**
   * 创建订阅
   */
  async createSubscription(ruleData) {
    console.log(`  [订阅] ${ruleData.ruleId}`);
    
    const subscription = {
      subscription_id: `sub_isc_${ruleData.ruleId.replace(/\./g, '_')}`,
      subscriber: '本地任务编排-Declarative-Orchestrator',
      rule_id: ruleData.ruleId,
      rule_name: ruleData.ruleName,
      file_path: ruleData.filePath,
      relative_path: ruleData.relativePath,
      domain: ruleData.domain,
      auto_execute: ruleData.autoExecute !== false && !ruleData.councilRequired,
      created_at: new Date().toISOString(),
      source: 'isc_notification'
    };
    
    // 保存订阅
    const subFile = path.join(LISTENER_CONFIG.subscriptionsPath, `isc-${ruleData.ruleId.replace(/\./g, '-')}.json`);
    fs.writeFileSync(subFile, JSON.stringify(subscription, null, 2));
    
    console.log(`    ✅ 已订阅: ${ruleData.ruleId}`);
    console.log(`    📍 位置: ${ruleData.relativePath}`);
    console.log(`    ⚡ 自动执行: ${subscription.auto_execute}`);
    
    return subscription;
  }

  /**
   * 主运行
   */
  async run() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     本地任务编排-ISC规则创建监听器 - ISC创建→DTO自动订阅           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    const subscriptions = await this.listen();
    
    if (subscriptions.length > 0) {
      console.log('\n新订阅汇总:');
      subscriptions.forEach(s => {
        console.log(`  - ${s.rule_id} (${s.domain})`);
      });
    }
    
    return subscriptions;
  }
}

// 运行
if (require.main === module) {
  const listener = new ISCRuleCreatedListener();
  listener.run();
}

module.exports = ISCRuleCreatedListener;
