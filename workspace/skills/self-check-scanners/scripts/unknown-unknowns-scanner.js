#!/usr/bin/env node
/**
 * "知道自己不知道"扫描器 v1.0
 * 
 * 定期扫描本地系统的认知盲区：
 * 1. 意图识别的no-match率（不知道用户在说什么）
 * 2. 规则库的全链路缺失率（知道规则但不知道怎么执行）
 * 3. handler_not_found的模式（系统声称有能力但实际缺失）
 * 4. 告警响应率（发生了问题但不知道该处理）
 * 5. 评测集 vs 实际场景的覆盖差距（以为覆盖了但实际没覆盖）
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';

function checkIntentNoMatch() {
  // 检查意图识别的未匹配候选
  const candidatePath = path.join(WORKSPACE, 'infrastructure/intent-engine/unknown-candidates.jsonl');
  const registryPath = path.join(WORKSPACE, 'infrastructure/intent-engine/intent-registry.json');
  
  let unknownCount = 0;
  if (fs.existsSync(candidatePath)) {
    unknownCount = fs.readFileSync(candidatePath, 'utf8').trim().split('\n').filter(l => l).length;
  }
  
  let registeredCount = 0;
  if (fs.existsSync(registryPath)) {
    const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    registeredCount = (reg.intents || []).length;
  }
  
  return {
    check: '意图识别盲区',
    registered_intents: registeredCount,
    unknown_candidates: unknownCount,
    gap: unknownCount > 0 ? `${unknownCount}个未知意图等待分类` : '无积压',
    risk: unknownCount > 10 ? 'HIGH' : unknownCount > 0 ? 'MEDIUM' : 'LOW'
  };
}

function checkRuleFullchain() {
  // 检查规则全链路缺失率
  const rulesDir = path.join(WORKSPACE, 'skills/isc-core/rules');
  if (!fs.existsSync(rulesDir)) return { check: '规则全链路', error: '规则目录不存在' };
  
  const ruleFiles = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));
  let withTrigger = 0, withAction = 0;
  
  for (const f of ruleFiles) {
    try {
      const rule = JSON.parse(fs.readFileSync(path.join(rulesDir, f), 'utf8'));
      if (rule.trigger && (rule.trigger.event || rule.trigger.condition || rule.trigger.hook)) withTrigger++;
      if (rule.action && (rule.action.type || rule.action.method || rule.action.skill)) withAction++;
    } catch {}
  }
  
  const total = ruleFiles.length;
  const incomplete = total - Math.min(withTrigger, withAction);
  
  return {
    check: '规则全链路完整性',
    total_rules: total,
    with_trigger: withTrigger,
    with_action: withAction,
    incomplete,
    completion_rate: total > 0 ? ((Math.min(withTrigger, withAction) / total) * 100).toFixed(1) + '%' : 'N/A',
    risk: incomplete > total * 0.5 ? 'HIGH' : incomplete > total * 0.2 ? 'MEDIUM' : 'LOW'
  };
}

function checkHandlerGaps() {
  // 检查handler_not_found的模式
  const logPath = path.join(WORKSPACE, 'infrastructure/logs/cron-dispatch.log');
  if (!fs.existsSync(logPath)) return { check: 'Handler缺失', error: '日志不存在' };
  
  const content = fs.readFileSync(logPath, 'utf8');
  const missingHandlers = {};
  const regex = /handler_not_found:(\S+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const name = match[1].replace(/[",}]/g, '');
    missingHandlers[name] = (missingHandlers[name] || 0) + 1;
  }
  
  return {
    check: 'Handler能力缺失',
    missing_handlers: missingHandlers,
    total_missing_types: Object.keys(missingHandlers).length,
    total_failures: Object.values(missingHandlers).reduce((a, b) => a + b, 0),
    risk: Object.keys(missingHandlers).length > 3 ? 'HIGH' : Object.keys(missingHandlers).length > 0 ? 'MEDIUM' : 'LOW'
  };
}

function checkAlertResponseRate() {
  const alertsPath = path.join(WORKSPACE, 'infrastructure/observability/alerts.jsonl');
  const responsePath = path.join(WORKSPACE, 'infrastructure/observability/alert-responses.jsonl');
  
  let totalAlerts = 0, respondedAlerts = 0;
  if (fs.existsSync(alertsPath)) {
    totalAlerts = fs.readFileSync(alertsPath, 'utf8').trim().split('\n').filter(l => l).length;
  }
  if (fs.existsSync(responsePath)) {
    respondedAlerts = fs.readFileSync(responsePath, 'utf8').trim().split('\n').filter(l => l).length;
  }
  
  const unresponded = totalAlerts - respondedAlerts;
  return {
    check: '告警响应率',
    total_alerts: totalAlerts,
    responded: respondedAlerts,
    unresponded,
    response_rate: totalAlerts > 0 ? ((respondedAlerts / totalAlerts) * 100).toFixed(1) + '%' : 'N/A',
    risk: unresponded > 5 ? 'HIGH' : unresponded > 0 ? 'MEDIUM' : 'LOW'
  };
}

function run() {
  console.log('🔍 "知道自己不知道" 系统盲区扫描\n');
  
  const results = [
    checkIntentNoMatch(),
    checkRuleFullchain(),
    checkHandlerGaps(),
    checkAlertResponseRate()
  ];
  
  let highRisk = 0, mediumRisk = 0;
  for (const r of results) {
    const icon = r.risk === 'HIGH' ? '🔴' : r.risk === 'MEDIUM' ? '🟡' : '🟢';
    console.log(`${icon} ${r.check}: ${r.risk || 'OK'}`);
    if (r.error) console.log(`   错误: ${r.error}`);
    else {
      Object.entries(r).filter(([k]) => !['check', 'risk'].includes(k)).forEach(([k, v]) => {
        if (typeof v === 'object') console.log(`   ${k}: ${JSON.stringify(v)}`);
        else console.log(`   ${k}: ${v}`);
      });
    }
    console.log('');
    if (r.risk === 'HIGH') highRisk++;
    if (r.risk === 'MEDIUM') mediumRisk++;
  }
  
  console.log(`📊 总结: ${highRisk}个高风险盲区, ${mediumRisk}个中风险盲区`);
  
  // 写入报告
  const reportPath = path.join(WORKSPACE, 'reports/unknown-unknowns-scan.json');
  fs.writeFileSync(reportPath, JSON.stringify({ scan_time: new Date().toISOString(), results, summary: { highRisk, mediumRisk } }, null, 2));
  
  return results;
}

if (require.main === module) run();
module.exports = { run };
