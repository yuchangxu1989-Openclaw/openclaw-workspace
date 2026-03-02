#!/usr/bin/env node
/**
 * 评测集统一迁移脚本
 * 将所有散落的评测集迁移到AEO统一目录
 * 按功能测试用例 / AI效果测试用例分类存放
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
  aeoEvalPath: '/root/.openclaw/workspace/skills/aeo/evaluation-sets',
  unifiedPath: '/root/.openclaw/workspace/skills/aeo/unified-evaluation-sets',
  sources: [
    { path: '/root/.openclaw/workspace/aeo-vector-system/test-data/test-cases.json', type: 'function', name: 'vector-system' },
    { path: '/root/.openclaw/workspace/infrastructure/mr/__tests__/test-cases.json', type: 'ai-effect', name: 'model-router' },
    { path: '/root/.openclaw/workspace/evolver/test', type: 'function', name: 'evolver-unit', isDir: true }
  ]
};

class EvaluationSetMigrator {
  constructor() {
    this.migrated = { function: [], aiEffect: [] };
  }

  async migrate() {
    console.log('[迁移] 开始统一评测集...');
    
    // 创建统一目录结构
    this.createUnifiedStructure();
    
    // 1. 迁移AEO-向量系统测试用例
    await this.migrateVectorSystem();
    
    // 2. 迁移模型路由测试用例
    await this.migrateModelRouter();
    
    // 3. 迁移Evolver单元测试
    await this.migrateEvolverTests();
    
    // 4. 整合所有技能的评测集
    await this.consolidateSkillEvaluations();
    
    console.log('[迁移] 完成！');
    console.log(`  - 功能测试用例: ${this.migrated.function.length} 个来源`);
    console.log(`  - AI效果测试用例: ${this.migrated.aiEffect.length} 个来源`);
    
    return this.migrated;
  }

  createUnifiedStructure() {
    const functionPath = path.join(CONFIG.unifiedPath, 'function-tests');
    const aiEffectPath = path.join(CONFIG.unifiedPath, 'ai-effect-tests');
    
    fs.mkdirSync(functionPath, { recursive: true });
    fs.mkdirSync(aiEffectPath, { recursive: true });
    
    console.log('[迁移] 创建统一目录结构');
  }

  async migrateVectorSystem() {
    const sourcePath = '/root/.openclaw/workspace/aeo-vector-system/test-data/test-cases.json';
    if (!fs.existsSync(sourcePath)) return;
    
    const cases = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const output = {
      source: 'aeo-vector-system',
      type: 'function',
      migratedAt: new Date().toISOString(),
      totalCases: cases.length,
      cases: cases.map(c => ({
        id: c.id,
        name: c.name,
        category: c.category,
        domain: c.domain,
        input: c.input,
        expected: c.expected,
        assertions: c.assertions
      }))
    };
    
    const outputPath = path.join(CONFIG.unifiedPath, 'function-tests', 'vector-system-cases.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    this.migrated.function.push('vector-system');
    console.log('[迁移] ✓ vector-system (10个测试用例)');
  }

  async migrateModelRouter() {
    const sourcePath = '/root/.openclaw/workspace/infrastructure/mr/__tests__/test-cases.json';
    if (!fs.existsSync(sourcePath)) return;
    
    const data = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const cases = data.testSuite.testCases;
    
    // 分类：推理/多模态 -> AI效果，其他->功能
    const aiEffectCases = cases.filter(c => 
      c.category === 'reasoning' || c.category === 'multimodal'
    );
    const functionCases = cases.filter(c => 
      c.category === 'general' || c.category === 'fallback_chain' || c.category === 'boundary'
    );
    
    // AI效果测试用例
    const aiEffectOutput = {
      source: 'model-router',
      type: 'ai-effect',
      migratedAt: new Date().toISOString(),
      totalCases: aiEffectCases.length,
      cases: aiEffectCases.map(c => ({
        id: c.id,
        name: c.name,
        category: c.category,
        input: c.input,
        expected: c.expected
      }))
    };
    
    fs.writeFileSync(
      path.join(CONFIG.unifiedPath, 'ai-effect-tests', 'model-router-cases.json'),
      JSON.stringify(aiEffectOutput, null, 2)
    );
    this.migrated.aiEffect.push('model-router');
    
    // 功能测试用例
    const functionOutput = {
      source: 'model-router',
      type: 'function',
      migratedAt: new Date().toISOString(),
      totalCases: functionCases.length,
      cases: functionCases.map(c => ({
        id: c.id,
        name: c.name,
        category: c.category,
        input: c.input,
        expected: c.expected
      }))
    };
    
    fs.writeFileSync(
      path.join(CONFIG.unifiedPath, 'function-tests', 'model-router-cases.json'),
      JSON.stringify(functionOutput, null, 2)
    );
    this.migrated.function.push('model-router');
    
    console.log(`[迁移] ✓ model-router (AI效果: ${aiEffectCases.length}, 功能: ${functionCases.length})`);
  }

  async migrateEvolverTests() {
    const testDir = '/root/.openclaw/workspace/evolver/test';
    if (!fs.existsSync(testDir)) return;
    
    const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js'));
    const cases = files.map(f => ({
      id: `evolver_${path.basename(f, '.test.js')}`,
      name: `Evolver ${path.basename(f, '.test.js')} 单元测试`,
      file: f,
      type: 'unit'
    }));
    
    const output = {
      source: 'evolver',
      type: 'function',
      migratedAt: new Date().toISOString(),
      totalCases: cases.length,
      cases: cases
    };
    
    fs.writeFileSync(
      path.join(CONFIG.unifiedPath, 'function-tests', 'evolver-unit-cases.json'),
      JSON.stringify(output, null, 2)
    );
    this.migrated.function.push('evolver-unit');
    console.log(`[迁移] ✓ evolver-unit (${cases.length}个测试文件)`);
  }

  async consolidateSkillEvaluations() {
    console.log('[迁移] 整合技能评测集...');
    
    const skills = fs.readdirSync(CONFIG.aeoEvalPath);
    let functionCount = 0;
    let aiEffectCount = 0;
    
    for (const skill of skills) {
      const skillPath = path.join(CONFIG.aeoEvalPath, skill);
      if (!fs.statSync(skillPath).isDirectory()) continue;
      
      const standardPath = path.join(skillPath, 'standard.json');
      if (!fs.existsSync(standardPath)) continue;
      
      const standard = JSON.parse(fs.readFileSync(standardPath, 'utf8'));
      
      // 根据类型分类
      if (standard.type === 'ai-effect') {
        aiEffectCount++;
      } else {
        functionCount++;
      }
    }
    
    // 创建索引文件
    const index = {
      updatedAt: new Date().toISOString(),
      summary: {
        functionTests: {
          totalSources: this.migrated.function.length + functionCount,
          migrated: this.migrated.function,
          skills: functionCount
        },
        aiEffectTests: {
          totalSources: this.migrated.aiEffect.length + aiEffectCount,
          migrated: this.migrated.aiEffect,
          skills: aiEffectCount
        }
      },
      paths: {
        functionTests: 'skills/aeo/unified-evaluation-sets/function-tests/',
        aiEffectTests: 'skills/aeo/unified-evaluation-sets/ai-effect-tests/'
      }
    };
    
    fs.writeFileSync(
      path.join(CONFIG.unifiedPath, 'index.json'),
      JSON.stringify(index, null, 2)
    );
    
    console.log(`[迁移] 技能评测集: ${functionCount}个功能 + ${aiEffectCount}个AI效果`);
  }
}

// 主执行
if (require.main === module) {
  const migrator = new EvaluationSetMigrator();
  migrator.migrate().catch(console.error);
}

module.exports = { EvaluationSetMigrator };
