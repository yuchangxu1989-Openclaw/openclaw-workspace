/**
 * 事件触发器
 */
class EventTrigger {
  constructor() {
    this.subscriptions = new Map();
  }

  async start(lto) {
    // 订阅 本地任务编排 事件总线
    lto.eventBus.subscribe('*', async (data) => {
      const eventType = data.event;
      
      // 查找匹配的事件触发任务
      const tasks = lto.taskRegistry.findByTrigger('event', eventType);
      
      for (const task of tasks) {
        const trigger = task.triggers.find(t => 
          t.type === 'event' && t.source === eventType
        );
        
        // 检查条件
        if (trigger.condition) {
          const match = this.evaluateCondition(trigger.condition, data);
          if (!match) continue;
        }
        
        console.log(`[EventTrigger] 触发任务: ${task.id}`);
        
        try {
          await lto.execute(task.id, { 
            trigger: 'event',
            input: data 
          });
        } catch (e) {
          console.error(`[EventTrigger] 执行失败: ${task.id}`, e.message);
        }
      }
    });
    
    console.log('[EventTrigger] 已启动');
  }

  evaluateCondition(condition, data) {
    // 简化实现
    return true;
  }
}

module.exports = new EventTrigger();
