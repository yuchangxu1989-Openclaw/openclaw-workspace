#!/usr/bin/env node
/**
 * ISC规则审计器 v1.0
 * 
 * 定时审计所有ISC规则的展开状态和合规性：
 * 1. 检测cognitive类型规则是否有对应执行代码
 * 2. 检测handler路径是否指向实际存在的文件
 * 3. 检测规则声明 vs 实际执行记录的差异
 * 4. 生成审计报告
 */

const fs = require('fs');
const path = require('path');

const RULES_DIR = path.resolve(__dirname, '../../skills/isc-core/rules');
const HOOKS_DIR = path.resolve(__dirname, '../../scripts/isc-hooks');
const HANDLERS_DIR = path.resolve(__dirname, '../../skills/isc-core/handlers');
const AUDIT_LOG_DIR = path.resolve(__dirname, '../../logs/isc-enforce');
const REPORT_DIR = path.resolve(__dirname, '../../reports');
const WORKSPACE = path.resolve(__dirname, '../..');

class ISCRuleAuditor {
  constructor() {
    this.findings = [];
    this.stats = { total: 0, compliant: 0, warnings: 0, violations: 0 };
  }

  resolveHandlerPath(handlerRef) {
    if (!handlerRef) return null;
    const candidates = [
      path.resolve(WORKSPACE, handlerRef),
      path.resolve(HOOKS_DIR, path.basename(handlerRef)),
      path.resolve(HANDLERS_DIR, path.basename(handlerRef)),
    ];
    return candidates.find(p => fs.existsSync(p)) || null;
  }

  auditRule(file) {
    const filePath = path.join(RULES_DIR, file);
    let rule;
    try {
      rule = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      this.findings.push({ file, severity: '❌', issue: `JSON解析失败: ${e.message}` });
      this.stats.violations++;
      return;
    }

    this.stats.total++;
    const ruleId = rule.id || file;
    const enforcement = rule.enforcement || 'null';
    const handlerRef = rule.handler || (rule.action && rule.action.script);

    // Check 1: cognitive without handler → VIOLATION
    if (enforcement === 'cognitive') {
      if (!handlerRef || !this.resolveHandlerPath(handlerRef)) {
        this.findings.push({
          file, ruleId, severity: '❌',
          issue: '规则enforcement=cognitive且无可执行handler — 等于没有执行力',
          fix: '运行 isc-rule-deployer.js 自动生成handler'
        });
        this.stats.violations++;
        return;
      }
    }

    // Check 2: has handler ref but file missing → WARNING
    if (handlerRef) {
      const resolved = this.resolveHandlerPath(handlerRef);
      if (!resolved) {
        this.findings.push({
          file, ruleId, severity: '⚠️',
          issue: `handler路径声明存在但文件缺失: ${handlerRef}`,
          fix: '创建对应handler脚本或修正路径'
        });
        this.stats.warnings++;
        return;
      }
      // Check 3: handler exists but is empty/placeholder
      const content = fs.readFileSync(resolved, 'utf8');
      if (content.length < 50) {
        this.findings.push({
          file, ruleId, severity: '⚠️',
          issue: `handler文件过小(${content.length}bytes)，疑似空壳`,
          fix: '补充实际执行逻辑'
        });
        this.stats.warnings++;
        return;
      }
    }

    // Check 4: no enforcement field at all
    if (enforcement === 'null' && !handlerRef) {
      this.findings.push({
        file, ruleId, severity: '⚠️',
        issue: '无enforcement字段且无handler — 纯声明性规则',
        fix: '添加enforcement字段并绑定handler'
      });
      this.stats.warnings++;
      return;
    }

    this.stats.compliant++;
  }

  generateReport() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const violations = this.findings.filter(f => f.severity === '❌');
    const warnings = this.findings.filter(f => f.severity === '⚠️');

    let md = `# ISC规则审计报告\n\n`;
    md += `**审计时间**: ${new Date().toISOString()}\n`;
    md += `**审计器**: isc-rule-auditor.js v1.0\n\n`;
    md += `## 概览\n\n`;
    md += `| 指标 | 数量 |\n|------|------|\n`;
    md += `| 规则总数 | ${this.stats.total} |\n`;
    md += `| ✅ 合规 | ${this.stats.compliant} |\n`;
    md += `| ⚠️ 警告 | ${this.stats.warnings} |\n`;
    md += `| ❌ 违规 | ${this.stats.violations} |\n`;
    md += `| 合规率 | ${this.stats.total ? Math.round(this.stats.compliant / this.stats.total * 100) : 0}% |\n\n`;

    if (violations.length > 0) {
      md += `## ❌ 违规（必须整改）\n\n`;
      for (const v of violations) {
        md += `### ${v.ruleId || v.file}\n`;
        md += `- **问题**: ${v.issue}\n`;
        md += `- **修复**: ${v.fix}\n\n`;
      }
    }

    if (warnings.length > 0) {
      md += `## ⚠️ 警告（建议修复）\n\n`;
      for (const w of warnings) {
        md += `- **${w.ruleId || w.file}**: ${w.issue}\n`;
        if (w.fix) md += `  - 修复: ${w.fix}\n`;
      }
      md += '\n';
    }

    md += `## 结论\n\n`;
    if (violations.length === 0 && warnings.length === 0) {
      md += `✅ 所有规则均已展开为可执行程序，审计通过。\n`;
    } else if (violations.length === 0) {
      md += `⚠️ 无阻断性违规，但有 ${warnings.length} 条警告需关注。\n`;
    } else {
      md += `❌ 发现 ${violations.length} 条违规，需立即整改。建议运行:\n`;
      md += `\`\`\`bash\nnode infrastructure/isc-enforce/isc-rule-deployer.js\n\`\`\`\n`;
    }

    return md;
  }

  run() {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║        ISC规则审计器 v1.0                ║');
    console.log('╚══════════════════════════════════════════╝');

    const files = fs.readdirSync(RULES_DIR).filter(f => f.startsWith('rule.') && f.endsWith('.json'));
    console.log(`扫描 ${files.length} 条规则...`);

    for (const f of files) {
      this.auditRule(f);
    }

    const report = this.generateReport();

    // Save report
    if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORT_DIR, 'isc-auto-enforce-report.md'), report);

    // Save JSON results
    if (!fs.existsSync(AUDIT_LOG_DIR)) fs.mkdirSync(AUDIT_LOG_DIR, { recursive: true });
    fs.writeFileSync(path.join(AUDIT_LOG_DIR, 'last-audit.json'), JSON.stringify({
      timestamp: new Date().toISOString(),
      stats: this.stats,
      findings: this.findings,
    }, null, 2));

    console.log(`\n结果: 总计=${this.stats.total}, 合规=${this.stats.compliant}, 警告=${this.stats.warnings}, 违规=${this.stats.violations}`);
    console.log(`报告: reports/isc-auto-enforce-report.md`);

    return { stats: this.stats, findings: this.findings, report };
  }
}

if (require.main === module) {
  const auditor = new ISCRuleAuditor();
  auditor.run();
}

module.exports = ISCRuleAuditor;
