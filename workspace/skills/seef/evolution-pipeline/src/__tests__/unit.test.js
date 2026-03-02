/**
 * @fileoverview 单元测试套件 - PipelineEngine & StateManager
 * @description 针对核心类的详细单元测试
 * @module unit-tests
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { StateManager, PIPELINE_STATES, STATE_TRANSITIONS } from '../../src/state-manager.js';
import { PipelineEngine } from '../../src/engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_STATE_PATH = path.join(__dirname, '.unit-test-state');

/**
 * StateManager 单元测试
 */
describe('StateManager 单元测试', () => {
  let stateManager;

  beforeEach(async () => {
    await fs.rm(TEST_STATE_PATH, { recursive: true, force: true }).catch(() => {});
    stateManager = new StateManager({ statePath: TEST_STATE_PATH });
  });

  afterEach(async () => {
    await fs.rm(TEST_STATE_PATH, { recursive: true, force: true }).catch(() => {});
  });

  describe('构造函数', () => {
    it('应该使用默认配置初始化', () => {
      const sm = new StateManager();
      expect(sm.config).toBeDefined();
      expect(sm.statePath).toBeDefined();
    });

    it('应该使用自定义配置初始化', () => {
      const customPath = '/custom/state/path';
      const sm = new StateManager({ statePath: customPath });
      expect(sm.statePath).toBe(customPath);
    });
  });

  describe('ensureStateDirectory', () => {
    it('应该自动创建状态目录', async () => {
      const testPath = path.join(TEST_STATE_PATH, 'auto-create');
      const sm = new StateManager({ statePath: testPath });
      
      // 访问私有方法进行测试
      sm.ensureStateDirectory();
      
      const stats = await fs.stat(testPath);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('getStateFilePath', () => {
    it('应该返回正确的状态文件路径', () => {
      const filePath = stateManager.getStateFilePath('test-skill');
      expect(filePath).toBe(path.join(TEST_STATE_PATH, 'test-skill.json'));
    });

    it('应该处理特殊字符的技能ID', () => {
      const filePath = stateManager.getStateFilePath('skill@123#test');
      expect(filePath).toBe(path.join(TEST_STATE_PATH, 'skill@123#test.json'));
    });
  });

  describe('stateExists', () => {
    it('应该返回false当状态文件不存在', () => {
      expect(stateManager.stateExists('non-existent')).toBe(false);
    });

    it('应该返回true当状态文件存在', async () => {
      const skillPath = path.join(TEST_STATE_PATH, 'mock-skill');
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, 'SKILL.md'), '---\nname: mock\n---', 'utf-8');
      
      stateManager.getOrCreateState(skillPath);
      
      expect(stateManager.stateExists('mock-skill')).toBe(true);
    });
  });

  describe('rebuildStateFromFilesystem', () => {
    it('应该从目录创建默认状态', async () => {
      const skillPath = path.join(TEST_STATE_PATH, 'rebuild-test');
      await fs.mkdir(skillPath, { recursive: true });
      
      const state = stateManager.rebuildStateFromFilesystem(skillPath);
      
      expect(state.skillId).toBe('rebuild-test');
      expect(state.skillName).toBe('rebuild-test');
      expect(state.currentState).toBe(PIPELINE_STATES.DEVELOP);
      expect(state.version).toBe('0.0.1');
    });

    it('应该从SKILL.md解析元数据', async () => {
      const skillPath = path.join(TEST_STATE_PATH, 'parsed-skill');
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(
        path.join(skillPath, 'SKILL.md'),
        '---\nname: parsed-name\nversion: "2.0.0"\ndescription: Parsed Description\n---\n# Content',
        'utf-8'
      );
      
      const state = stateManager.rebuildStateFromFilesystem(skillPath);
      
      expect(state.skillName).toBe('parsed-name');
      expect(state.version).toBe('2.0.0');
      expect(state.description).toBe('Parsed Description');
    });
  });

  describe('parseSkillMetadata', () => {
    it('应该解析YAML Front Matter', () => {
      const content = `---
name: test-skill
description: Test Description
version: "1.0.0"
status: active
tags: [tag1, tag2]
---

# Skill Content`;

      const metadata = stateManager.parseSkillMetadata(content);
      
      expect(metadata.name).toBe('test-skill');
      expect(metadata.description).toBe('Test Description');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.status).toBe('active');
    });

    it('应该处理没有Front Matter的内容', () => {
      const content = '# Just a title\nSome content';
      const metadata = stateManager.parseSkillMetadata(content);
      expect(metadata).toEqual({});
    });

    it('应该处理空内容', () => {
      const metadata = stateManager.parseSkillMetadata('');
      expect(metadata).toEqual({});
    });

    it('应该正确处理带引号的值', () => {
      const content = `---
name: "quoted name"
version: '1.0.0'
---`;

      const metadata = stateManager.parseSkillMetadata(content);
      expect(metadata.name).toBe('quoted name');
      expect(metadata.version).toBe('1.0.0');
    });
  });

  describe('getOrCreateState', () => {
    it('应该创建新状态当文件不存在', async () => {
      const skillPath = path.join(TEST_STATE_PATH, 'new-skill');
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, 'SKILL.md'), '---\nname: new\n---', 'utf-8');
      
      const state = stateManager.getOrCreateState(skillPath);
      
      expect(state.skillId).toBe('new-skill');
      expect(state.currentState).toBe(PIPELINE_STATES.DEVELOP);
    });

    it('应该读取已存在的状态', async () => {
      const skillPath = path.join(TEST_STATE_PATH, 'existing-skill');
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, 'SKILL.md'), '---\nname: existing\n---', 'utf-8');
      
      // 创建初始状态
      const initialState = stateManager.getOrCreateState(skillPath);
      stateManager.transitionState('existing-skill', PIPELINE_STATES.TEST, 'test');
      
      // 重新获取状态
      const loadedState = stateManager.getOrCreateState(skillPath);
      expect(loadedState.currentState).toBe(PIPELINE_STATES.TEST);
    });
  });

  describe('saveState & updateState', () => {
    it('应该持久化状态到文件', async () => {
      const skillPath = path.join(TEST_STATE_PATH, 'persist-skill');
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, 'SKILL.md'), '---\nname: persist\n---', 'utf-8');
      
      stateManager.getOrCreateState(skillPath);
      stateManager.updateState('persist-skill', { iscScore: 85 });
      
      const fileContent = await fs.readFile(
        path.join(TEST_STATE_PATH, 'persist-skill.json'),
        'utf-8'
      );
      const savedState = JSON.parse(fileContent);
      
      expect(savedState.iscScore).toBe(85);
      expect(savedState.updatedAt).toBeDefined();
    });

    it('应该在更新时自动更新时间戳', async () => {
      const skillPath = path.join(TEST_STATE_PATH, 'timestamp-skill');
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, 'SKILL.md'), '---\nname: ts\n---', 'utf-8');
      
      const state = stateManager.getOrCreateState(skillPath);
      const originalUpdatedAt = state.updatedAt;
      
      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const updated = stateManager.updateState('timestamp-skill', { test: 'value' });
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime()
      );
    });
  });

  describe('transitionState', () => {
    it('应该正确记录状态历史', async () => {
      const skillPath = path.join(TEST_STATE_PATH, 'history-skill');
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, 'SKILL.md'), '---\nname: history\n---', 'utf-8');
      
      stateManager.getOrCreateState(skillPath);
      stateManager.transitionState('history-skill', PIPELINE_STATES.TEST, '测试', 'user');
      stateManager.transitionState('history-skill', PIPELINE_STATES.REVIEW, '审核', 'system');
      
      const state = stateManager.getOrCreateState(skillPath);
      expect(state.stateHistory).toHaveLength(2);
      expect(state.stateHistory[0].from).toBe(PIPELINE_STATES.DEVELOP);
      expect(state.stateHistory[0].to).toBe(PIPELINE_STATES.TEST);
      expect(state.stateHistory[1].triggeredBy).toBe('system');
    });

    it('应该拒绝非法状态流转', async () => {
      const skillPath = path.join(TEST_STATE_PATH, 'invalid-skill');
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, 'SKILL.md'), '---\nname: invalid\n---', 'utf-8');
      
      stateManager.getOrCreateState(skillPath);
      
      expect(() => {
        stateManager.transitionState('invalid-skill', PIPELINE_STATES.SYNC);
      }).toThrow();
    });

    it('应该支持双向流转', async () => {
      const skillPath = path.join(TEST_STATE_PATH, 'bidirectional-skill');
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, 'SKILL.md'), '---\nname: bidirectional\n---', 'utf-8');
      
      stateManager.getOrCreateState(skillPath);
      stateManager.transitionState('bidirectional-skill', PIPELINE_STATES.TEST);
      stateManager.transitionState('bidirectional-skill', PIPELINE_STATES.DEVELOP);
      
      const state = stateManager.getOrCreateState(skillPath);
      expect(state.currentState).toBe(PIPELINE_STATES.DEVELOP);
    });
  });

  describe('状态查询方法', () => {
    beforeEach(async () => {
      // 创建多个测试状态
      for (const [id, state] of Object.entries({
        'skill-a': PIPELINE_STATES.DEVELOP,
        'skill-b': PIPELINE_STATES.TEST,
        'skill-c': PIPELINE_STATES.TEST,
        'skill-d': PIPELINE_STATES.ONLINE
      })) {
        const skillPath = path.join(TEST_STATE_PATH, id);
        await fs.mkdir(skillPath, { recursive: true });
        await fs.writeFile(path.join(skillPath, 'SKILL.md'), `---\nname: ${id}\n---`, 'utf-8');
        stateManager.getOrCreateState(skillPath);
        if (state !== PIPELINE_STATES.DEVELOP) {
          stateManager.transitionState(id, state);
        }
      }
    });

    it('应该获取所有状态', () => {
      const allStates = stateManager.getAllStates();
      expect(allStates.length).toBeGreaterThanOrEqual(4);
    });

    it('应该按状态筛选', () => {
      const testStates = stateManager.getStatesByStatus(PIPELINE_STATES.TEST);
      expect(testStates.length).toBe(2);
      expect(testStates.every(s => s.currentState === PIPELINE_STATES.TEST)).toBe(true);
    });

    it('应该返回状态统计', () => {
      const stats = stateManager.getStateStatistics();
      expect(stats.total).toBeGreaterThanOrEqual(4);
      expect(stats.byState[PIPELINE_STATES.TEST]).toBe(2);
      expect(stats.byState[PIPELINE_STATES.DEVELOP]).toBe(1);
      expect(stats.byState[PIPELINE_STATES.ONLINE]).toBe(1);
    });
  });

  describe('deleteState', () => {
    it('应该删除状态文件', async () => {
      const skillPath = path.join(TEST_STATE_PATH, 'delete-skill');
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(path.join(skillPath, 'SKILL.md'), '---\nname: delete\n---', 'utf-8');
      
      stateManager.getOrCreateState(skillPath);
      expect(stateManager.stateExists('delete-skill')).toBe(true);
      
      stateManager.deleteState('delete-skill');
      expect(stateManager.stateExists('delete-skill')).toBe(false);
    });

    it('应该安全处理不存在的删除', () => {
      expect(() => stateManager.deleteState('non-existent')).not.toThrow();
    });
  });

  describe('isValidTransition', () => {
    it('应该验证合法流转', () => {
      expect(stateManager.isValidTransition(PIPELINE_STATES.DEVELOP, PIPELINE_STATES.TEST)).toBe(true);
      expect(stateManager.isValidTransition(PIPELINE_STATES.TEST, PIPELINE_STATES.REVIEW)).toBe(true);
      expect(stateManager.isValidTransition(PIPELINE_STATES.FAILED, PIPELINE_STATES.SYNC)).toBe(true);
    });

    it('应该拒绝非法流转', () => {
      expect(stateManager.isValidTransition(PIPELINE_STATES.DEVELOP, PIPELINE_STATES.ONLINE)).toBe(false);
      expect(stateManager.isValidTransition(PIPELINE_STATES.ONLINE, PIPELINE_STATES.RELEASE)).toBe(false);
      expect(stateManager.isValidTransition(PIPELINE_STATES.RELEASE, PIPELINE_STATES.DEVELOP)).toBe(false);
    });
  });
});

