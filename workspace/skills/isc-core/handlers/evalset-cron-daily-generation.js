'use strict';

/**
 * ISC Handler: evalset-cron-daily-generation
 * Rule: rule.evalset-cron-daily-generation-001
 * Validates daily cron-generated eval sets: source compliance, dedup, closed-book safety.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  writeReport,
  emitEvent,
  scanFiles,
  checkFileExists,
  gateResult,
} = require('../lib/handler-utils');

const FORBIDDEN_PATHS = ['memory/', 'labels/', 'annotations/', 'answers/', 'ground_truth/'];

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const datasetPath = event?.payload?.path || event?.payload?.output;
  logger.info?.(`[evalset-cron-daily-generation] Validating: ${datasetPath || 'scan mode'}`);

  const checks = [];

  // Check 1: Output dataset exists
  const evalSetsDir = path.join(root, 'evaluation-sets');
  const filesToCheck = [];
  if (datasetPath) {
    const fullPath = path.join(root, datasetPath);
    if (checkFileExists(fullPath)) {
      filesToCheck.push(fullPath);
      checks.push({ name: 'output_exists', ok: true, message: `Output: ${datasetPath}` });
    } else {
      checks.push({ name: 'output_exists', ok: false, message: `Output not found: ${datasetPath}` });
    }
  } else if (checkFileExists(evalSetsDir)) {
    scanFiles(evalSetsDir, /\.json$/, (fp) => filesToCheck.push(fp), { maxDepth: 3 });
    checks.push({ name: 'eval_sets_found', ok: filesToCheck.length > 0, message: `Found ${filesToCheck.length} eval set file(s)` });
  }

  // Check 2: Closed-book safety — no references to forbidden paths
  let closedBookViolations = 0;
  for (const fp of filesToCheck) {
    try {
      const content = fs.readFileSync(fp, 'utf8');
      for (const forbidden of FORBIDDEN_PATHS) {
        if (content.includes(forbidden)) {
          closedBookViolations++;
          checks.push({
            name: `closed_book_${path.basename(fp)}`,
            ok: false,
            message: `References forbidden path "${forbidden}" in ${path.basename(fp)}`,
          });
        }
      }
    } catch { /* skip */ }
  }
  if (closedBookViolations === 0) {
    checks.push({ name: 'closed_book_safe', ok: true, message: 'No forbidden path references' });
  }

  // Check 3: Data source must be real_conversation
  let sourceViolations = 0;
  for (const fp of filesToCheck) {
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const source = data.data_source || data.dataSource || '';
      if (source && source !== 'real_conversation') {
        sourceViolations++;
        checks.push({
          name: `source_check_${path.basename(fp)}`,
          ok: false,
          message: `Invalid source "${source}" in ${path.basename(fp)} — must be real_conversation`,
        });
      }
    } catch { /* skip */ }
  }
  if (sourceViolations === 0) {
    checks.push({ name: 'source_compliant', ok: true, message: 'All sources are real_conversation or unspecified' });
  }

  // Check 4: Dedup — check for content hash duplicates within files
  const seenHashes = new Set();
  let dupCount = 0;
  for (const fp of filesToCheck) {
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const samples = Array.isArray(data) ? data : (data.samples || data.items || []);
      for (const s of samples) {
        const hash = crypto.createHash('sha256').update(JSON.stringify(s)).digest('hex');
        if (seenHashes.has(hash)) {
          dupCount++;
        } else {
          seenHashes.add(hash);
        }
      }
    } catch { /* skip */ }
  }
  checks.push({
    name: 'dedup_check',
    ok: dupCount === 0,
    message: dupCount === 0 ? 'No duplicates detected' : `${dupCount} duplicate sample(s) found`,
  });

  // Check 5: Generator version metadata
  for (const fp of filesToCheck) {
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const hasVersion = !!(data.generatorVersion || data.generator_version);
      checks.push({
        name: `version_meta_${path.basename(fp)}`,
        ok: hasVersion,
        message: hasVersion ? `Generator version: ${data.generatorVersion || data.generator_version}` : 'Missing generatorVersion field',
      });
    } catch { /* skip */ }
  }

  const result = gateResult(rule?.id || 'evalset-cron-daily-generation', checks);

  const reportPath = path.join(root, 'reports', 'evalset-cron-daily', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'evalset-cron-daily-generation',
    filesChecked: filesToCheck.length,
    closedBookViolations,
    sourceViolations,
    duplicates: dupCount,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'evalset-cron-daily-generation.completed', { ok: result.ok, status: result.status });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
