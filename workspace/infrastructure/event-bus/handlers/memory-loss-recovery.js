'use strict';

/**
 * 自主执行器：记忆丢失自动恢复
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 检测到MemOS(memos.db)丢失/损坏 → 尝试恢复 → 验证完整性 → 重建注册表 → 闭环
 * （MEMORY.md已废弃，MemOS为唯一记忆源）
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = '/root/.openclaw/workspace';
const MEMOS_DB_PATH = '/root/.openclaw/memos-local/memos.db';
const REGISTRY_FILE = path.join(WORKSPACE, '.rule-registry.json');
const RULES_DIR = path.join(WORKSPACE, 'skills/isc-core/rules');
const STANDARDS_DIR = path.join(WORKSPACE, 'skills/isc-core/standards');
const REPORT_DIR = path.join(WORKSPACE, 'reports');

function detectMemoryLoss() {
  const issues = [];
  // Check MemOS (memos.db) — 唯一记忆源
  if (!fs.existsSync(MEMOS_DB_PATH)) {
    issues.push({ type: 'file_missing', file: 'memos.db' });
  } else {
    const stat = fs.statSync(MEMOS_DB_PATH);
    if (stat.size < 4096) {
      issues.push({ type: 'file_corrupted', file: 'memos.db', reason: `size=${stat.size} < 4096` });
    }
  }
  // Check registry
  if (!fs.existsSync(REGISTRY_FILE)) {
    issues.push({ type: 'registry_missing', file: '.rule-registry.json' });
  } else {
    try {
      const reg = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
      if (!reg.rules || Object.keys(reg.rules).length === 0) {
        issues.push({ type: 'registry_empty', file: '.rule-registry.json' });
      }
    } catch {
      issues.push({ type: 'registry_corrupted', file: '.rule-registry.json' });
    }
  }
  return issues;
}

function recoverFromGit(filePath) {
  try {
    // Find the last known good version in git
    const relPath = path.relative(WORKSPACE, filePath);
    const result = execSync(
      `cd "${WORKSPACE}" && git log --oneline -1 -- "${relPath}" 2>/dev/null`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    if (!result) return null;

    const commitHash = result.split(' ')[0];
    const content = execSync(
      `cd "${WORKSPACE}" && git show ${commitHash}:"${relPath}" 2>/dev/null`,
      { encoding: 'utf8', timeout: 5000 }
    );
    return { commitHash, content };
  } catch {
    return null;
  }
}

function scanRules(dir) {
  const rules = [];
  if (!fs.existsSync(dir)) return rules;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const content = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      rules.push({
        id: content.id || content.rule_id || content.name || file,
        name: content.name || content.rule_name || file,
        domain: content.domain || content.category || 'unknown',
        file,
        version: content.version || '1.0.0',
        enforcement_tier: content.enforcement_tier || 'unknown',
      });
    } catch { /* skip invalid */ }
  }
  return rules;
}

function rebuildRegistry(rules) {
  const categories = {};
  for (const r of rules) {
    const cat = r.domain;
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(r.id);
  }
  const registry = {
    version: '1.0.0',
    rebuilt_at: new Date().toISOString(),
    rebuilt_by: 'memory-loss-recovery-handler',
    rule_count: rules.length,
    category_count: Object.keys(categories).length,
    rules: Object.fromEntries(rules.map(r => [r.id, r])),
    categories,
    stats: {
      total: rules.length,
      by_domain: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, v.length])),
    },
  };
  return registry;
}

module.exports = async function(event, rule, context) {
  const startTime = Date.now();
  const results = { phases: [], recovered: [], errors: [] };

  // Phase 1: 感知 - 检测记忆丢失
  const issues = detectMemoryLoss();
  if (issues.length === 0) {
    return { status: 'pass', reason: '记忆完整，无需恢复' };
  }
  results.phases.push({ phase: 'detection', issues });

  // Phase 2: 自主执行 - 恢复文件
  for (const issue of issues) {
    if (issue.file === 'memos.db') {
      // memos.db不能从git恢复（二进制文件），只能记录问题
      results.errors.push({ file: issue.file, error: 'MemOS数据库异常，需要手动检查或从备份恢复' });
    } else if (issue.type === 'file_missing' || issue.type === 'file_corrupted') {
      const filePath = path.join(WORKSPACE, issue.file);
      const recovered = recoverFromGit(filePath);
      if (recovered) {
        fs.writeFileSync(filePath, recovered.content);
        results.recovered.push({
          file: issue.file,
          from_commit: recovered.commitHash,
          size: recovered.content.length,
        });
      } else {
        results.errors.push({ file: issue.file, error: '无法从git恢复，无历史版本' });
      }
    }
  }

  // Phase 3: 重建注册表
  const ruleFiles = [
    ...scanRules(RULES_DIR),
    ...scanRules(STANDARDS_DIR),
  ];
  const registry = rebuildRegistry(ruleFiles);
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
  results.phases.push({
    phase: 'registry_rebuild',
    rule_count: registry.rule_count,
    category_count: registry.category_count,
  });

  // Phase 4: 验证
  const verification = {
    memos_db_exists: fs.existsSync(MEMOS_DB_PATH),
    registry_valid: false,
    rule_count: 0,
  };
  try {
    const reg = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
    verification.registry_valid = true;
    verification.rule_count = reg.rule_count || 0;
  } catch { /* */ }
  results.phases.push({ phase: 'verification', ...verification });

  // Phase 5: 生成报告
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const report = {
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
    issues_detected: issues.length,
    files_recovered: results.recovered.length,
    errors: results.errors.length,
    registry_rules: registry.rule_count,
    details: results,
  };
  fs.writeFileSync(
    path.join(REPORT_DIR, 'memory-recovery-report.json'),
    JSON.stringify(report, null, 2)
  );

  // 通知
  const msg = results.errors.length > 0
    ? `⚠️ 记忆恢复部分完成: ${results.recovered.length}个文件恢复, ${results.errors.length}个失败`
    : `✅ 记忆恢复完成: ${results.recovered.length}个文件恢复, ${registry.rule_count}条规则重建`;
  if (context?.notify) {
    context.notify('feishu', msg, { severity: results.errors.length > 0 ? 'high' : 'normal' });
  }

  return {
    status: results.errors.length > 0 ? 'partial' : 'recovered',
    recovered_files: results.recovered.length,
    rebuilt_rules: registry.rule_count,
    errors: results.errors,
    duration_ms: Date.now() - startTime,
  };
};
