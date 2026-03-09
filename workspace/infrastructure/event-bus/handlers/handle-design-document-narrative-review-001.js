'use strict';

const fs = require('fs');
const path = require('path');
const {
  scanFiles,
  writeReport,
  emitEvent,
  gateResult,
} = require('../../../skills/isc-core/lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  // ─── 1. 感知：定位设计文档 ───
  const docPath = event?.payload?.filePath
    || event?.payload?.path
    || path.join(root, 'docs', 'design', 'latest.md');

  if (!fs.existsSync(docPath)) {
    const result = gateResult(rule?.id || 'design-document-narrative-review-001', [{
      name: 'doc_exists', ok: false, message: `文档不存在: ${docPath}`,
    }]);
    return { ok: false, autonomous: true, actions: [], message: '文档不存在', ...result };
  }

  const content = fs.readFileSync(docPath, 'utf8');
  const sections = content.split(/^#{1,2}\s+/m).filter(Boolean);
  logger.info?.(`[narrative-review] 文档共 ${sections.length} 个章节`);

  // ─── 2. 判断：模拟演讲审查 ───
  const checks = [];

  // NR1: 覆盖核心章节（至少3个章节）
  checks.push({
    name: 'NR1_section_coverage',
    ok: sections.length >= 3,
    message: sections.length >= 3
      ? `${sections.length} 个章节，满足演讲覆盖要求`
      : `仅 ${sections.length} 个章节，不足以支撑10分钟演讲`,
  });

  // NR2: 每段应有足够内容支撑追问（段落>50字）
  const thinSections = sections.filter(s => s.trim().length < 50);
  checks.push({
    name: 'NR2_section_depth',
    ok: thinSections.length === 0,
    message: thinSections.length === 0
      ? '所有章节内容充实'
      : `${thinSections.length} 个章节内容过薄，无法支撑追问`,
  });

  // NR3: 不允许含 TODO/FIXME/TBD 未修复标记
  const unfixed = (content.match(/\b(TODO|FIXME|TBD)\b/gi) || []).length;
  checks.push({
    name: 'NR3_no_unresolved',
    ok: unfixed === 0,
    message: unfixed === 0
      ? '无未修复标记'
      : `发现 ${unfixed} 处未修复标记(TODO/FIXME/TBD)`,
  });

  // NR4: 双层审查标记检测（文档应有审查记录）
  const hasReviewMark = /review|审查|reviewed/i.test(content);
  checks.push({
    name: 'NR4_review_trace',
    ok: hasReviewMark,
    message: hasReviewMark
      ? '检测到审查记录标记'
      : '未检测到审查记录标记，建议添加审查备注',
  });

  // ─── 3. 输出：门禁结果 ───
  const result = gateResult(rule?.id || 'design-document-narrative-review-001', checks);

  // ─── 4. 持久化 ───
  const reportPath = path.join(root, 'reports', 'narrative-review', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'design-document-narrative-review-001',
    docPath,
    sectionCount: sections.length,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  // ─── 5. 闭环 ───
  await emitEvent(bus, 'narrative-review.completed', {
    ok: result.ok, status: result.status, docPath, actions,
  });

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: result.ok
      ? `模拟演讲审查通过 (${result.total} 项)`
      : `${result.failed}/${result.total} 项审查未通过`,
    ...result,
  };
};
