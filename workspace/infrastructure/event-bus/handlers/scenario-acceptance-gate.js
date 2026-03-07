'use strict';

/**
 * 自主执行器：场景化验收门禁
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 评测/发布事件 → 检查是否包含场景化测试 → 不足则阻止 → 通过则放行
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';
const MIN_SCENARIOS = 5;
const MIN_DOMAINS = 3;

function findScenarioTests(targetPath) {
  const scenarios = [];
  const searchDirs = [
    path.join(targetPath, 'tests'),
    path.join(targetPath, 'test'),
    path.join(targetPath, 'scenarios'),
    path.join(targetPath, 'aeo'),
    path.join(WORKSPACE, 'aeo/evaluation-sets'),
  ];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => /\.(json|yaml|yml|md)$/.test(f));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        // 检测场景化测试标记
        const isScenario = /scenario|场景|user.?story|用户故事|端到端|e2e|acceptance/i.test(content);
        if (isScenario) {
          // 提取领域
          const domainMatch = content.match(/domain|领域|category|类别[:：]\s*["']?(\w+)/i);
          scenarios.push({
            file,
            dir: path.relative(WORKSPACE, dir),
            domain: domainMatch ? domainMatch[1] : 'unknown',
          });
        }
      } catch { /* skip */ }
    }
  }
  return scenarios;
}

module.exports = async function(event, rule, context) {
  const payload = event.payload || event.data || {};
  const targetPath = payload.path || payload.skill_path || payload.module_path || WORKSPACE;
  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(WORKSPACE, targetPath);

  const scenarios = findScenarioTests(fullPath);
  const uniqueDomains = new Set(scenarios.map(s => s.domain));

  const checks = {
    scenario_count: { required: MIN_SCENARIOS, actual: scenarios.length, pass: scenarios.length >= MIN_SCENARIOS },
    domain_coverage: { required: MIN_DOMAINS, actual: uniqueDomains.size, pass: uniqueDomains.size >= MIN_DOMAINS },
    domains: [...uniqueDomains],
    scenarios: scenarios.map(s => `${s.dir}/${s.file}`),
  };

  const allPass = checks.scenario_count.pass && checks.domain_coverage.pass;

  if (!allPass) {
    const issues = [];
    if (!checks.scenario_count.pass) {
      issues.push(`场景测试数量不足: ${checks.scenario_count.actual}/${checks.scenario_count.required}`);
    }
    if (!checks.domain_coverage.pass) {
      issues.push(`领域覆盖不足: ${checks.domain_coverage.actual}/${checks.domain_coverage.required}`);
    }

    const msg = [
      `🚫 **场景化验收门禁未通过**`,
      '',
      ...issues.map(i => `- ${i}`),
      '',
      `要求: ≥${MIN_SCENARIOS}个场景测试, 覆盖≥${MIN_DOMAINS}个领域`,
      `当前: ${scenarios.length}个场景, ${uniqueDomains.size}个领域`,
    ].join('\n');

    if (context?.notify) context.notify('feishu', msg, { severity: 'high' });

    return {
      status: 'blocked',
      gate: 'scenario_acceptance',
      checks,
      message: '场景化验收门禁未通过',
    };
  }

  // ── ISC-INTENT-EVAL-001 + ISC-CLOSED-BOOK-001 enforcement ──
  let iscGateResult = null;
  try {
    const { evaluateAll } = require('../../enforcement/isc-eval-gates');
    iscGateResult = evaluateAll(payload);
  } catch (_) {
    iscGateResult = { ok: false, gateStatus: 'FAIL-CLOSED', summary: 'isc-eval-gates not loadable' };
  }

  return {
    status: iscGateResult?.ok ? 'pass' : 'pass_with_isc_warning',
    scenarios: scenarios.length,
    domains: [...uniqueDomains],
    message: '场景化验收门禁通过',
    isc_gates: iscGateResult
  };
};
