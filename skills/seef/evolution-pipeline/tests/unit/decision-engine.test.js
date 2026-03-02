/**
 * @fileoverview 决策引擎单元测试 - Decision Engine Test Suite
 * @description 测试不同评分下的决策正确性
 * @module DecisionEngineTests
 * @version 1.0.0
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { 
  PIPELINE_STATES, 
  STATE_TRANSITIONS,
  createStateManager 
} from '../../../src/core/state-manager.js';
import { PipelineEngine } from '../../../src/engine.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 模拟决策引擎
class DecisionEngine {
  constructor(config = {}) {
    this.config = {
      autoReviewThreshold: config.autoReviewThreshold || 80,
      autoReleaseThreshold: config.autoReleaseThreshold || 80,
      requireManualReview: config.requireManualReview ?? false,
      ...config
    };
    this.decisions = [];
  }

  /**
   * 基于ISC评分做出版本发布决策
   */
  makeReleaseDecision(iscScore, currentState, context = {}) {
    const decision = {
      timestamp: new Date().toISOString(),
      iscScore,
      currentState,
      action: null,
      reason: null,
      approved: false
    };

    // TEST -> REVIEW 决策
    if (currentState === PIPELINE_STATES.TEST) {
      if (iscScore >= this.config.autoReviewThreshold) {
        decision.action = 'TRANSITION_TO_REVIEW';
        decision.reason = `ISC评分 ${iscScore} >= 阈值 ${this.config.autoReviewThreshold}`;
        decision.approved = true;
      } else {
        decision.action = 'RETURN_TO_DEVELOP';
        decision.reason = `ISC评分 ${iscScore} < 阈值 ${this.config.autoReviewThreshold}`;
        decision.approved = false;
      }
    }
    // REVIEW -> RELEASE 决策
    else if (currentState === PIPELINE_STATES.REVIEW) {
      if (iscScore >= this.config.autoReleaseThreshold && !this.config.requireManualReview) {
        decision.action = 'AUTO_APPROVE_RELEASE';
        decision.reason = `ISC评分 ${iscScore} >= 阈值 ${this.config.autoReleaseThreshold}，自动审批`;
        decision.approved = true;
      } else if (iscScore >= this.config.autoReleaseThreshold) {
        decision.action = 'WAIT_MANUAL_APPROVAL';
        decision.reason = `ISC评分达标但需要人工审批`;
        decision.approved = false;
      } else {
        decision.action = 'REJECT_RELEASE';
        decision.reason = `ISC评分 ${iscScore} < 阈值 ${this.config.autoReleaseThreshold}`;
        decision.approved = false;
      }
    }
    // FAILED -> 重试决策
    else if (currentState === PIPELINE_STATES.FAILED) {
      const retryCount = context.retryCount || 0;
      const maxRetries = context.maxRetries || 3;
      
      if (retryCount < maxRetries) {
        decision.action = 'RETRY_SYNC';
        decision.reason = `重试同步 (${retryCount + 1}/${maxRetries})`;
        decision.approved = true;
      } else {
        decision.action = 'ABORT';
        decision.reason = `重试次数耗尽 (${maxRetries})`;
        decision.approved = false;
      }
    }
    else {
      decision.action = 'NO_ACTION';
      decision.reason = `当前状态 ${currentState} 无需决策`;
    }

    this.decisions.push(decision);
    return decision;
  }

  /**
   * 基于技能类型做出版本策略决策
   */
  makeVersionStrategyDecision(skillType, currentVersion, changeType) {
    const parts = currentVersion.split('.').map(Number);
    let [major, minor, patch] = parts;

    const decision = {
      currentVersion,
      newVersion: null,
      strategy: null,
      reason: null
    };

    switch (changeType) {
      case 'breaking':
        major++;
        minor = 0;
        patch = 0;
        decision.strategy = 'MAJOR';
        decision.reason = '破坏性变更，升级主版本号';
        break;
      case 'feature':
        minor++;
        patch = 0;
        decision.strategy = 'MINOR';
        decision.reason = '新功能，升级次版本号';
        break;
      case 'patch':
      default:
        patch++;
        if (patch > 99) {
          patch = 0;
          minor++;
        }
        if (minor > 99) {
          minor = 0;
          major++;
        }
        decision.strategy = 'PATCH';
        decision.reason = '补丁修复，升级修订版本号';
    }

    decision.newVersion = `${major}.${minor}.${patch}`;
    return decision;
  }

  /**
   * 基于风险评估做出部署决策
   */
  makeDeploymentDecision(riskLevel, environment, context = {}) {
    const decision = {
      riskLevel,
      environment,
      approved: false,
      precautions: [],
      reason: null
    };

    switch (riskLevel) {
      case 'low':
        decision.approved = true;
        decision.reason = '低风险，可直接部署';
        break;
      case 'medium':
        decision.approved = true;
        decision.precautions.push('建议在低峰期部署');
        decision.precautions.push('部署后密切监控');
        decision.reason = '中等风险，需要基本预防措施';
        break;
      case 'high':
        decision.approved = context.forceDeploy === true;
        decision.precautions.push('必须有人值守');
        decision.precautions.push('准备回滚方案');
        decision.precautions.push('先在staging环境验证');
        decision.reason = decision.approved 
          ? '高风险，强制部署（需要确认）' 
          : '高风险，建议暂缓部署';
        break;
      case 'critical':
        decision.approved = false;
        decision.precautions.push('禁止自动部署');
        decision.precautions.push('需要架构评审');
        decision.precautions.push('制定详细部署计划');
        decision.reason = '极高风险，禁止自动部署';
        break;
    }

    return decision;
  }

  /**
   * 基于依赖分析做出升级决策
   */
  makeUpgradeDecision(currentDependencies, availableUpdates) {
    const decisions = [];

    for (const [dep, currentVersion] of Object.entries(currentDependencies)) {
      const available = availableUpdates[dep];
      
      if (!available) continue;

      const decision = {
        dependency: dep,
        currentVersion,
        availableVersion: available.version,
        action: 'SKIP',
        reason: null
      };

      // 语义化版本比较
      const current = currentVersion.replace(/^v/, '').split('.').map(Number);
      const latest = available.version.replace(/^v/, '').split('.').map(Number);

      // 主版本变更 = 破坏性更新
      if (latest[0] > current[0]) {
        decision.action = 'REVIEW_REQUIRED';
        decision.reason = `主版本升级 ${currentVersion} -> ${available.version}，需要审查`;
      }
      // 次版本变更 = 新功能
      else if (latest[1] > current[1]) {
        if (available.securityFix) {
          decision.action = 'UPGRADE';
          decision.reason = `包含安全修复的新版本`;
        } else {
          decision.action = 'CONSIDER';
          decision.reason = `有新功能可用`;
        }
      }
      // 修订版本变更 = bug修复
      else if (latest[2] > current[2]) {
        decision.action = 'UPGRADE';
        decision.reason = `Bug修复版本`;
      }

      decisions.push(decision);
    }

    return decisions;
  }

  /**
   * 获取决策历史
   */
  getDecisionHistory() {
    return [...this.decisions];
  }

  /**
   * 清除决策历史
   */
  clearHistory() {
    this.decisions = [];
  }
}

