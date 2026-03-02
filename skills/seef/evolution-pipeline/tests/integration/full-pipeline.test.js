/**
 * @fileoverview 完整流程集成测试 - Full Pipeline Integration Test
 * @description 测试从技能变更到EvoMap发布的完整流程
 * @module FullPipelineTests
 * @version 1.0.0
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PipelineEngine } from '../../src/engine.js';
import { createStateManager, PIPELINE_STATES } from '../../src/core/state-manager.js';
import { createISCValidator } from '../../src/core/isc-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试配置
const TEST_CONFIG = {
  storage: {
    statePath: path.join(__dirname, '../fixtures/integration/state')
  },
  isc: {
    minScore: 70
  },
  evomap: {
    offlineMode: true,
    maxRetries: 2
  },
  pipeline: {
    states: {
      TEST: { autoTransition: true },
      REVIEW: { autoTransition: true },
      RELEASE: { autoTransition: true },
      SYNC: { autoTransition: true }
    }
  }
};

describe('完整流程集成测试', () => {
  let engine;
  let testSkillPath;
  let testSkillId;
  let tempBasePath;

  beforeAll(() => {
    // 创建测试基础目录
    tempBasePath = path.join(__dirname, '../fixtures/integration');
    if (!fs.existsSync(tempBasePath)) {
      fs.mkdirSync(tempBasePath, { recursive: true });
    }
  });

  afterAll(() => {
    // 清理测试数据
    if (fs.existsSync(tempBasePath)) {
      fs.rmSync(tempBasePath, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // 创建测试技能目录
    testSkillId = `test-skill-${Date.now()}`;
    testSkillPath = path.join(tempBasePath, 'skills', testSkillId);
    fs.mkdirSync(testSkillPath, { recursive: true });
    
    // 创建状态目录
    const statePath = path.join(tempBasePath, 'state');
    if (!fs.existsSync(statePath)) {
      fs.mkdirSync(statePath, { recursive: true });
    }
    
    // 初始化引擎
    engine = new PipelineEngine({
      ...TEST_CONFIG,
      storage: { statePath }
    });
  });

  afterEach(async () => {
    // 关闭引擎
    if (engine) {
      await engine.shutdown();
    }
    
    // 清理测试技能
    if (fs.existsSync(testSkillPath)) {
      fs.rmSync(path.dirname(testSkillPath), { recursive: true, force: true });
    }
  });

  describe('DEVELOP -> TEST -> REVIEW -> RELEASE -> SYNC -> ONLINE 流程', () => {
    test('完整流程：高分技能应该自动发布', async () => {
      // 1. 创建高质量的测试技能
      createHighQualitySkill(testSkillPath);
      
      // 2. 处理技能
      const result = await engine.processSkill(testSkillPath);
      
      // 3. 验证最终状态
      expect(result.currentState).toBe(PIPELINE_STATES.ONLINE);
      expect(result.iscScore).toBeGreaterThanOrEqual(70);
      expect(result.version).toBeDefined();
      expect(result.stateHistory.length).toBeGreaterThan(0);
      
      // 4. 验证状态流转历史
      const stateTransitions = result.stateHistory.map(h => `${h.from} -> ${h.to}`);
      expect(stateTransitions.some(t => t.includes('DEVELOP'))).toBe(true);
      expect(stateTransitions.some(t => t.includes('TEST'))).toBe(true);
    });

    test('完整流程：低分技能应该返回DEVELOP', async () => {
      // 1. 创建低质量的测试技能
      createLowQualitySkill(testSkillPath);
      
      // 2. 处理技能
      const result = await engine.processSkill(testSkillPath);
      
      // 3. 验证最终状态（ISC失败后应该回到DEVELOP）
      expect(result.currentState).toBe(PIPELINE_STATES.DEVELOP);
      expect(result.iscScore).toBeLessThan(70);
      expect(result.stateHistory.some(h => h.to === 'DEVELOP')).toBe(true);
    });

    test('完整流程：中等分数技能应该在REVIEW等待', async () => {
      // 1. 创建中等质量的测试技能（70-80分）
      createMediumQualitySkill(testSkillPath);
      
      // 2. 修改配置禁用REVIEW自动流转
      engine.config.pipeline.states.REVIEW.autoTransition = false;
      
      // 3. 处理技能
      const result = await engine.processSkill(testSkillPath);
      
      // 4. 验证停留在REVIEW状态
      expect(result.currentState).toBe(PIPELINE_STATES.REVIEW);
      expect(result.iscScore).toBeGreaterThanOrEqual(70);
      expect(result.iscScore).toBeLessThan(80);
    });
  });

  describe('版本递增流程', () => {
    test('发布流程应该递增版本号', async () => {
      createHighQualitySkill(testSkillPath);
      
      // 第一次处理
      const result1 = await engine.processSkill(testSkillPath);
      const version1 = result1.version;
      
      // 模拟文件变更
      fs.writeFileSync(
        path.join(testSkillPath, 'SKILL.md'),
        fs.readFileSync(path.join(testSkillPath, 'SKILL.md'), 'utf-8') + '\n# Updated'
      );
      
      // 重置状态到DEVELOP（模拟新变更）
      engine.stateManager.transitionState(
        testSkillId,
        PIPELINE_STATES.DEVELOP,
        '文件变更',
        'test'
      );
      
      // 第二次处理
      const result2 = await engine.processSkill(testSkillPath);
      const version2 = result2.version;
      
      // 验证版本递增
      expect(compareVersions(version2, version1)).toBeGreaterThan(0);
    });

    test('多次快速变更应该正确处理版本', async () => {
      createHighQualitySkill(testSkillPath);
      
      const versions = [];
      
      for (let i = 0; i < 3; i++) {
        // 更新文件
        fs.writeFileSync(
          path.join(testSkillPath, 'index.js'),
          `export function v${i}() { return ${i}; }`
        );
        
        // 强制重置到DEVELOP
        const state = engine.stateManager.getOrCreateState(testSkillPath);
        if (state.currentState !== PIPELINE_STATES.DEVELOP) {
          engine.stateManager.transitionState(
            testSkillId,
            PIPELINE_STATES.DEVELOP,
            '强制重置',
            'test'
          );
        }
        
        // 处理
        const result = await engine.processSkill(testSkillPath);
        versions.push(result.version);
      }
      
      // 验证版本递增
      for (let i = 1; i < versions.length; i++) {
        expect(compareVersions(versions[i], versions[i-1])).toBeGreaterThan(0);
      }
    });
  });

  describe('事件触发测试', () => {
    test('应该触发状态变更事件', async () => {
      const events = [];
      
      engine.on('beforeProcess', (data) => {
        events.push({ type: 'beforeProcess', skillId: data.skillId });
      });
      
      engine.on('afterProcess', (data) => {
        events.push({ type: 'afterProcess', skillId: data.skillId, state: data.state.currentState });
      });
      
      engine.on('stateTransition', (data) => {
        events.push({ 
          type: 'stateTransition', 
          from: data.from, 
          to: data.to 
        });
      });
      
      createHighQualitySkill(testSkillPath);
      await engine.processSkill(testSkillPath);
      
      expect(events.some(e => e.type === 'beforeProcess')).toBe(true);
      expect(events.some(e => e.type === 'afterProcess')).toBe(true);
      expect(events.some(e => e.type === 'stateTransition')).toBe(true);
    });

    test('应该触发ISC验证事件', async () => {
      const events = [];
      
      engine.on('beforeValidate', (data) => {
        events.push({ type: 'beforeValidate', skillId: data.skillId });
      });
      
      engine.on('afterValidate', (data) => {
        events.push({ 
          type: 'afterValidate', 
          skillId: data.skillId, 
          score: data.result.score 
        });
      });
      
      createHighQualitySkill(testSkillPath);
      await engine.processSkill(testSkillPath);
      
      expect(events.some(e => e.type === 'beforeValidate')).toBe(true);
      expect(events.some(e => e.type === 'afterValidate')).toBe(true);
    });

    test('应该触发发布事件', async () => {
      const events = [];
      
      engine.on('beforeRelease', (data) => {
        events.push({ type: 'beforeRelease', version: data.version });
      });
      
      createHighQualitySkill(testSkillPath);
      await engine.processSkill(testSkillPath);
      
      expect(events.some(e => e.type === 'beforeRelease')).toBe(true);
    });
  });

  describe('统计信息', () => {
    test('应该正确统计处理任务', async () => {
      createHighQualitySkill(testSkillPath);
      
      const statsBefore = engine.getStats();
      await engine.processSkill(testSkillPath);
      const statsAfter = engine.getStats();
      
      expect(statsAfter.jobsProcessed).toBe(statsBefore.jobsProcessed + 1);
    });

    test('失败任务应该正确统计', async () => {
      // 创建会导致失败的场景（空技能）
      createLowQualitySkill(testSkillPath);
      
      const statsBefore = engine.getStats();
      await engine.processSkill(testSkillPath);
      const statsAfter = engine.getStats();
      
      expect(statsAfter.jobsProcessed).toBe(statsBefore.jobsProcessed + 1);
    });

    test('应该包含状态分布统计', async () => {
      createHighQualitySkill(testSkillPath);
      await engine.processSkill(testSkillPath);
      
      const stats = engine.getStats();
      expect(stats.stateDistribution).toBeDefined();
      expect(stats.stateDistribution.total).toBeGreaterThan(0);
    });
  });

  describe('批量处理', () => {
    test('应该支持批量处理多个技能', async () => {
      // 创建多个技能
      const skillIds = [];
      for (let i = 0; i < 3; i++) {
        const skillId = `batch-skill-${i}-${Date.now()}`;
        const skillPath = path.join(tempBasePath, 'skills', skillId);
        fs.mkdirSync(skillPath, { recursive: true });
        createHighQualitySkill(skillPath);
        skillIds.push(skillId);
      }
      
      // 初始化引擎并运行
      await engine.initialize();
      const stats = await engine.run();
      
      expect(stats.jobsProcessed).toBeGreaterThanOrEqual(3);
      
      // 清理
      skillIds.forEach(id => {
        const p = path.join(tempBasePath, 'skills', id);
        if (fs.existsSync(p)) {
          fs.rmSync(p, { recursive: true, force: true });
        }
      });
    });

    test('批量处理应该跳过ONLINE状态技能', async () => {
      createHighQualitySkill(testSkillPath);
      
      // 先处理一次使其变为ONLINE
      await engine.processSkill(testSkillPath);
      
      const statsBefore = engine.getStats();
      
      // 再次运行，应该跳过
      await engine.run();
      
      const statsAfter = engine.getStats();
      
      // ONLINE状态不应被再次处理
      expect(statsAfter.jobsProcessed).toBe(statsBefore.jobsProcessed);
    });
  });

  describe('上下文传递', () => {
    test('应该传递上下文到处理流程', async () => {
      createHighQualitySkill(testSkillPath);
      
      const context = {
        triggerReason: '手动触发',
        triggeredBy: 'test_user',
        customData: { key: 'value' }
      };
      
      const result = await engine.processSkill(testSkillPath, context);
      
      expect(result).toBeDefined();
      // 验证上下文被处理（具体取决于实现）
    });
  });

  describe('持久化', () => {
    test('状态应该持久化到文件系统', async () => {
      createHighQualitySkill(testSkillPath);
      await engine.processSkill(testSkillPath);
      
      // 检查状态文件
      const stateFile = path.join(tempBasePath, 'state', `${testSkillId}.json`);
      expect(fs.existsSync(stateFile)).toBe(true);
      
      // 验证文件内容
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      expect(state.skillId).toBe(testSkillId);
      expect(state.currentState).toBeDefined();
    });

    test('重启后应该能恢复状态', async () => {
      createHighQualitySkill(testSkillPath);
      const result1 = await engine.processSkill(testSkillPath);
      
      // 创建新引擎实例
      const engine2 = new PipelineEngine({
        ...TEST_CONFIG,
        storage: { statePath: path.join(tempBasePath, 'state') }
      });
      
      // 获取状态
      const restoredState = engine2.stateManager.getState(testSkillId);
      
      expect(restoredState).toBeDefined();
      expect(restoredState.currentState).toBe(result1.currentState);
      expect(restoredState.iscScore).toBe(result1.iscScore);
      
      await engine2.shutdown();
    });
  });
});

// 辅助函数

function createHighQualitySkill(skillPath) {
  // SKILL.md
  fs.writeFileSync(path.join(skillPath, 'SKILL.md'), `---
name: "高质量测试技能"
description: "这是一个高质量的测试技能，包含完整的文档和实现"
version: "1.0.0"
status: "stable"
author: "Test Author"
tags: "test, high-quality, example"
layer: "application"
---

# 高质量测试技能

这是一个非常详细的技能文档，包含了所有必要的信息。

## 功能特性

- 特性1: 支持多种操作
- 特性2: 高性能执行
- 特性3: 易于扩展

## 使用示例

\`\`\`javascript
import { run } from './index.js';
await run();
\`\`\`

## API文档

详细说明了所有可用的API接口和参数。

## 注意事项

使用本技能时需要注意以下事项...

## 配置说明

可以配置以下参数...
`);

  // README.md
  fs.writeFileSync(path.join(skillPath, 'README.md'), `# 高质量测试技能

## 安装

\`\`\`bash
npm install
\`\`\`

## 使用

\`\`\`javascript
import { run } from './index.js';
await run();
\`\`\`

## 贡献

欢迎提交PR！
`);

  // index.js
  fs.writeFileSync(path.join(skillPath, 'index.js'), `/**
 * 高质量测试技能
 * @module HighQualityTestSkill
 */

