#!/usr/bin/env node
/**
 * ISC Handler: Skill Permission Classification (Rule 031)
 * 
 * Enforces the four-dimension permission model (filesystem/network/shell/credential)
 * for all skills. Validates that SKILL.md declares permissions and they don't exceed
 * the approved levels. Applies least-privilege defaults when undeclared.
 *
 * Rule: rule.isc-skill-permission-classification-031
 * Priority: P0 (gate — blocks deployment if violated)
 * Trigger: isc.rule.matched
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../../..');
const SKILLS_DIR = path.join(WORKSPACE, 'skills');
const RULES_DIR = path.join(WORKSPACE, 'skills/isc-core/rules');

// Default safe permissions (least privilege)
const DEFAULT_PERMISSIONS = {
  filesystem: 1,
  network: 2,
  shell: 0,
  credential: 0
};

// Maximum levels per dimension
const MAX_LEVELS = {
  filesystem: 4,
  network: 4,
  shell: 4,
  credential: 3
};

// Levels requiring extra approval (warning threshold)
const APPROVAL_REQUIRED = {
  filesystem: 4,
  network: 4,
  shell: 4,
  credential: 3
};

/**
 * Parse permissions block from SKILL.md content
 */
function parsePermissionsFromSkillMd(content) {
  // Look for a permissions YAML/JSON block or structured section
  // Pattern 1: ```json permissions block
  const jsonMatch = content.match(/```json\s*\n\s*\{[^}]*"permissions"\s*:\s*(\{[^}]+\})/s);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch (e) { /* fall through */ }
  }

  // Pattern 2: permissions section with key: value pairs
  const permSection = content.match(/##?\s*[Pp]ermissions?\s*\n([\s\S]*?)(?=\n##|\n$|$)/);
  if (permSection) {
    const perms = {};
    const lines = permSection[1].split('\n');
    for (const line of lines) {
      const match = line.match(/[-*]?\s*(filesystem|network|shell|credential)\s*[:=]\s*(\d+)/i);
      if (match) {
        perms[match[1].toLowerCase()] = parseInt(match[2], 10);
      }
    }
    if (Object.keys(perms).length > 0) return perms;
  }

  // Pattern 3: manifest-style in frontmatter or metadata
  const fmMatch = content.match(/permissions:\s*\n((?:\s+\w+:\s*\d+\n?)+)/);
  if (fmMatch) {
    const perms = {};
    const lines = fmMatch[1].split('\n');
    for (const line of lines) {
      const m = line.match(/(\w+)\s*:\s*(\d+)/);
      if (m && ['filesystem', 'network', 'shell', 'credential'].includes(m[1])) {
        perms[m[1]] = parseInt(m[2], 10);
      }
    }
    if (Object.keys(perms).length > 0) return perms;
  }

  return null;
}

/**
 * Validate a single skill's permissions
 */
function validateSkillPermissions(skillDir) {
  const skillName = path.basename(skillDir);
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const result = {
    skill: skillName,
    violations: [],
    warnings: [],
    permissions: null,
    status: 'PASS'
  };

  // Check SKILL.md exists
  if (!fs.existsSync(skillMdPath)) {
    result.violations.push({
      type: 'missing_skill_md',
      message: `SKILL.md not found in ${skillName}`
    });
    result.status = 'FAIL';
    return result;
  }

  const content = fs.readFileSync(skillMdPath, 'utf8');
  const permissions = parsePermissionsFromSkillMd(content);

  if (!permissions) {
    result.violations.push({
      type: 'missing_permissions',
      message: `No permissions declaration found in ${skillName}/SKILL.md. Must declare filesystem, network, shell, credential levels.`
    });
    result.permissions = { ...DEFAULT_PERMISSIONS, source: 'default_applied' };
    result.status = 'FAIL';
    return result;
  }

  result.permissions = permissions;

  // Validate each dimension
  for (const dim of ['filesystem', 'network', 'shell', 'credential']) {
    const level = permissions[dim];

    if (level === undefined || level === null) {
      result.violations.push({
        type: 'missing_dimension',
        dimension: dim,
        message: `Permission dimension "${dim}" not declared. Default ${DEFAULT_PERMISSIONS[dim]} will be applied.`
      });
      continue;
    }

    if (typeof level !== 'number' || level < 0 || level > MAX_LEVELS[dim]) {
      result.violations.push({
        type: 'invalid_level',
        dimension: dim,
        value: level,
        max: MAX_LEVELS[dim],
        message: `Invalid ${dim} level: ${level}. Must be 0-${MAX_LEVELS[dim]}.`
      });
      result.status = 'FAIL';
      continue;
    }

    if (level >= APPROVAL_REQUIRED[dim]) {
      result.warnings.push({
        type: 'approval_required',
        dimension: dim,
        level: level,
        message: `${dim} level ${level} requires extra approval and audit logging.`
      });
    }
  }

  // Check justification for elevated permissions
  const hasElevated = ['filesystem', 'network', 'shell', 'credential'].some(
    dim => (permissions[dim] || 0) >= APPROVAL_REQUIRED[dim]
  );
  if (hasElevated && !permissions.justification && !content.includes('justification')) {
    result.violations.push({
      type: 'missing_justification',
      message: 'Elevated permissions require a justification field.'
    });
  }

  if (result.violations.length > 0) {
    result.status = 'FAIL';
  }

  return result;
}

/**
 * Main handler entry point
 */
function main() {
  const report = {
    handler: 'isc-skill-permission-classification-031',
    rule: 'rule.isc-skill-permission-classification-031',
    priority: 'P0',
    enforcement: 'gate',
    timestamp: new Date().toISOString(),
    skills: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0
    }
  };

  // Scan all skill directories
  if (!fs.existsSync(SKILLS_DIR)) {
    report.error = `Skills directory not found: ${SKILLS_DIR}`;
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const skillDirs = fs.readdirSync(SKILLS_DIR).filter(d => {
    const fullPath = path.join(SKILLS_DIR, d);
    return fs.statSync(fullPath).isDirectory();
  });

  for (const dir of skillDirs) {
    const result = validateSkillPermissions(path.join(SKILLS_DIR, dir));
    report.skills.push(result);
    report.summary.total++;
    if (result.status === 'PASS') {
      report.summary.passed++;
    } else {
      report.summary.failed++;
    }
    report.summary.warnings += result.warnings.length;
  }

  report.status = report.summary.failed === 0 ? 'PASS' : 'FAIL';
  report.defaultPermissions = DEFAULT_PERMISSIONS;

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'PASS' ? 0 : 1);
}

main();
