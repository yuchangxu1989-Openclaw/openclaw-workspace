/**
 * ISC规则动态加载器
 * 从 /skills/isc-core/rules/ 动态扫描、解析、缓存ISC规则
 * 支持热更新 — 文件变更自动刷新，无需重启
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

const RULES_DIR = '/root/.openclaw/workspace/skills/isc-core/rules';
const SCAN_INTERVAL_MS = 30000; // 30秒轮询检测文件变更

/**
 * ISC规则动态加载器（单例）
 */
class ISCRuleLoader {
  constructor(rulesDir = RULES_DIR) {
    this.rulesDir = rulesDir;
    // 规则缓存: ruleId -> { rule, mtime, filePath }
    this._cache = new Map();
    // 按阶段分类索引: 'check-in' | 'checkpoint' | 'check-out' -> [ruleId, ...]
    this._phaseIndex = { 'check-in': [], 'checkpoint': [], 'check-out': [] };
    // 按domain分类索引
    this._domainIndex = {};
    // 按scope分类索引
    this._scopeIndex = {};
    // 文件指纹: filePath -> mtime
    this._fileFingerprints = new Map();
    // 是否已初始化
    this._initialized = false;
    // 轮询timer
    this._pollTimer = null;
    // 上次完整扫描时间
    this._lastScanTime = 0;
    // 加载统计
    this._stats = { loaded: 0, failed: 0, hotReloaded: 0, errors: [] };
  }

  /**
   * 初始化：首次加载所有规则 + 启动热更新轮询
   */
  async init() {
    if (this._initialized) return this;
    await this._fullScan();
    this._startPolling();
    this._initialized = true;
    return this;
  }

