/**
 * @fileoverview DTO事件触发测试 - 本地任务编排 Events Integration Test
 * @description 测试DTO事件触发机制
 * @module DTOEventsTests
 * @version 1.0.0
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * DTO事件总线模拟
 */
class DTOEventBus extends EventEmitter {
  constructor() {
    super();
    this.subscribers = new Map();
    this.eventHistory = [];
    this.middlewares = [];
  }

  /**
   * 发布事件
   */
  async publish(eventType, payload, metadata = {}) {
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: eventType,
      payload,
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'evolution-pipeline',
        ...metadata
      }
    };

    // 执行中间件
    for (const middleware of this.middlewares) {
      await middleware(event);
    }

    this.eventHistory.push(event);
    this.emit(eventType, event);
    this.emit('*', event);

    return event;
  }

  /**
   * 订阅事件
   */
  subscribe(eventType, handler, options = {}) {
    const subscriberId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const wrapper = async (event) => {
      if (options.filter && !options.filter(event)) return;
      
      try {
        await handler(event);
        if (options.once) {
          this.off(eventType, wrapper);
        }
      } catch (error) {
        if (options.onError) {
          options.onError(error, event);
        }
      }
    };

    this.subscribers.set(subscriberId, { eventType, handler: wrapper });
    this.on(eventType, wrapper);

    return subscriberId;
  }

  /**
   * 取消订阅
   */
  unsubscribe(subscriberId) {
    const sub = this.subscribers.get(subscriberId);
    if (sub) {
      this.off(sub.eventType, sub.handler);
      this.subscribers.delete(subscriberId);
      return true;
    }
    return false;
  }

  /**
   * 使用中间件
   */
  use(middleware) {
    this.middlewares.push(middleware);
  }

  /**
   * 获取事件历史
   */
  getHistory(filter = null) {
    if (filter) {
      return this.eventHistory.filter(filter);
    }
    return [...this.eventHistory];
  }

  /**
   * 清空历史
   */
  clearHistory() {
    this.eventHistory = [];
  }
}

/**
 * 文件变更检测器
 */
class FileChangeDetector extends EventEmitter {
  constructor(watchPath, options = {}) {
    super();
    this.watchPath = watchPath;
    this.options = {
      debounceMs: options.debounceMs || 300,
      recursive: options.recursive !== false,
      ...options
    };
    this.isWatching = false;
    this.changeBuffer = new Map();
    this.debounceTimers = new Map();
  }

  start() {
    this.isWatching = true;
    this.emit('started', { path: this.watchPath });
  }

  stop() {
    this.isWatching = false;
    // 清除所有debounce定时器
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.emit('stopped');
  }

  /**
   * 模拟文件变更
   */
  simulateChange(filePath, changeType = 'modified') {
    if (!this.isWatching) return;

    const changeKey = `${filePath}:${changeType}`;
    
    // 更新缓冲区
    this.changeBuffer.set(changeKey, {
      filePath,
      changeType,
      timestamp: Date.now()
    });

    // 清除之前的定时器
    if (this.debounceTimers.has(changeKey)) {
      clearTimeout(this.debounceTimers.get(changeKey));
    }

    // 设置新的debounce定时器
    const timer = setTimeout(() => {
      const change = this.changeBuffer.get(changeKey);
      this.changeBuffer.delete(changeKey);
      this.debounceTimers.delete(changeKey);

      this.emit('change', {
        type: changeType,
        path: filePath,
        timestamp: new Date().toISOString()
      });
    }, this.options.debounceMs);

    this.debounceTimers.set(changeKey, timer);
  }
}

/**
 * 流水线事件触发器
 */
class PipelineEventTrigger {
  constructor(eventBus, config = {}) {
    this.eventBus = eventBus;
    this.config = {
      enabledEvents: config.enabledEvents || ['skill.changed', 'skill.validated', 'skill.published'],
      ...config
    };
    this.triggers = new Map();
  }

