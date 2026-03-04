#!/usr/bin/env node
/**
 * Skill Distribution Checker
 * 
 * 扫描技能目录，检查distribution标记和外销合规性。
 * 引用ISC规则: skill-distribution-separation-001
 * 
 * Usage:
 *   node skill-distribution-checker.js <skill-dir>
 *   node skill-distribution-checker.js <skill-dir> --json
 *   node skill-distribution-checker.js --scan-all
 */

const fs = require('fs');
const path = require('path');

// === Configuration ===

const SECRETS_PATTERNS = [
  /\.secrets\//g,
  /\/\.secrets\//g,
  /secrets\//g,
];

const INTERNAL_PATH_PATTERNS = [
  /\/root\//g,
  /\/home\/[a-zA-Z0-9_]+\//g,
  /~\/\.openclaw\//g,
  /\/root\/\.openclaw\//g,
];

const SENSITIVE_ENV_PATTERNS = [
  /process\.env\.(API_KEY|SECRET_KEY|ACCESS_TOKEN|PRIVATE_KEY)/g,
  /process\.env\.(ZHIPU_API_KEY|OPENAI_API_KEY|FEISHU_APP_SECRET)/g,
  /process\.env\.(DB_PASSWORD|JWT_SECRET|AWS_SECRET_ACCESS_KEY)/g,
  /process\.env\.(ANTHROPIC_API_KEY|GOOGLE_API_KEY|AZURE_KEY)/g,
  /process\.env\.\w*(SECRET|PASSWORD|CREDENTIAL|TOKEN|APIKEY)\w*/gi,
];

const HARDCODED_CREDENTIAL_PATTERNS = [
  /api[_-]?key\s*[:=]\s*['"][^'"]{10,}['"]/gi,
  /password\s*[:=]\s*['"][^'"]{8,}['"]/gi,
  /secret\s*[:=]\s*['"][^'"]{10,}['"]/gi,
  /token\s*[:=]\s*['"][^'"]{20,}['"]/gi,
];

const SCANNABLE_EXTENSIONS = ['.js', '.ts', '.py', '.sh', '.md', '.json', '.yaml', '.yml', '.cjs', '.mjs'];

const VALID_DISTRIBUTIONS = ['internal', 'external', 'both'];

// === Core Functions ===

function parseSkillMd(skillDir) {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    return { exists: false, distribution: null, permissions: null, raw: '' };
  }

  const content = fs.readFileSync(skillMdPath, 'utf-8');
  
  // Extract distribution field
  const distMatch = content.match(/distribution:\s*(internal|external|both)/i);
  const distribution = distMatch ? distMatch[1].toLowerCase() : null;

  // Extract permissions block - parse line by line after "permissions:" header
  const permissions = {};
  const contentLines = content.split('\n');
  let inPermBlock = false;
  for (const line of contentLines) {
    if (/^permissions:\s*$/.test(line.trim())) {
      inPermBlock = true;
      continue;
    }
    if (inPermBlock) {
      const m = line.match(/^\s+(filesystem|network|shell|credential):\s*(\d+)/);
      if (m) {
        permissions[m[1]] = parseInt(m[2]);
      } else if (line.trim() !== '' && !line.startsWith(' ') && !line.startsWith('\t')) {
        // Non-indented non-empty line → end of block
        inPermBlock = false;
      }
    }
  }

  // Also try inline format: permissions: { filesystem: 1, network: 0, ... }
  const inlineMatch = content.match(/permissions:\s*\{([^}]+)\}/);
  if (inlineMatch && Object.keys(permissions).length === 0) {
    const pairs = inlineMatch[1].split(',');
    for (const pair of pairs) {
      const m = pair.match(/(\w+)\s*:\s*(\d+)/);
      if (m) permissions[m[1]] = parseInt(m[2]);
    }
  }

  return {
    exists: true,
    distribution,
    permissions: Object.keys(permissions).length > 0 ? permissions : null,
    raw: content,
  };
}

function scanFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      results.push(...scanFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SCANNABLE_EXTENSIONS.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function scanForViolations(filePath, patterns, patternName) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const violations = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      // Reset regex lastIndex
      pattern.lastIndex = 0;
      const match = pattern.exec(lines[i]);
      if (match) {
        violations.push({
          file: filePath,
          line: i + 1,
          type: patternName,
          match: match[0],
          context: lines[i].trim().substring(0, 120),
        });
      }
    }
  }
  return violations;
}

