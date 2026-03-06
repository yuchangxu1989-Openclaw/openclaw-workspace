/**
 * ISC智能标准中心 - 大成版
 * Intelligent Standards Center - Grand Integration Edition v3.0.0
 * 
 * 融合: USC v1.0.0 + ISC-Core v2.1.0 + SCNM v4 精华
 * 归属: PCEC (周期性认知进化周期) - 基础设施层
 * 
 * 六大能力:
 * 1. 标准定义 (Standard Definition)
 * 2. 标准生成 (Standard Generation)
 * 3. 标准分发 (Standard Distribution)
 * 4. 反思改进 (Reflective Improvement)
 * 5. 模板管理 (Template Management)
 * 6. 版本控制 (Version Control)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WORKSPACE } = require('../shared/paths');

// ============================================================
// ISC大成版配置
// ============================================================

const ISC_CONFIG = {
  version: '3.0.0',
  name: 'ISC-Core',
  fullName: 'ISC智能标准中心 - 大成版',
  description: '自主决策规则、自动化检测标准、统一命名规范的唯一管理源',
  layer: 'infrastructure',
  priority: 'critical',
  evolution: '融合USC v1.0.0 + ISC-Core v2.1.0 + SCNM v4精华',
  affiliation: 'PCEC (周期性认知进化周期)',
  
  schema: {
    name: 'isc.unified-standards.v3',
    format: 'json'
  },
  
  paths: {
    root: __dirname,
    rules: path.join(__dirname, 'rules'),
    rulesDecision: path.join(__dirname, 'rules/decision'),
    rulesDetection: path.join(__dirname, 'rules/detection'),
    rulesNaming: path.join(__dirname, 'rules/naming'),
    assets: path.join(__dirname, 'assets'),
    mechanisms: path.join(__dirname, 'assets/mechanisms'),
    genes: path.join(__dirname, 'assets/genes'),
    config: path.join(__dirname, 'config'),
    templates: path.join(__dirname, 'templates'),
    templateDefs: path.join(__dirname, 'templates/definitions'),
    versions: path.join(__dirname, 'versions'),
    workspace: WORKSPACE
  },
  
  // 5项自主决策规则 (R001-R005)
  decisionRules: {
    R001: {
      id: 'R001',
      name: 'auto_skillization',
      description: '自动技能化',
      condition: 'skill_quality_score >= 50',
      threshold: 50,
      priority: 9,
      action: 'trigger_auto_skillization_pipeline',
      category: 'automation'
    },
    R002: {
      id: 'R002',
      name: 'auto_vectorization',
      description: '自动向量化',
      condition: 'skill_md_exists AND not_vectorized',
      priority: 8,
      action: 'trigger_bge_m3_vectorization',
      category: 'automation'
    },
    R003: {
      id: 'R003',
      name: 'auto_evomap_sync',
      description: '自动EvoMap同步',
      condition: 'skill_created OR skill_updated',
      trigger: 'skill_lifecycle',
      priority: 7,
      action: 'sync_to_evomap_network',
      category: 'sync'
    },
    R004: {
      id: 'R004',
      name: 'auto_fix_high_severity',
      description: '自动修复高严重度问题',
      condition: 'severity == HIGH AND auto_fix_enabled',
      severity: 'HIGH',
      priority: 10,
      action: 'execute_auto_remediation',
      category: 'remediation'
    },
    R005: {
      id: 'R005',
      name: 'auto_readme_generation',
      description: '自动README生成',
      condition: 'readme_missing OR readme_length < 500',
      threshold: { minLength: 500 },
      priority: 6,
      action: 'generate_readme_with_badges',
      category: 'documentation'
    }
  },
  
  // 4项检测标准 (S001-S004)
  detectionStandards: {
    S001: {
      id: 'S001',
      name: 'skill_md_quality',
      description: 'SKILL.md质量检测',
      target: 'skill_documentation',
      criteria: 'min_length_200 AND has_name AND has_description',
      threshold: { minLength: 200, requiredFields: ['name', 'description'] },
      tool: 'regex+llm',
      category: 'quality'
    },
    S002: {
      id: 'S002',
      name: 'readme_quality',
      description: 'README质量检测',
      target: 'readme_documentation',
      criteria: 'min_length_500 AND recommended_badges AND recommended_toc',
      threshold: { minLength: 500, recommendations: ['badges', 'table_of_contents'] },
      tool: 'regex',
      category: 'quality'
    },
    S003: {
      id: 'S003',
      name: 'vectorization',
      description: '向量化状态检测',
      target: 'skill_vectors',
      criteria: 'bge_m3_embedded AND dimension_1024',
      threshold: { model: 'bge-m3', dimension: 1024 },
      tool: 'bge-m3',
      category: 'vectorization'
    },
    S004: {
      id: 'S004',
      name: 'evomap_sync',
      description: 'EvoMap同步状态检测',
      target: 'evomap_gene_files',
      criteria: 'gene_schema_v1_5_0 AND capsule_format',
      threshold: { schemaVersion: '1.5.0', format: 'gene-capsule' },
      tool: 'schema-validator',
      category: 'sync'
    }
  },
  
  // 5项命名规范 (N001-N005)
  namingStandards: {
    N001: {
      id: 'N001',
      name: 'skill-dir-naming',
      scope: 'skill-directory',
      pattern: 'kebab-case',
      regex: '^[a-z0-9]+(-[a-z0-9]+)*$',
      example: 'isc-document-quality',
      description: '技能目录名使用短横线连接的小写字母'
    },
    N002: {
      id: 'N002',
      name: 'file-naming',
      scope: 'code-files',
      pattern: 'camelCase|snake_case',
      example: 'standardDefinition.js / standard_definition.py',
      description: '代码文件使用驼峰或下划线命名'
    },
    N003: {
      id: 'N003',
      name: 'constants-naming',
      scope: 'constants',
      pattern: 'UPPER_SNAKE_CASE',
      regex: '^[A-Z][A-Z0-9_]*$',
      example: 'ISC_CONFIG',
      description: '常量使用全大写下划线分隔'
    },
    N004: {
      id: 'N004',
      name: 'gene-files-naming',
      scope: 'gene-files',
      pattern: 'gene_{id}.json',
      regex: '^gene_[a-z0-9]+\\.json$',
      example: 'gene_abc123.json',
      description: '基因文件使用gene_前缀和.json后缀'
    },
    N005: {
      id: 'N005',
      name: 'rule-id-naming',
      scope: 'rule-identifiers',
      pattern: '{type}_{snake_case}',
      regex: '^[a-z][a-z0-9_]*$',
      example: 'auto_skillization',
      description: '规则ID使用小写下划线分隔'
    }
  },
  
  // 10个分发目标
  distributionTargets: [
    { id: 'T001', name: 'auto-skillization-pipeline', type: 'pipeline', rules: ['R001'], format: 'json', sync: 'realtime' },
    { id: 'T002', name: 'unified-vector-service', type: 'service', rules: ['R002', 'S003'], format: 'json', sync: 'realtime' },
    { id: 'T003', name: 'pcec-orchestrator', type: 'orchestrator', rules: ['all_decision', 'all_detection'], format: 'json', sync: 'periodic' },
    { id: 'T004', name: 'agentic-decision-auto-aligner', type: 'aligner', rules: ['naming_standards', 'decision_rules'], format: 'json', sync: 'realtime' },
    { id: 'T005', name: 'arg-auto-trigger', type: 'trigger', rules: ['R004'], format: 'json', sync: 'event' },
    { id: 'T006', name: 'lep-executor', type: 'executor', rules: ['all'], format: 'json', sync: 'startup' },
    { id: 'T007', name: 'evolver-network', type: 'network', rules: ['all'], format: 'gene', sync: 'periodic' },
    { id: 'T008', name: 'pdca-pipeline', type: 'pipeline', rules: ['all'], format: 'json', phase: 'check', sync: 'phase' },
    { id: 'T009', name: 'cras-cognitive', type: 'cognitive', rules: ['all'], format: 'json', sync: 'subscription' },
    { id: 'T010', name: 'cars-insight', type: 'insight', rules: ['templates'], format: 'template', sync: 'subscription' }
  ],
  
  output: {
    format: 'text-lines',
    disableMarkdownTables: true,
    indent: '  ',
    separator: '='
  }
};

// ============================================================
// 能力一：标准定义层 (Standard Definition Layer)
// ============================================================

class StandardDefinitionLayer {
  constructor(config = ISC_CONFIG) {
    this.config = config;
    this.decisionRules = new Map();
    this.detectionStandards = new Map();
    this.namingStandards = new Map();
    this.version = config.version;
    this.loadExistingStandards();
  }

  loadExistingStandards() {
    // 加载内置标准
    this.loadBuiltInStandards();
    
    // 从文件加载已保存的标准
    const rulesPath = this.config.paths.rules;
    if (fs.existsSync(rulesPath)) {
      this.loadFromDirectory(rulesPath);
    }
  }

  loadBuiltInStandards() {
    // 加载5项决策规则
    for (const [id, rule] of Object.entries(this.config.decisionRules)) {
      this.decisionRules.set(id, { ...rule, type: 'decision-rule', builtin: true });
    }
    
    // 加载4项检测标准
    for (const [id, standard] of Object.entries(this.config.detectionStandards)) {
      this.detectionStandards.set(id, { ...standard, type: 'detection-standard', builtin: true });
    }
    
    // 加载5项命名规范
    for (const [id, naming] of Object.entries(this.config.namingStandards)) {
      this.namingStandards.set(id, { ...naming, type: 'naming-standard', builtin: true });
    }
  }

  loadFromDirectory(dirPath) {
    const loadRecursive = (dir) => {
      if (!fs.existsSync(dir)) return;
      
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          loadRecursive(fullPath);
        } else if (item.endsWith('.json')) {
          try {
            const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
            this.loadStandard(content);
          } catch (e) {
            console.error(`[ISC] 加载标准失败: ${fullPath}`, e.message);
          }
        }
      }
    };
    
    loadRecursive(dirPath);
  }

  loadStandard(content) {
    if (content.type === 'decision-rule') {
      this.decisionRules.set(content.id, content);
    } else if (content.type === 'detection-standard') {
      this.detectionStandards.set(content.id, content);
    } else if (content.type === 'naming-standard') {
      this.namingStandards.set(content.id, content);
    }
  }

  // 定义决策规则
  defineDecisionRule(id, name, condition, action, priority = 5, options = {}) {
    const rule = {
      type: 'decision-rule',
      id,
      name,
      condition,
      action,
      priority,
      ...options,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'active',
      version: this.version
    };
    
    this.decisionRules.set(id, rule);
    this.saveStandard(rule);
    return rule;
  }

  // 定义检测标准
  defineDetectionStandard(id, name, target, criteria, threshold, options = {}) {
    const standard = {
      type: 'detection-standard',
      id,
      name,
      target,
      criteria,
      threshold,
      ...options,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'active',
      version: this.version
    };
    
    this.detectionStandards.set(id, standard);
    this.saveStandard(standard);
    return standard;
  }

  // 定义命名规范
  defineNamingStandard(id, name, scope, pattern, example, options = {}) {
    const naming = {
      type: 'naming-standard',
      id,
      name,
      scope,
      pattern,
      example,
      ...options,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'active',
      version: this.version
    };
    
    this.namingStandards.set(id, naming);
    this.saveStandard(naming);
    return naming;
  }

  saveStandard(standard) {
    let dirPath;
    if (standard.type === 'decision-rule') {
      dirPath = this.config.paths.rulesDecision;
    } else if (standard.type === 'detection-standard') {
      dirPath = this.config.paths.rulesDetection;
    } else if (standard.type === 'naming-standard') {
      dirPath = this.config.paths.rulesNaming;
    } else {
      dirPath = this.config.paths.rules;
    }
    
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    const filePath = path.join(dirPath, `${standard.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(standard, null, 2), 'utf-8');
  }

  // 获取规则
  getRule(idOrName) {
    // 先按ID查找
    if (this.decisionRules.has(idOrName)) {
      return this.decisionRules.get(idOrName);
    }
    // 再按名称查找
    for (const rule of this.decisionRules.values()) {
      if (rule.name === idOrName) {
        return rule;
      }
    }
    return null;
  }

  // 获取标准
  getStandard(idOrName) {
    if (this.detectionStandards.has(idOrName)) {
      return this.detectionStandards.get(idOrName);
    }
    for (const std of this.detectionStandards.values()) {
      if (std.name === idOrName) {
        return std;
      }
    }
    return null;
  }

  // 获取命名规范
  getNaming(idOrName) {
    if (this.namingStandards.has(idOrName)) {
      return this.namingStandards.get(idOrName);
    }
    for (const naming of this.namingStandards.values()) {
      if (naming.name === idOrName) {
        return naming;
      }
    }
    return null;
  }

  // 验证命名是否符合规范
  validateNaming(value, scope) {
    for (const naming of this.namingStandards.values()) {
      if (naming.scope === scope && naming.regex) {
        const regex = new RegExp(naming.regex);
        return regex.test(value);
      }
    }
    return true;
  }

  getReport() {
    const lines = [];
    lines.push('【ISC标准定义层报告】');
    lines.push(`版本: ${this.version}`);
    lines.push(`决策规则: ${this.decisionRules.size} 项 (内置5项)`);
    lines.push(`检测标准: ${this.detectionStandards.size} 项 (内置4项)`);
    lines.push(`命名规范: ${this.namingStandards.size} 项 (内置5项)`);
    lines.push('');
    
    lines.push('5项核心决策规则:');
    for (const [id, rule] of this.decisionRules) {
      if (rule.builtin) {
        lines.push(`  [P${rule.priority}] ${id} ${rule.name}`);
        lines.push(`    条件: ${rule.condition}`);
      }
    }
    
    lines.push('');
    lines.push('4项检测标准:');
    for (const [id, std] of this.detectionStandards) {
      if (std.builtin) {
        lines.push(`  ${id} ${std.name}`);
        lines.push(`    目标: ${std.target} | 工具: ${std.tool}`);
      }
    }
    
    return lines.join('\n');
  }
}

// ============================================================
// ISC-Core 主类 - 大成版
// ============================================================

class ISCCore {
  constructor(options = {}) {
