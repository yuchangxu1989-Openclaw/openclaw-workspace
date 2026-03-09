'use strict';

/**
 * ISC Handler: interaction-source-file-delivery
 * Rule: N007-v2
 * 源文件交付标准 — 用户请求源文件时直接发送文件或输出完整内容
 */

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

  const filePath = event?.payload?.filePath || '';
  const channel = event?.payload?.channel || 'unknown';

  logger.info?.(`[source-file-delivery] file=${filePath} channel=${channel}`);

  const checks = [];

  // Check 1: requested file exists
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  const fileExists = filePath ? checkFileExists(resolvedPath) : false;
  checks.push({
    name: 'requested_file_exists',
    ok: fileExists,
    message: fileExists ? `File found: ${resolvedPath}` : `File not found: ${filePath || '(empty)'}`,
  });

  // Check 2: delivery script exists
  const scriptPath = path.join(root, 'scripts/isc-hooks/N007-v2.sh');
  const scriptExists = checkFileExists(scriptPath);
  checks.push({
    name: 'delivery_script_exists',
    ok: scriptExists,
    message: scriptExists ? 'Delivery script found' : 'Delivery script missing',
  });

  const result = gateResult('N007-v2', checks);

  if (result.ok) {
    await emitEvent(bus, 'isc.file.delivery', {
      ruleId: 'N007-v2',
      filePath: resolvedPath,
      channel,
      method: 'direct_file_delivery',
      timestamp: new Date().toISOString(),
    });
  }

  const reportPath = path.join(root, 'reports', 'isc', `source-file-delivery-${Date.now()}.json`);
  writeReport(reportPath, { rule: 'N007-v2', result });

  logger.info?.(`[source-file-delivery] result=${result.status}`);
  return result;
};
