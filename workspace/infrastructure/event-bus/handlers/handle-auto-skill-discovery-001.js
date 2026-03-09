'use strict';

const path = require('path');
const {
  gitExec,
  writeReport,
  emitEvent,
  scanFiles,
  checkFileExists,
  gateResult,
} = require('../../../skills/isc-core/lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  // ─── 1. 感知：扫描新脚本 ───
  const scriptsDir = path.join(root, 'scripts');
  const newScripts = scanFiles(scriptsDir, /\.(sh|js)$/i);
  logger.info?.(`[auto-skill-discovery] 扫描到 ${newScripts.length} 个脚本文件`);

  const skillsDir = path.join(root, 'skills', 'public');
  const existingSkills = scanFiles(skillsDir, /SKILL\.md$/i);
  const existingSkillNames = new Set(
    existingSkills.map(s => path.basename(path.dirname(s)).toLowerCase())
  );

  // ─── 2. 判断：检查每个脚本是否应技能化 ───
  const checks = [];
  const candidates = [];

  for (const scriptPath of newScripts) {
    const name = path.basename(scriptPath, path.extname(scriptPath));
    const content = require('fs').readFileSync(scriptPath, 'utf8');
    const lineCount = content.split('\n').length;
    const isSubstantial = lineCount > 10;
    const alreadySkillified = existingSkillNames.has(name.toLowerCase());

    if (isSubstantial && !alreadySkillified) {
      candidates.push({ name, path: scriptPath, lines: lineCount });
    }

    checks.push({
      name: `script_${name}`,
      ok: !isSubstantial || alreadySkillified,
      message: isSubstantial && !alreadySkillified
        ? `${name} (${lineCount}行) 可技能化`
        : `${name} 无需技能化`,
    });
  }

  // ─── 3. 输出：门禁结果（fail-open，仅报告候选） ───
  const result = gateResult(rule?.id || 'auto-skill-discovery-001', checks, { failClosed: false });

  // ─── 4. 持久化：写报告 ───
  const reportPath = path.join(root, 'reports', 'skill-discovery', `candidates-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'auto-skill-discovery-001',
    eventType: event?.type || null,
    candidates,
    totalScripts: newScripts.length,
    candidateCount: candidates.length,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  // ─── 5. 闭环：发射后续事件 ───
  if (candidates.length > 0) {
    await emitEvent(bus, 'skill-discovery.candidates-found', {
      candidates,
      count: candidates.length,
    });
    actions.push('event_emitted:skill-discovery.candidates-found');
  }

  // ─── 6. 返回 ───
  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: candidates.length > 0
      ? `发现 ${candidates.length} 个候选脚本可技能化`
      : '无新候选脚本',
    ...result,
  };
};