function checkSkill(skillDir) {
  const skillName = path.basename(skillDir);
  const report = {
    skill: skillName,
    path: skillDir,
    timestamp: new Date().toISOString(),
    checks: [],
    violations: [],
    compliant: true,
    distribution: null,
  };

  // Check 1: SKILL.md exists
  const skillMd = parseSkillMd(skillDir);
  if (!skillMd.exists) {
    report.checks.push({ id: 'SKILL_MD_EXISTS', pass: false, message: 'SKILL.md not found' });
    report.compliant = false;
    return report;
  }
  report.checks.push({ id: 'SKILL_MD_EXISTS', pass: true, message: 'SKILL.md found' });

  // Check 2: distribution field
  if (!skillMd.distribution) {
    report.checks.push({ id: 'DISTRIBUTION_DECLARED', pass: false, message: 'Missing distribution field in SKILL.md' });
    report.compliant = false;
    return report;
  }
  if (!VALID_DISTRIBUTIONS.includes(skillMd.distribution)) {
    report.checks.push({ id: 'DISTRIBUTION_VALID', pass: false, message: `Invalid distribution value: ${skillMd.distribution}` });
    report.compliant = false;
    return report;
  }
  report.distribution = skillMd.distribution;
  report.checks.push({ id: 'DISTRIBUTION_DECLARED', pass: true, message: `distribution: ${skillMd.distribution}` });

  // Internal skills pass all checks by default
  if (skillMd.distribution === 'internal') {
    report.checks.push({ id: 'INTERNAL_SKIP', pass: true, message: 'Internal skill — no external checks needed' });
    return report;
  }

  // Check 3: permissions declaration (external/both)
  const requiredPerms = ['filesystem', 'network', 'shell', 'credential'];
  if (!skillMd.permissions) {
    report.checks.push({ id: 'PERMISSIONS_DECLARED', pass: false, message: 'External/both skill missing permissions declaration' });
    report.compliant = false;
  } else {
    const missingPerms = requiredPerms.filter(p => skillMd.permissions[p] === undefined);
    if (missingPerms.length > 0) {
      report.checks.push({ id: 'PERMISSIONS_COMPLETE', pass: false, message: `Missing permission dimensions: ${missingPerms.join(', ')}` });
      report.compliant = false;
    } else {
      report.checks.push({ id: 'PERMISSIONS_COMPLETE', pass: true, message: 'All 4 permission dimensions declared' });
    }

    // Check credential must be 0
    if (skillMd.permissions.credential !== undefined && skillMd.permissions.credential !== 0) {
      report.checks.push({ id: 'CREDENTIAL_ZERO', pass: false, message: `credential must be 0 for external skills, got: ${skillMd.permissions.credential}` });
      report.compliant = false;
    } else if (skillMd.permissions.credential === 0) {
      report.checks.push({ id: 'CREDENTIAL_ZERO', pass: true, message: 'credential = 0 (no host credentials)' });
    }
  }

  // Check 4-6: Code scanning for external/both skills
  const files = scanFiles(skillDir);

  // Check 4: No .secrets references
  const secretsViolations = [];
  for (const file of files) {
    secretsViolations.push(...scanForViolations(file, SECRETS_PATTERNS, 'secrets_reference'));
  }
  if (secretsViolations.length > 0) {
    report.checks.push({ id: 'NO_SECRETS_REFS', pass: false, message: `Found ${secretsViolations.length} .secrets/ references` });
    report.violations.push(...secretsViolations);
    report.compliant = false;
  } else {
    report.checks.push({ id: 'NO_SECRETS_REFS', pass: true, message: 'No .secrets/ references found' });
  }

  // Check 5: No internal absolute paths
  const pathViolations = [];
  for (const file of files) {
    pathViolations.push(...scanForViolations(file, INTERNAL_PATH_PATTERNS, 'internal_path'));
  }
  if (pathViolations.length > 0) {
    report.checks.push({ id: 'NO_INTERNAL_PATHS', pass: false, message: `Found ${pathViolations.length} internal path references` });
    report.violations.push(...pathViolations);
    report.compliant = false;
  } else {
    report.checks.push({ id: 'NO_INTERNAL_PATHS', pass: true, message: 'No internal absolute paths found' });
  }

  // Check 6: No sensitive environment variables
  const envViolations = [];
  for (const file of files) {
    envViolations.push(...scanForViolations(file, SENSITIVE_ENV_PATTERNS, 'sensitive_env'));
  }
  if (envViolations.length > 0) {
    report.checks.push({ id: 'NO_SENSITIVE_ENV', pass: false, message: `Found ${envViolations.length} sensitive env var references` });
    report.violations.push(...envViolations);
    report.compliant = false;
  } else {
    report.checks.push({ id: 'NO_SENSITIVE_ENV', pass: true, message: 'No sensitive environment variables found' });
  }

  // Check 7: No hardcoded credentials
  const credViolations = [];
  for (const file of files) {
    credViolations.push(...scanForViolations(file, HARDCODED_CREDENTIAL_PATTERNS, 'hardcoded_credential'));
  }
  if (credViolations.length > 0) {
    report.checks.push({ id: 'NO_HARDCODED_CREDS', pass: false, message: `Found ${credViolations.length} hardcoded credential patterns` });
    report.violations.push(...credViolations);
    report.compliant = false;
  } else {
    report.checks.push({ id: 'NO_HARDCODED_CREDS', pass: true, message: 'No hardcoded credentials found' });
  }

  return report;
}

