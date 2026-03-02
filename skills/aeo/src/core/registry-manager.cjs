/**
 * Evaluation Set Registry Manager - 评测集注册表管理器
 * @version 1.0.0
 * @description ISC标准评测集管理工具
 */

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '../unified-evaluation-sets/registry.json');

/**
 * 评测集注册管理器
 */
class EvaluationSetRegistry {
  constructor() {
    this.registry = this._loadRegistry();
  }

  /**
   * 加载注册表
   */
  _loadRegistry() {
    if (fs.existsSync(REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    }
    return this._createEmptyRegistry();
  }

  /**
   * 创建空注册表
   */
  _createEmptyRegistry() {
    return {
      $schema: "isc://evaluation-set-registry.schema.json",
      version: "1.0.0",
      description: "AEO统一评测集注册表 - ISC标准格式",
      registryMetadata: {
        maintainer: "AEO",
        lastUpdated: new Date().toISOString(),
        totalSets: 0,
        goldenStandardCount: 0
      },
      indexing: {
        bySkill: {},
        byTrack: {
          "ai-effect": [],
          "functional-quality": [],
          "hybrid": []
        },
        byStandard: {
          golden: [],
          standard: [],
          experimental: []
        }
      },
      sets: {}
    };
  }

  /**
   * 保存注册表
   */
  _saveRegistry() {
    this.registry.registryMetadata.lastUpdated = new Date().toISOString();
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(this.registry, null, 2));
  }

  /**
   * 注册新评测集
   */
  register(config) {
    const { 
      skillName, 
      track, 
      standard = 'standard',
      name,
      description,
      testCases = [],
      dimensions = [],
      dtoSubscriptionId = null,
      location = { type: 'file' }
    } = config;

    // 生成ID
    const existingIds = Object.keys(this.registry.sets)
      .filter(id => id.startsWith(`eval.${skillName}.`));
    const sequence = (existingIds.length + 1).toString().padStart(3, '0');
    const id = `eval.${skillName}.${sequence}`;

    // 构建评测集定义
    const evaluationSet = {
      id,
      name: name || `${skillName}评测集${sequence}`,
      targetSkill: skillName,
      track,
      standard,
      location: {
        type: location.type,
        path: location.type === 'file' ? `${id}.json` : location.path
      },
      metadata: {
        description: description || `技能 ${skillName} 的${track === 'ai-effect' ? 'AI效果' : '功能质量'}评测集`,
        author: config.author || 'system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: '1.0.0',
        testCaseCount: testCases.length
      },
      dimensions: dimensions.length > 0 ? dimensions : this._getDefaultDimensions(track),
      dtoMapping: dtoSubscriptionId ? {
        subscriptionId: dtoSubscriptionId,
        autoTrigger: true
      } : null
    };

    // 如果是内联存储，直接包含测试用例
    if (location.type === 'inline' && testCases.length > 0) {
      evaluationSet.testCases = testCases.slice(0, 10);  // 最多10个
    }

    // 添加到注册表
    this.registry.sets[id] = evaluationSet;
    
    // 更新索引
    this._updateIndex(id, evaluationSet);
    
    // 更新统计
    this.registry.registryMetadata.totalSets++;
    if (standard === 'golden') {
      this.registry.registryMetadata.goldenStandardCount++;
    }

    // 如果是文件存储，保存测试用例到独立文件
    if (location.type === 'file' && testCases.length > 0) {
      this._saveTestCasesToFile(id, testCases);
    }

    this._saveRegistry();
    
    console.log(`[Registry] Registered evaluation set: ${id}`);
    return evaluationSet;
  }

  /**
   * 更新索引
   */
  _updateIndex(id, evaluationSet) {
    // 按技能索引
    if (!this.registry.indexing.bySkill[evaluationSet.targetSkill]) {
      this.registry.indexing.bySkill[evaluationSet.targetSkill] = [];
    }
    if (!this.registry.indexing.bySkill[evaluationSet.targetSkill].includes(id)) {
      this.registry.indexing.bySkill[evaluationSet.targetSkill].push(id);
    }

    // 按轨道索引
    if (!this.registry.indexing.byTrack[evaluationSet.track].includes(id)) {
      this.registry.indexing.byTrack[evaluationSet.track].push(id);
    }

    // 按标准级别索引
    if (!this.registry.indexing.byStandard[evaluationSet.standard].includes(id)) {
      this.registry.indexing.byStandard[evaluationSet.standard].push(id);
    }
  }

