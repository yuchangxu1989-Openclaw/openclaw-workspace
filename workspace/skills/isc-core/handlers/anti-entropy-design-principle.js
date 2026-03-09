'use strict';

/**
 * ISC Handler: anti-entropy-design-principle
 * Rule: rule.anti-entropy-design-principle-001
 * Gate check: validates designs against 4 anti-entropy dimensions —
 * scalability, generalizability, growability, entropy direction.
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  gitExec,
  checkFileExists,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const docPath = event?.payload?.path || event?.payload?.document;
  logger.info?.(`[anti-entropy-design-principle] Checking: ${docPath || 'unknown'}`);

  const checks = [];

  if (!docPath) {
    checks.push({ name: 'document_specified', ok: false, message: 'No document path in event payload' });
  } else {
    const fullPath = path.join(root, docPath);
    if (!checkFileExists(fullPath)) {
      checks.push({ name: 'document_exists', ok: false, message: `Document ${docPath} not found` });
    } else {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lower = content.toLowerCase();

      // Scalability: design should mention scale, extensibility, or growth patterns
      const scalable = /scal|扩展|10倍|百倍|可伸缩|横向扩展/i.test(content);
      checks.push({
        name: 'scalability',
        ok: scalable,
        message: scalable
          ? 'Scalability considerations found'
          : 'No scalability discussion — does this hold at 10x scale?',
      });

      // Generalizability: solves a class of problems, not just one
      const generalizable = /泛化|一类问题|通用|抽象|pattern|模式|复用/i.test(content);
      checks.push({
        name: 'generalizability',
        ok: generalizable,
        message: generalizable
          ? 'Generalization patterns found'
          : 'Appears to solve only a specific case — consider generalizing',
      });

      // Growability: knowledge codified as rules/code, not just conversation
      const growable = /规则|handler|代码|自动化|codif|沉淀|可执行/i.test(content);
      checks.push({
        name: 'growability',
        ok: growable,
        message: growable
          ? 'Knowledge codification indicators found'
          : 'Knowledge may not be codified — ensure it becomes executable rules/code',
      });

      // Entropy direction: change should increase order
      const hasStructure = /有序|结构化|简化|统一|收敛|规范/i.test(content);
      const hasEntropy = /混乱|临时|hack|workaround|硬编码/i.test(content);
      const entropyOk = hasStructure && !hasEntropy;
      checks.push({
        name: 'entropy_direction',
        ok: entropyOk,
        message: entropyOk
          ? 'Change direction: towards order'
          : hasEntropy
            ? 'Entropy-increasing patterns detected (hardcoded/hack/workaround)'
            : 'No explicit ordering signals — clarify how this reduces entropy',
      });
    }
  }

  const result = gateResult(rule?.id || 'anti-entropy-design-principle', checks);

  const reportPath = path.join(root, 'reports', 'anti-entropy', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'anti-entropy-design-principle',
    documentPath: docPath || null,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'anti-entropy-design-principle.completed', {
    ok: result.ok,
    status: result.status,
    actions,
  });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