/**
 * 运行技能
 * @returns {Promise<Object>}
 */
export async function run() {
  // 主要执行逻辑
  console.log('Running high quality skill');
  return { success: true, data: 'result' };
}

/**
 * 验证输入
 * @param {*} input
 * @returns {boolean}
 */
export function validate(input) {
  return input !== null && input !== undefined;
}

/**
 * 配置技能
 * @param {Object} config
 */
export function configure(config) {
  // 配置逻辑
  return { configured: true };
}

export default { run, validate, configure };
`);

  // package.json
  fs.writeFileSync(path.join(skillPath, 'package.json'), JSON.stringify({
    name: "high-quality-test-skill",
    version: "1.0.0",
    type: "module",
    main: "index.js",
    description: "高质量测试技能"
  }, null, 2));
}

function createMediumQualitySkill(skillPath) {
  fs.writeFileSync(path.join(skillPath, 'SKILL.md'), `---
name: "中等质量技能"
description: "这是一个中等质量的技能"
version: "1.0.0"
status: "beta"
author: "Test Author"
---

# 中等质量技能

基本描述信息。
`);

  fs.writeFileSync(path.join(skillPath, 'index.js'), `export function run() { return true; }`);
}

function createLowQualitySkill(skillPath) {
  fs.writeFileSync(path.join(skillPath, 'SKILL.md'), `---
name: "低质量技能"
version: "0.1.0"
---
`);
  // 不创建index.js
}

function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  return 0;
}
