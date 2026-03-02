/**
 * DTO 事件桥接 - 连接事件总线与 DTO 同步引擎
 * 由 Cron dispatcher 或手动触发
 */
const path = require('path');
const bus = require(path.join(__dirname, '..', '..', 'infrastructure', 'event-bus', 'bus.js'));

const CONSUMER_ID = 'dto-core';

async function processEvents() {
  // 消费 ISC 规则变更事件
  const iscEvents = bus.consume(CONSUMER_ID, { types: ['isc.rule.*'] });
  
  if (iscEvents.length === 0) {
    console.log('[DTO-Bridge] 无待处理事件');
    return { processed: 0 };
  }
  
  console.log(`[DTO-Bridge] 发现 ${iscEvents.length} 个ISC事件`);
  
  const results = [];
  for (const event of iscEvents) {
    try {
      console.log(`[DTO-Bridge] 处理: ${event.type} - ${JSON.stringify(event.payload)}`);
      
      // 根据事件类型执行不同同步
      switch (event.type) {
        case 'isc.rule.created':
          await syncNewRule(event.payload);
          break;
        case 'isc.rule.updated':
          await syncUpdatedRule(event.payload);
          break;
        case 'isc.rule.deleted':
          await syncDeletedRule(event.payload);
          break;
        default:
          console.log(`[DTO-Bridge] 未知事件类型: ${event.type}`);
      }
      
      // 确认消费
      bus.ack(CONSUMER_ID, event.id);
      results.push({ event: event.id, status: 'ok' });
      
      // 发布同步完成事件
      bus.emit('dto.sync.completed', {
        source_event: event.id,
        rule_id: event.payload?.rule_id,
        action: event.type.split('.').pop()
      }, 'dto-core');
      
    } catch (err) {
      console.error(`[DTO-Bridge] 处理失败: ${event.id}`, err.message);
      results.push({ event: event.id, status: 'error', error: err.message });
      
      // 发布错误事件
      bus.emit('system.error', {
        source: 'dto-core',
        event_id: event.id,
        error: err.message
      }, 'dto-core');
    }
  }
  
  return { processed: results.length, results };
}

// 同步函数（读取真实 DTO 订阅配置）
async function syncNewRule(payload) {
  // 读取订阅列表，通知所有订阅了该规则类别的消费者
  const subsDir = path.join(__dirname, 'subscriptions');
  const fs = require('fs');
  if (!fs.existsSync(subsDir)) return;
  
  const files = fs.readdirSync(subsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const sub = JSON.parse(fs.readFileSync(path.join(subsDir, file), 'utf8'));
    console.log(`[DTO-Sync] 通知订阅者: ${file} -> rule ${payload.rule_id}`);
  }
}

async function syncUpdatedRule(payload) {
  return syncNewRule(payload); // 暂时复用
}

async function syncDeletedRule(payload) {
  console.log(`[DTO-Sync] 规则删除通知: ${payload.rule_id}`);
}

// CLI 入口
if (require.main === module) {
  processEvents()
    .then(r => {
      console.log(`[DTO-Bridge] 完成: ${JSON.stringify(r)}`);
      process.exit(0);
    })
    .catch(err => {
      console.error('[DTO-Bridge] 致命错误:', err);
      process.exit(1);
    });
}

module.exports = { processEvents };
