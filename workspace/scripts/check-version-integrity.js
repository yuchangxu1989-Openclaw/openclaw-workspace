#!/usr/bin/env node
/**
 * Version Integrity Gate - 版本号诚实性门禁
 * 检查技能版本号是否与代码成熟度匹配
 */
const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.resolve(__dirname, '../skills');

function assessMaturity(skillDir) {
  const result = { jsLines: 0, hasEntry: false, hasTest: false, hasTryCatch: 0, hasFallback: false, hasLog: 0 };
  
  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      if (f.isDirectory() && !f.name.startsWith('.') && f.name !== 'node_modules') {
        scanDir(full);
      } else if (f.isFile() && /\.(js|cjs|mjs|ts)$/.test(f.name)) {
        const content = fs.readFileSync(full, 'utf8');
        const lines = content.split('\n').length;
        result.jsLines += lines;
        if (/module\.exports|export\s+(default|function|const)|main\s*\(/.test(content)) result.hasEntry = true;
        if (/test|spec|__test/i.test(f.name) || /describe\s*\(|it\s*\(|test\s*\(/.test(content)) result.hasTest = true;
        if (/try\s*\{/.test(content)) result.hasTryCatch++;
        if (/fallback|degrade|retry/i.test(content)) result.hasFallback = true;
        if (/console\.(log|error|warn)|logger/i.test(content)) result.hasLog++;
      }
    }
  }
  scanDir(skillDir);
  return result;
}

function suggestVersion(maturity) {
  const { jsLines, hasEntry, hasTest, hasTryCatch, hasFallback, hasLog } = maturity;
  if (jsLines === 0 || !hasEntry) return '0.0';
  if (jsLines < 50 && !hasTest) return '0.1';
  if (jsLines < 100 && !hasTest) return '0.3';
  if (hasEntry && hasTest && hasTryCatch >= 5 && hasFallback && hasLog >= 3) return '2.0';
  if (hasEntry && hasTryCatch >= 1) return '1.0';
  return '0.5';
}

function parseVersion(vStr) {
  if (!vStr) return null;
  const m = vStr.match(/(\d+)\.(\d+)/);
  return m ? { major: parseInt(m[1]), minor: parseInt(m[2]) } : null;
}

function getDeclaredVersion(skillDir) {
  const skillMd = path.join(skillDir, 'SKILL.md');
  if (fs.existsSync(skillMd)) {
    const content = fs.readFileSync(skillMd, 'utf8');
    const m = content.match(/version:\s*"?(\d+\.\d+\.\d+)"?/i);
    if (m) return m[1];
  }
  const pkg = path.join(skillDir, 'package.json');
  if (fs.existsSync(pkg)) {
    try {
      const p = JSON.parse(fs.readFileSync(pkg, 'utf8'));
      if (p.version) return p.version;
    } catch (e) {}
  }
  return null;
}

function checkVersionJump(oldVer, newVer) {
  const o = parseVersion(oldVer);
  const n = parseVersion(newVer);
  if (!o || !n) return { valid: true };
  const jump = n.major - o.major;
  if (jump > 1) return { valid: false, reason: `Major version jump from ${oldVer} to ${newVer} (max +1)` };
  return { valid: true };
}

function auditSkill(skillName) {
  const skillDir = path.join(SKILLS_DIR, skillName);
  if (!fs.existsSync(skillDir) || !fs.statSync(skillDir).isDirectory()) return null;
  
  const declared = getDeclaredVersion(skillDir);
  const maturity = assessMaturity(skillDir);
  const suggested = suggestVersion(maturity);
  const declaredParsed = parseVersion(declared);
  const suggestedParsed = parseVersion(suggested);
  
  let honest = true;
  if (declaredParsed && suggestedParsed) {
    if (declaredParsed.major > suggestedParsed.major || 
        (declaredParsed.major === suggestedParsed.major && declaredParsed.minor > suggestedParsed.minor + 2)) {
      honest = false;
    }
  }
  
  return { skillName, declared, suggested, maturity, honest };
}

function auditAll() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs.readdirSync(SKILLS_DIR)
    .filter(d => !d.startsWith('.') && d !== '_shared' && fs.statSync(path.join(SKILLS_DIR, d)).isDirectory())
    .map(auditSkill)
    .filter(Boolean);
}

// CLI mode
if (require.main === module) {
  const results = auditAll();
  const violations = results.filter(r => !r.honest);
  if (violations.length > 0) {
    console.error(`❌ ${violations.length} version integrity violations found:`);
    for (const v of violations) {
      console.error(`  ${v.skillName}: declared ${v.declared} vs actual ~${v.suggested}`);
    }
    process.exit(1);
  } else {
    console.log(`✅ All ${results.length} skills pass version integrity check`);
  }
}

module.exports = { auditSkill, auditAll, assessMaturity, suggestVersion, parseVersion, getDeclaredVersion, checkVersionJump };
