/**
 * @fileoverview 核心模块单元测试
 * @description 测试PipelineEngine、StateManager、Watcher、ISCValidator
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { 
  PipelineEngine, 
  createPipelineEngine,
  StateManager,
  createStateManager,
  Watcher,
  createWatcher,
  ISCValidator,
  createISCValidator,
  PIPELINE_STATES,
  STATES,
  STATE_TRANSITIONS,
  ChangeType,
  Dimension
} from '../core/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试数据目录
const TEST_STATE_PATH = path.join(__dirname, '../../.pipeline/test-state');
const TEST_SKILLS_PATH = path.join(__dirname, '../../.pipeline/test-skills');

describe('StateManager', () => {
  let stateManager;

  beforeEach(() => {
    // 清理测试目录
    if (fs.existsSync(TEST_STATE_PATH)) {
      fs.rmSync(TEST_STATE_PATH, { recursive: true });
    }
    fs.mkdirSync(TEST_STATE_PATH, { recursive: true });
    
    stateManager = createStateManager({
      statePath: TEST_STATE_PATH,
      skillsBasePath: TEST_SKILLS_PATH
    });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_STATE_PATH)) {
      fs.rmSync(TEST_STATE_PATH, { recursive: true });
    }
  });

  test('should create state directory', () => {
    expect(fs.existsSync(TEST_STATE_PATH)).toBe(true);
  });

  test('should return correct state file path', () => {
    const path = stateManager.getStateFilePath('test-skill');
    expect(path).toContain('test-skill.json');
  });

  test('should check state existence', () => {
    expect(stateManager.stateExists('non-existent')).toBe(false);
  });

  test('should parse SKILL.md metadata', () => {
    const content = `---
name: test-skill
description: Test description
version: 1.0.0
---
# Content`;
    
    const metadata = stateManager.parseSkillMetadata(content);
    expect(metadata.name).toBe('test-skill');
    expect(metadata.description).toBe('Test description');
    expect(metadata.version).toBe('1.0.0');
  });

  test('should get state statistics', () => {
    const stats = stateManager.getStateStatistics();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('byState');
    expect(stats.total).toBe(0);
  });

  test('should check valid state transitions', () => {
    expect(stateManager.isValidTransition(STATES.DEVELOP, STATES.TEST)).toBe(true);
    expect(stateManager.isValidTransition(STATES.DEVELOP, STATES.ONLINE)).toBe(false);
    expect(stateManager.isValidTransition(STATES.TEST, STATES.REVIEW)).toBe(true);
  });
});

describe('ISCValidator', () => {
  let validator;

  beforeEach(() => {
    validator = createISCValidator({
      minScore: 70
    });
  });

  test('should create validator with default config', () => {
    expect(validator.config.minScore).toBe(70);
    expect(validator.config.maxScore).toBe(100);
  });

  test('should calculate grade labels correctly', () => {
    expect(validator.getGradeLabel(95).level).toBe('A');
    expect(validator.getGradeLabel(85).level).toBe('B');
    expect(validator.getGradeLabel(75).level).toBe('C');
    expect(validator.getGradeLabel(65).level).toBe('D');
    expect(validator.getGradeLabel(55).level).toBe('F');
  });

  test('should generate recommendations', () => {
    const dimensions = {
      basicCompleteness: { score: 20 },
      standardCompliance: { score: 15 },
      contentAccuracy: { score: 10 },
      extensionCompleteness: { score: 3 }
    };
    
    const recommendations = validator.generateRecommendations(dimensions, 48);
    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.some(r => r.includes('基础完整性'))).toBe(true);
  });

  test('should return validation stats', () => {
    const results = [
      { passed: true, score: 80 },
      { passed: true, score: 90 },
      { passed: false, score: 60 }
    ];
    
    const stats = validator.getValidationStats(results);
    expect(stats.total).toBe(3);
    expect(stats.passed).toBe(2);
    expect(stats.failed).toBe(1);
    expect(parseFloat(stats.avgScore)).toBeCloseTo(76.67, 1);
  });
});

describe('Watcher', () => {
  let watcher;

  beforeEach(() => {
    watcher = createWatcher({
      watchPaths: [TEST_SKILLS_PATH],
      debounceMs: 1000,
      logger: { info: () => {}, warn: () => {}, error: () => {} }
    });
  });

  afterEach(async () => {
    if (watcher.isRunning) {
      await watcher.stop();
    }
  });

  test('should create watcher with config', () => {
    expect(watcher.config.watchPaths).toContain(TEST_SKILLS_PATH);
    expect(watcher.config.debounceMs).toBe(1000);
  });

  test('should not be running initially', () => {
    expect(watcher.isRunning).toBe(false);
  });

  test('should return stats', () => {
    const stats = watcher.getStats();
    expect(stats).toHaveProperty('isRunning');
    expect(stats).toHaveProperty('bufferedChanges');
    expect(stats).toHaveProperty('watchPaths');
  });

  test('should add watch path', () => {
    watcher.addWatchPath('/new/path');
    expect(watcher.config.watchPaths).toContain('/new/path');
  });

  test('should remove watch path', () => {
    watcher.removeWatchPath(TEST_SKILLS_PATH);
    expect(watcher.config.watchPaths).not.toContain(TEST_SKILLS_PATH);
  });
});

describe('PipelineEngine', () => {
  let engine;

  beforeEach(() => {
    engine = createPipelineEngine({
      storage: { statePath: TEST_STATE_PATH },
      isc: { minScore: 70 }
    });
  });

  afterEach(async () => {
    await engine.shutdown();
  });

  test('should create engine with config', () => {
    expect(engine).toBeInstanceOf(PipelineEngine);
    expect(engine.config).toHaveProperty('isc');
  });

  test('should increment version correctly', () => {
    expect(engine.incrementVersion('0.0.1')).toBe('0.0.2');
    expect(engine.incrementVersion('0.0.99')).toBe('0.1.0');
    expect(engine.incrementVersion('0.99.99')).toBe('1.0.0');
    expect(engine.incrementVersion('invalid')).toBe('0.0.1');
  });

  test('should manage event handlers', () => {
    const handler = jest.fn();
    engine.on('testEvent', handler);
    
    expect(engine.eventHandlers.has('testEvent')).toBe(true);
    expect(engine.eventHandlers.get('testEvent')).toContain(handler);
  });

  test('should return stats', () => {
    const stats = engine.getStats();
    expect(stats).toHaveProperty('jobsProcessed');
    expect(stats).toHaveProperty('jobsFailed');
    expect(stats).toHaveProperty('stateDistribution');
  });
});

describe('Constants', () => {
  test('should have all pipeline states', () => {
    expect(STATES.DEVELOP).toBe('DEVELOP');
    expect(STATES.TEST).toBe('TEST');
    expect(STATES.REVIEW).toBe('REVIEW');
    expect(STATES.RELEASE).toBe('RELEASE');
    expect(STATES.SYNC).toBe('SYNC');
    expect(STATES.ONLINE).toBe('ONLINE');
    expect(STATES.FAILED).toBe('FAILED');
  });

  test('should have valid state transitions', () => {
    expect(STATE_TRANSITIONS[STATES.DEVELOP]).toContain(STATES.TEST);
    expect(STATE_TRANSITIONS[STATES.TEST]).toContain(STATES.REVIEW);
    expect(STATE_TRANSITIONS[STATES.TEST]).toContain(STATES.DEVELOP);
  });

  test('should have change types', () => {
    expect(ChangeType.ADD).toBe('add');
    expect(ChangeType.CHANGE).toBe('change');
    expect(ChangeType.DELETE).toBe('delete');
  });

  test('should have dimension weights', () => {
    expect(Dimension.BASIC_COMPLETENESS).toBe('basicCompleteness');
    expect(Dimension.STANDARD_COMPLIANCE).toBe('standardCompliance');
    expect(Dimension.CONTENT_ACCURACY).toBe('contentAccuracy');
    expect(Dimension.EXTENSION_COMPLETENESS).toBe('extensionCompleteness');
  });
});
