/**
 * @file tests/integration-phase3.test.js
 * @description 阶段3集成层测试
 * @version 1.0.0
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// 导入被测模块
import { SEEFEvolutionPipeline, createPipeline } from '../index.js';
import { EvoMapClient, createEvoMapClient } from '../lib/evomap-client.js';
import { DTOAdapter, createDTOAdapter } from '../lib/dto-adapter.js';

describe('阶段3集成层测试', () => {
  describe('DTO适配器', () => {
    let adapter;

    beforeAll(() => {
      adapter = createDTOAdapter({
        autoTrigger: true,
        iscRulesPath: '/tmp/test-isc-rules'
      });
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.stop();
      }
      // 清理测试规则
      try {
        fs.rmSync('/tmp/test-isc-rules', { recursive: true });
      } catch {}
    });

    it('应该正确创建DTO适配器实例', () => {
      expect(adapter).toBeDefined();
      expect(adapter.config.autoTrigger).toBe(true);
      expect(adapter.config.subscriptionRules).toContain('skill.evolution.auto-trigger');
    });

    it('应该能获取ISC规则定义', () => {
      const rule = adapter.getISCRule();
      expect(rule).toBeDefined();
      expect(rule.id).toBe('skill.evolution.auto-trigger');
      expect(rule.name).toBe('技能进化自动触发');
      expect(rule.trigger.type).toBe('event');
    });

    it('应该能创建ISC规则文件', async () => {
      await adapter.initialize();
      
      const rulePath = path.join('/tmp/test-isc-rules', 'rule.skill.evolution.auto-trigger.json');
      expect(fs.existsSync(rulePath)).toBe(true);
      
      const savedRule = JSON.parse(fs.readFileSync(rulePath, 'utf-8'));
      expect(savedRule.id).toBe('skill.evolution.auto-trigger');
    });

    it('应该正确判断事件处理', () => {
      const event = {
        skillId: 'test-skill',
        changedFiles: ['SKILL.md', 'index.js'],
        metadata: { iscScore: 80 }
      };
      
      // 通过反射调用私有方法
      const shouldProcess = adapter._shouldProcessEvent(event);
      expect(shouldProcess).toBe(true);
    });

    it('应该能获取统计信息', () => {
      const stats = adapter.getStats();
      expect(stats).toHaveProperty('eventsReceived');
      expect(stats).toHaveProperty('eventsProcessed');
      expect(stats).toHaveProperty('isSubscribed');
      expect(stats).toHaveProperty('autoTrigger');
    });
  });

  describe('EvoMap客户端', () => {
    let client;

    beforeAll(() => {
      client = createEvoMapClient({
        offlineMode: true,
        maxRetries: 3
      });
    });

    it('应该正确创建EvoMap客户端实例', () => {
      expect(client).toBeDefined();
      expect(client.config.offlineMode).toBe(true);
      expect(client.config.maxRetries).toBe(3);
    });

    it('应该在离线模式下初始化', async () => {
      const result = await client.initialize();
      expect(result).toBe(false); // 离线模式返回false
      expect(client.config.offlineMode).toBe(true);
    });

    it('应该能解析SKILL.md元数据', () => {
      const content = `---
name: test-skill
description: 测试技能
version: "1.0.0"
author: OpenClaw
---

# Test Skill
`;
      const metadata = client.parseSkillMetadata(content);
      expect(metadata.name).toBe('test-skill');
      expect(metadata.description).toBe('测试技能');
      expect(metadata.version).toBe('1.0.0');
    });

    it('应该能构建Gene对象', () => {
      const skill = {
        skillId: 'test-skill',
        skillName: 'Test Skill',
        version: '1.0.0',
        description: 'A test skill',
        iscScore: 85
      };
      
      const gene = client._buildGeneFromSkill(skill);
      expect(gene).toBeDefined();
      expect(gene.type).toBe('Gene');
      expect(gene.metadata.skillId).toBe('test-skill');
      expect(gene.metadata.iscScore).toBe(85);
    });

    it('应该能获取统计信息', () => {
      const stats = client.getStats();
      expect(stats).toHaveProperty('isConnected');
      expect(stats).toHaveProperty('isOfflineMode');
      expect(stats).toHaveProperty('messageQueueSize');
    });
  });

  describe('流水线主控', () => {
    let pipeline;

    beforeAll(() => {
      pipeline = createPipeline({
        pipelineId: 'test-pipeline',
        dto: { enabled: false }, // 禁用DTO避免依赖
        evomap: { enabled: false } // 禁用EvoMap避免依赖
      });
    });

    afterAll(async () => {
      if (pipeline) {
        await pipeline.stop();
      }
    });

    it('应该正确创建流水线实例', () => {
      expect(pipeline).toBeDefined();
      expect(pipeline.pipelineId).toBe('test-pipeline');
      expect(pipeline.config).toBeDefined();
    });

    it('应该能获取流水线统计', () => {
      const stats = pipeline.getStats();
      expect(stats).toHaveProperty('totalRuns');
      expect(stats).toHaveProperty('successfulRuns');
      expect(stats).toHaveProperty('failedRuns');
      expect(stats).toHaveProperty('isRunning');
      expect(stats).toHaveProperty('isInitialized');
    });

    it('应该正确构建执行阶段', () => {
      const stages = pipeline._buildStages({ skillId: 'test-skill' });
      expect(stages).toBeDefined();
      expect(stages.length).toBeGreaterThanOrEqual(5);
      
      // 验证阶段名称
      const stageNames = stages.map(s => s.id);
      expect(stageNames).toContain('detect');
      expect(stageNames).toContain('analyze');
      expect(stageNames).toContain('evolve');
      expect(stageNames).toContain('validate');
      expect(stageNames).toContain('publish');
    });
  });

  describe('ISC规则文件', () => {
    const rulePath = '/root/.openclaw/workspace/skills/isc-core/rules/rule.skill.evolution.auto-trigger.json';

    it('ISC规则文件应该存在', () => {
      // 规则会在DTOAdapter初始化时创建
      expect(fs.existsSync('/root/.openclaw/workspace/skills/isc-core/rules')).toBe(true);
    });

    it('ISC规则结构应该正确', async () => {
      // 创建适配器来生成规则
      const adapter = createDTOAdapter({
        iscRulesPath: '/root/.openclaw/workspace/skills/isc-core/rules'
      });
      await adapter.initialize();

      expect(fs.existsSync(rulePath)).toBe(true);
      
      const rule = JSON.parse(fs.readFileSync(rulePath, 'utf-8'));
      expect(rule.id).toBe('skill.evolution.auto-trigger');
      expect(rule.trigger.type).toBe('event');
      expect(rule.action.type).toBe('pipeline.trigger');
      expect(rule.status).toBe('active');
    });
  });

  describe('配置文件', () => {
    const configPath = '/root/.openclaw/workspace/skills/seef/evolution-pipeline/config.json';

    it('配置文件应该存在', () => {
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('配置文件结构应该正确', () => {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      
      expect(config.name).toBe('seef-evolution-pipeline');
      expect(config.type).toBe('module');
      expect(config.isc.skillId).toBe('seef.evolution-pipeline');
      
      // 集成配置
      expect(config.integration.dto.enabled).toBe(true);
      expect(config.integration.evomap.enabled).toBe(true);
      expect(config.integration.cras.enabled).toBe(true);
      
      // 流水线配置
      expect(config.pipeline.stages).toContain('detect');
      expect(config.pipeline.stages).toContain('analyze');
      expect(config.pipeline.stages).toContain('sync');
      
      // 重试配置
      expect(config.retry.maxAttempts).toBe(3);
      expect(config.retry.backoffMultiplier).toBe(2);
    });
  });
});

console.log('✅ 阶段3集成层测试已定义');
