'use strict';

/**
 * ISC Handler: pdf-output-standard
 * Rule: rule.intent-pdf输出标准-fyhznt
 * Enforces PDF output formatting and content organization standards.
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  scanFiles,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const checks = [];

  logger.info?.('[pdf-output-standard] Checking PDF output standards');

  const docPath = event?.payload?.path || event?.payload?.document;

  // Check 1: Source document exists
  if (!docPath) {
    checks.push({ name: 'source_document', ok: false, message: 'No document path provided in event payload' });
  } else {
    const fullPath = path.join(root, docPath);
    const exists = checkFileExists(fullPath);
    checks.push({
      name: 'source_document',
      ok: exists,
      message: exists ? `Source document found: ${docPath}` : `Document not found: ${docPath}`,
    });

    if (exists) {
      const content = fs.readFileSync(fullPath, 'utf8');

      // Check 2: Has proper heading structure
      const headings = content.match(/^#{1,3}\s+.+/gm) || [];
      const hasStructure = headings.length >= 2;
      checks.push({
        name: 'heading_structure',
        ok: hasStructure,
        message: hasStructure
          ? `${headings.length} headings found — proper structure`
          : 'Insufficient heading structure for PDF layout',
      });

      // Check 3: No raw URLs without context
      const rawUrls = content.match(/(?<!\[)[^\(]https?:\/\/[^\s\)]+/g) || [];
      const cleanUrls = rawUrls.length <= 3;
      checks.push({
        name: 'url_formatting',
        ok: cleanUrls,
        message: cleanUrls
          ? 'URLs are properly formatted or minimal'
          : `${rawUrls.length} raw URLs found — should use markdown links for PDF readability`,
      });

      // Check 4: Chinese content present (for Chinese PDF output)
      const hasChinese = /[\u4e00-\u9fff]/.test(content);
      checks.push({
        name: 'chinese_content',
        ok: hasChinese,
        message: hasChinese ? 'Chinese content present' : 'No Chinese content — verify if Chinese output is required',
      });
    }
  }

  const result = gateResult(rule?.id || 'pdf-output-standard', checks, { failClosed: false });

  const reportPath = path.join(root, 'reports', 'pdf-output-standard.json');
  writeReport(reportPath, result);

  await emitEvent(bus, 'handler:complete', {
    handler: 'pdf-output-standard',
    ruleId: rule?.id,
    result,
  });

  return result;
};