  /**
   * 销毁：停止轮询，清空缓存
   */
  destroy() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    this._cache.clear();
    this._fileFingerprints.clear();
    this._initialized = false;
  }

  // ─── 公开查询API ───────────────────────────────────

  /**
   * 获取所有已加载规则
   * @returns {Object[]}
   */
  getAllRules() {
    return Array.from(this._cache.values()).map(entry => entry.rule);
  }

  /**
   * 按ID获取规则
   * @param {string} ruleId
   * @returns {Object|null}
   */
  getRuleById(ruleId) {
    const entry = this._cache.get(ruleId);
    return entry ? entry.rule : null;
  }

  /**
   * 按验证阶段获取规则
   * 映射关系:
   *   admission / check-in  → 准入规则
   *   checkpoint             → 过程中检查规则
   *   checkout / check-out   → 准出规则
   * @param {string} phase - 'admission'|'check-in'|'checkout'|'check-out'|'checkpoint'
   * @returns {Object[]}
   */
  getRulesByPhase(phase) {
    const normalizedPhase = this._normalizePhase(phase);
    const ids = this._phaseIndex[normalizedPhase] || [];
    return ids.map(id => this._cache.get(id)?.rule).filter(Boolean);
  }

  /**
   * 按domain获取规则
   * @param {string} domain - 'quality'|'naming'|'process'|'security'|'orchestration'等
   * @returns {Object[]}
   */
  getRulesByDomain(domain) {
    const ids = this._domainIndex[domain] || [];
    return ids.map(id => this._cache.get(id)?.rule).filter(Boolean);
  }

  /**
   * 按scope获取规则
   * @param {string} scope - 'skill'|'system'|'isc'|'global'等
   * @returns {Object[]}
   */
  getRulesByScope(scope) {
    const ids = this._scopeIndex[scope] || [];
    return ids.map(id => this._cache.get(id)?.rule).filter(Boolean);
  }

  /**
   * 获取所有可自动执行的规则
   * @returns {Object[]}
   */
  getAutoExecutableRules() {
    return this.getAllRules().filter(rule => {
      const gov = rule.governance;
      return gov && gov.auto_execute === true;
    });
  }

  /**
   * 获取指定严重级别的规则
   * @param {string} severity - 'critical'|'high'|'medium'|'low'
   * @returns {Object[]}
   */
  getRulesBySeverity(severity) {
    return this.getAllRules().filter(rule =>
      (rule.severity || rule.priority || '').toLowerCase() === severity.toLowerCase()
    );
  }

  /**
   * 获取包含条件检查的规则（带 conditions/check_criteria/creation_gate）
   * @returns {Object[]}
   */
  getRulesWithConditions() {
    return this.getAllRules().filter(rule =>
      rule.conditions || rule.check_criteria || rule.creation_gate || rule.rules
    );
  }

  /**
   * 针对一个技能包评估所有适用规则
   * @param {Object} skillPackage - 技能包信息
   * @param {string} phase - 验证阶段
   * @returns {{ passed: boolean, results: Object[], score: number }}
   */
  evaluateRules(skillPackage, phase = 'checkout') {
    const phaseRules = this.getRulesByPhase(phase);
    // 合并：阶段规则 + scope=skill 且带可评估条件的规则（去重）
    const skillScopedRules = this.getRulesByScope('skill').filter(r =>
      r.check_criteria || r.conditions || r.threshold || r.rules || r.threatCategories
    );
    const seenIds = new Set(phaseRules.map(r => r.id));
    const merged = [...phaseRules];
    for (const r of skillScopedRules) {
      if (!seenIds.has(r.id)) {
        merged.push(r);
        seenIds.add(r.id);
      }
    }
    const skillRules = merged;

    const results = [];

    for (const rule of skillRules) {
      const result = this._evaluateSingleRule(rule, skillPackage);
      results.push(result);
    }

    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;
    const score = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 100;

    return {
      passed: results.every(r => r.passed || r.severity !== 'critical'),
      results,
      score,
      totalRules: totalCount,
      passedRules: passedCount,
      failedRules: totalCount - passedCount
    };
  }

  /**
   * 获取加载统计
   */
  getStats() {
    return {
      ...this._stats,
      cachedRules: this._cache.size,
      rulesDir: this.rulesDir,
      lastScanTime: this._lastScanTime,
      phaseDistribution: {
        'check-in': this._phaseIndex['check-in'].length,
        'checkpoint': this._phaseIndex['checkpoint'].length,
        'check-out': this._phaseIndex['check-out'].length
      },
      domains: Object.keys(this._domainIndex)
    };
  }

  /**
   * 强制重新加载所有规则
   */
  async reload() {
    this._cache.clear();
    this._fileFingerprints.clear();
    this._resetIndices();
    this._stats = { loaded: 0, failed: 0, hotReloaded: 0, errors: [] };
    await this._fullScan();
    console.log(`[ISCRuleLoader] 强制重载完成: ${this._stats.loaded} 条规则`);
  }

  // ─── 内部方法 ───────────────────────────────────

  /**
   * 全量扫描规则目录
   */
  async _fullScan() {
    if (!fs.existsSync(this.rulesDir)) {
      console.warn(`[ISCRuleLoader] 规则目录不存在: ${this.rulesDir}`);
      return;
    }

    const files = fs.readdirSync(this.rulesDir)
      .filter(f => f.endsWith('.json'));

    this._resetIndices();

    for (const file of files) {
      const filePath = path.join(this.rulesDir, file);
      await this._loadRuleFile(filePath);
    }

    this._lastScanTime = Date.now();
    console.log(`[ISCRuleLoader] 扫描完成: ${this._stats.loaded} 条规则, ${this._stats.failed} 个失败`);
  }

  /**
   * 加载单个规则文件
   */
  async _loadRuleFile(filePath) {
    try {
      const stat = fs.statSync(filePath);
      const mtime = stat.mtimeMs;

      // 检查指纹：如果没变就跳过
      if (this._fileFingerprints.get(filePath) === mtime) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const rule = JSON.parse(content);

      // 提取规则ID（兼容多种格式）
      const ruleId = rule.id || path.basename(filePath, '.json');

      // 写入/更新缓存
      const isUpdate = this._cache.has(ruleId);
      this._cache.set(ruleId, { rule, mtime, filePath });
      this._fileFingerprints.set(filePath, mtime);

      // 更新索引
      this._indexRule(ruleId, rule);

      if (isUpdate) {
        this._stats.hotReloaded++;
        console.log(`[ISCRuleLoader] 热更新规则: ${ruleId}`);
      } else {
        this._stats.loaded++;
      }
    } catch (error) {
      this._stats.failed++;
      this._stats.errors.push({
        file: path.basename(filePath),
        error: error.message,
        time: Date.now()
      });
      // 只保留最近20条错误
      if (this._stats.errors.length > 20) {
        this._stats.errors = this._stats.errors.slice(-20);
      }
      console.warn(`[ISCRuleLoader] 加载失败 ${path.basename(filePath)}: ${error.message}`);
    }
  }

  /**
   * 建立规则索引
   */
  _indexRule(ruleId, rule) {
    // 1. 阶段索引
    const phase = this._detectPhase(rule);
    if (phase && this._phaseIndex[phase]) {
      if (!this._phaseIndex[phase].includes(ruleId)) {
        this._phaseIndex[phase].push(ruleId);
      }
    }

    // 2. domain索引
    const domain = rule.domain || 'unknown';
    if (!this._domainIndex[domain]) this._domainIndex[domain] = [];
    if (!this._domainIndex[domain].includes(ruleId)) {
      this._domainIndex[domain].push(ruleId);
    }

    // 3. scope索引
    const scope = rule.scope || 'global';
    if (!this._scopeIndex[scope]) this._scopeIndex[scope] = [];
    if (!this._scopeIndex[scope].includes(ruleId)) {
      this._scopeIndex[scope].push(ruleId);
    }
  }

  /**
   * 检测规则适用的验证阶段
   * 基于规则内容智能推断
   */
  _detectPhase(rule) {
    // 方式1: 规则显式声明了phase
    if (rule.phase) return this._normalizePhase(rule.phase);

    // 方式2: 从trigger.events推断
    if (rule.trigger && rule.trigger.events) {
      const events = rule.trigger.events.join(',').toLowerCase();
      if (events.includes('publish') || events.includes('sync') || events.includes('upload') || events.includes('checkout')) {
        return 'check-out';
      }
      if (events.includes('create') || events.includes('admission') || events.includes('checkin')) {
        return 'check-in';
      }
    }

    // 方式3: 从domain/type/description推断
    const text = `${rule.domain || ''} ${rule.type || ''} ${rule.description || ''} ${rule.name || ''}`.toLowerCase();

    // 准出类：质量检查、安全扫描、发布门禁
    if (text.includes('准出') || text.includes('checkout') || text.includes('check-out') ||
        text.includes('publish') || text.includes('security') || text.includes('安全扫描') ||
        text.includes('发布') || text.includes('gate') || text.includes('门禁')) {
      return 'check-out';
    }

    // 准入类：创建、命名、格式验证
    if (text.includes('准入') || text.includes('check-in') || text.includes('checkin') ||
        text.includes('creation') || text.includes('创建') || text.includes('admission') ||
        text.includes('naming') || text.includes('命名') || text.includes('format')) {
      return 'check-in';
    }

    // 过程检查类：质量、检测
    if (text.includes('checkpoint') || text.includes('detection') || text.includes('检测') ||
        text.includes('quality') || text.includes('质量')) {
      return 'checkpoint';
    }

    // 默认归类为checkpoint（过程中检查）
    return 'checkpoint';
  }

  /**
   * 标准化阶段名称
   */
  _normalizePhase(phase) {
    const phaseMap = {
      'admission': 'check-in',
      'check-in': 'check-in',
      'checkin': 'check-in',
      'checkpoint': 'checkpoint',
      'checkout': 'check-out',
      'check-out': 'check-out'
    };
    return phaseMap[phase.toLowerCase()] || 'checkpoint';
  }

  /**
   * 评估单条规则
   */
  _evaluateSingleRule(rule, skillPackage) {
    const result = {
      ruleId: rule.id || 'unknown',
      ruleName: rule.name || rule.description || 'unnamed',
      passed: true,
      severity: rule.severity || rule.priority || 'medium',
      violations: [],
      message: ''
    };

    try {
      // 评估 check_criteria
      if (rule.check_criteria) {
        this._evalCheckCriteria(rule.check_criteria, skillPackage, result);
      }

      // 评估 conditions (fact-based)
      if (rule.conditions) {
        this._evalConditions(rule.conditions, skillPackage, result);
      }

      // 评估 creation_gate
      if (rule.creation_gate && rule.creation_gate.before_create) {
        this._evalCreationGate(rule.creation_gate.before_create, skillPackage, result);
      }

      // 评估内联rules数组 (如 skill-mandatory-skill-md-001)
      if (rule.rules && Array.isArray(rule.rules)) {
        this._evalInlineRules(rule.rules, skillPackage, result);
      }

      // 评估 threshold（如 skill-md-quality-check）
      if (rule.threshold) {
        this._evalThreshold(rule.threshold, skillPackage, result);
      }

      // 评估 threatCategories（安全类规则）
      if (rule.threatCategories && rule.threatCategories.categories) {
        this._evalThreatCategories(rule.threatCategories.categories, skillPackage, result);
      }

      result.message = result.passed
        ? `规则 ${result.ruleId} 验证通过`
        : `规则 ${result.ruleId} 验证失败: ${result.violations.length} 项违规`;

    } catch (error) {
      result.passed = true; // 规则评估出错不阻塞，但记录
      result.message = `规则 ${result.ruleId} 评估异常: ${error.message}`;
    }

    return result;
  }

  /**
   * 评估 check_criteria（must_have / must_not_have）
   */
  _evalCheckCriteria(criteria, skillPackage, result) {
    if (criteria.must_have) {
      for (const requirement of criteria.must_have) {
        const reqLower = requirement.toLowerCase();
        let satisfied = true;

        if (reqLower.includes('skill.md') && reqLower.includes('存在')) {
          satisfied = skillPackage.hasSkillMd === true;
        } else if (reqLower.includes('可执行代码') || reqLower.includes('.js') || reqLower.includes('.py') || reqLower.includes('.sh')) {
          satisfied = skillPackage.hasEntry === true;
        } else if (reqLower.includes('实际逻辑') || reqLower.includes('不是空函数')) {
          satisfied = skillPackage.entryContent && skillPackage.entryContent.trim().length > 50;
        } else if (reqLower.includes('skill.md') && reqLower.includes('100字')) {
          satisfied = skillPackage.skillMdContent && skillPackage.skillMdContent.length > 100;
        }

        if (!satisfied) {
          result.passed = false;
          result.violations.push({ check: 'must_have', detail: requirement });
        }
      }
    }

    if (criteria.must_not_have) {
      for (const prohibition of criteria.must_not_have) {
        const prohibLower = prohibition.toLowerCase();
        let violated = false;

        if (prohibLower.includes('空目录')) {
          violated = !skillPackage.hasEntry && !skillPackage.hasSkillMd;
        } else if (prohibLower.includes('只有框架')) {
          violated = skillPackage.entryContent && skillPackage.entryContent.trim().length < 50;
        } else if (prohibLower.includes('只有标题')) {
          violated = skillPackage.skillMdContent &&
            skillPackage.skillMdContent.split('\n').filter(l => l.trim() && !l.startsWith('#')).length < 3;
        }

        if (violated) {
          result.passed = false;
          result.violations.push({ check: 'must_not_have', detail: prohibition });
        }
      }
    }
  }

  /**
   * 评估 conditions（fact-based规则引擎风格）
   */
  _evalConditions(conditions, skillPackage, result) {
    // conditions.all: 所有条件必须满足
    if (conditions.all && Array.isArray(conditions.all)) {
      for (const cond of conditions.all) {
        const factValue = this._resolveFact(cond.fact, skillPackage);
        const condPassed = this._evaluateOperator(factValue, cond.operator, cond.value);
        if (!condPassed) {
          result.passed = false;
          result.violations.push({
            check: 'condition',
            fact: cond.fact,
            expected: `${cond.operator} ${cond.value}`,
            actual: factValue
          });
        }
      }
    }

    // conditions.any: 任一条件满足即可
    if (conditions.any && Array.isArray(conditions.any)) {
      const anyPassed = conditions.any.some(cond => {
        const factValue = this._resolveFact(cond.fact, skillPackage);
        return this._evaluateOperator(factValue, cond.operator, cond.value);
      });
      if (!anyPassed && conditions.any.length > 0) {
        result.passed = false;
        result.violations.push({ check: 'condition_any', detail: 'No condition in "any" group was satisfied' });
      }
    }
  }

  /**
   * 从skillPackage解析fact值
   */
  _resolveFact(factPath, skillPackage) {
    if (!factPath) return undefined;

    const factMap = {
      'skill.hasSkillMd': skillPackage.hasSkillMd,
      'skill.hasEntry': skillPackage.hasEntry,
      'skill.hasPackageJson': skillPackage.hasPackageJson,
      'skill.fileCount': skillPackage.fileCount,
      'skill.totalSize': skillPackage.totalSize,
      'skill.security.scan': skillPackage.securityScanStatus || 'pending',
      'skill.security.threats': skillPackage.securityThreats || 0,
      'skill.documentation.length': skillPackage.skillMdContent ? skillPackage.skillMdContent.length : 0
    };

    return factMap[factPath] !== undefined ? factMap[factPath] : undefined;
  }

  /**
   * 运算符求值
   */
  _evaluateOperator(actual, operator, expected) {
    switch (operator) {
      case 'equal': return actual === expected;
      case 'notEqual': return actual !== expected;
      case 'greaterThan': return actual > expected;
      case 'greaterThanInclusive': return actual >= expected;
      case 'lessThan': return actual < expected;
      case 'lessThanInclusive': return actual <= expected;
      case 'in': return Array.isArray(expected) && expected.includes(actual);
      case 'notIn': return Array.isArray(expected) && !expected.includes(actual);
      case 'contains': return typeof actual === 'string' && actual.includes(expected);
      default: return true; // 未知运算符不阻塞
    }
  }

  /**
   * 评估 creation_gate
   */
  _evalCreationGate(steps, skillPackage, result) {
    for (const step of steps) {
      if (step.required_fields) {
        // schema验证类：检查skillPackage有对应信息
        // （此处为泛化检查，具体字段映射到skillPackage属性）
        if (step.check && step.check.includes('SKILL.md') && !skillPackage.hasSkillMd) {
          result.passed = false;
          result.violations.push({
            check: 'creation_gate',
            step: step.step,
            detail: step.error_message || step.reject_if
          });
        }
      }
    }
  }

  /**
   * 评估内联rules数组
   */
  _evalInlineRules(rules, skillPackage, result) {
    for (const subRule of rules) {
      if (!subRule.action) continue;

      const action = subRule.action;

      if (action.type === 'file_existence_check') {
        const required = action.required_file;
        if (required === 'SKILL.md' && !skillPackage.hasSkillMd) {
          result.passed = false;
          result.violations.push({
            check: subRule.id || 'inline_rule',
            detail: action.on_missing ? action.on_missing.message : `缺少必需文件: ${required}`
          });
        }
      }

      if (action.type === 'content_validation') {
        if (action.required_fields && skillPackage.skillMdContent) {
          for (const field of action.required_fields) {
            const fieldLower = field.toLowerCase();
            const hasField = skillPackage.skillMdContent.toLowerCase().includes(fieldLower);
            if (!hasField) {
              // content_validation失败为warning级别，不阻塞
              result.violations.push({
                check: subRule.id || 'inline_rule',
                detail: `SKILL.md 缺少字段: ${field}`,
                severity: 'warning'
              });
            }
          }
        }
      }
    }
  }

  /**
   * 评估 threshold（如文档最小长度）
   */
  _evalThreshold(threshold, skillPackage, result) {
    if (threshold.minLength && skillPackage.skillMdContent) {
      if (skillPackage.skillMdContent.length < threshold.minLength) {
        result.passed = false;
        result.violations.push({
          check: 'threshold_minLength',
          detail: `文档长度 ${skillPackage.skillMdContent.length} < 最低要求 ${threshold.minLength}`
        });
      }
    }

    if (threshold.requiredFields && skillPackage.skillMdContent) {
      for (const field of threshold.requiredFields) {
        if (!skillPackage.skillMdContent.toLowerCase().includes(field.toLowerCase())) {
          result.violations.push({
            check: 'threshold_requiredField',
            detail: `缺少必需字段: ${field}`,
            severity: 'warning'
          });
        }
      }
    }
  }

  /**
   * 评估威胁模式（安全规则）
   */
  _evalThreatCategories(categories, skillPackage, result) {
    if (!skillPackage.entryContent) return;

    for (const cat of categories) {
      if (!cat.patterns) continue;

      for (const pattern of cat.patterns) {
        try {
          const regex = new RegExp(pattern);
          if (regex.test(skillPackage.entryContent)) {
            const isCritical = cat.severity === 'critical';
            if (isCritical) {
              result.passed = false;
            }
            result.violations.push({
              check: 'threat_detection',
              threatId: cat.id,
              threatName: cat.name,
              severity: cat.severity,
              pattern: pattern,
              detail: `检测到 ${cat.name} 风险模式`
            });
          }
        } catch (e) {
          // 正则解析失败，跳过
        }
      }
    }
  }

  /**
   * 重置所有索引
   */
  _resetIndices() {
    this._phaseIndex = { 'check-in': [], 'checkpoint': [], 'check-out': [] };
    this._domainIndex = {};
    this._scopeIndex = {};
  }

  /**
   * 启动热更新轮询
   */
  _startPolling() {
    if (this._pollTimer) return;

    this._pollTimer = setInterval(async () => {
      await this._incrementalScan();
    }, SCAN_INTERVAL_MS);

    // 不阻止进程退出
    if (this._pollTimer.unref) {
      this._pollTimer.unref();
    }
  }

  /**
   * 增量扫描：只处理有变化的文件
   */
  async _incrementalScan() {
    if (!fs.existsSync(this.rulesDir)) return;

    try {
      const currentFiles = fs.readdirSync(this.rulesDir)
        .filter(f => f.endsWith('.json'))
        .map(f => path.join(this.rulesDir, f));

      // 检查新文件和修改的文件
      for (const filePath of currentFiles) {
        try {
          const stat = fs.statSync(filePath);
          const cachedMtime = this._fileFingerprints.get(filePath);
          if (cachedMtime !== stat.mtimeMs) {
            await this._loadRuleFile(filePath);
          }
        } catch (e) {
          // 文件读取失败，忽略
        }
      }

      // 检查删除的文件
      const currentFileSet = new Set(currentFiles);
      for (const [cachedPath] of this._fileFingerprints) {
        if (!currentFileSet.has(cachedPath)) {
          this._removeRuleByFilePath(cachedPath);
        }
      }
    } catch (error) {
      // 扫描异常不中断轮询
      console.warn(`[ISCRuleLoader] 增量扫描异常: ${error.message}`);
    }
  }

  /**
   * 按文件路径移除规则
   */
  _removeRuleByFilePath(filePath) {
    for (const [ruleId, entry] of this._cache) {
      if (entry.filePath === filePath) {
        this._cache.delete(ruleId);
        this._fileFingerprints.delete(filePath);
        // 从索引中清除
        this._removeFromIndices(ruleId);
        console.log(`[ISCRuleLoader] 规则已移除(文件删除): ${ruleId}`);
        break;
      }
    }
  }

  /**
   * 从所有索引中移除指定ruleId
   */
  _removeFromIndices(ruleId) {
    for (const phase in this._phaseIndex) {
      this._phaseIndex[phase] = this._phaseIndex[phase].filter(id => id !== ruleId);
    }
    for (const domain in this._domainIndex) {
      this._domainIndex[domain] = this._domainIndex[domain].filter(id => id !== ruleId);
    }
    for (const scope in this._scopeIndex) {
      this._scopeIndex[scope] = this._scopeIndex[scope].filter(id => id !== ruleId);
    }
  }
}

// ─── 单例导出 ─────────────────────────────────────

let _instance = null;

/**
 * 获取ISCRuleLoader单例
 * @param {string} [rulesDir] - 规则目录（仅首次有效）
 * @returns {ISCRuleLoader}
 */
function getInstance(rulesDir) {
  if (!_instance) {
    _instance = new ISCRuleLoader(rulesDir);
  }
  return _instance;
}

module.exports = {
  ISCRuleLoader,
  getInstance
};
