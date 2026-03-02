#!/usr/bin/env node
/**
 * DTO自动握手响应器 v1.0
 * 监听ISC通知，自动订阅新规则，自动反馈对齐状态
 */

const fs = require('fs');
const path = require('path');

const HANDSHAKE_CONFIG = {
  eventPath: '/root/.openclaw/workspace/skills/dto-core/events/isc-rule-created.jsonl',
  subscriptionsPath: '/root/.openclaw/workspace/skills/dto-core/subscriptions',
  feedbackPath: '/root/.openclaw/workspace/skills/dto-core/events/dto-handshake-feedback.jsonl',
  checkInterval: 10 * 1000 // 10秒检查一次
};

class DTOAutoHandshakeResponder {
  constructor() {
    this.processedEvents = new Set();
    this.lastPosition = 0;
  }

  /**
   * 读取新事件
   */
  readNewEvents() {
    if (!fs.existsSync(HANDSHAKE_CONFIG.eventPath)) {
      return [];
    }
    
    const content = fs.readFileSync(HANDSHAKE_CONFIG.eventPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    
    const newEvents = [];
    for (let i = this.lastPosition; i < lines.length; i++) {
      try {
        const event = JSON.parse(lines[i]);
        const eventId = `${event.timestamp}-${event.data?.ruleId}`;
        
        if (!this.processedEvents.has(eventId)) {
          this.processedEvents.add(eventId);
          newEvents.push(event);
        }
      } catch {}
    }
    
    this.lastPosition = lines.length;
    return newEvents;
  }

  /**
   * 自动订阅规则
   */
  async autoSubscribe(event) {
    const data = event.data;
    if (!data || !data.ruleId) return null;
    
    console.log(`[DTO握手] 自动订阅: ${data.ruleId}`);
    
    // 检查是否已订阅
    const existingSub = this.findExistingSubscription(data.ruleId);
    if (existingSub) {
      console.log(`  ℹ️ 已订阅，跳过`);
      return { status: 'already_subscribed', ruleId: data.ruleId };
    }
    
    // 创建订阅
    const subscription = {
      subscription_id: `sub_isc_${data.ruleId.replace(/\./g, '_')}`,
      subscriber: 'DTO-Declarative-Orchestrator',
      rule_id: data.ruleId,
      rule_name: data.ruleName,
      file_path: data.filePath,
      relative_path: data.relativePath,
      domain: data.domain,
      auto_execute: data.autoExecute !== false && !data.councilRequired,
      subscribed_at: new Date().toISOString(),
      source: 'auto_handshake',
      triggered_by: event.source
    };
    
    // 保存订阅
    const subFile = path.join(
      HANDSHAKE_CONFIG.subscriptionsPath,
      `isc-${data.ruleId.replace(/\./g, '-')}.json`
    );
    
    fs.writeFileSync(subFile, JSON.stringify(subscription, null, 2));
    
    console.log(`  ✅ 已订阅: ${data.ruleId}`);
    console.log(`  ⚡ 自动执行: ${subscription.auto_execute}`);
    
    return { status: 'subscribed', ruleId: data.ruleId, subscription };
  }

  findExistingSubscription(ruleId) {
    if (!fs.existsSync(HANDSHAKE_CONFIG.subscriptionsPath)) return null;
    
    const files = fs.readdirSync(HANDSHAKE_CONFIG.subscriptionsPath)
      .filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const sub = JSON.parse(fs.readFileSync(
          path.join(HANDSHAKE_CONFIG.subscriptionsPath, file), 'utf8'
        ));
        if (sub.rule_id === ruleId) return sub;
      } catch {}
    }
    
    return null;
  }

  /**
   * 反馈对齐状态给ISC
   */
  async feedbackToISC(results) {
    const feedback = {
      source: 'dto-auto-handshake',
      timestamp: new Date().toISOString(),
      event: 'handshake_completed',
      data: {
        processed: results.length,
        subscribed: results.filter(r => r.status === 'subscribed').length,
        already_subscribed: results.filter(r => r.status === 'already_subscribed').length,
        details: results
      }
    };
    
    // 确保目录存在
    const dir = path.dirname(HANDSHAKE_CONFIG.feedbackPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.appendFileSync(HANDSHAKE_CONFIG.feedbackPath, JSON.stringify(feedback) + '\n');
    
    console.log(`[DTO→ISC] 握手反馈: ${feedback.data.subscribed} 个新订阅`);
  }

  /**
   * 单次处理
   */
  async process() {
    const events = this.readNewEvents();
    
    if (events.length === 0) return [];
    
    console.log(`[DTO握手] 收到 ${events.length} 个ISC通知`);
    
    const results = [];
    for (const event of events) {
      const result = await this.autoSubscribe(event);
      if (result) results.push(result);
    }
    
    // 反馈给ISC
    await this.feedbackToISC(results);
    
    return results;
  }

  /**
   * 持续监听
   */
  async watch() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     DTO自动握手响应器 - 自动订阅ISC规则并反馈              ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`监听: ${HANDSHAKE_CONFIG.eventPath}`);
    console.log(`反馈: ${HANDSHAKE_CONFIG.feedbackPath}`);
    console.log(`间隔: ${HANDSHAKE_CONFIG.checkInterval / 1000}秒`);
    console.log('');
    
    console.log('[DTO握手] 等待ISC通知...');
    
    setInterval(async () => {
      const results = await this.process();
      if (results.length > 0) {
        console.log(`[${new Date().toLocaleTimeString()}] 处理完成: ${results.length} 个`);
      }
    }, HANDSHAKE_CONFIG.checkInterval);
  }

  /**
   * 主运行（单次模式）
   */
  async run() {
    const results = await this.process();
    console.log('[DTO握手] 处理完成:');
    console.log(`  新订阅: ${results.filter(r => r.status === 'subscribed').length}`);
    console.log(`  已订阅: ${results.filter(r => r.status === 'already_subscribed').length}`);
    return results;
  }
}

// 运行
if (require.main === module) {
  const responder = new DTOAutoHandshakeResponder();
  
  if (process.argv.includes('--watch')) {
    responder.watch();
  } else {
    responder.run();
  }
}

module.exports = DTOAutoHandshakeResponder;
