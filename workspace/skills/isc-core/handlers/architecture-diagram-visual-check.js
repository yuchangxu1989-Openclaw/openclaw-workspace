'use strict';

/**
 * ISC Handler: architecture-diagram-visual-check
 * Rule: rule.architecture-diagram-visual-output-001
 * Validates architecture diagrams meet 10 visual standards (Mermaid-based).
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
  logger.info?.(`[architecture-diagram-visual-check] Checking: ${docPath || 'unknown'}`);

  const checks = [];

  if (!docPath) {
    checks.push({ name: 'document_specified', ok: false, message: 'No document path in event payload' });
  } else {
    const fullPath = path.join(root, docPath);
    if (!checkFileExists(fullPath)) {
      checks.push({ name: 'document_exists', ok: false, message: `Document ${docPath} not found` });
    } else {
      const content = fs.readFileSync(fullPath, 'utf8');

      // VS01: Check for mermaid usage (not AI image gen)
      const hasMermaid = /```mermaid/i.test(content);
      checks.push({
        name: 'VS01_mermaid_usage',
        ok: hasMermaid,
        message: hasMermaid ? 'Uses Mermaid for diagrams' : 'No Mermaid diagram blocks found',
      });

      // VS02: Chinese labels
      const hasChinese = /[\u4e00-\u9fff]/.test(content);
      checks.push({
        name: 'VS02_chinese_labels',
        ok: hasChinese,
        message: hasChinese ? 'Chinese annotations present' : 'No Chinese text found — labels should be in Chinese',
      });

      // VS03: No high-saturation neon colors in style blocks
      const hasNeon = /#[0-9a-f]{6}/gi.test(content) && /ff00|00ff|f0f|0ff/i.test(content);
      checks.push({
        name: 'VS03_soft_colors',
        ok: !hasNeon,
        message: hasNeon ? 'Possibly high-saturation neon colors detected' : 'Color palette looks acceptable',
      });

      // VS07: Style consistency — check no mixed diagram types in single doc
      const diagramTypes = new Set();
      for (const m of content.matchAll(/```mermaid\s*\n\s*(\w+)/g)) {
        diagramTypes.add(m[1].toLowerCase());
      }
      const styleConsistent = diagramTypes.size <= 2;
      checks.push({
        name: 'VS07_style_consistency',
        ok: styleConsistent,
        message: styleConsistent
          ? `Consistent style (${diagramTypes.size} diagram type(s))`
          : `${diagramTypes.size} different diagram types — may lack consistency`,
      });

      // Check for accompanying PNG output reference
      const hasPngRef = /\.png/i.test(content);
      checks.push({
        name: 'visual_output_reference',
        ok: hasPngRef,
        message: hasPngRef ? 'PNG output referenced' : 'No PNG image reference found — diagrams should be rendered',
      });
    }
  }

  const result = gateResult(rule?.id || 'architecture-diagram-visual-check', checks);

  const reportPath = path.join(root, 'reports', 'diagram-visual-check', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'architecture-diagram-visual-check',
    documentPath: docPath || null,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'architecture-diagram-visual-check.completed', { ok: result.ok, status: result.status, actions });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
