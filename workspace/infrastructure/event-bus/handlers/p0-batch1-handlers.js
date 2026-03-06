'use strict';

/**
 * 自主执行器：P0安全门禁 (Batch 1)
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 技能安全扫描 → 权限分类 → 不合规自动隔离 → 记录
 */

const fs = require('fs');
const path = require('path');

// 危险模式定义
const DANGER_PATTERNS = [
  { pattern: /process\.exit/g, severity: 'critical', reason: '直接退出进程' },
  { pattern: /child_process/g, severity: 'high', reason: '调用子进程' },
  { pattern: /eval\s*\(/g, severity: 'critical', reason: '动态代码执行' },
  { pattern: /Function\s*\(/g, severity: 'high', reason: '动态函数构造' },
  { pattern: /require\s*\(\s*['"`]fs['"` ]/g, severity: 'medium', reason: '文件系统访问' },
  { pattern: /require\s*\(\s*['"`]net['"` ]/g, severity: 'high', reason: '网络访问' },
  { pattern: /require\s*\(\s*['"`]http['"` ]/g, severity: 'medium', reason: 'HTTP访问' },
  { pattern: /\.env\b/g, severity: 'high', reason: '环境变量访问' },
  { pattern: /rm\s+-rf/g, severity: 'critical', reason: '递归删除' },
  { pattern: /chmod\s+777/g, severity: 'high', reason: '不安全权限设置' },
  { pattern: /sudo\s/g, severity: 'critical', reason: '特权提升' },
  { pattern: /exec\s*\(/g, severity: 'high', reason: 'shell执行' },
  { pattern: /spawn\s*\(/g, severity: 'high', reason: '进程spawn' },
];

// 权限分类
const PERMISSION_LEVELS = {
  safe: { maxSeverityScore: 0, label: '安全', color: 'green' },
  standard: { maxSeverityScore: 5, label: '标准', color: 'yellow' },
  elevated: { maxSeverityScore: 15, label: '需审核', color: 'orange' },
  dangerous: { maxSeverityScore: Infinity, label: '危险', color: 'red' },
};

const SEVERITY_SCORES = { low: 1, medium: 3, high: 5, critical: 10 };

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const findings = [];

  for (const dp of DANGER_PATTERNS) {
    const matches = content.match(dp.pattern);
    if (matches) {
      findings.push({
        pattern: dp.pattern.source,
        severity: dp.severity,
        reason: dp.reason,
        count: matches.length,
        score: SEVERITY_SCORES[dp.severity] * matches.length,
      });
    }
  }

  const totalScore = findings.reduce((s, f) => s + f.score, 0);
  let level = 'safe';
  for (const [key, def] of Object.entries(PERMISSION_LEVELS)) {
    if (totalScore <= def.maxSeverityScore) { level = key; break; }
  }

  return { findings, totalScore, level };
}

function isolateSkill(skillDir, reason) {
  const quarantineMark = path.join(skillDir, '.quarantined');
  const info = {
    quarantinedAt: new Date().toISOString(),
    reason,
    autoIsolated: true,
  };
  fs.writeFileSync(quarantineMark, JSON.stringify(info, null, 2) + '\n', 'utf8');

  // 重命名index.js → index.js.quarantined 使其不可加载
  const indexPath = path.join(skillDir, 'index.js');
  const quarantinedPath = path.join(skillDir, 'index.js.quarantined');
  if (fs.existsSync(indexPath) && !fs.existsSync(quarantinedPath)) {
    fs.renameSync(indexPath, quarantinedPath);
    return true;
  }
  return false;
}

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const skillsDir = path.join(root, 'skills');
  const reportPath = path.join(root, 'infrastructure', 'security-scan-report.json');
  const actions = [];
  const scanResults = [];

  // ─── 感知：扫描所有技能目录 ───
  if (!fs.existsSync(skillsDir)) {
    return {
      ok: true,
      autonomous: true,
      actions: ['no_skills_dir'],
      message: 'skills目录不存在，无需安全扫描',
    };
  }

  const skills = fs.readdirSync(skillsDir).filter(name => {
    const p = path.join(skillsDir, name);
    return fs.statSync(p).isDirectory();
  });

  for (const skillName of skills) {
    const skillDir = path.join(skillsDir, skillName);

    // 跳过已隔离的
    if (fs.existsSync(path.join(skillDir, '.quarantined'))) {
      scanResults.push({ skill: skillName, status: 'already_quarantined', level: 'quarantined' });
      continue;
    }

    // 扫描所有JS文件
    const jsFiles = [];
    try {
      const entries = fs.readdirSync(skillDir, { recursive: true });
      for (const entry of entries) {
        const entryStr = typeof entry === 'string' ? entry : entry.toString();
        if (entryStr.endsWith('.js') && !entryStr.includes('node_modules')) {
          jsFiles.push(path.join(skillDir, entryStr));
        }
      }
    } catch {
      jsFiles.push(path.join(skillDir, 'index.js'));
    }

    let totalScore = 0;
    const allFindings = [];

    for (const jsFile of jsFiles) {
      if (!fs.existsSync(jsFile)) continue;
      try {
        const result = scanFile(jsFile);
        totalScore += result.totalScore;
        if (result.findings.length > 0) {
          allFindings.push({
            file: path.relative(skillDir, jsFile),
            ...result,
          });
        }
      } catch (e) {
        actions.push(`scan_error:${skillName}:${e.message}`);
      }
    }

    // ─── 判断 & 自主执行：权限分类 & 隔离 ───
    let level = 'safe';
    for (const [key, def] of Object.entries(PERMISSION_LEVELS)) {
      if (totalScore <= def.maxSeverityScore) { level = key; break; }
    }

    const scanEntry = {
      skill: skillName,
      level,
      totalScore,
      findings: allFindings,
      filesScanned: jsFiles.length,
    };

    if (level === 'dangerous') {
      // 自动隔离
      const isolated = isolateSkill(skillDir, `安全扫描评分${totalScore}, 自动隔离`);
      scanEntry.action = isolated ? 'auto_quarantined' : 'quarantine_already_done';
      scanEntry.status = 'quarantined';
      actions.push(`quarantined:${skillName}(score:${totalScore})`);
      logger.warn?.(`[p0-security] 自动隔离技能: ${skillName} (评分: ${totalScore})`);
    } else if (level === 'elevated') {
      // 标记需要审核但不隔离
      const flagPath = path.join(skillDir, '.needs-review');
      fs.writeFileSync(flagPath, JSON.stringify({
        flaggedAt: new Date().toISOString(),
        score: totalScore,
        findings: allFindings,
      }, null, 2) + '\n', 'utf8');
      scanEntry.action = 'flagged_for_review';
      scanEntry.status = 'needs_review';
      actions.push(`flagged:${skillName}(score:${totalScore})`);
    } else {
      scanEntry.action = 'passed';
      scanEntry.status = 'clean';
    }

    scanResults.push(scanEntry);
  }

  // ─── 记录扫描报告 ───
  const report = {
    timestamp: new Date().toISOString(),
    totalSkills: skills.length,
    results: scanResults,
    summary: {
      safe: scanResults.filter(r => r.level === 'safe').length,
      standard: scanResults.filter(r => r.level === 'standard').length,
      elevated: scanResults.filter(r => r.level === 'elevated').length,
      dangerous: scanResults.filter(r => r.level === 'dangerous').length,
      quarantined: scanResults.filter(r => r.status === 'already_quarantined').length,
    },
  };

  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    actions.push('report_saved');
  } catch (e) {
    actions.push(`report_save_failed:${e.message}`);
  }

  // ─── 验证 ───
  const quarantinedSkills = scanResults.filter(r => r.action === 'auto_quarantined');
  let verifyOk = true;
  for (const qs of quarantinedSkills) {
    const qMark = path.join(skillsDir, qs.skill, '.quarantined');
    const qIndex = path.join(skillsDir, qs.skill, 'index.js.quarantined');
    if (!fs.existsSync(qMark)) { verifyOk = false; break; }
  }
  actions.push(verifyOk ? 'verification_passed' : 'verification_failed');

  // ─── 闭环：仅在有隔离或需审核时通知 ───
  const needsAttention = scanResults.filter(r => r.status === 'quarantined' || r.status === 'needs_review');
  if (needsAttention.length > 0 && context?.notify) {
    const quarantinedNames = needsAttention.filter(r => r.status === 'quarantined').map(r => r.skill);
    const reviewNames = needsAttention.filter(r => r.status === 'needs_review').map(r => r.skill);
    let msg = '[p0-security] 安全扫描完成。';
    if (quarantinedNames.length) msg += ` 已隔离: ${quarantinedNames.join(', ')}。`;
    if (reviewNames.length) msg += ` 待审核: ${reviewNames.join(', ')}。`;
    await context.notify(msg, 'warning');
  }

  // ─── 事件传播 ───
  if (context?.bus?.emit) {
    await context.bus.emit('security.scan.completed', {
      summary: report.summary,
      quarantined: quarantinedSkills.map(q => q.skill),
    });
  }

  return {
    ok: verifyOk,
    autonomous: true,
    actions,
    summary: report.summary,
    quarantined: quarantinedSkills.map(q => q.skill),
    message: `安全扫描完成: ${skills.length}个技能, ${report.summary.dangerous}个隔离, ${report.summary.elevated}个待审核`,
  };
};
