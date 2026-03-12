#!/usr/bin/env node
/**
 * unknown-unknowns 扫描器 v2
 * 目标：只输出可证伪、可执行、与当前系统真实状态绑定的盲区。
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';
const OUTPUT_DIR = path.join(WORKSPACE, 'reports/unknown-unknowns');
const CONFIRMED_PATH = path.join(OUTPUT_DIR, 'confirmed-gaps.jsonl');

function safeRead(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function countJsonl(filePath) {
  const raw = safeRead(filePath).trim();
  if (!raw) return 0;
  return raw.split('\n').filter(Boolean).length;
}

function nowDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function listRuleFiles() {
  const rulesDir = path.join(WORKSPACE, 'skills/isc-core/rules');
  if (!fs.existsSync(rulesDir)) return { rulesDir, files: [] };
  return {
    rulesDir,
    files: fs.readdirSync(rulesDir).filter(f => f.endsWith('.json')).map(f => path.join(rulesDir, f))
  };
}

function parseRule(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function scanRuleChainGap() {
  const { rulesDir, files } = listRuleFiles();
  if (!fs.existsSync(rulesDir)) {
    return {
      id: 'RULE_DIR_MISSING',
      title: '规则目录不存在，无法确认规则链路覆盖',
      blind_spot: `缺少规则目录: ${rulesDir}`,
      evidence: { rules_dir_exists: false },
      verify: [`test -d ${rulesDir}`],
      impact: 'HIGH（规则治理失效）',
      risk: 'HIGH'
    };
  }

  const incomplete = [];
  for (const file of files) {
    const rule = parseRule(file);
    if (!rule) {
      incomplete.push({ file: path.basename(file), reason: 'json_parse_error' });
      continue;
    }
    const hasTrigger = !!(rule.trigger && (rule.trigger.event || rule.trigger.condition || rule.trigger.hook));
    const hasAction = !!(rule.action && (rule.action.type || rule.action.method || rule.action.skill));
    if (!hasTrigger || !hasAction) {
      incomplete.push({
        file: path.basename(file),
        has_trigger: hasTrigger,
        has_action: hasAction
      });
    }
  }

  if (incomplete.length === 0) return null;

  return {
    id: 'RULE_CHAIN_INCOMPLETE',
    title: '规则存在触发/动作链路缺口',
    blind_spot: `在 ${files.length} 条规则中检测到 ${incomplete.length} 条不完整规则（缺 trigger 或 action）`,
    evidence: {
      total_rules: files.length,
      incomplete_count: incomplete.length,
      sample: incomplete.slice(0, 10)
    },
    verify: [
      `node -e "const fs=require('fs');const p='${rulesDir}';const files=fs.readdirSync(p).filter(f=>f.endsWith('.json'));let bad=[];for(const f of files){try{const r=JSON.parse(fs.readFileSync(p+'/'+f,'utf8'));const t=!!(r.trigger&&(r.trigger.event||r.trigger.condition||r.trigger.hook));const a=!!(r.action&&(r.action.type||r.action.method||r.action.skill));if(!t||!a)bad.push(f);}catch{bad.push(f+':parse_error')}};console.log(JSON.stringify({total:files.length,bad:bad.length,sample:bad.slice(0,20)},null,2));"`
    ],
    impact: incomplete.length > 50 ? 'HIGH（规则无法闭环执行，治理面失真）' : 'MEDIUM（部分规则不可执行）',
    risk: incomplete.length > 50 ? 'HIGH' : 'MEDIUM'
  };
}

function scanHandlerNotFoundGap() {
  const logPath = path.join(WORKSPACE, 'infrastructure/logs/cron-dispatch.log');
  if (!fs.existsSync(logPath)) return null;

  const content = safeRead(logPath);
  const regex = /handler_not_found:(\S+)/g;
  const counter = {};
  let m;
  while ((m = regex.exec(content)) !== null) {
    const name = m[1].replace(/[",}]/g, '');
    counter[name] = (counter[name] || 0) + 1;
  }

  const entries = Object.entries(counter).sort((a,b)=>b[1]-a[1]);
  const total = entries.reduce((s, [,c]) => s + c, 0);
  if (total === 0) return null;

  return {
    id: 'HANDLER_NOT_FOUND_PATTERN',
    title: '调度日志存在持续 handler_not_found',
    blind_spot: `发现 ${entries.length} 类缺失 handler，累计失败 ${total} 次`,
    evidence: {
      log: logPath,
      missing_types: entries.length,
      total_failures: total,
      top: entries.slice(0, 10)
    },
    verify: [
      `grep -o 'handler_not_found:[^ ,}]\+' ${logPath} | sed 's/handler_not_found://' | sort | uniq -c | sort -nr | head -20`
    ],
    impact: total > 100 ? 'HIGH（调度任务声明能力与实际执行能力脱节）' : 'MEDIUM（局部能力缺失）',
    risk: total > 100 ? 'HIGH' : 'MEDIUM'
  };
}

function scanAlertActionSinkGap() {
  const alertsPath = path.join(WORKSPACE, 'infrastructure/observability/alerts.jsonl');
  const responsesPath = path.join(WORKSPACE, 'infrastructure/observability/alert-responses.jsonl');
  const reportsDailyDir = path.join(WORKSPACE, 'reports/daily');

  const totalAlerts = countJsonl(alertsPath);
  const responded = countJsonl(responsesPath);
  const dailyExists = fs.existsSync(reportsDailyDir);

  // 可证伪盲区：response 计数 == alerts 计数，但缺少“行动产物”映射证明
  const blind = totalAlerts > 0 && responded >= totalAlerts && !dailyExists;
  if (!blind) return null;

  return {
    id: 'ALERT_RESPONSE_NO_ACTION_ARTIFACT',
    title: '告警响应计数闭环，但行动产物缺失',
    blind_spot: `alerts=${totalAlerts}, responses=${responded}；但缺少 ${reportsDailyDir} 行动报告目录，无法证明响应已转化为行动`,
    evidence: {
      alerts_path: alertsPath,
      responses_path: responsesPath,
      total_alerts: totalAlerts,
      responded,
      action_artifact_dir_exists: dailyExists
    },
    verify: [
      `wc -l ${alertsPath} ${responsesPath}`,
      `test -d ${reportsDailyDir} && echo ACTION_ARTIFACT_DIR_EXISTS || echo ACTION_ARTIFACT_DIR_MISSING`
    ],
    impact: 'HIGH（会把“已记录响应”误判为“已完成处置”）',
    risk: 'HIGH'
  };
}

function buildMarkdown(findings) {
  const date = nowDate();
  const lines = [];
  lines.push(`# Unknown Unknowns Scan - ${date}`);
  lines.push('');
  lines.push('仅保留可证伪、可执行的盲区项。');
  lines.push('');

  if (findings.length === 0) {
    lines.push('## 结果');
    lines.push('未发现满足“可证伪 + 可执行”标准的盲区。');
    return lines.join('\n');
  }

  findings.forEach((f, idx) => {
    lines.push(`## ${idx + 1}. ${f.title} [${f.risk}]`);
    lines.push(`- 具体盲区：${f.blind_spot}`);
    lines.push(`- 影响评估：${f.impact}`);
    lines.push('- 证据：');
    lines.push('```json');
    lines.push(JSON.stringify(f.evidence, null, 2));
    lines.push('```');
    lines.push('- 如何验证：');
    for (const cmd of f.verify) lines.push('  - `' + cmd + '`');
    lines.push('');
  });

  return lines.join('\n');
}

function appendConfirmed(findings, reportPath) {
  if (findings.length === 0) return;
  const ts = new Date().toISOString();
  const rows = findings.map(f => JSON.stringify({
    ts,
    id: f.id,
    title: f.title,
    risk: f.risk,
    impact: f.impact,
    blind_spot: f.blind_spot,
    evidence: f.evidence,
    verify: f.verify,
    report: reportPath
  }));
  fs.appendFileSync(CONFIRMED_PATH, rows.join('\n') + '\n');
}

function run() {
  ensureDir(OUTPUT_DIR);

  const findings = [
    scanRuleChainGap(),
    scanHandlerNotFoundGap(),
    scanAlertActionSinkGap()
  ].filter(Boolean);

  const date = nowDate();
  const reportPath = path.join(OUTPUT_DIR, `scan-${date}.md`);
  const md = buildMarkdown(findings);
  fs.writeFileSync(reportPath, md);

  appendConfirmed(findings, reportPath);

  console.log(`[unknown-unknowns] report=${reportPath} findings=${findings.length}`);
  console.log(`[unknown-unknowns] confirmed_sink=${CONFIRMED_PATH}`);

  return { reportPath, findingsCount: findings.length, confirmedPath: CONFIRMED_PATH };
}

if (require.main === module) run();
module.exports = { run };
