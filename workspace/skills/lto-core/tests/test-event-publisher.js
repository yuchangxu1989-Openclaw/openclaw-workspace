#!/usr/bin/env node
/**
 * 本地任务编排 Event Publisher - 测试脚本
 * 验证事件发布机制是否正常工作
 */

const path = require('path');
const { SKILLS_DIR } = require('../../shared/paths');
const EventPublisher = require('../core/event-publisher');
const EventBus = require('../core/event-bus');

async function testEventPublisher() {
  console.log('='.repeat(60));
  console.log('本地任务编排 Event Publisher - 测试');
  console.log('='.repeat(60));
  console.log('');

  // 1. 初始化
  const eventBus = new EventBus();
  const publisher = new EventPublisher(eventBus);

  console.log('✓ EventPublisher 初始化完成');
  console.log(`  已加载订阅: ${publisher.getSubscriptions().length} 个`);
  console.log('');

  // 2. 测试 skill.registered 事件
  console.log('测试 1: 发布 skill.registered 事件');
  console.log('-'.repeat(60));
  
  try {
    await publisher.publishEvent('skill.registered', {
      skillId: 'test-skill-001',
      skillName: 'test-skill',
      skillPath: '/root/.openclaw/workspace/skills/test-skill',
      version: '1.0.0',
      metadata: {
        author: 'test',
        description: '测试技能'
      }
    });
    
    console.log('✓ skill.registered 事件发布成功');
  } catch (e) {
    console.error('✗ skill.registered 事件发布失败:', e.message);
  }
  
  console.log('');

  // 3. 测试 skill.updated 事件
  console.log('测试 2: 发布 skill.updated 事件');
  console.log('-'.repeat(60));
  
  try {
    await publisher.publishEvent('skill.updated', {
      skillId: 'test-skill-001',
      skillName: 'test-skill',
      skillPath: '/root/.openclaw/workspace/skills/test-skill',
      version: '1.0.1',
      changes: {
        version: '1.0.1',
        description: '更新描述'
      },
      metadata: {
        author: 'test'
      }
    });
    
    console.log('✓ skill.updated 事件发布成功');
  } catch (e) {
    console.error('✗ skill.updated 事件发布失败:', e.message);
  }
  
  console.log('');

  // 4. 测试过滤器（排除技能）
  console.log('测试 3: 测试过滤器（应被排除）');
  console.log('-'.repeat(60));
  
  try {
    await publisher.publishEvent('skill.registered', {
      skillId: 'lto-core-001',
      skillName: 'lto-core',
      skillPath: '/root/.openclaw/workspace/skills/lto-core',
      version: '3.0.0',
      metadata: {}
    });
    
    console.log('✓ 事件已发布（应被过滤器排除）');
  } catch (e) {
    console.error('✗ 事件发布失败:', e.message);
  }
  
  console.log('');

  // 5. 查看事件历史
  console.log('测试 4: 查看事件历史');
  console.log('-'.repeat(60));
  
  const history = eventBus.getHistory();
  console.log(`事件历史记录: ${history.length} 条`);
  
  for (const record of history.slice(-3)) {
    console.log(`  - ${record.event} @ ${record.timestamp}`);
    console.log(`    订阅者: ${record.subscribers}`);
  }
  
  console.log('');
  console.log('='.repeat(60));
  console.log('测试完成');
  console.log('='.repeat(60));
}

// 运行测试
testEventPublisher().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
