/**
 * @fileoverview 触发器模块单元测试
 * @module __tests__/trigger.test
 */

'use strict';

// 模拟测试框架
let passCount = 0;
let failCount = 0;

function describe(name, fn) {
  console.log(`\n📦 ${name}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failCount++;
    console.log(`  ❌ ${name}: ${error.message}`);
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`期望 ${expected}，实际 ${actual}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`不匹配`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`期望为真`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`期望为假`);
      }
    }
  };
}

// 异步运行测试
async function runTests() {
  const { TriggerManager, TriggerType, createTriggerManager } = await import('../trigger.js');

  describe('TriggerType', () => {
    it('应该有正确的触发类型', () => {
      expect(TriggerType.FILE).toBe('file');
      expect(TriggerType.SCHEDULE).toBe('schedule');
      expect(TriggerType.MANUAL).toBe('manual');
      expect(TriggerType.WEBHOOK).toBe('webhook');
      expect(TriggerType.EVENT).toBe('event');
    });
  });

  describe('TriggerManager', () => {
    it('应该正确创建管理器', () => {
      const manager = new TriggerManager({ queueMaxSize: 100, deduplicate: false });
      expect(manager).toBeTruthy();
      expect(manager.queueLength).toBe(0);
    });

    it('应该初始化成功', async () => {
      const manager = new TriggerManager();
      await manager.initialize();
      expect(manager.config).toBeTruthy();
    });

    it('应该手动触发事件', () => {
      const manager = new TriggerManager({ deduplicate: false });
      const event = manager.manualTrigger({ test: true }, 'test_user');
      expect(event).toBeTruthy();
      expect(event.type).toBe(TriggerType.MANUAL);
      expect(event.payload.triggeredBy).toBe('test_user');
    });

    it('应该webhook触发事件', () => {
      const manager = new TriggerManager({ deduplicate: false });
      const event = manager.webhookTrigger({ action: 'test' }, { 'X-Header': 'value' });
      expect(event).toBeTruthy();
      expect(event.type).toBe(TriggerType.WEBHOOK);
    });

    it('应该发送内部事件', () => {
      const manager = new TriggerManager({ deduplicate: false });
      const event = manager.emitEvent('test_event', { data: 'test' });
      expect(event).toBeTruthy();
      expect(event.type).toBe(TriggerType.EVENT);
      expect(event.payload.eventName).toBe('test_event');
    });

    it('应该清空事件队列', () => {
      const manager = new TriggerManager({ deduplicate: false });
      manager.manualTrigger({ test: 1 });
      manager.manualTrigger({ test: 2 });
      expect(manager.queueLength).toBe(2);
      
      const cleared = manager.clearQueue();
      expect(cleared).toBe(2);
      expect(manager.queueLength).toBe(0);
    });

    it('应该获取队列统计', () => {
      const manager = new TriggerManager({ deduplicate: false });
      manager.manualTrigger({ test: true });
      const stats = manager.getQueueStats();
      expect(stats.total).toBe(1);
    });
  });

  describe('createTriggerManager', () => {
    it('应该创建管理器实例', () => {
      const manager = createTriggerManager({ deduplicate: false });
      expect(manager).toBeTruthy();
      expect(manager instanceof TriggerManager).toBeTruthy();
    });
  });
}

// 运行测试
console.log('🧪 运行 Trigger 单元测试...');

runTests().then(() => {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`测试结果: 通过 ${passCount}, 失败 ${failCount}`);
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(failCount > 0 ? 1 : 0);
}).catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
