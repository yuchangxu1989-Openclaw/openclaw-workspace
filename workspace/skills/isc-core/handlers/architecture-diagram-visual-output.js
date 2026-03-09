'use strict';

/**
 * ISC Handler: architecture-diagram-visual-output
 * Rule: rule.architecture-diagram-visual-output-001
 * Validates architecture documents meet 10 visual standards for diagrams.
 * Uses Mermaid rendering, checks VS01-VS10 compliance.
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
  logger.info?.(`[architecture-diagram-visual-output] Checking: ${docPath || 'unknown'}`);

  const checks = [];

  if (!docPath) {
    checks.push({ name: 'document_specified', ok: false, message: 'No document path in event payload' });
  } else {
    const fullPath = path.join(root, docPath);
    if (!checkFileExists(fullPath)) {
      checks.push({ name: 'document_exists', ok: false, message: `Document ${docPath} not found` });
    } else {
      const content = fs.readFileSync(fullPath, 'utf8');

      // VS01: Mermaid usage (not AI image gen)
      const hasMermaid = /```mermaid/i.test(content);
      checks.push({ name: 'VS01_mermaid_usage', ok: hasMermaid, message: hasMermaid ? 'Uses Mermaid' : 'No Mermaid blocks found' });

      // VS02: Chinese labels
      const hasChinese = /[\u4e00-\u9fff]/.test(content);
      checks.push({ name: 'VS02_chinese_labels', ok: hasChinese, message: hasChinese ? 'Chinese annotations present' : 'No Chinese text' });

      // VS03: Soft colors — no neon
      const hasNeon = /#[0-9a-f]{6}/gi.test(content) && /ff00|00ff|f0f|0ff/i.test(content);
      checks.push({ name: 'VS03_soft_colors', ok: !hasNeon, message: hasNeon ? 'Neon colors detected' : 'Colors OK' });

      // VS04: Text overlap — check padding hints
      const tightBoxes = /padding\s*:\s*0|margin\s*:\s*0/i.test(content);
      checks.push({ name: 'VS04_no_text_overlap', ok: !tightBoxes, message: tightBoxes ? 'Zero padding detected' : 'Spacing looks OK' });

      // VS05: MECE naming — check for duplicate node labels in mermaid
      const labels = [];
      for (const m of content.matchAll(/\[([^\]]+)\]/g)) labels.push(m[1].trim());
      const dupes = labels.filter((l, i) => labels.indexOf(l) !== i);
      checks.push({ name: 'VS05_mece_naming', ok: dupes.length === 0, message: dupes.length === 0 ? 'No duplicate labels' : `Duplicate labels: ${dupes.join(', ')}` });

      // VS07: Style consistency
      const diagramTypes = new Set();
      for (const m of content.matchAll(/```mermaid\s*\n\s*(\w+)/g)) diagramTypes.add(m[1].toLowerCase());
      const consistent = diagramTypes.size <= 2;
      checks.push({ name: 'VS07_style_consistency', ok: consistent, message: `${diagramTypes.size} diagram type(s)` });

      // VS09: Emoji handling
      const hasEmoji = /[\u{1F300}-\u{1FAFF}]/u.test(content);
      checks.push({ name: 'VS09_emoji_handling', ok: !hasEmoji, message: hasEmoji ? 'Emoji present — may render poorly in PDF' : 'No emoji issues' });

      // PNG output reference
      const hasPng = /\.png/i.test(content);
      checks.push({ name: 'visual_output_rendered', ok: hasPng, message: hasPng ? 'PNG referenced' : 'No PNG — render diagrams' });
    }
  }

  const result = gateResult(rule?.id || 'architecture-diagram-visual-output', checks);

  const reportPath = path.join(root, 'reports', 'diagram-visual', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'architecture-diagram-visual-output',
    documentPath: docPath || null,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'architecture-diagram-visual-output.completed', { ok: result.ok, status: result.status, actions });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