  /**
   * 保存测试用例到文件
   */
  _saveTestCasesToFile(id, testCases) {
    const filePath = path.join(
      path.dirname(REGISTRY_PATH),
      `${id}.json`
    );
    
    fs.writeFileSync(filePath, JSON.stringify({
      evaluationSetId: id,
      testCases,
      generatedAt: new Date().toISOString()
    }, null, 2));
  }

  /**
   * 获取默认评测维度
   */
  _getDefaultDimensions(track) {
    if (track === 'ai-effect') {
      return [
        { name: 'relevance', weight: 0.25, threshold: 0.8 },
        { name: 'coherence', weight: 0.2, threshold: 0.75 },
        { name: 'helpfulness', weight: 0.25, threshold: 0.8 },
        { name: 'creativity', weight: 0.15, threshold: 0.6 },
        { name: 'safety', weight: 0.15, threshold: 0.9 }
      ];
    } else {
      return [
        { name: 'accuracy', weight: 0.3, threshold: 0.95 },
        { name: 'responseTime', weight: 0.2, threshold: 0.9 },
        { name: 'errorRate', weight: 0.25, threshold: 0.95 },
        { name: 'compatibility', weight: 0.15, threshold: 0.85 },
        { name: 'stability', weight: 0.1, threshold: 0.9 }
      ];
    }
  }

  /**
   * 查找评测集
   */
  find(query = {}) {
    const { skill, track, standard, id } = query;
    
    let results = Object.values(this.registry.sets);
    
    if (id) {
      return this.registry.sets[id] ? [this.registry.sets[id]] : [];
    }
    
    if (skill) {
      const skillIds = this.registry.indexing.bySkill[skill] || [];
      results = skillIds.map(id => this.registry.sets[id]).filter(Boolean);
    }
    
    if (track) {
      results = results.filter(s => s.track === track);
    }
    
    if (standard) {
      results = results.filter(s => s.standard === standard);
    }
    
    return results;
  }

  /**
   * 获取黄金标准评测集
   */
  getGoldenStandards(skill = null) {
    const goldenIds = this.registry.indexing.byStandard.golden || [];
    let results = goldenIds.map(id => this.registry.sets[id]).filter(Boolean);
    
    if (skill) {
      results = results.filter(s => s.targetSkill === skill);
    }
    
    return results;
  }

  /**
   * 获取评测集状态摘要
   */
  getSummary() {
    return {
      total: this.registry.registryMetadata.totalSets,
      golden: this.registry.registryMetadata.goldenStandardCount,
      byTrack: {
        'ai-effect': this.registry.indexing.byTrack['ai-effect'].length,
        'functional-quality': this.registry.indexing.byTrack['functional-quality'].length,
        'hybrid': this.registry.indexing.byTrack['hybrid'].length
      },
      byStandard: {
        golden: this.registry.indexing.byStandard.golden.length,
        standard: this.registry.indexing.byStandard.standard.length,
        experimental: this.registry.indexing.byStandard.experimental.length
      },
      skills: Object.keys(this.registry.indexing.bySkill).length
    };
  }

  /**
   * 加载测试用例
   */
  loadTestCases(evaluationSetId) {
    const evalSet = this.registry.sets[evaluationSetId];
    if (!evalSet) return null;

    // 内联存储
    if (evalSet.location.type === 'inline' && evalSet.testCases) {
      return evalSet.testCases;
    }

    // 文件存储
    if (evalSet.location.type === 'file') {
      const filePath = path.join(
        path.dirname(REGISTRY_PATH),
        evalSet.location.path
      );
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return data.testCases;
      }
    }

    return null;
  }
}

// ============================================================================
// CLI
// ============================================================================

function cli() {
  const command = process.argv[2];
  const registry = new EvaluationSetRegistry();

  switch (command) {
    case 'register':
      const result = registry.register({
        skillName: process.argv[3],
        track: process.argv[4] || 'functional-quality',
        standard: process.argv[5] || 'standard',
        name: process.argv[6]
      });
      console.log('Registered:', result.id);
      break;

    case 'list':
      const sets = registry.find();
      console.table(sets.map(s => ({
        id: s.id,
        name: s.name,
        skill: s.targetSkill,
        track: s.track,
        standard: s.standard
      })));
      break;

    case 'summary':
      console.log(registry.getSummary());
      break;

    case 'golden':
      const golden = registry.getGoldenStandards(process.argv[3]);
      console.log('Golden Standards:', golden.map(s => s.id));
      break;

    default:
      console.log('Usage:');
      console.log('  node registry-manager.js register {skill} [track] [standard] [name]');
      console.log('  node registry-manager.js list');
      console.log('  node registry-manager.js summary');
      console.log('  node registry-manager.js golden [skill]');
  }
}

if (require.main === module) {
  cli();
}

module.exports = { EvaluationSetRegistry };
