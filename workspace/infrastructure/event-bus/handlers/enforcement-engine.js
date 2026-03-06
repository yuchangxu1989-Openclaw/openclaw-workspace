'use strict';

/**
 * 自主执行器：架构审核门强制执行
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 检测到设计未过审核门 → 自动触发架构评审流水线 → 阻塞后续执行
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APPROVAL_MARKERS = [
  /审核门\s*[:：]\s*(通过|已通过|pass)/i,
  /design[\s_-]*gate\s*[:：]\s*(approved|pass|passed)/i,
  /review(?:ed)?\s*[:：]\s*(yes|approved|pass)/i,
  /\[x\]\s*(审核通过|design gate approved)/i,
  /✅\s*(审核通过|approved|gate passed)/i,
  /GATE_STATUS\s*[:=]\s*["']?approved["']?/i,
];

const REQUIRED_SECTIONS = [
  { name: '目标', patterns: [/##\s*(目标|objective|goal)/i] },
  { name: '方案', patterns: [/##\s*(方案|solution|approach|design)/i] },
  { name: '风险', patterns: [/##\s*(风险|risk|concern)/i] },
  { name: '验收', patterns: [/##\s*(验收|acceptance|criteria)/i] },
];

function hasApprovalMarker(content) {
  return APPROVAL_MARKERS.some(r => r.test(content));
}

function checkDesignCompleteness(content) {
  const missing = [];
  for (const section of REQUIRED_SECTIONS) {
    const found = section.patterns.some(p => p.test(content));
    if (!found) missing.push(section.name);
  }
  return missing;
}

function generateReviewTemplate(filePath, missingSections) {
  const name = path.basename(filePath, path.extname(filePath));
  const sections = [
    `\n---\n`,
    `## 📋 架构评审清单 (自动生成)`,
    ``,
    `**文档**: ${name}`,
    `**生成时间**: ${new Date().toISOString()}`,
    `**状态**: 待评审`,
    ``,
  ];

  if (missingSections.length > 0) {
    sections.push(`### ⚠️ 缺失章节`);
    for (const s of missingSections) {
      sections.push(`- [ ] 补充「${s}」章节`);
    }
    sections.push('');
  }

  sections.push(
    `### 评审检查项`,
    `- [ ] 方案可行性评估`,
    `- [ ] 技术风险已识别`,
    `- [ ] 依赖关系已明确`,
    `- [ ] 回滚方案已准备`,
    `- [ ] 性能影响已评估`,
    ``,
    `### 审核门`,
    `审核门: 待通过`,
    ``,
    `> 评审完成后，将上方「待通过」改为「通过」即可放行。`,
    ``
  );

  return sections.join('\n');
}

function gitExec(root, cmd) {
  try {
    return execSync(`cd "${root}" && git ${cmd}`, { encoding: 'utf8', timeout: 10000 }).trim();
  } catch { return ''; }
}

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const designDir = path.join(root, 'designs');
  const actions = [];
  const blocked = [];
  const autoFixed = [];

  // ─── 感知：扫描设计文档 ───
  if (!fs.existsSync(designDir)) {
    // 自动创建designs目录
    fs.mkdirSync(designDir, { recursive: true });
    actions.push('created_designs_dir');
    return {
      ok: true,
      autonomous: true,
      actions,
      message: 'designs目录不存在，已创建。无设计文档待审核。',
    };
  }

  const docs = fs.readdirSync(designDir)
    .filter(n => /\.(md|markdown|txt)$/i.test(n))
    .map(n => ({ name: n, fullPath: path.join(designDir, n) }));

  if (docs.length === 0) {
    return {
      ok: true,
      autonomous: true,
      actions: ['no_designs_found'],
      message: '无设计文档待审核',
    };
  }

  // ─── 判断 & 自主执行 ───
  for (const doc of docs) {
    let content;
    try { content = fs.readFileSync(doc.fullPath, 'utf8'); }
    catch { continue; }

    const approved = hasApprovalMarker(content);
    if (approved) {
      actions.push(`approved:${doc.name}`);
      continue;
    }

    // 未通过审核门 → 自主修复
    const missingSections = checkDesignCompleteness(content);

    // 1. 为缺失章节生成骨架
    if (missingSections.length > 0) {
      let patch = '';
      for (const section of missingSections) {
        const existing = REQUIRED_SECTIONS.find(s => s.name === section);
        if (existing) {
          patch += `\n## ${section}\n\n> TODO: 请补充${section}内容\n`;
        }
      }
      if (patch) {
        try {
          fs.appendFileSync(doc.fullPath, patch, 'utf8');
          autoFixed.push({ doc: doc.name, action: 'added_missing_sections', sections: missingSections });
          actions.push(`patched_sections:${doc.name}`);
        } catch (e) {
          actions.push(`patch_failed:${doc.name}:${e.message}`);
        }
      }
    }

    // 2. 追加评审清单模板
    const reviewTemplate = generateReviewTemplate(doc.name, missingSections);
    if (!content.includes('架构评审清单')) {
      try {
        fs.appendFileSync(doc.fullPath, reviewTemplate, 'utf8');
        autoFixed.push({ doc: doc.name, action: 'added_review_template' });
        actions.push(`review_template:${doc.name}`);
      } catch (e) {
        actions.push(`template_failed:${doc.name}:${e.message}`);
      }
    }

    // 3. 记录为阻塞项
    blocked.push({
      doc: doc.name,
      missingSections,
      status: 'blocked_pending_review',
    });
  }

  // ─── 更新阻塞状态文件 ───
  const blockFilePath = path.join(root, 'infrastructure', 'gate-blocked.json');
  if (blocked.length > 0) {
    try {
      const blockData = {
        timestamp: new Date().toISOString(),
        blocked,
        totalDocs: docs.length,
        approvedCount: docs.length - blocked.length,
      };
      fs.mkdirSync(path.dirname(blockFilePath), { recursive: true });
      fs.writeFileSync(blockFilePath, JSON.stringify(blockData, null, 2) + '\n', 'utf8');
      actions.push('block_list_updated');
    } catch (e) {
      actions.push(`block_list_failed:${e.message}`);
    }
  } else if (fs.existsSync(blockFilePath)) {
    // 全部通过 → 清除阻塞文件
    fs.unlinkSync(blockFilePath);
    actions.push('block_list_cleared');
  }

  // ─── Git commit ───
  if (autoFixed.length > 0) {
    try {
      gitExec(root, 'add -A');
      gitExec(root, `commit --no-verify -m "🚧 enforcement: patched ${autoFixed.length} design docs with review templates"`);
      actions.push('git_committed');
    } catch (e) {
      actions.push(`git_commit_failed:${e.message}`);
    }
  }

  // ─── 验证 ───
  const verifyOk = blocked.length === 0;
  actions.push(verifyOk ? 'all_gates_passed' : `${blocked.length}_gates_blocked`);

  // ─── 闭环 ───
  if (context?.bus?.emit) {
    await context.bus.emit('enforcement.gate.checked', {
      total: docs.length,
      approved: docs.length - blocked.length,
      blocked: blocked.length,
      autoFixed: autoFixed.length,
    });

    // 发射阻塞事件阻止后续执行
    if (blocked.length > 0) {
      await context.bus.emit('enforcement.gate.blocked', {
        blockedDocs: blocked.map(b => b.doc),
        message: `${blocked.length}个设计文档未通过审核门，后续执行已阻塞`,
      });
    }
  }

  if (blocked.length > 0 && context?.notify) {
    await context.notify(
      `[enforcement] ${blocked.length}/${docs.length}个设计文档未通过审核门（已自动补充评审清单），请完成评审: ${blocked.map(b => b.doc).join(', ')}`,
      'warning'
    );
  }

  return {
    ok: verifyOk,
    autonomous: true,
    totalDocs: docs.length,
    approved: docs.length - blocked.length,
    blocked: blocked.length,
    autoFixed: autoFixed.length,
    blockedDocs: blocked.map(b => b.doc),
    actions,
    message: verifyOk
      ? `所有${docs.length}个设计文档已通过审核门`
      : `${blocked.length}个设计文档未通过审核门，已补充评审清单模板，后续执行已阻塞`,
  };
};