/**
 * PipelineEngine 单元测试
 */
describe('PipelineEngine 单元测试', () => {
  let engine;

  beforeEach(async () => {
    await fs.rm(TEST_STATE_PATH, { recursive: true, force: true }).catch(() => {});
    engine = new PipelineEngine({
      storage: { statePath: TEST_STATE_PATH },
      isc: { minScore: 70 },
      evomap: { offlineMode: true }
    });
  });

  afterEach(async () => {
    await engine.shutdown().catch(() => {});
    await fs.rm(TEST_STATE_PATH, { recursive: true, force: true }).catch(() => {});
  });

  describe('构造函数', () => {
    it('应该正确初始化配置', () => {
      expect(engine.config).toBeDefined();
      expect(engine.stateManager).toBeDefined();
      expect(engine.iscValidator).toBeDefined();
      expect(engine.evomapUploader).toBeDefined();
    });

    it('应该合并自定义配置', () => {
      const customEngine = new PipelineEngine({
        isc: { minScore: 80 },
        evomap: { maxRetries: 5 }
      });
      expect(customEngine.config.isc.minScore).toBe(80);
      expect(customEngine.config.evomap.maxRetries).toBe(5);
    });
  });

  describe('loadConfig', () => {
    it('应该加载默认配置', () => {
      const config = engine.loadConfig();
      expect(config).toBeDefined();
    });

    it('应该合并覆盖配置', () => {
      const config = engine.loadConfig({ custom: 'value' });
      expect(config.custom).toBe('value');
    });
  });

  describe('initialize', () => {
    it('应该初始化所有子模块', async () => {
      await engine.initialize();
      // 初始化完成不应抛出错误
      expect(engine).toBeDefined();
    });
  });

  describe('incrementVersion', () => {
    it('应该正确递增patch版本', () => {
      expect(engine.incrementVersion('1.0.0')).toBe('1.0.1');
      expect(engine.incrementVersion('0.5.3')).toBe('0.5.4');
    });

    it('应该在patch溢出时递增minor', () => {
      expect(engine.incrementVersion('1.0.99')).toBe('1.1.0');
    });

    it('应该在minor溢出时递增major', () => {
      expect(engine.incrementVersion('1.99.99')).toBe('2.0.0');
    });

    it('应该处理无效版本号', () => {
      expect(engine.incrementVersion('invalid')).toBe('0.0.1');
      expect(engine.incrementVersion('1.2')).toBe('0.0.1');
      expect(engine.incrementVersion('')).toBe('0.0.1');
    });

    it('应该处理边界值', () => {
      expect(engine.incrementVersion('999.99.99')).toBe('1000.0.0');
    });
  });

  describe('getStats', () => {
    it('应该返回统计信息', () => {
      const stats = engine.getStats();
      expect(stats.jobsProcessed).toBe(0);
      expect(stats.jobsFailed).toBe(0);
      expect(stats.startTime).toBeDefined();
      expect(stats.stateDistribution).toBeDefined();
    });
  });

  describe('shutdown', () => {
    it('应该关闭引擎', async () => {
      await engine.initialize();
      await engine.shutdown();
      // 关闭不应抛出错误
    });
  });
});

