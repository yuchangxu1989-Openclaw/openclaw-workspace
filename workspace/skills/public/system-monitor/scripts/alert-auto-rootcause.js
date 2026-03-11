#!/usr/bin/env node
/**
 * 告警根因自动分析器 v1.0
 * 
 * 当threshold-scanner产生新告警时，自动展开第一性原理根因链。
 * 从感知到执行端到端：
 *   感知(threshold-scanner) → 认知(本脚本根因分析) → 执行(生成修复任务/通知用户)
 * 
 * 通过cron每10分钟运行，检查alerts.jsonl中未分析的告警
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '../..');
const ALERTS_PATH = path.join(WORKSPACE, 'infrastructure/observability/alerts.jsonl');
const RESPONSE_LOG = path.join(WORKSPACE, 'infrastructure/observability/alert-responses.jsonl');
const ANALYSIS_DIR = path.join(WORKSPACE, 'infrastructure/observability/root-cause-analyses');
const LOG_PATH = path.join(WORKSPACE, 'infrastructure/logs/alert-auto-rootcause.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(LOG_PATH, line + '\n');
}

function loadRespondedKeys() {
  if (!fs.existsSync(RESPONSE_LOG)) return new Set();
  return new Set(
    fs.readFileSync(RESPONSE_LOG, 'utf8').trim().split('\n')
      .map(l => { try { return JSON.parse(l).alert_key; } catch { return null; } })
      .filter(Boolean)
  );
}

function loadAlerts() {
  if (!fs.existsSync(ALERTS_PATH)) return [];
  return fs.readFileSync(ALERTS_PATH, 'utf8').trim().split('\n')
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function alertKey(a) {
  return `${a.rule_id}@${a.timestamp_ms || a.timestamp}`;
}

/**
 * 根因分析模板 — 基于告警类型生成结构化根因链
 */
function generateRootCauseTemplate(alertGroup) {
  return {
    alert_rule_id: alertGroup.rule_id,
    alert_name: alertGroup.name,
    severity: alertGroup.severity,
    occurrence_count: alertGroup.count,
    time_range: { first: alertGroup.first, last: alertGroup.last },
    sample_message: alertGroup.sample_message,
    root_cause_chain: {
      layer1_symptom: alertGroup.sample_message,
      layer2_mechanism: '待分析：什么机制触发了这个告警？',
      layer3_design_flaw: '待分析：为什么系统设计允许这个问题发生？',
      layer4_first_principle: '待分析：违反了哪个第一性原理？'
    },
    fix_actions: [
      { action: '待定义', owner: 'auto', status: 'pending' }
    ],
    prevention: '待定义：如何防止未来再次发生',
    analyzed_at: new Date().toISOString(),
    auto_generated: true
  };
}

function run() {
  const alerts = loadAlerts();
  const responded = loadRespondedKeys();
  
  // 找未响应告警，按rule_id聚合
  const unresolved = {};
  for (const a of alerts) {
    if (responded.has(alertKey(a))) continue;
    if (!unresolved[a.rule_id]) {
      unresolved[a.rule_id] = {
        rule_id: a.rule_id, name: a.rule_name, severity: a.severity,
        count: 0, first: a.timestamp, last: a.timestamp,
        sample_message: a.message, alerts: []
      };
    }
    unresolved[a.rule_id].count++;
    unresolved[a.rule_id].last = a.timestamp;
    unresolved[a.rule_id].alerts.push(a);
  }
  
  const groups = Object.values(unresolved);
  if (groups.length === 0) {
    log('无未响应告警');
    return;
  }
  
  log(`发现 ${groups.length} 类未响应告警，生成根因分析模板...`);
  fs.mkdirSync(ANALYSIS_DIR, { recursive: true });
  
  for (const g of groups) {
    const analysis = generateRootCauseTemplate(g);
    const filename = `rca-${g.rule_id}-${Date.now()}.json`;
    fs.writeFileSync(path.join(ANALYSIS_DIR, filename), JSON.stringify(analysis, null, 2));
    log(`⚠️ [${g.severity.toUpperCase()}] ${g.name}: ${g.count}次未响应 → 根因模板: ${filename}`);
    
    // CRITICAL级别自动写入事件总线，触发通知
    if (g.severity === 'critical') {
      const eventPath = path.join(WORKSPACE, 'infrastructure/event-bus/events.jsonl');
      const event = {
        type: 'alert.critical.unresponded',
        source: 'alert-auto-rootcause',
        timestamp: new Date().toISOString(),
        data: {
          rule_id: g.rule_id,
          name: g.name,
          count: g.count,
          analysis_file: filename,
          action_required: '立即根因分析+修复'
        }
      };
      fs.appendFileSync(eventPath, JSON.stringify(event) + '\n');
      log(`🚨 CRITICAL告警已写入事件总线，等待处理`);
    }
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
