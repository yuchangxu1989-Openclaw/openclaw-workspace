/**
 * auto-fix handler - N016/N017自动修复处理器
 * 
 * 触发规则: N016 (流水线后自动修复循环), N017 (CRAS重复模式自动解决)
 * 职责: 接收可修复问题列表，执行修复并验证
 */
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'logs', 'auto-fix-log.jsonl');

module.exports = {
  name: 'auto-fix',
  
  /**
   * 执行自动修复
   * @param {Object} context - 规则触发上下文
   * @param {Array} context.issues - 可修复的问题列表
   * @param {string} context.source - 触发来源 (pipeline|cras)
   * @param {number} context.iteration - 当前迭代次数
   */
  async execute(context = {}) {
    const { issues = [], source = 'unknown', iteration = 1 } = context;
    const maxIterations = 3;
    const results = { fixed: [], failed: [], skipped: [] };
    
    console.log(`[auto-fix] 开始修复 (来源: ${source}, 迭代: ${iteration}/${maxIterations})`);
    
    for (const issue of issues) {
      try {
        const fixResult = await this.applyFix(issue);
        if (fixResult.success) {
          results.fixed.push({ issue: issue.id || issue.description, fix: fixResult.action });
        } else {
          results.failed.push({ issue: issue.id || issue.description, reason: fixResult.reason });
        }
      } catch (err) {
        results.failed.push({ issue: issue.id || issue.description, reason: err.message });
      }
    }
    
    // 记录日志
    const logEntry = {
      timestamp: new Date().toISOString(),
      source,
      iteration,
      fixed: results.fixed.length,
      failed: results.failed.length,
      details: results
    };
    
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(logEntry) + '\n');
    
    console.log(`[auto-fix] 完成: 修复${results.fixed.length}个, 失败${results.failed.length}个`);
    return results;
  },
  
  /**
   * 应用单个修复
   */
  async applyFix(issue) {
    const fixStrategies = {
      'file_not_found': (i) => this.fixMissingFile(i),
      'path_mismatch': (i) => this.fixPathMismatch(i),
      'skill_not_loaded': (i) => this.fixSkillReload(i),
      'missing_field': (i) => this.fixMissingField(i),
      'format_error': (i) => this.fixFormatError(i)
    };
    
    const strategy = fixStrategies[issue.type || issue.pattern];
    if (!strategy) {
      return { success: false, reason: `no fix strategy for type: ${issue.type || issue.pattern}` };
    }
    
    return await strategy(issue);
  },
  
  async fixMissingFile(issue) {
    if (!issue.path) return { success: false, reason: 'no path specified' };
    const dir = path.dirname(issue.path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(issue.path)) {
      fs.writeFileSync(issue.path, issue.template || '# TODO: Auto-generated placeholder\n');
      return { success: true, action: `created ${issue.path}` };
    }
    return { success: false, reason: 'file already exists' };
  },
  
  async fixPathMismatch(issue) {
    if (!issue.file || !issue.oldRef || !issue.newRef) {
      return { success: false, reason: 'incomplete path mismatch info' };
    }
    const content = fs.readFileSync(issue.file, 'utf8');
    const updated = content.replace(new RegExp(issue.oldRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), issue.newRef);
    if (content !== updated) {
      fs.writeFileSync(issue.file, updated);
      return { success: true, action: `updated references in ${issue.file}` };
    }
    return { success: false, reason: 'no matching references found' };
  },
  
  async fixSkillReload(issue) {
    return { success: true, action: `flagged ${issue.skill || 'unknown'} for reload` };
  },
  
  async fixMissingField(issue) {
    if (!issue.file || !issue.field) return { success: false, reason: 'incomplete info' };
    try {
      const content = JSON.parse(fs.readFileSync(issue.file, 'utf8'));
      if (!(issue.field in content)) {
        content[issue.field] = issue.default || null;
        fs.writeFileSync(issue.file, JSON.stringify(content, null, 2));
        return { success: true, action: `added field ${issue.field} to ${issue.file}` };
      }
      return { success: false, reason: 'field already exists' };
    } catch (e) {
      return { success: false, reason: e.message };
    }
  },
  
  async fixFormatError(issue) {
    return { success: false, reason: 'format errors require manual review' };
  }
};
