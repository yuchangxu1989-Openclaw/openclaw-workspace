'use strict';

/**
 * ISC Handler: cras-daily-report
 * Rule: rule.cras-daily-report-001
 * Triggers on cron.cras-daily-report — generates and delivers CRAS daily
 * insight report covering 5 modules: learning, user, knowledge, strategy, evolution.
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  scanFiles,
  checkFileExists,
  gateResult,
  gitExec,
} = require('../lib/handler-utils');

const MODULES = ['learning', 'user', 'knowledge', 'strategy', 'evolution'];

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  logger.info?.('[cras-daily-report] Generating CRAS daily insight report');

  const checks = [];
  const moduleInsights = {};

  // Check each CRAS module for today's insights
  for (const mod of MODULES) {
    const insightsDir = path.join(root, 'skills/cras', mod, 'insights');
    let found = false;
    let insightCount = 0;

    if (checkFileExists(insightsDir)) {
      const today = new Date().toISOString().slice(0, 10);
      scanFiles(insightsDir, /\.json$/, (filePath) => {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(content);
          const ts = data.timestamp || data.created_at || '';
          if (ts.startsWith(today)) {
            insightCount++;
            found = true;
          }
        } catch {}
      }, { maxDepth: 2 });
    }

    moduleInsights[mod] = { found, count: insightCount };
    checks.push({
      name: `module_${mod}_has_insights`,
      ok: found,
      message: found
        ? `Module ${mod}: ${insightCount} insight(s) today`
        : `Module ${mod}: no insights found for today (graceful skip)`,
    });
  }

  // Per-module graceful failover: report is valid even if some modules have no data
  const modulesWithData = MODULES.filter(m => moduleInsights[m].found);
  const reportValid = true; // graceful — always produce report

  // Build markdown report
  const reportDate = new Date().toISOString().slice(0, 10);
  const lines = [`# CRAS 每日洞察报告 — ${reportDate}\n`];
  for (const mod of MODULES) {
    const info = moduleInsights[mod];
    lines.push(`## ${mod}`);
    if (info.found) {
      lines.push(`- 洞察数: ${info.count}`);
    } else {
      lines.push('- 今日无新洞察');
    }
    lines.push('');
  }
  lines.push(`> 有数据模块: ${modulesWithData.length}/${MODULES.length}`);

  // ─── 断裂点#4修复：Badcase统计 ───
  const badcaseStats = { total: 0, byCategory: {}, bySeverity: {}, items: [] };
  const today = new Date().toISOString().slice(0, 10);
  const badcaseDirs = [
    path.join(root, 'logs', 'badcases'),
    path.join(root, 'memory', 'badcases'),
  ];
  const seenIds = new Set();
  for (const dir of badcaseDirs) {
    if (!checkFileExists(dir)) continue;
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f.includes(today));
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
          if (seenIds.has(data.id)) continue;
          seenIds.add(data.id);
          badcaseStats.total++;
          const cat = data.category || 'uncategorized';
          const sev = data.severity || 'P2';
          badcaseStats.byCategory[cat] = (badcaseStats.byCategory[cat] || 0) + 1;
          badcaseStats.bySeverity[sev] = (badcaseStats.bySeverity[sev] || 0) + 1;
          badcaseStats.items.push({ id: data.id, category: cat, severity: sev, label: data.label || '' });
        } catch {}
      }
    } catch {}
  }
  // 也扫描 tests/badcases/ 日索引
  const testIndexPath = path.join(root, 'tests', 'badcases', `${today}-collected.json`);
  if (checkFileExists(testIndexPath)) {
    try {
      const entries = JSON.parse(fs.readFileSync(testIndexPath, 'utf8'));
      if (Array.isArray(entries)) {
        for (const data of entries) {
          if (seenIds.has(data.id)) continue;
          seenIds.add(data.id);
          badcaseStats.total++;
          const cat = data.category || 'uncategorized';
          const sev = data.severity || 'P2';
          badcaseStats.byCategory[cat] = (badcaseStats.byCategory[cat] || 0) + 1;
          badcaseStats.bySeverity[sev] = (badcaseStats.bySeverity[sev] || 0) + 1;
          badcaseStats.items.push({ id: data.id, category: cat, severity: sev, label: data.label || '' });
        }
      }
    } catch {}
  }

  lines.push('');
  lines.push('## Badcase统计');
  if (badcaseStats.total === 0) {
    lines.push('- 今日无新badcase');
  } else {
    lines.push(`- 今日新增: ${badcaseStats.total}例`);
    lines.push('- 按分类:');
    for (const [cat, count] of Object.entries(badcaseStats.byCategory).sort((a, b) => b[1] - a[1])) {
      lines.push(`  - ${cat}: ${count}`);
    }
    lines.push('- 按严重度:');
    for (const [sev, count] of Object.entries(badcaseStats.bySeverity).sort()) {
      lines.push(`  - ${sev}: ${count}`);
    }
  }

  // ISC改进建议汇总
  const suggestDir = path.join(root, 'logs', 'isc-suggestions');
  const suggestions = [];
  if (checkFileExists(suggestDir)) {
    try {
      const files = fs.readdirSync(suggestDir).filter(f => f.endsWith('.json') && f.includes(today));
      for (const file of files) {
        try {
          const s = JSON.parse(fs.readFileSync(path.join(suggestDir, file), 'utf8'));
          if (s.rule && s.suggestion) suggestions.push(s);
        } catch {}
      }
    } catch {}
  }
  if (suggestions.length > 0) {
    lines.push('');
    lines.push('## ISC规则改进建议');
    const ruleMap = {};
    for (const s of suggestions) {
      if (!ruleMap[s.rule]) ruleMap[s.rule] = { suggestion: s.suggestion, count: 0 };
      ruleMap[s.rule].count++;
    }
    for (const [rule, info] of Object.entries(ruleMap).sort((a, b) => b[1].count - a[1].count)) {
      lines.push(`- **${rule}** (${info.count}次): ${info.suggestion}`);
    }
  }

  const markdownReport = lines.join('\n');

  // Write structured report
  const result = gateResult(rule?.id || 'rule.cras-daily-report-001', checks, { failClosed: false });

  const reportPath = path.join(root, 'reports', 'cras-daily-report', `report-${reportDate}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'cras-daily-report',
    eventType: event?.type || 'cron.cras-daily-report',
    ruleId: rule?.id || null,
    lastCommit: gitExec(root, 'log --oneline -1'),
    modulesWithData: modulesWithData.length,
    totalModules: MODULES.length,
    moduleInsights,
    badcaseStats,
    iscSuggestions: suggestions.length,
    markdown: markdownReport,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  // Write markdown version
  const mdPath = path.join(root, 'reports', 'cras-daily-report', `report-${reportDate}.md`);
  fs.mkdirSync(path.dirname(mdPath), { recursive: true });
  fs.writeFileSync(mdPath, markdownReport, 'utf8');
  actions.push(`markdown_written:${mdPath}`);

  await emitEvent(bus, 'cras-daily-report.completed', {
    ok: reportValid,
    modulesWithData: modulesWithData.length,
    actions,
  });

  return {
    ok: reportValid,
    autonomous: true,
    actions,
    message: `CRAS daily report generated: ${modulesWithData.length}/${MODULES.length} modules with data`,
    markdown: markdownReport,
    ...result,
  };
};