function formatReport(report) {
  const icon = report.compliant ? '✅' : '❌';
  let output = `${icon} ${report.skill} [${report.distribution || 'UNKNOWN'}]\n`;

  for (const check of report.checks) {
    output += `  ${check.pass ? '✓' : '✗'} ${check.id}: ${check.message}\n`;
  }

  if (report.violations.length > 0) {
    output += `  Violations (${report.violations.length}):\n`;
    for (const v of report.violations.slice(0, 10)) {
      const relFile = path.relative(report.path, v.file);
      output += `    - ${relFile}:${v.line} [${v.type}] ${v.match}\n`;
    }
    if (report.violations.length > 10) {
      output += `    ... and ${report.violations.length - 10} more\n`;
    }
  }

  return output;
}

function scanAllSkills(skillsRoot) {
  const reports = [];
  const entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(skillsRoot, entry.name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    if (fs.existsSync(skillMdPath)) {
      reports.push(checkSkill(skillDir));
    }
  }
  return reports;
}

// === Main ===

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const scanAll = args.includes('--scan-all');

  if (scanAll) {
    const skillsRoot = path.resolve(__dirname, '../skills');
    const reports = scanAllSkills(skillsRoot);
    
    if (jsonMode) {
      console.log(JSON.stringify(reports, null, 2));
    } else {
      console.log('=== Skill Distribution Compliance Report ===\n');
      const compliant = reports.filter(r => r.compliant);
      const nonCompliant = reports.filter(r => !r.compliant);
      
      console.log(`Total: ${reports.length} | Compliant: ${compliant.length} | Non-compliant: ${nonCompliant.length}\n`);
      
      for (const report of reports) {
        console.log(formatReport(report));
      }
      
      console.log('---');
      console.log(`Exit code: ${nonCompliant.length > 0 ? 1 : 0}`);
      process.exit(nonCompliant.length > 0 ? 1 : 0);
    }
  } else if (args.length > 0) {
    const skillDir = path.resolve(args[0]);
    if (!fs.existsSync(skillDir)) {
      console.error(`Error: Directory not found: ${skillDir}`);
      process.exit(1);
    }
    
    const report = checkSkill(skillDir);
    
    if (jsonMode) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatReport(report));
      process.exit(report.compliant ? 0 : 1);
    }
  } else {
    console.log('Usage:');
    console.log('  node skill-distribution-checker.js <skill-dir>        Check a single skill');
    console.log('  node skill-distribution-checker.js <skill-dir> --json Output as JSON');
    console.log('  node skill-distribution-checker.js --scan-all         Scan all skills');
    console.log('  node skill-distribution-checker.js --scan-all --json  Scan all, JSON output');
    process.exit(0);
  }
}

main();
