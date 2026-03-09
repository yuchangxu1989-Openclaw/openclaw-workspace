'use strict';

/**
 * ISC Handler: eval-sample-auto-collection
 * Rule: rule.eval-sample-auto-collection-001
 * Auto-collects real usage samples (intent/event/pipeline) into eval sample pools.
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  gateResult,
} = require('../lib/handler-utils');

const COLLECTION_PATHS = {
  intent_samples: 'tests/collection/pending/',
  pipeline_samples: 'tests/collection/pending/',
  regression_samples: 'tests/regression/',
};

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const eventType = event?.type || event?.name || '';
  const payload = event?.payload || {};
  logger.info?.(`[eval-sample-auto-collection] Processing event: ${eventType}`);

  const checks = [];

  // Check 1: Event is a collectible type
  const collectibleEvents = [
    'event.general.classified',
    'orchestration.general.completed',
    'quality.general.failed',
  ];
  const isCollectible = collectibleEvents.includes(eventType);
  checks.push({
    name: 'collectible_event',
    ok: isCollectible,
    message: isCollectible
      ? `Collectible event: ${eventType}`
      : `Event ${eventType} is not in collectible list`,
  });

  if (isCollectible) {
    // Determine collection target
    let targetDir;
    if (eventType.includes('failed')) {
      targetDir = COLLECTION_PATHS.regression_samples;
    } else if (eventType.includes('classified')) {
      targetDir = COLLECTION_PATHS.intent_samples;
    } else {
      targetDir = COLLECTION_PATHS.pipeline_samples;
    }

    const fullTargetDir = path.join(root, targetDir);
    fs.mkdirSync(fullTargetDir, { recursive: true });

    // Build sample record
    const sample = {
      collectedAt: new Date().toISOString(),
      eventType,
      input: payload.input || payload.message || null,
      output: payload.output || payload.result || null,
      metadata: {
        source: 'auto_collection',
        handler: 'eval-sample-auto-collection',
        eventPayloadKeys: Object.keys(payload),
      },
    };

    // Write sample file
    const sampleFile = path.join(fullTargetDir, `sample-${Date.now()}.json`);
    fs.writeFileSync(sampleFile, JSON.stringify(sample, null, 2) + '\n', 'utf8');

    checks.push({
      name: 'sample_collected',
      ok: true,
      message: `Sample written to ${targetDir}`,
    });
    actions.push(`sample_written:${sampleFile}`);

    // Check 2: Collection directory is accessible
    const dirExists = checkFileExists(fullTargetDir);
    checks.push({
      name: 'collection_dir_exists',
      ok: dirExists,
      message: dirExists ? `Collection dir: ${targetDir}` : `Failed to create ${targetDir}`,
    });
  }

  const result = gateResult(rule?.id || 'eval-sample-auto-collection', checks, { failClosed: false });

  const reportPath = path.join(root, 'reports', 'eval-sample-auto-collection', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'eval-sample-auto-collection',
    eventType,
    collected: isCollectible,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'eval-sample-auto-collection.completed', { ok: result.ok, collected: isCollectible });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
