/**
 * scenario-acceptance-gate - 场景化验收门禁
 *
 * 规则: rule.scenario-acceptance-gate-001
 * 职责: 检查评测体系是否包含场景化测试，无则阻止发布
 */
const path = require('path');
const { writeReport, emitEvent, scanFiles, gateResult } = require('../lib/handler-utils');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const MIN_SCENARIOS = 5;
const MIN_DOMAINS = 3;

module.exports = {
  name: 'scenario-acceptance-gate',
  ruleId: 'rule.scenario-acceptance-gate-001',

  /**
   * @param {Object} context
   * @param {Array} [context.scenarios] - 场景列表 [{name, domain, steps[], source}]
   * @param {string} [context.evalDir] - 评测目录路径（自动扫描）
   * @param {Object} [context.bus] - 事件总线
   */
  async execute(context = {}) {
    const { scenarios = [], evalDir, bus } = context;
    const checks = [];

    // 场景数量检查
    const scenarioCount = scenarios.length;
    checks.push({
      name: 'min_scenario_count',
      ok: scenarioCount >= MIN_SCENARIOS,
      message: `${scenarioCount}/${MIN_SCENARIOS} scenarios`,
    });

    // 领域覆盖检查
    const domains = new Set(scenarios.map(s => s.domain).filter(Boolean));
    checks.push({
      name: 'min_domain_coverage',
      ok: domains.size >= MIN_DOMAINS,
      message: `${domains.size}/${MIN_DOMAINS} domains covered`,
    });

    // 场景来源检查（必须来自真实应用）
    const realSources = scenarios.filter(s => s.source && s.source !== 'synthetic');
    checks.push({
      name: 'real_source_scenarios',
      ok: realSources.length > 0,
      message: `${realSources.length} scenarios from real sources`,
    });

    // 端到端完整性检查（意图→识别→匹配→分发→执行→交付）
    const e2eSteps = ['intent', 'recognition', 'matching', 'dispatch', 'execution', 'delivery'];
    const hasE2E = scenarios.some(s => {
      const steps = (s.steps || []).map(st => st.toLowerCase());
      return e2eSteps.every(step => steps.some(st => st.includes(step)));
    });
    checks.push({
      name: 'e2e_story_coverage',
      ok: hasE2E || scenarios.length === 0, // 无场景时由数量检查拦截
      message: hasE2E ? 'has e2e user story' : 'no complete e2e user story found',
    });

    const result = gateResult('scenario-acceptance-gate', checks);
    result.scenarioCount = scenarioCount;
    result.domains = [...domains];
    result.timestamp = new Date().toISOString();

    writeReport(path.join(LOG_DIR, 'scenario-gate-last.json'), result);
    await emitEvent(bus, `isc.scenario-gate.${result.ok ? 'passed' : 'blocked'}`, result);

    console.log(`[scenario-gate] ${result.status}: ${result.passed}/${result.total} checks passed`);
    return result;
  },
};
