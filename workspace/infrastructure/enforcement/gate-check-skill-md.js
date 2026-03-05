#!/usr/bin/env node
/**
 * Gate Check: skill-mandatory-skill-md-001
 * 技能发布前检查SKILL.md是否存在
 * 
 * Usage: node gate-check-skill-md.js <skill_path>
 * Exit 0 = pass, Exit 1 = blocked
 */
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'enforcement-log.jsonl');

function log(entry) {
  const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() });
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function check(skillPath) {
  const resolved = path.resolve(skillPath);
  const skillMd = path.join(resolved, 'SKILL.md');
  const skillName = path.basename(resolved);

  if (!fs.existsSync(resolved)) {
    const msg = `❌ 技能路径不存在: ${resolved}`;
    console.error(msg);
    log({ rule: 'rule.skill-mandatory-skill-md-001', gate: 'skill-publish', result: 'BLOCKED', skill: skillName, reason: '路径不存在', path: resolved });
    process.exit(1);
  }

  if (!fs.existsSync(skillMd)) {
    const msg = `🚫 [BLOCKED] 技能 "${skillName}" 缺少 SKILL.md，禁止发布\n   规则: rule.skill-mandatory-skill-md-001 (P0)\n   路径: ${resolved}\n   修复: 在技能目录创建 SKILL.md`;
    console.error(msg);
    log({ rule: 'rule.skill-mandatory-skill-md-001', gate: 'skill-publish', result: 'BLOCKED', skill: skillName, reason: 'SKILL.md缺失', path: resolved });
    process.exit(1);
  }

  // Check non-empty
  const stat = fs.statSync(skillMd);
  if (stat.size < 10) {
    const msg = `🚫 [BLOCKED] 技能 "${skillName}" 的 SKILL.md 内容为空或过短 (${stat.size} bytes)\n   规则: rule.skill-mandatory-skill-md-001 (P0)`;
    console.error(msg);
    log({ rule: 'rule.skill-mandatory-skill-md-001', gate: 'skill-publish', result: 'BLOCKED', skill: skillName, reason: 'SKILL.md内容过短', size: stat.size });
    process.exit(1);
  }

  console.log(`✅ [PASS] 技能 "${skillName}" SKILL.md 检查通过 (${stat.size} bytes)`);
  log({ rule: 'rule.skill-mandatory-skill-md-001', gate: 'skill-publish', result: 'PASS', skill: skillName, size: stat.size });
  process.exit(0);
}

const target = process.argv[2];
if (!target) {
  console.error('Usage: node gate-check-skill-md.js <skill_path>');
  process.exit(1);
}
check(target);
