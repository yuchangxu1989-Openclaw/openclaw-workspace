/**
 * @file tests/phase3-quick-test.js
 * @description 阶段3快速验证脚本
 */

import { createDTOAdapter } from '../lib/lto-adapter.js';
import { createEvoMapClient } from '../lib/evomap-client.js';
import { createPipeline } from '../index.js';
import fs from 'fs';

console.log('🧪 SEEF EvoMap进化流水线 - 阶段3集成层快速验证\n');

async function runTests() {
  const results = [];

  // 测试1: DTO适配器
  console.log('📋 测试1: DTO适配器');
  try {
    const adapter = createDTOAdapter({
      autoTrigger: true,
      iscRulesPath: '/root/.openclaw/workspace/skills/isc-core/rules'
    });

    // 获取ISC规则
    const rule = adapter.getISCRule();
    console.log('  ✓ ISC规则ID:', rule.id);
    console.log('  ✓ 规则名称:', rule.name);
    console.log('  ✓ 触发类型:', rule.trigger.type);
    console.log('  ✓ 事件源:', rule.trigger.sources.join(', '));

    // 初始化（创建规则文件）
    await adapter.initialize();
    console.log('  ✓ DTO适配器初始化成功');

    // 检查规则文件
    const rulePath = '/root/.openclaw/workspace/skills/isc-core/rules/rule.skill.evolution.auto-trigger.json';
    if (fs.existsSync(rulePath)) {
      console.log('  ✓ ISC规则文件已创建');
    }

    // 获取统计
    const stats = adapter.getStats();
    console.log('  ✓ 自动触发:', stats.autoTrigger);

    results.push({ test: 'DTO适配器', status: 'PASS' });
  } catch (error) {
    console.log('  ✗ DTO适配器测试失败:', error.message);
    results.push({ test: 'DTO适配器', status: 'FAIL', error: error.message });
  }

  console.log();

  // 测试2: EvoMap客户端
  console.log('📋 测试2: EvoMap客户端');
  try {
    const client = createEvoMapClient({
      offlineMode: true,
      maxRetries: 3
    });

    // 初始化
    await client.initialize();
    console.log('  ✓ EvoMap客户端初始化成功（离线模式）');

    // 解析SKILL.md
    const skillContent = `---
name: test-skill
description: 测试技能
version: "1.0.0"
author: Test Author
tags: [test, demo]
---

# Test Skill
This is a test skill.
`;
    const metadata = client.parseSkillMetadata(skillContent);
    console.log('  ✓ SKILL.md解析成功');
    console.log('    - 名称:', metadata.name);
    console.log('    - 版本:', metadata.version);
    console.log('    - 作者:', metadata.author);

    // 构建Gene
    const skill = {
      skillId: 'test-skill',
      skillName: 'Test Skill',
      version: '1.0.0',
      description: 'A test skill',
      iscScore: 85,
      content: skillContent
    };
    const gene = client._buildGeneFromSkill(skill);
    console.log('  ✓ Gene构建成功');
    console.log('    - Gene类型:', gene.type);
    console.log('    - 元数据技能ID:', gene.metadata.skillId);
    console.log('    - ISC分数:', gene.metadata.iscScore);

    // 获取统计
    const stats = client.getStats();
    console.log('  ✓ 离线模式:', stats.isOfflineMode);

    results.push({ test: 'EvoMap客户端', status: 'PASS' });
  } catch (error) {
    console.log('  ✗ EvoMap客户端测试失败:', error.message);
    results.push({ test: 'EvoMap客户端', status: 'FAIL', error: error.message });
  }

  console.log();

  // 测试3: 流水线主控
  console.log('📋 测试3: 流水线主控');
  try {
    const pipeline = createPipeline({
      pipelineId: 'test-pipeline-001',
      integration: {
        lto: { enabled: false },
        evomap: { enabled: false },
        cras: { enabled: false }
      }
    });

    console.log('  ✓ 流水线实例创建成功');
    console.log('  ✓ 流水线ID:', pipeline.pipelineId);

    // 获取统计
    const stats = pipeline.getStats();
    console.log('  ✓ 流水线状态:', stats.isInitialized ? '已初始化' : '未初始化');
    console.log('  ✓ 运行状态:', stats.isRunning ? '运行中' : '已停止');

    // 构建阶段
    const stages = pipeline._buildStages({ skillId: 'test-skill' });
    console.log('  ✓ 执行阶段构建成功');
    console.log('    - 阶段数量:', stages.length);
    console.log('    - 阶段列表:', stages.map(s => s.id).join(' → '));

    results.push({ test: '流水线主控', status: 'PASS' });
  } catch (error) {
    console.log('  ✗ 流水线主控测试失败:', error.message);
    results.push({ test: '流水线主控', status: 'FAIL', error: error.message });
  }

  console.log();

  // 测试4: 配置文件
  console.log('📋 测试4: 配置文件');
  try {
    const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
    console.log('  ✓ 配置文件加载成功');
    console.log('  ✓ 技能ID:', config.isc.skillId);
    console.log('  ✓ 缩写:', config.isc.abbreviation);
    console.log('  ✓ DTO集成:', config.integration.lto.enabled ? '启用' : '禁用');
    console.log('  ✓ EvoMap集成:', config.integration.evomap.enabled ? '启用' : '禁用');
    console.log('  ✓ 自动触发:', config.pipeline.autoTrigger ? '启用' : '禁用');
    console.log('  ✓ 最大并发:', config.pipeline.maxConcurrent);
    console.log('  ✓ 重试次数:', config.retry.maxAttempts);

    results.push({ test: '配置文件', status: 'PASS' });
  } catch (error) {
    console.log('  ✗ 配置文件测试失败:', error.message);
    results.push({ test: '配置文件', status: 'FAIL', error: error.message });
  }

  // 总结
  console.log('\n' + '='.repeat(50));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(50));
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} ${r.test}: ${r.status}`);
    if (r.error) {
      console.log(`   错误: ${r.error}`);
    }
  });
  
  console.log('-'.repeat(50));
  console.log(`总计: ${results.length} 项 | 通过: ${passed} | 失败: ${failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 阶段3集成层验证全部通过！');
  } else {
    console.log('\n⚠️ 部分测试未通过，请检查错误信息。');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
