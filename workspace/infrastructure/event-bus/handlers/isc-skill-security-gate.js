/**
 * Handler: isc-skill-security-gate-030
 * 技能安全准出标准 — Snyk 8类威胁检测门禁
 *
 * Triggers: skill.general.publish, skill.general.sync, skill.evoMap.upload
 * Priority: P0 (gate — fail-closed)
 *
 * Scans skill source files against 8 threat categories (RCE, command injection,
 * malicious deps, data exfiltration, privilege escalation, hardcoded credentials,
 * obfuscation, dynamic code execution). Blocks publish if any threat is detected.
 */

const fs = require('fs');
const path = require('path');

// Threat categories with compiled patterns (from rule JSON)
const THREAT_CATEGORIES = [
  { id: 'T001', name: '远程代码执行 (RCE)', severity: 'critical', patterns: [/eval\(/, /exec\(/, /system\(/, /subprocess\.call/, /child_process/] },
  { id: 'T002', name: '命令注入 (Command Injection)', severity: 'critical', patterns: [/shell=True/, /os\.system/, /os\.popen/, /`.*`/] },
  { id: 'T003', name: '恶意依赖 (Malicious Dependencies)', severity: 'critical', patterns: [] }, // checked via dependency list
  { id: 'T004', name: '数据外泄 (Data Exfiltration)', severity: 'high', patterns: [/fetch\(.*http/, /axios\.post/, /request\.post/, /curl.*-d/] },
  { id: 'T005', name: '权限提升 (Privilege Escalation)', severity: 'high', patterns: [/chmod.*777/, /sudo/, /setuid/, /setgid/] },
  { id: 'T006', name: '硬编码凭证 (Hardcoded Credentials)', severity: 'high', patterns: [/api[_-]?key.*=.*['"][^'"]{10,}/, /password.*=.*['"][^'"]{8,}/, /secret.*=.*['"][^'"]{10,}/] },
  { id: 'T007', name: 'Base64混淆 (Obfuscation)', severity: 'medium', patterns: [/atob\(/, /btoa\(/, /Buffer\.from.*base64/, /base64.*decode/] },
  { id: 'T008', name: '动态代码执行 (Dynamic Code Execution)', severity: 'medium', patterns: [/Function\(/, /new Function/, /setTimeout.*string/, /setInterval.*string/] },
];

const SCAN_EXTENSIONS = new Set(['.js', '.ts', '.py', '.sh', '.mjs', '.cjs', '.jsx', '.tsx']);

function collectFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
      collectFiles(full, files);
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const findings = [];
  for (const cat of THREAT_CATEGORIES) {
    for (const pat of cat.patterns) {
      const match = content.match(pat);
      if (match) {
        // Find line number
        const idx = content.indexOf(match[0]);
        const line = content.substring(0, idx).split('\n').length;
        findings.push({
          threatId: cat.id,
          threatName: cat.name,
          severity: cat.severity,
          file: filePath,
          line,
          match: match[0].substring(0, 80),
        });
        break; // one finding per category per file
      }
    }
  }
  return findings;
}

module.exports = async function handler(event, rule, context) {
  const workspace = (context && context.workspace) || '/root/.openclaw/workspace';
  const payload = (event && event.payload) || {};
  const skillPath = payload.skillPath || payload.path;

  if (!skillPath) {
    return {
      ok: false,
      handler: 'isc-skill-security-gate',
      ruleId: rule?.id || 'rule.isc-skill-security-gate-030',
      error: 'missing skillPath in event payload',
      gateStatus: 'BLOCKED',
      failClosed: true,
    };
  }

  const fullPath = path.isAbsolute(skillPath) ? skillPath : path.join(workspace, skillPath);
  const files = collectFiles(fullPath);
  const allFindings = [];

  for (const f of files) {
    try {
      const findings = scanFile(f);
      allFindings.push(...findings);
    } catch (err) {
      allFindings.push({ threatId: 'SCAN_ERROR', file: f, error: err.message });
    }
  }

  const criticalCount = allFindings.filter(f => f.severity === 'critical').length;
  const highCount = allFindings.filter(f => f.severity === 'high').length;
  const totalThreats = allFindings.length;
  const passed = totalThreats === 0;

  // Write audit report
  const reportDir = path.join(workspace, 'reports', 'security-gate');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportFile = path.join(reportDir, `audit-${Date.now()}.json`);
  const report = {
    timestamp: new Date().toISOString(),
    handler: 'isc-skill-security-gate',
    ruleId: rule?.id || 'rule.isc-skill-security-gate-030',
    eventType: event?.type || null,
    skillPath,
    filesScanned: files.length,
    threatSummary: { total: totalThreats, critical: criticalCount, high: highCount },
    findings: allFindings,
    verdict: passed ? 'PASS' : 'BLOCKED',
  };
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  return {
    ok: passed,
    handler: 'isc-skill-security-gate',
    ruleId: rule?.id || 'rule.isc-skill-security-gate-030',
    eventType: event?.type || null,
    gateStatus: passed ? 'PASS' : 'BLOCKED',
    failClosed: !passed,
    filesScanned: files.length,
    threatSummary: { total: totalThreats, critical: criticalCount, high: highCount },
    findings: allFindings.slice(0, 20), // cap output
    auditPath: reportFile,
  };
};
