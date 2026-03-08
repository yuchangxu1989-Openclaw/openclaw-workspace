/**
 * 本地任务编排 Event Publisher - 使用示例
 */

const EventPublisher = require('./core/event-publisher');
const EventBus = require('./core/event-bus');

// 示例 1: 独立使用 EventPublisher
async function example1() {
  const eventBus = new EventBus();
  const publisher = new EventPublisher(eventBus);

  // 发布技能注册事件
  await publisher.publishEvent('skill.registered', {
    skillId: 'my-skill-001',
    skillName: 'my-skill',
    skillPath: '/path/to/skill',
    version: '1.0.0',
    metadata: {
      author: 'developer',
      description: '我的技能'
    }
  });
}

// 示例 2: 在 本地任务编排 Platform 中使用
async function example2() {
  const DTOPlatform = require('./index');
  
  const dto = new DTOPlatform();
  await dto.initialize();

  // 注册任务时自动触发事件
  dto.registerTask({
    id: 'my-task',
    intent: '执行某个任务',
    version: '1.0.0',
    workflow: {
      nodes: [
        { id: 'step1', action: 'echo', params: { message: 'Hello' } }
      ]
    }
  });
  
  // 事件会自动发布到 SEEF Evaluator
}

// 示例 3: 使用 SkillRegistryWrapper
async function example3() {
  const SkillRegistryWrapper = require('./core/skill-registry-wrapper');
  const EventPublisher = require('./core/event-publisher');
  const EventBus = require('./core/event-bus');

  const eventBus = new EventBus();
  const publisher = new EventPublisher(eventBus);
  const registry = new SkillRegistryWrapper(publisher);

  // 注册技能
  await registry.registerSkill({
    skillId: 'skill-001',
    skillName: 'my-skill',
    skillPath: '/path/to/skill',
    version: '1.0.0',
    metadata: { author: 'dev' }
  });

  // 更新技能
  await registry.updateSkill('skill-001', {
    version: '1.0.1',
    metadata: { author: 'dev', updated: true }
  });
}

module.exports = {
  example1,
  example2,
  example3
};
