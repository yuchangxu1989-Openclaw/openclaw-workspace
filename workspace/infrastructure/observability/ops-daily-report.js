'use strict';

/**
 * Agent 运营五层仪表盘日报生成器
 * 
 * 从"监控代码流水线"升级为"监控认知-决策-执行闭环"。
 * 五层: L1意图 → L2决策 → L3执行 → L4效果(AEO) → L5系统健康
 * 
 * [Day2 Gap2 升级] 现在委托给 pipeline-dashboard-collector + autonomous-pipeline-monitor
 * 保持向后兼容的 generateOpsDailyReport() 接口
 * 
 * @module infrastructure/observability/ops-daily-report
 */

const fs = require('fs');
const path = require('path');
const REPORTS_DIR = path.resolve(__dirname, '..', '..', 'reports');

/**
 * Generate full ops daily report using the unified 5-layer dashboard pipeline.
 * @param {object} [options]
 * @returns {string} Markdown report
 */
function generateOpsDailyReport(options = {}) {
  try {
    const collector = require('./pipeline-dashboard-collector');
    const monitor = require('./autonomous-pipeline-monitor');

    const snapshot = collector.collectAll({ windowHours: 24 });
    const previous = collector.loadLastSnapshot();
    const delta = monitor.computeDelta(snapshot, previous);
    collector.persist(snapshot);

    return monitor.generateMarkdownReport(snapshot, delta);
  } catch (err) {
    // Fallback: return minimal error report
    return `# ❌ 运营日报生成失败\n\n错误: ${err.message}\n\n请检查 pipeline-dashboard-collector.js 和 autonomous-pipeline-monitor.js\n`;
  }
}

// ─── CLI ─────────────────────────────────────────────────────────

if (require.main === module) {
  const report = generateOpsDailyReport();

  // Ensure reports dir
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  // Determine output file
  const outFile = process.argv[2] || path.join(REPORTS_DIR, `ops-dashboard-${new Date().toISOString().slice(0, 10)}.md`);
  fs.writeFileSync(outFile, report, 'utf8');
  console.log(`[ops-daily-report] Written to ${outFile}`);
  console.log(`[ops-daily-report] Report length: ${report.length} chars`);
}

module.exports = { generateOpsDailyReport };