// 测试常量验证
describe('状态常量验证', () => {
  it('PIPELINE_STATES应该包含所有状态', () => {
    expect(PIPELINE_STATES.DEVELOP).toBe('DEVELOP');
    expect(PIPELINE_STATES.TEST).toBe('TEST');
    expect(PIPELINE_STATES.REVIEW).toBe('REVIEW');
    expect(PIPELINE_STATES.RELEASE).toBe('RELEASE');
    expect(PIPELINE_STATES.SYNC).toBe('SYNC');
    expect(PIPELINE_STATES.ONLINE).toBe('ONLINE');
    expect(PIPELINE_STATES.FAILED).toBe('FAILED');
  });

  it('STATE_TRANSITIONS应该定义正确的流转规则', () => {
    // 开发状态只能流转到测试
    expect(STATE_TRANSITIONS[PIPELINE_STATES.DEVELOP]).toContain(PIPELINE_STATES.TEST);
    expect(STATE_TRANSITIONS[PIPELINE_STATES.DEVELOP]).not.toContain(PIPELINE_STATES.ONLINE);
    
    // 测试状态可以流转到审核或回退到开发
    expect(STATE_TRANSITIONS[PIPELINE_STATES.TEST]).toContain(PIPELINE_STATES.REVIEW);
    expect(STATE_TRANSITIONS[PIPELINE_STATES.TEST]).toContain(PIPELINE_STATES.DEVELOP);
    
    // 发布状态只能流转到同步
    expect(STATE_TRANSITIONS[PIPELINE_STATES.RELEASE]).toContain(PIPELINE_STATES.SYNC);
    expect(STATE_TRANSITIONS[PIPELINE_STATES.RELEASE]).toHaveLength(1);
    
    // 同步状态可以流转到上线或失败
    expect(STATE_TRANSITIONS[PIPELINE_STATES.SYNC]).toContain(PIPELINE_STATES.ONLINE);
    expect(STATE_TRANSITIONS[PIPELINE_STATES.SYNC]).toContain(PIPELINE_STATES.FAILED);
  });
});
