#!/usr/bin/env node
/**
 * 告警响应守卫 v1.0
 * 
 * 扫描 alerts.jsonl，检测未响应的告警，生成根因分析报告
 * 接入 heartbeat 和 cron 双通道
 * 
 * 原则：告警 ≠ 通知。告警 = 必须行动的事件。
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '../..');
const ALERTS_PATH = path.join(WORKSPACE, 'infrastructure/observability/alerts.jsonl');
const RESPONSE_LOG = path.join(WORKSPACE, 'infrastructure/observability/alert-responses.jsonl');
const REPORT_PATH = path.join(WORKSPACE, 'infrastructure/observability/unresolved-alerts.json');

function loadAlerts() {
  if (!fs.existsSync(ALERTS_PATH)) return [];
  return fs.readFileSync(ALERTS_PATH, 'utf8').trim().split('\n')
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function loadResponses() {
  if (!fs.existsSync(RESPONSE_LOG)) return new Set();
  const lines = fs.readFileSync(RESPONSE_LOG, 'utf8').trim().split('\n');
  const ids = new Set();
  lines.forEach(l => {
    try { ids.add(JSON.parse(l).alert_key); } catch {}
  });
  return ids;
}

function alertKey(a) {
  return `${a.rule_id}@${a.timestamp_ms || a.timestamp}`;
}

function scan() {
  const alerts = loadAlerts();
  const responded = loadResponses();
  
  // 按rule_id聚合未响应告警
  const unresolved = {};
  let unresolvedCount = 0;
  
  for (const a of alerts) {
    const key = alertKey(a);
    if (responded.has(key)) continue;
    
    if (!unresolved[a.rule_id]) {
      unresolved[a.rule_id] = {
        rule_id: a.rule_id,
        name: a.rule_name,
        severity: a.severity,
        count: 0,
        first: a.timestamp,
        last: a.timestamp,
        sample_message: a.message
      };
    }
    unresolved[a.rule_id].count++;
    unresolved[a.rule_id].last = a.timestamp;
    unresolvedCount++;
  }
  
  const groups = Object.values(unresolved).sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    return (sev[a.severity] || 3) - (sev[b.severity] || 3);
  });
  
  const report = {
    scan_time: new Date().toISOString(),
    total_alerts: alerts.length,
    responded: responded.size,
    unresolved_count: unresolvedCount,
    unresolved_groups: groups
  };
  
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  
  // 输出
  if (groups.length === 0) {
    console.log('✅ 所有告警已响应');
    return report;
  }
  
  console.log(`⚠️ ${unresolvedCount} 条未响应告警（${groups.length} 类）:\n`);
  for (const g of groups) {
    console.log(`  ${g.severity.toUpperCase().padEnd(10)} ${g.name} (${g.count}次)`);
    console.log(`    样本: ${g.sample_message}`);
    console.log(`    时间: ${g.first} ~ ${g.last}`);
    console.log('');
  }
  
  return report;
}

/**
 * 标记告警已响应
 */
function markResolved(ruleId, resolution) {
  const alerts = loadAlerts();
  const entries = alerts
    .filter(a => a.rule_id === ruleId)
    .map(a => JSON.stringify({
      alert_key: alertKey(a),
      rule_id: ruleId,
      resolved_at: new Date().toISOString(),
      resolution
    }));
  
  if (entries.length > 0) {
    fs.mkdirSync(path.dirname(RESPONSE_LOG), { recursive: true });
    fs.appendFileSync(RESPONSE_LOG, entries.join('\n') + '\n');
    console.log(`✅ 标记 ${entries.length} 条 ${ruleId} 告警已响应: ${resolution}`);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === 'resolve' && args[1]) {
    markResolved(args[1], args.slice(2).join(' ') || 'manually resolved');
  } else {
    scan();
  }
}

module.exports = { scan, markResolved, loadAlerts };
