'use strict';

/**
 * ISC Handler: intent-cras-e-architecture-constraint
 * Rule: rule.intent-cras-e系统架构与交付约束-21ztnb
 * Enforces CRAS-E constraints: continuous evolution, anti-amnesia,
 * dynamic queue expansion, Feishu card delivery priority.
 */

const path = require('path');
const fs = require('fs');
const {
  writeReport,
  emitEvent,
  gitExec,
  scanFiles,
  checkFileExists,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function (event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];
  const checks = [];

  logger.info?.('[intent-cras-e-architecture-constraint] Validating CRAS-E system architecture constraints');

  // Check 1: CRAS skill exists (continuous evolution organ)
  const crasSkillDir = path.join(root, 'skills', 'cras');
  const hasCrasSkill = checkFileExists(crasSkillDir);
  checks.push({
    name: 'cras_skill_exists',
    ok: hasCrasSkill,
    message: hasCrasSkill ? 'CRAS skill directory found' : 'No CRAS skill directory — must be a continuous evolution organ',
  });

  // Check 2: Anti-amnesia — memory/persistence mechanism present
  let hasMemoryMechanism = false;
  const searchDirs = [path.join(root, 'skills', 'cras'), path.join(root, 'skills', 'isc-core')];
  for (const dir of searchDirs) {
    if (!checkFileExists(dir)) continue;
    scanFiles(dir, /\.(js|md)$/i, (fp) => {
      if (hasMemoryMechanism) return;
      try {
        const content = fs.readFileSync(fp, 'utf8');
        if (/memory|persist|snapshot|checkpoint|anti.?amnesia/i.test(content)) {
          hasMemoryMechanism = true;
        }
      } catch { /* skip */ }
    }, { maxDepth: 3 });
  }
  checks.push({
    name: 'anti_amnesia_mechanism',
    ok: hasMemoryMechanism,
    message: hasMemoryMechanism
      ? 'Memory/persistence mechanism detected'
      : 'No anti-amnesia mechanism found — CRAS-E must resist memory loss',
  });

  // Check 3: Dynamic queue expansion support
  let hasDynamicQueue = false;
  scanFiles(path.join(root, 'skills'), /\.(js|md)$/i, (fp) => {
    if (hasDynamicQueue) return;
    try {
      const content = fs.readFileSync(fp, 'utf8');
      if (/dynamic.*queue|queue.*expan|task.*queue/i.test(content)) {
        hasDynamicQueue = true;
      }
    } catch { /* skip */ }
  }, { maxDepth: 3 });
  checks.push({
    name: 'dynamic_queue_expansion',
    ok: hasDynamicQueue,
    message: hasDynamicQueue
      ? 'Dynamic queue expansion pattern found'
      : 'No dynamic queue expansion detected',
  });

  // Check 4: Feishu card delivery mechanism
  let hasFeishuCard = false;
  scanFiles(path.join(root, 'skills'), /\.(js|md)$/i, (fp) => {
    if (hasFeishuCard) return;
    try {
      const content = fs.readFileSync(fp, 'utf8');
      if (/feishu.*card|飞书.*卡片|interactive.*card/i.test(content)) {
        hasFeishuCard = true;
      }
    } catch { /* skip */ }
  }, { maxDepth: 3 });
  checks.push({
    name: 'feishu_card_delivery',
    ok: hasFeishuCard,
    message: hasFeishuCard
      ? 'Feishu card delivery mechanism found'
      : 'No Feishu card delivery — should prioritize card-based output',
  });

  const result = gateResult(rule?.id || 'intent-cras-e系统架构与交付约束-21ztnb', checks);

  const reportPath = path.join(root, 'reports', 'cras-e-architecture', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'intent-cras-e-architecture-constraint',
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'intent-cras-e-architecture-constraint.completed', { ok: result.ok, status: result.status, actions });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
