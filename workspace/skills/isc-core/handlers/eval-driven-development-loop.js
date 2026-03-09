/**
 * eval-driven-development-loop - 评测驱动开发闭环门禁
 *
 * 规则: rule.eval-driven-development-loop-001
 * 职责: 检查功能开发是否完整执行了10个phase评测闭环，缺失phase阻止交付
 */
const path = require('path');
const { writeReport, emitEvent, scanFiles, readRuleJson, gateResult } = require('../lib/handler-utils');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const REQUIRED_PHASES = [
  '场景化数据采集', '评测标准设计', '评测集构建', '评测执行与报告',
  'Badcase分析', '根因分析', '差距分析', '优化评测集与标准',
  '优化知识/记忆与工程实现', '优化架构',
];

module.exports = {
  name: 'eval-driven-development-loop',
  ruleId: 'rule.eval-driven-development-loop-001',

  /**
   * @param {Object} context
   * @param {string} context.deliverablePath - 交付物路径
   * @param {Object} [context.evalReport] - 评测报告对象
   * @param {string[]} [context.completedPhases] - 已完成的phase名称列表
   * @param {Object} [context.bus] - 事件总线
   */
  async execute(context = {}) {
    const { deliverablePath, evalReport, completedPhases = [], bus } = context;
    const checks = [];

    // 检查每个phase是否完成
    for (let i = 0; i < REQUIRED_PHASES.length; i++) {
      const phase = REQUIRED_PHASES[i];
      const completed = completedPhases.includes(phase) ||
        (evalReport?.phases && evalReport.phases[`phase_${i + 1}`]?.completed);
      checks.push({
        name: `phase_${i + 1}_${phase}`,
        ok: !!completed,
        message: completed ? `Phase ${i + 1} 完成` : `Phase ${i + 1} 缺失: ${phase}`,
      });
    }

    // 检查是否有量化改进数据
    const hasMetrics = !!(evalReport?.metrics || evalReport?.improvement);
    checks.push({ name: 'quantitative_improvement', ok: hasMetrics, message: hasMetrics ? '有量化指标' : '缺少量化改进数据' });

    const result = gateResult('eval-driven-development-loop', checks);
    result.deliverablePath = deliverablePath;
    result.timestamp = new Date().toISOString();

    writeReport(path.join(LOG_DIR, 'eval-loop-gate-last.json'), result);
    await emitEvent(bus, `isc.eval-loop.${result.ok ? 'passed' : 'blocked'}`, result);

    console.log(`[eval-loop] ${result.status}: ${result.passed}/${result.total} checks passed`);
    return result;
  },
};
