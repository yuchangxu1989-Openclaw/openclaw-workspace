/**
 * memory-loss-recovery handler - N036记忆丢失自主恢复处理器
 * 
 * 触发规则: N036 (记忆丢失后自主恢复)
 * 职责: 检测MEMORY.md/规则注册表缺失时，从文件系统自动重建
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || '/root/.openclaw/workspace';
const RULES_DIR = path.join(WORKSPACE, 'skills/isc-core/rules');
const REGISTRY_PATH = path.join(WORKSPACE, '.rule-registry.json');
const MEMORY_PATH = path.join(WORKSPACE, 'MEMORY.md');
const LOG_PATH = path.join(WORKSPACE, 'skills/isc-core/logs/memory-recovery-log.jsonl');

module.exports = {
  name: 'memory-loss-recovery',
  
  /**
   * 检测并执行恢复
   */
  async execute(context = {}) {
    const report = {
      timestamp: new Date().toISOString(),
      trigger: context.trigger || 'manual',
      phases: {},
      recovered_rules: 0,
      recovered_categories: 0,
      status: 'starting'
    };
    
    console.log('[N036] 🔄 启动记忆恢复检测...');
    
    // Phase 1: 检测是否需要恢复
    const needsRecovery = this.detectLoss();
    if (!needsRecovery.needed) {
      console.log('[N036] ✅ 记忆完整，无需恢复');
      report.status = 'not_needed';
      return report;
    }
    
    report.phases.detection = needsRecovery;
    console.log(`[N036] 检测到: ${needsRecovery.reasons.join(', ')}`);
    
    // Phase 2: 扫描规则文件
    const rules = this.scanRules();
    report.phases.scan = { rule_count: rules.length };
    console.log(`[N036] 扫描到 ${rules.length} 条规则`);
    
    // Phase 3: 重建注册表
    if (needsRecovery.registry_missing || needsRecovery.registry_empty) {
      const registry = this.buildRegistry(rules);
      fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
      report.recovered_rules = rules.length;
      report.recovered_categories = Object.keys(registry.by_domain).length;
      report.phases.registry_rebuilt = true;
      console.log(`[N036] 注册表已重建: ${rules.length}条规则, ${report.recovered_categories}个类别`);
    }
    
    // Phase 4: 验证
    const verified = this.verify();
    report.phases.verification = verified;
    report.status = verified.all_pass ? 'recovered' : 'partial';
    
    // 记录日志
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(report) + '\n');
    
    console.log(`[N036] ${report.status === 'recovered' ? '✅' : '⚠️'} 恢复${report.status}`);
    return report;
  },
  
  detectLoss() {
    const result = { needed: false, reasons: [] };
    
    if (!fs.existsSync(MEMORY_PATH)) {
      result.needed = true;
      result.memory_missing = true;
      result.reasons.push('MEMORY.md缺失');
    } else {
      const stat = fs.statSync(MEMORY_PATH);
      if (stat.size < 100) {
        result.needed = true;
        result.memory_corrupt = true;
        result.reasons.push('MEMORY.md过小(可能损坏)');
      }
    }
    
    if (!fs.existsSync(REGISTRY_PATH)) {
      result.needed = true;
      result.registry_missing = true;
      result.reasons.push('规则注册表缺失');
    } else {
      try {
        const reg = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
        if (!reg.rules || reg.rules.length === 0) {
          result.needed = true;
          result.registry_empty = true;
          result.reasons.push('规则注册表为空');
        }
      } catch {
        result.needed = true;
        result.registry_corrupt = true;
        result.reasons.push('规则注册表格式错误');
      }
    }
    
    return result;
  },
  
  scanRules() {
    const rules = [];
    if (!fs.existsSync(RULES_DIR)) return rules;
    
    const files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.json') && f.startsWith('rule.'));
    for (const file of files) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(RULES_DIR, file), 'utf8'));
        rules.push({
          file,
          id: content.id || content.rule_id || path.basename(file, '.json'),
          name: content.name || content.rule_name || '',
          domain: content.domain || content.category || 'uncategorized',
          type: content.type || 'rule',
          status: content.status || 'active',
          enforcement_tier: content.enforcement_tier || 'unknown'
        });
      } catch (e) {
        console.warn(`[N036] 解析失败: ${file}: ${e.message}`);
      }
    }
    return rules;
  },
  
  buildRegistry(rules) {
    const registry = {
      version: '1.0.0',
      rebuilt_at: new Date().toISOString(),
      rebuilt_by: 'N036-memory-loss-recovery',
      total: rules.length,
      rules: rules,
      by_domain: {},
      by_type: {},
      by_tier: {}
    };
    
    for (const r of rules) {
      // By domain
      if (!registry.by_domain[r.domain]) registry.by_domain[r.domain] = [];
      registry.by_domain[r.domain].push(r.id);
      
      // By type
      if (!registry.by_type[r.type]) registry.by_type[r.type] = [];
      registry.by_type[r.type].push(r.id);
      
      // By tier
      if (!registry.by_tier[r.enforcement_tier]) registry.by_tier[r.enforcement_tier] = [];
      registry.by_tier[r.enforcement_tier].push(r.id);
    }
    
    return registry;
  },
  
  verify() {
    const checks = {
      registry_exists: fs.existsSync(REGISTRY_PATH),
      registry_valid: false,
      rule_count_positive: false,
      all_pass: false
    };
    
    if (checks.registry_exists) {
      try {
        const reg = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
        checks.registry_valid = true;
        checks.rule_count_positive = (reg.total || 0) > 0;
      } catch {}
    }
    
    checks.all_pass = checks.registry_exists && checks.registry_valid && checks.rule_count_positive;
    return checks;
  }
};
