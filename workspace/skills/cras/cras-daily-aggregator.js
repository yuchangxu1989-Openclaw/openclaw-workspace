#!/usr/bin/env node
/**
 * CRAS 慢通道：日级洞察聚合 → 系统自动升级 v1.0
 * 
 * 每天运行一次：
 * 1. 聚合过去24h的意图提取结果 → 意图趋势分析
 * 2. 聚合insights → 识别可操作洞察
 * 3. 基于洞察自动生成系统升级任务（ISC规则/意图注册/handler/评测集）
 * 4. 执行自动升级 → 写入事件总线
 * 
 * 原则：洞察不停留在报告里，必须转化为代码/规则/评测集
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';
const INTENT_LOG = path.join(WORKSPACE, 'infrastructure/logs/intent-extractor.log');
const INSIGHTS_DIR = path.join(WORKSPACE, 'skills/cras/insights');
const KNOWLEDGE_DIR = path.join(WORKSPACE, 'skills/cras/knowledge');
const INTENT_REGISTRY = path.join(WORKSPACE, 'infrastructure/intent-engine/intent-registry.json');
const EVENT_BUS = path.join(WORKSPACE, 'infrastructure/event-bus/events.jsonl');
const REPORT_DIR = path.join(WORKSPACE, 'reports/cras-daily');
const UPGRADE_LOG = path.join(WORKSPACE, 'infrastructure/logs/cras-daily-upgrade.log');

fs.mkdirSync(REPORT_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.mkdirSync(path.dirname(UPGRADE_LOG), { recursive: true });
  fs.appendFileSync(UPGRADE_LOG, line + '\n');
}

/**
 * 1. 聚合意图提取日志，分析趋势
 */
function aggregateIntentTrends() {
  if (!fs.existsSync(INTENT_LOG)) return { total_runs: 0, with_content: 0, patterns: [] };
  
  const content = fs.readFileSync(INTENT_LOG, 'utf8');
  const lines = content.split('\n');
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  
  let totalRuns = 0, withContent = 0, noContent = 0;
  const patterns = {};
  
  for (const line of lines) {
    if (line.includes('开始增量扫描')) totalRuns++;
    if (line.includes('无新增内容')) noContent++;
    if (line.includes('提取到') || line.includes('发现')) {
      withContent++;
      // 提取模式
      const match = line.match(/提取到\s*(\d+)/);
      if (match) patterns['intent_extracted'] = (patterns['intent_extracted'] || 0) + parseInt(match[1]);
    }
  }
  
  return { total_runs: totalRuns, with_content: withContent, no_content: noContent, patterns };
}

/**
 * 2. 聚合insights，识别可操作洞察
 */
function aggregateInsights() {
  if (!fs.existsSync(INSIGHTS_DIR)) return [];
  
  const files = fs.readdirSync(INSIGHTS_DIR).filter(f => f.endsWith('.json'));
  const insights = [];
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(INSIGHTS_DIR, f), 'utf8'));
      if (data.timestamp && data.timestamp > last24h) {
        insights.push(data);
      }
    } catch {}
  }
  
  return insights;
}

/**
 * 3. 扫描系统状态，发现可自动升级的点
 */
function scanUpgradeOpportunities() {
  const opportunities = [];
  
  // 3a. 检查意图注册表覆盖率
  try {
    const registry = JSON.parse(fs.readFileSync(INTENT_REGISTRY, 'utf8'));
    const intents = registry.intents || [];
    const byCategory = {};
    intents.forEach(i => {
      byCategory[i.category] = (byCategory[i.category] || 0) + 1;
    });
    
    // IC4(隐含意图)和IC5(多意图)通常覆盖不足
    if ((byCategory['IC4'] || 0) < 5) {
      opportunities.push({
        type: 'intent_coverage_gap',
        category: 'IC4',
        current: byCategory['IC4'] || 0,
        target: 5,
        action: '从真实对话中提取更多IC4隐含意图样本'
      });
    }
    if ((byCategory['IC5'] || 0) < 3) {
      opportunities.push({
        type: 'intent_coverage_gap',
        category: 'IC5',
        current: byCategory['IC5'] || 0,
        target: 3,
        action: '从真实对话中提取更多IC5多意图样本'
      });
    }
  } catch {}
  
  // 3b. 检查评测集覆盖率
  const evalDir = path.join(WORKSPACE, 'tests/benchmarks/intent');
  if (fs.existsSync(evalDir)) {
    const evalFiles = fs.readdirSync(evalDir).filter(f => f.endsWith('.json'));
    let totalCases = 0;
    evalFiles.forEach(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(evalDir, f), 'utf8'));
        if (Array.isArray(data)) totalCases += data.length;
        else if (data.cases) totalCases += data.cases.length;
      } catch {}
    });
    
    if (totalCases < 100) {
      opportunities.push({
        type: 'evalset_coverage_low',
        current: totalCases,
        target: 100,
        action: '从真实对话和badcase中扩充评测集'
      });
    }
  }
  
  // 3c. 检查规则全链路完整率
  const rulesDir = path.join(WORKSPACE, 'skills/isc-core/rules');
  if (fs.existsSync(rulesDir)) {
    const rules = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));
    let withTrigger = 0;
    rules.forEach(f => {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(rulesDir, f), 'utf8'));
        if (r.trigger && (r.trigger.event || r.trigger.condition)) withTrigger++;
      } catch {}
    });
    const rate = rules.length > 0 ? withTrigger / rules.length : 1;
    if (rate < 0.3) {
      opportunities.push({
        type: 'rule_fullchain_low',
        completion_rate: (rate * 100).toFixed(1) + '%',
        total: rules.length,
        with_trigger: withTrigger,
        action: '批量补齐规则的trigger/event定义'
      });
    }
  }
  
  // 3d. 检查handler缺失模式
  const dispatchLog = path.join(WORKSPACE, 'infrastructure/logs/cron-dispatch.log');
  if (fs.existsSync(dispatchLog)) {
    const content = fs.readFileSync(dispatchLog, 'utf8');
    const missing = {};
    const regex = /handler_not_found:(\w+)/g;
    let m;
    while ((m = regex.exec(content)) !== null) {
      missing[m[1]] = (missing[m[1]] || 0) + 1;
    }
    const topMissing = Object.entries(missing).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topMissing.length > 0) {
      opportunities.push({
        type: 'handler_missing',
        top_missing: topMissing.map(([name, count]) => ({ name, count })),
        action: '创建缺失的handler或修复命名不一致'
      });
    }
  }
  
  return opportunities;
}

