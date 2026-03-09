'use strict';

const fs = require('fs');
const path = require('path');
const {
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
    const result = gateResult(rule?.id || 'design-document-structure-001', [{
      name: 'doc_exists', ok: false, message: `文档不存在: ${docPath}`,
    }]);
    return { ok: false, autonomous: true, actions: [], message: '文档不存在', ...result };
  }

  const content = fs.readFileSync(docPath, 'utf8');
  const lines = content.split('\n');
  const checks = [];

  // ─── 2. 判断：7项结构检查 ───

  // S1: 一级目录不超过5章
  const h1Count = lines.filter(l => /^#\s+/.test(l)).length;
  checks.push({
    name: 'S1_h1_limit',
    ok: h1Count <= 5,
    message: h1Count <= 5 ? `一级目录 ${h1Count} 章 (≤5)` : `一级目录 ${h1Count} 章，超过5章上限`,
  });

  // S2: 叙事脉络（章节间有逻辑递进，至少3个章节）
  const headings = lines.filter(l => /^#{1,2}\s+/.test(l));
  checks.push({
    name: 'S2_narrative_flow',
    ok: headings.length >= 3,
    message: headings.length >= 3
      ? `${headings.length} 个章节，叙事结构完整`
      : `仅 ${headings.length} 个章节，叙事结构不足`,
  });

  // S3: 超过5行的代码块必须抽到附录
  const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
  const longCodeInBody = codeBlocks.filter(block => {
    const blockLines = block.split('\n').length - 2; // exclude fence lines
    return blockLines > 5;
  });
  // Check if long code blocks are in appendix section
  const appendixIdx = content.search(/^#{1,2}\s*(附录|Appendix)/mi);
  const longCodeBeforeAppendix = longCodeInBody.filter(block => {
    const idx = content.indexOf(block);
    return appendixIdx < 0 || idx < appendixIdx;
  });
  checks.push({
    name: 'S3_code_separation',
    ok: longCodeBeforeAppendix.length === 0,
    message: longCodeBeforeAppendix.length === 0
      ? '代码块已正确分离到附录'
      : `正文中有 ${longCodeBeforeAppendix.length} 个超长代码块未抽到附录`,
  });

  // S4: TL;DR不超过150字
  const tldrMatch = content.match(/#{1,3}\s*TL;?DR[\s\S]*?(?=\n#{1,3}\s|\n$)/i);
  const tldrLen = tldrMatch ? tldrMatch[0].replace(/#{1,3}\s*TL;?DR\s*/i, '').trim().length : 0;
  checks.push({
    name: 'S4_tldr_length',
    ok: !tldrMatch || tldrLen <= 150,
    message: !tldrMatch ? '未找到TL;DR章节' : (tldrLen <= 150 ? `TL;DR ${tldrLen}字 (≤150)` : `TL;DR ${tldrLen}字，超过150字`),
  });

  // S5: 禁止PM内容
  const pmPatterns = /\b(Day\s*\d|Sprint\s*\d|工时估算|人天|人月)\b/gi;
  const pmMatches = (content.match(pmPatterns) || []).length;
  checks.push({
    name: 'S5_no_pm_content',
    ok: pmMatches === 0,
    message: pmMatches === 0 ? '无PM内容' : `发现 ${pmMatches} 处PM内容`,
  });

  // S6: 章节编号连续
  const numberedHeadings = headings.map(h => {
    const m = h.match(/^#{1,2}\s+(\d+)/);
    return m ? parseInt(m[1]) : null;
  }).filter(n => n !== null);
  let sequential = true;
  for (let i = 1; i < numberedHeadings.length; i++) {
    if (numberedHeadings[i] !== numberedHeadings[i-1] && numberedHeadings[i] !== numberedHeadings[i-1] + 1) {
      sequential = false;
      break;
    }
  }
  checks.push({
    name: 'S6_sequential_numbering',
    ok: sequential,
    message: sequential ? '章节编号连续' : '章节编号不连续或有跳号',
  });

  // S7: 交叉引用有效
  const refs = content.match(/\[([^\]]+)\]\(#([^)]+)\)/g) || [];
  const anchors = headings.map(h => h.replace(/^#{1,2}\s+/, '').toLowerCase().replace(/\s+/g, '-'));
  const brokenRefs = refs.filter(ref => {
    const m = ref.match(/\(#([^)]+)\)/);
    return m && !anchors.includes(m[1].toLowerCase());
  });
  checks.push({
    name: 'S7_valid_cross_refs',
    ok: brokenRefs.length === 0,
    message: brokenRefs.length === 0
      ? `${refs.length} 个交叉引用全部有效`
      : `${brokenRefs.length}/${refs.length} 个交叉引用悬空`,
  });

  // ─── 3. 输出 ───
  const result = gateResult(rule?.id || 'design-document-structure-001', checks);

  // ─── 4. 持久化 ───
  const reportPath = path.join(root, 'reports', 'doc-structure', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'design-document-structure-001',
    docPath,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  // ─── 5. 闭环 ───
  await emitEvent(bus, 'doc-structure-check.completed', {
    ok: result.ok, status: result.status, docPath,
  });

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: result.ok
      ? `设计文档结构检查全部通过 (${result.total} 项)`
      : `${result.failed}/${result.total} 项结构检查未通过`,
    ...result,
  };
};
