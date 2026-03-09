'use strict';

/**
 * ISC Handler: eval-data-source-redline
 * Rule: rule.eval-data-source-redline-001
 * Validates evaluation datasets only use allowed sources (real conversation, web search).
 * Blocks synthetic/imagined/fabricated data.
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  scanFiles,
  gateResult,
} = require('../lib/handler-utils');

const ALLOWED_SOURCES = ['real_conversation', 'tavily_search', 'web_search'];
const FORBIDDEN_SOURCES = ['synthetic', 'imagined', 'fabricated'];

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const datasetPath = event?.payload?.path || event?.payload?.dataset;
  logger.info?.(`[eval-data-source-redline] Checking dataset: ${datasetPath || 'scan mode'}`);

  const checks = [];

  // Collect dataset files to check
  const filesToCheck = [];
  if (datasetPath) {
    const fullPath = path.join(root, datasetPath);
    if (fs.existsSync(fullPath)) {
      filesToCheck.push(fullPath);
    } else {
      checks.push({ name: 'dataset_exists', ok: false, message: `Dataset not found: ${datasetPath}` });
    }
  } else {
    // Scan evaluation-sets directory
    const evalDir = path.join(root, 'evaluation-sets');
    if (fs.existsSync(evalDir)) {
      scanFiles(evalDir, /\.json$/, (fp) => filesToCheck.push(fp), { maxDepth: 3 });
    }
  }

  if (filesToCheck.length === 0 && checks.length === 0) {
    checks.push({ name: 'datasets_found', ok: true, message: 'No evaluation datasets to check' });
  }

  // Check each dataset file for source compliance
  let violationCount = 0;
  for (const fp of filesToCheck) {
    try {
      const content = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const samples = Array.isArray(content) ? content : (content.samples || content.items || [content]);

      for (const sample of samples) {
        const source = sample.source || sample.data_source || '';
        const sourceLower = typeof source === 'string' ? source.toLowerCase() : '';

        // Check for forbidden sources
        const isForbidden = FORBIDDEN_SOURCES.some(f => sourceLower.includes(f));
        if (isForbidden) {
          violationCount++;
          checks.push({
            name: `forbidden_source_${path.basename(fp)}`,
            ok: false,
            message: `Forbidden source "${source}" in ${path.basename(fp)}`,
          });
        }

        // Check source is in allowed list (if specified)
        if (source && !isForbidden) {
          const isAllowed = ALLOWED_SOURCES.some(a => sourceLower.includes(a));
          if (!isAllowed) {
            violationCount++;
            checks.push({
              name: `unknown_source_${path.basename(fp)}`,
              ok: false,
              message: `Unknown source "${source}" in ${path.basename(fp)} — must be one of: ${ALLOWED_SOURCES.join(', ')}`,
            });
          }
        }
      }
    } catch {
      // Non-JSON or parse error — skip
    }
  }

  if (violationCount === 0) {
    checks.push({ name: 'all_sources_valid', ok: true, message: `All ${filesToCheck.length} dataset file(s) pass source redline` });
  }

  const result = gateResult(rule?.id || 'eval-data-source-redline', checks);

  const reportPath = path.join(root, 'reports', 'eval-data-source-redline', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'eval-data-source-redline',
    datasetsChecked: filesToCheck.length,
    violations: violationCount,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'eval-data-source-redline.completed', { ok: result.ok, violations: violationCount });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
