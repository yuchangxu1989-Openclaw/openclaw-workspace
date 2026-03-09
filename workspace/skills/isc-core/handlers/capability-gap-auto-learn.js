'use strict';

/**
 * ISC Handler: capability-gap-auto-learn
 * Rule: rule.capability-gap-auto-learn-001
 * 能力缺失自动学习闭环：按优先级搜索解决方案并固化为技能。
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const capability = event?.payload?.capability || event?.payload?.operation || 'unknown';
  const errorMsg = event?.payload?.error || '';
  logger.info?.(`[capability-gap-auto-learn] Detected gap: ${capability}`);

  // Step 1: Scan local skills/ directory
  const skillsDir = path.join(root, 'skills');
  let localMatch = null;

  if (fs.existsSync(skillsDir)) {
    const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const dir of skillDirs) {
      const skillMd = path.join(skillsDir, dir, 'SKILL.md');
      if (checkFileExists(skillMd)) {
        const content = fs.readFileSync(skillMd, 'utf-8').toLowerCase();
        if (content.includes(capability.toLowerCase())) {
          localMatch = { skill: dir, path: skillMd };
          break;
        }
      }
    }
  }

  if (localMatch) {
    logger.info?.(`[capability-gap-auto-learn] Found local skill: ${localMatch.skill}`);
    actions.push({
      type: 'use_existing_skill',
      skill: localMatch.skill,
      path: localMatch.path,
    });
    const result = gateResult('pass', `Local skill found: ${localMatch.skill}`, actions);
    emitEvent(bus, 'agent.capability.resolved', {
      capability,
      resolution: 'local_skill',
      skill: localMatch.skill,
    });
    writeReport(root, 'capability-gap-auto-learn', result);
    return result;
  }

  // Step 2: Check configured model/API capabilities
  const configPaths = [
    path.join(root, '.openclaw', 'config.json'),
    path.join(root, 'config', 'models.json'),
  ];

  let apiMatch = null;
  for (const cfgPath of configPaths) {
    if (checkFileExists(cfgPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        const models = cfg.models || cfg.apis || [];
        if (Array.isArray(models)) {
          apiMatch = models.find(m =>
            (m.capabilities || []).some(c => c.toLowerCase().includes(capability.toLowerCase()))
          );
        }
      } catch (_) { /* skip malformed config */ }
    }
    if (apiMatch) break;
  }

  if (apiMatch) {
    logger.info?.(`[capability-gap-auto-learn] API supports capability: ${apiMatch.name || apiMatch.id}`);
    actions.push({
      type: 'use_model_api',
      api: apiMatch.name || apiMatch.id,
    });
    const result = gateResult('pass', `Model/API supports: ${apiMatch.name || apiMatch.id}`, actions);
    emitEvent(bus, 'agent.capability.resolved', {
      capability,
      resolution: 'model_api',
      api: apiMatch.name || apiMatch.id,
    });
    writeReport(root, 'capability-gap-auto-learn', result);
    return result;
  }

  // Step 3 & 4: External search + codify (emit event for orchestrator to handle)
  logger.info?.(`[capability-gap-auto-learn] No local resolution. Requesting external learning for: ${capability}`);
  actions.push({
    type: 'request_external_learning',
    capability,
    steps: [
      'Search official API documentation',
      'Learn and implement capability',
      'Codify as new skill in skills/ directory',
    ],
  });

  emitEvent(bus, 'agent.capability.learn_requested', {
    capability,
    error: errorMsg,
    searchHints: [
      `${capability} official API documentation`,
      `${capability} SDK integration guide`,
    ],
  });

  const result = gateResult('pending', `External learning requested for: ${capability}`, actions);
  writeReport(root, 'capability-gap-auto-learn', result);
  return result;
};