describe('决策引擎单元测试', () => {
  let decisionEngine;
  let stateManager;
  let tempDir;

  beforeEach(() => {
    decisionEngine = new DecisionEngine();
    tempDir = path.join(__dirname, '../fixtures/temp-decision-test');
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 创建临时状态管理器
    const statePath = path.join(tempDir, 'state');
    fs.mkdirSync(statePath, { recursive: true });
    stateManager = createStateManager({ statePath });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('TEST -> REVIEW 决策', () => {
    test('ISC评分>=80应该自动进入REVIEW', () => {
      const decision = decisionEngine.makeReleaseDecision(85, PIPELINE_STATES.TEST);
      
      expect(decision.action).toBe('TRANSITION_TO_REVIEW');
      expect(decision.approved).toBe(true);
      expect(decision.reason).toContain('85');
    });

    test('ISC评分<80应该返回DEVELOP', () => {
      const decision = decisionEngine.makeReleaseDecision(65, PIPELINE_STATES.TEST);
      
      expect(decision.action).toBe('RETURN_TO_DEVELOP');
      expect(decision.approved).toBe(false);
    });

    test('ISC评分刚好等于阈值应该通过', () => {
      const decision = decisionEngine.makeReleaseDecision(80, PIPELINE_STATES.TEST);
      
      expect(decision.action).toBe('TRANSITION_TO_REVIEW');
      expect(decision.approved).toBe(true);
    });

    test('自定义阈值应该生效', () => {
      const customEngine = new DecisionEngine({ autoReviewThreshold: 75 });
      const decision = customEngine.makeReleaseDecision(76, PIPELINE_STATES.TEST);
      
      expect(decision.action).toBe('TRANSITION_TO_REVIEW');
    });
  });

  describe('REVIEW -> RELEASE 决策', () => {
    test('高分且无需人工审批应该自动发布', () => {
      const decision = decisionEngine.makeReleaseDecision(85, PIPELINE_STATES.REVIEW);
      
      expect(decision.action).toBe('AUTO_APPROVE_RELEASE');
      expect(decision.approved).toBe(true);
    });

    test('高分但需要人工审批应该等待', () => {
      const manualEngine = new DecisionEngine({ requireManualReview: true });
      const decision = manualEngine.makeReleaseDecision(85, PIPELINE_STATES.REVIEW);
      
      expect(decision.action).toBe('WAIT_MANUAL_APPROVAL');
      expect(decision.approved).toBe(false);
    });

    test('低分应该拒绝发布', () => {
      const decision = decisionEngine.makeReleaseDecision(65, PIPELINE_STATES.REVIEW);
      
      expect(decision.action).toBe('REJECT_RELEASE');
      expect(decision.approved).toBe(false);
    });
  });

  describe('FAILED -> 重试决策', () => {
    test('未达到最大重试次数应该重试', () => {
      const decision = decisionEngine.makeReleaseDecision(0, PIPELINE_STATES.FAILED, {
        retryCount: 1,
        maxRetries: 3
      });
      
      expect(decision.action).toBe('RETRY_SYNC');
      expect(decision.approved).toBe(true);
    });

    test('达到最大重试次数应该中止', () => {
      const decision = decisionEngine.makeReleaseDecision(0, PIPELINE_STATES.FAILED, {
        retryCount: 3,
        maxRetries: 3
      });
      
      expect(decision.action).toBe('ABORT');
      expect(decision.approved).toBe(false);
    });

    test('第一次失败应该重试', () => {
      const decision = decisionEngine.makeReleaseDecision(0, PIPELINE_STATES.FAILED, {
        retryCount: 0,
        maxRetries: 3
      });
      
      expect(decision.reason).toContain('1/3');
    });
  });

  describe('版本策略决策', () => {
    test('破坏性变更应该升级主版本号', () => {
      const decision = decisionEngine.makeVersionStrategyDecision(
        'core', '1.2.3', 'breaking'
      );
      
      expect(decision.strategy).toBe('MAJOR');
      expect(decision.newVersion).toBe('2.0.0');
    });

    test('新功能应该升级次版本号', () => {
      const decision = decisionEngine.makeVersionStrategyDecision(
        'feature', '1.2.3', 'feature'
      );
      
      expect(decision.strategy).toBe('MINOR');
      expect(decision.newVersion).toBe('1.3.0');
    });

    test('补丁修复应该升级修订版本号', () => {
      const decision = decisionEngine.makeVersionStrategyDecision(
        'patch', '1.2.3', 'patch'
      );
      
      expect(decision.strategy).toBe('PATCH');
      expect(decision.newVersion).toBe('1.2.4');
    });

    test('修订版本号超过99应该进位', () => {
      const decision = decisionEngine.makeVersionStrategyDecision(
        'patch', '1.2.99', 'patch'
      );
      
      expect(decision.newVersion).toBe('1.3.0');
    });

    test('次版本号超过99应该进位到主版本', () => {
      const decision = decisionEngine.makeVersionStrategyDecision(
        'feature', '1.99.0', 'feature'
      );
      
      expect(decision.newVersion).toBe('2.0.0');
    });
  });

  describe('部署风险决策', () => {
    test('低风险应该直接批准部署', () => {
      const decision = decisionEngine.makeDeploymentDecision('low', 'production');
      
      expect(decision.approved).toBe(true);
      expect(decision.precautions).toHaveLength(0);
    });

    test('中等风险应该批准但附带预防措施', () => {
      const decision = decisionEngine.makeDeploymentDecision('medium', 'production');
      
      expect(decision.approved).toBe(true);
      expect(decision.precautions.length).toBeGreaterThan(0);
    });

    test('高风险默认应该拒绝', () => {
      const decision = decisionEngine.makeDeploymentDecision('high', 'production');
      
      expect(decision.approved).toBe(false);
      expect(decision.precautions.length).toBeGreaterThan(0);
    });

    test('高风险强制部署应该批准', () => {
      const decision = decisionEngine.makeDeploymentDecision('high', 'production', {
        forceDeploy: true
      });
      
      expect(decision.approved).toBe(true);
    });

    test('极高风险应该始终拒绝', () => {
      const decision = decisionEngine.makeDeploymentDecision('critical', 'production', {
        forceDeploy: true
      });
      
      expect(decision.approved).toBe(false);
    });
  });

  describe('依赖升级决策', () => {
    test('主版本升级应该需要审查', () => {
      const decisions = decisionEngine.makeUpgradeDecision(
        { 'dep-a': '1.0.0' },
        { 'dep-a': { version: '2.0.0' } }
      );
      
      expect(decisions[0].action).toBe('REVIEW_REQUIRED');
    });

    test('安全修复应该建议升级', () => {
      const decisions = decisionEngine.makeUpgradeDecision(
        { 'dep-a': '1.0.0' },
        { 'dep-a': { version: '1.1.0', securityFix: true } }
      );
      
      expect(decisions[0].action).toBe('UPGRADE');
    });

    test('普通新功能应该建议考虑', () => {
      const decisions = decisionEngine.makeUpgradeDecision(
        { 'dep-a': '1.0.0' },
        { 'dep-a': { version: '1.1.0', securityFix: false } }
      );
      
      expect(decisions[0].action).toBe('CONSIDER');
    });

    test('Bug修复应该直接升级', () => {
      const decisions = decisionEngine.makeUpgradeDecision(
        { 'dep-a': '1.0.0' },
        { 'dep-a': { version: '1.0.1' } }
      );
      
      expect(decisions[0].action).toBe('UPGRADE');
    });

    test('多个依赖应该分别决策', () => {
      const decisions = decisionEngine.makeUpgradeDecision(
        { 'dep-a': '1.0.0', 'dep-b': '2.0.0' },
        { 
          'dep-a': { version: '1.0.1' },
          'dep-b': { version: '3.0.0' }
        }
      );
      
      expect(decisions).toHaveLength(2);
      expect(decisions.find(d => d.dependency === 'dep-a').action).toBe('UPGRADE');
      expect(decisions.find(d => d.dependency === 'dep-b').action).toBe('REVIEW_REQUIRED');
    });
  });

  describe('决策历史记录', () => {
    test('应该记录所有决策', () => {
      decisionEngine.makeReleaseDecision(85, PIPELINE_STATES.TEST);
      decisionEngine.makeReleaseDecision(90, PIPELINE_STATES.REVIEW);
      decisionEngine.makeDeploymentDecision('low', 'production');
      
      const history = decisionEngine.getDecisionHistory();
      expect(history).toHaveLength(3);
    });

    test('getDecisionHistory应该返回副本', () => {
      decisionEngine.makeReleaseDecision(85, PIPELINE_STATES.TEST);
      const history = decisionEngine.getDecisionHistory();
      
      history.pop(); // 修改副本
      
      expect(decisionEngine.getDecisionHistory()).toHaveLength(1);
    });

    test('clearHistory应该清除所有历史', () => {
      decisionEngine.makeReleaseDecision(85, PIPELINE_STATES.TEST);
      decisionEngine.clearHistory();
      
      expect(decisionEngine.getDecisionHistory()).toHaveLength(0);
    });
  });

  describe('状态流转验证', () => {
    test('合法的TEST->REVIEW流转应该被允许', () => {
      expect(STATE_TRANSITIONS[PIPELINE_STATES.TEST]).toContain(PIPELINE_STATES.REVIEW);
    });

    test('非法的DEVELOP->ONLINE流转应该不被允许', () => {
      expect(STATE_TRANSITIONS[PIPELINE_STATES.DEVELOP]).not.toContain(PIPELINE_STATES.ONLINE);
    });

    test('所有状态都应该有定义的流转规则', () => {
      Object.values(PIPELINE_STATES).forEach(state => {
        expect(STATE_TRANSITIONS[state]).toBeDefined();
      });
    });
  });

  describe('边界条件', () => {
    test('ISC评分0分应该正确处理', () => {
      const decision = decisionEngine.makeReleaseDecision(0, PIPELINE_STATES.TEST);
      expect(decision.approved).toBe(false);
    });

    test('ISC评分100分应该正确处理', () => {
      const decision = decisionEngine.makeReleaseDecision(100, PIPELINE_STATES.TEST);
      expect(decision.approved).toBe(true);
    });

    test('负数评分应该正确处理', () => {
      const decision = decisionEngine.makeReleaseDecision(-10, PIPELINE_STATES.TEST);
      expect(decision.approved).toBe(false);
    });

    test('超过100分应该正确处理', () => {
      const decision = decisionEngine.makeReleaseDecision(150, PIPELINE_STATES.TEST);
      expect(decision.approved).toBe(true);
    });

    test('未知状态应该返回NO_ACTION', () => {
      const decision = decisionEngine.makeReleaseDecision(85, 'UNKNOWN_STATE');
      expect(decision.action).toBe('NO_ACTION');
    });
  });
});

export { DecisionEngine };