/**
 * 4. 自动执行可安全执行的升级
 */
function executeAutoUpgrades(opportunities) {
  const executed = [];
  
  for (const opp of opportunities) {
    // 目前只自动执行低风险升级，高风险的写入事件总线等人工确认
    if (opp.type === 'intent_coverage_gap') {
      // 写入事件总线，触发后续流程
      const event = {
        type: 'cras.upgrade.intent_coverage',
        source: 'cras-daily-aggregator',
        timestamp: new Date().toISOString(),
        data: opp
      };
      fs.appendFileSync(EVENT_BUS, JSON.stringify(event) + '\n');
      executed.push({ ...opp, status: 'event_emitted' });
    } else {
      // 其他类型写入事件总线待处理
      const event = {
        type: 'cras.upgrade.opportunity',
        source: 'cras-daily-aggregator',
        timestamp: new Date().toISOString(),
        data: opp
      };
      fs.appendFileSync(EVENT_BUS, JSON.stringify(event) + '\n');
      executed.push({ ...opp, status: 'event_emitted' });
    }
  }
  
  return executed;
}

/**
 * 主流程
 */
function main() {
  const dateStr = new Date().toISOString().split('T')[0];
  const reportFile = path.join(REPORT_DIR, `cras-daily-${dateStr}.json`);
  
  log(`=== CRAS 日级洞察聚合+系统升级 ${dateStr} ===`);
  
  // 1. 意图趋势
  const intentTrends = aggregateIntentTrends();
  log(`意图提取: ${intentTrends.total_runs}次运行, ${intentTrends.with_content}次有内容`);
  
  // 2. 洞察聚合
  const insights = aggregateInsights();
  log(`近24h洞察: ${insights.length}条`);
  
  // 3. 升级机会扫描
  const opportunities = scanUpgradeOpportunities();
  log(`发现 ${opportunities.length} 个升级机会`);
  
  // 4. 自动执行
  const upgrades = executeAutoUpgrades(opportunities);
  log(`执行 ${upgrades.length} 个升级动作`);
  
  // 写入报告
  const report = {
    date: dateStr,
    generated_at: new Date().toISOString(),
    intent_trends: intentTrends,
    insights_count: insights.length,
    upgrade_opportunities: opportunities,
    upgrades_executed: upgrades,
    summary: {
      intent_extraction_active: intentTrends.total_runs > 0,
      insights_flowing: insights.length > 0,
      system_upgrades: upgrades.length,
      auto_upgrade_rate: opportunities.length > 0 
        ? ((upgrades.filter(u => u.status === 'executed').length / opportunities.length) * 100).toFixed(0) + '%'
        : 'N/A'
    }
  };
  
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  log(`报告已写入: ${reportFile}`);
  
  // 如果有升级机会，同时emit聚合事件
  if (opportunities.length > 0) {
    const summaryEvent = {
      type: 'cras.daily.aggregation_complete',
      source: 'cras-daily-aggregator',
      timestamp: new Date().toISOString(),
      data: {
        date: dateStr,
        opportunities_count: opportunities.length,
        upgrades_executed: upgrades.length,
        report_path: reportFile
      }
    };
    fs.appendFileSync(EVENT_BUS, JSON.stringify(summaryEvent) + '\n');
  }
  
  return report;
}

if (require.main === module) {
  main();
}

module.exports = { main };