  /**
   * 注册触发器
   */
  registerTrigger(eventType, condition, action) {
    const triggerId = `trig_${Date.now()}`;
    
    const handler = async (event) => {
      if (condition && !await condition(event)) return;
      await action(event);
    };

    this.eventBus.subscribe(eventType, handler);
    this.triggers.set(triggerId, { eventType, handler });

    return triggerId;
  }

  /**
   * 触发技能变更事件
   */
  async triggerSkillChanged(skillId, skillPath, changeDetails) {
    return this.eventBus.publish('skill.changed', {
      skillId,
      skillPath,
      changeType: changeDetails.type,
      files: changeDetails.files,
      diff: changeDetails.diff
    });
  }

  /**
   * 触发验证完成事件
   */
  async triggerValidationCompleted(skillId, result) {
    return this.eventBus.publish('skill.validated', {
      skillId,
      score: result.score,
      passed: result.passed,
      grade: result.grade,
      recommendations: result.recommendations
    });
  }

  /**
   * 触发发布完成事件
   */
  async triggerPublishCompleted(skillId, version, geneId) {
    return this.eventBus.publish('skill.published', {
      skillId,
      version,
      geneId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 触发失败事件
   */
  async triggerFailed(skillId, error, stage) {
    return this.eventBus.publish('skill.failed', {
      skillId,
      error: {
        message: error.message,
        stack: error.stack,
        stage
      },
      timestamp: new Date().toISOString()
    });
  }
}

describe('DTO事件触发集成测试', () => {
  let eventBus;
  let fileDetector;
  let pipelineTrigger;
  let tempDir;

  beforeEach(() => {
    eventBus = new DTOEventBus();
    
    tempDir = path.join(__dirname, '../fixtures/temp-dto-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    fileDetector = new FileChangeDetector(tempDir);
    pipelineTrigger = new PipelineEventTrigger(eventBus);
  });

  afterEach(() => {
    fileDetector.stop();
    
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('事件总线功能', () => {
    test('应该能发布和接收事件', async () => {
      const receivedEvents = [];
      
      eventBus.subscribe('test.event', (event) => {
        receivedEvents.push(event);
      });

      await eventBus.publish('test.event', { data: 'test' });

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].payload.data).toBe('test');
    });

    test('应该支持通配符订阅', async () => {
      const allEvents = [];
      
      eventBus.subscribe('*', (event) => {
        allEvents.push(event.type);
      });

      await eventBus.publish('event.a', {});
      await eventBus.publish('event.b', {});
      await eventBus.publish('event.c', {});

      expect(allEvents).toHaveLength(3);
      expect(allEvents).toContain('event.a');
      expect(allEvents).toContain('event.b');
    });

    test('应该支持一次性订阅', async () => {
      let callCount = 0;
      
      eventBus.subscribe('once.event', () => {
        callCount++;
      }, { once: true });

      await eventBus.publish('once.event', {});
      await eventBus.publish('once.event', {});
      await eventBus.publish('once.event', {});

      expect(callCount).toBe(1);
    });

    test('应该支持事件过滤', async () => {
      const highPriorityEvents = [];
      
      eventBus.subscribe('task.created', (event) => {
        highPriorityEvents.push(event);
      }, {
        filter: (event) => event.payload.priority === 'high'
      });

      await eventBus.publish('task.created', { priority: 'low' });
      await eventBus.publish('task.created', { priority: 'high' });
      await eventBus.publish('task.created', { priority: 'medium' });

      expect(highPriorityEvents).toHaveLength(1);
      expect(highPriorityEvents[0].payload.priority).toBe('high');
    });

    test('应该支持取消订阅', async () => {
      const events = [];
      
      const subId = eventBus.subscribe('test.event', (event) => {
        events.push(event);
      });

      await eventBus.publish('test.event', {});
      eventBus.unsubscribe(subId);
      await eventBus.publish('test.event', {});

      expect(events).toHaveLength(1);
    });

    test('应该记录事件历史', async () => {
      await eventBus.publish('event.1', { n: 1 });
      await eventBus.publish('event.2', { n: 2 });
      await eventBus.publish('event.3', { n: 3 });

      const history = eventBus.getHistory();
      expect(history).toHaveLength(3);
      expect(history[0].payload.n).toBe(1);
      expect(history[2].payload.n).toBe(3);
    });

    test('应该支持查询历史', async () => {
      await eventBus.publish('success', { status: 'ok' });
      await eventBus.publish('error', { status: 'fail' });
      await eventBus.publish('success', { status: 'ok' });

      const successEvents = eventBus.getHistory(
        e => e.type === 'success'
      );

      expect(successEvents).toHaveLength(2);
    });
  });

  describe('中间件系统', () => {
    test('应该按顺序执行中间件', async () => {
      const order = [];

      eventBus.use(async (event) => {
        order.push('middleware1');
      });

      eventBus.use(async (event) => {
        order.push('middleware2');
      });

      await eventBus.publish('test', {});

      expect(order).toEqual(['middleware1', 'middleware2']);
    });

    test('中间件应该能修改事件', async () => {
      eventBus.use(async (event) => {
        event.payload.processed = true;
      });

      await eventBus.publish('test', { original: true });

      const history = eventBus.getHistory();
      expect(history[0].payload.processed).toBe(true);
      expect(history[0].payload.original).toBe(true);
    });
  });

  describe('文件变更检测', () => {
    test('应该检测文件变更', (done) => {
      fileDetector.start();
      
      fileDetector.on('change', (change) => {
        expect(change.type).toBe('modified');
        expect(change.path).toContain('test.js');
        done();
      });

      fileDetector.simulateChange(path.join(tempDir, 'test.js'), 'modified');
    });

    test('应该支持debounce', (done) => {
      fileDetector.start();
      
      let eventCount = 0;
      fileDetector.on('change', () => {
        eventCount++;
      });

      // 快速触发多次
      fileDetector.simulateChange(path.join(tempDir, 'test.js'), 'modified');
      fileDetector.simulateChange(path.join(tempDir, 'test.js'), 'modified');
      fileDetector.simulateChange(path.join(tempDir, 'test.js'), 'modified');

      setTimeout(() => {
        expect(eventCount).toBe(1); // debounce后只触发一次
        done();
      }, 500);
    });

    test('应该能停止检测', () => {
      fileDetector.start();
      expect(fileDetector.isWatching).toBe(true);

      let eventReceived = false;
      fileDetector.on('change', () => {
        eventReceived = true;
      });

      fileDetector.stop();
      expect(fileDetector.isWatching).toBe(false);

      fileDetector.simulateChange(path.join(tempDir, 'test.js'));
      expect(eventReceived).toBe(false);
    });
  });

  describe('流水线事件触发', () => {
    test('应该触发技能变更事件', async () => {
      const events = [];
      
      eventBus.subscribe('skill.changed', (event) => {
        events.push(event);
      });

      await pipelineTrigger.triggerSkillChanged('test-skill', '/path/to/skill', {
        type: 'modified',
        files: ['SKILL.md'],
        diff: '+ added line'
      });

      expect(events).toHaveLength(1);
      expect(events[0].payload.skillId).toBe('test-skill');
      expect(events[0].payload.changeType).toBe('modified');
    });

    test('应该触发验证完成事件', async () => {
      const events = [];
      
      eventBus.subscribe('skill.validated', (event) => {
        events.push(event);
      });

      await pipelineTrigger.triggerValidationCompleted('test-skill', {
        score: 85,
        passed: true,
        grade: { level: 'B', label: '良好' },
        recommendations: ['建议1']
      });

      expect(events[0].payload.score).toBe(85);
      expect(events[0].payload.passed).toBe(true);
    });

    test('应该触发发布完成事件', async () => {
      const events = [];
      
      eventBus.subscribe('skill.published', (event) => {
        events.push(event);
      });

      await pipelineTrigger.triggerPublishCompleted('test-skill', '1.0.1', 'gene_abc123');

      expect(events[0].payload.version).toBe('1.0.1');
      expect(events[0].payload.geneId).toBe('gene_abc123');
    });

    test('应该触发失败事件', async () => {
      const events = [];
      
      eventBus.subscribe('skill.failed', (event) => {
        events.push(event);
      });

      await pipelineTrigger.triggerFailed(
        'test-skill',
        new Error('Validation failed'),
        'TEST'
      );

      expect(events[0].payload.error.message).toBe('Validation failed');
      expect(events[0].payload.error.stage).toBe('TEST');
    });
  });

  describe('触发器系统', () => {
    test('应该按条件触发动作', async () => {
      const triggeredActions = [];

      pipelineTrigger.registerTrigger(
        'skill.validated',
        (event) => event.payload.score >= 80,
        (event) => {
          triggeredActions.push({ type: 'auto_approve', skillId: event.payload.skillId });
        }
      );

      // 高分技能应该触发
      await eventBus.publish('skill.validated', { skillId: 'skill1', score: 85 });
      
      // 低分技能不应该触发
      await eventBus.publish('skill.validated', { skillId: 'skill2', score: 60 });

      expect(triggeredActions).toHaveLength(1);
      expect(triggeredActions[0].skillId).toBe('skill1');
    });

    test('应该支持多个触发器', async () => {
      const actions = [];

      pipelineTrigger.registerTrigger(
        'skill.changed',
        null,
        () => actions.push('trigger1')
      );

      pipelineTrigger.registerTrigger(
        'skill.changed',
        null,
        () => actions.push('trigger2')
      );

      await eventBus.publish('skill.changed', { skillId: 'test' });

      expect(actions).toContain('trigger1');
      expect(actions).toContain('trigger2');
    });
  });

  describe('事件流测试', () => {
    test('完整的事件流：文件变更到发布', async () => {
      const eventFlow = [];

      // 订阅所有流水线事件
      ['skill.changed', 'skill.validated', 'skill.published', 'skill.failed'].forEach(type => {
        eventBus.subscribe(type, (event) => {
          eventFlow.push({ type: event.type, skillId: event.payload.skillId });
        });
      });

      // 模拟完整流程
      await pipelineTrigger.triggerSkillChanged('test-skill', '/path', {
        type: 'modified',
        files: ['SKILL.md'],
        diff: 'changes'
      });

      await pipelineTrigger.triggerValidationCompleted('test-skill', {
        score: 85,
        passed: true,
        grade: { level: 'B' },
        recommendations: []
      });

      await pipelineTrigger.triggerPublishCompleted('test-skill', '1.0.1', 'gene_xyz');

      expect(eventFlow.map(e => e.type)).toEqual([
        'skill.changed',
        'skill.validated',
        'skill.published'
      ]);
    });

    test('失败的事件流', async () => {
      const eventFlow = [];

      eventBus.subscribe('skill.changed', (e) => eventFlow.push(e.type));
      eventBus.subscribe('skill.validated', (e) => eventFlow.push(e.type));
      eventBus.subscribe('skill.failed', (e) => eventFlow.push(e.type));

      await pipelineTrigger.triggerSkillChanged('test-skill', '/path', {});
      
      await pipelineTrigger.triggerValidationCompleted('test-skill', {
        score: 50,
        passed: false
      });

      // 验证失败后不会触发发布
      expect(eventFlow).not.toContain('skill.published');
    });
  });

  describe('错误处理', () => {
    test('订阅者错误不应该影响其他订阅者', async () => {
      const receivedBy = [];

      eventBus.subscribe('test', () => {
        throw new Error('Subscriber 1 error');
      });

      eventBus.subscribe('test', () => {
        receivedBy.push('subscriber2');
      });

      await eventBus.publish('test', {});

      expect(receivedBy).toContain('subscriber2');
    });

    test('应该使用错误处理器', async () => {
      const errors = [];

      eventBus.subscribe('test', () => {
        throw new Error('Test error');
      }, {
        onError: (error, event) => {
          errors.push(error.message);
        }
      });

      await eventBus.publish('test', {});

      expect(errors).toContain('Test error');
    });
  });
});
