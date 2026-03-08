const fs = require('fs');
const path = require('path');
const { exists, readText, readJson, walk, hasAny } = require('./p0-utils');

/**
 * Architecture Review Pipeline Handler
 * 
 * 规则意图：架构方案必须经过标准化评审流水线
 * 流水线：架构师→工程师+质量分析师并行→修复循环→裁决殿终审→用户裁决
 * 感知：document/architecture/skill restructure事件
 * 执行：检查文档方案+审核记录，缺少则自动生成评审模板
 */
module.exports = async function(event, rule, context) {
  const logger = context.logger || console;
  const bus = context.bus;
  const workspace = context.workspace || process.cwd();

  logger.info(`[architecture-review] Triggered by ${event.type}`, { eventId: event.id });

  try {
    const payload = event.payload || {};
    const docPath = payload.document_path || payload.file_path || payload.path || '';
    const fullDocPath = docPath ? path.resolve(workspace, docPath) : '';

    // === 感知：确定待评审文档 ===
    let docContent = '';
    if (fullDocPath && await exists(fullDocPath)) {
      docContent = await readText(fullDocPath);
      logger.info(`[architecture-review] Reviewing document: ${docPath}`);
    } else {
      logger.info('[architecture-review] No specific document path, scanning for architecture docs');
    }

    // === 判断：评审状态检查 ===
    const reviewChecklist = {
      hasProposal: false,         // 方案部分
      hasArchitectReview: false,  // 架构师评审
      hasEngineerReview: false,   // 工程师评审
      hasQAReview: false,         // 质量分析师评审
      hasFixLog: false,           // 修复记录
      hasFinalReview: false,      // 裁决殿终审
      hasUserDecision: false      // 用户裁决
    };

    if (docContent) {
      reviewChecklist.hasProposal = hasAny(docContent, ['## 方案', '## Proposal', '## 架构方案', '## Design', '## Architecture']);
      reviewChecklist.hasArchitectReview = hasAny(docContent, ['架构师评审', 'Architect Review', '## 架构评审']);
      reviewChecklist.hasEngineerReview = hasAny(docContent, ['工程师评审', 'Engineer Review', '## 工程评审']);
      reviewChecklist.hasQAReview = hasAny(docContent, ['质量分析', 'QA Review', '质量评审', 'Quality Review']);
      reviewChecklist.hasFixLog = hasAny(docContent, ['修复记录', 'Fix Log', '修复循环', 'Remediation']);
      reviewChecklist.hasFinalReview = hasAny(docContent, ['裁决殿', '终审', 'Final Review', 'Final Approval']);
      reviewChecklist.hasUserDecision = hasAny(docContent, ['用户裁决', 'User Decision', '用户决策', 'User Approval']);
    }

    const missingSteps = Object.entries(reviewChecklist)
      .filter(([, v]) => !v)
      .map(([k]) => k);

    const allPassed = missingSteps.length === 0;

    // === 执行：生成或更新评审模板 ===
    if (!allPassed && fullDocPath) {
      const reviewTemplate = generateReviewTemplate(missingSteps, payload);
      const reportDir = path.join(workspace, 'reports/architecture-reviews');

      // 确保报告目录存在
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }

      // 写入评审清单报告
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const reportName = `review-${path.basename(docPath || 'unknown', path.extname(docPath || ''))}-${timestamp}.md`;
      const reportPath = path.join(reportDir, reportName);

      fs.writeFileSync(reportPath, reviewTemplate, 'utf-8');
      logger.info(`[architecture-review] Review checklist written to: ${reportPath}`);

      // 如果文档存在但缺少评审段落，追加评审模板到文档
      if (docContent && missingSteps.includes('hasProposal') === false) {
        const appendTemplate = generateAppendTemplate(missingSteps);
        const updatedContent = docContent + '\n\n' + appendTemplate;
        fs.writeFileSync(fullDocPath, updatedContent, 'utf-8');
        logger.info(`[architecture-review] Appended review template to document: ${docPath}`);
      }
    }

    // === 闭环：emit结果 ===
    if (allPassed) {
      logger.info('[architecture-review] PASSED: All review stages complete');

      if (bus) {
        await bus.emit('architecture.review.passed', {
          source: 'architecture-review',
          document: docPath,
          checklist: reviewChecklist,
          trigger: event.type,
          timestamp: new Date().toISOString()
        });
      }

      return {
        status: 'PASSED',
        document: docPath,
        checklist: reviewChecklist,
        timestamp: new Date().toISOString()
      };
    } else {
      logger.warn('[architecture-review] INCOMPLETE: Missing review stages', { missingSteps });

      if (bus) {
        await bus.emit('architecture.review.incomplete', {
          source: 'architecture-review',
          document: docPath,
          missingSteps,
          checklist: reviewChecklist,
          trigger: event.type
        });
      }

      return {
        status: 'INCOMPLETE',
        document: docPath,
        missingSteps,
        checklist: reviewChecklist,
        message: `Architecture review incomplete. Missing: ${missingSteps.join(', ')}`,
        timestamp: new Date().toISOString()
      };
    }
  } catch (err) {
    logger.error('[architecture-review] Unexpected error', err);
    throw err;
  }
};

function generateReviewTemplate(missingSteps, payload) {
  const now = new Date().toISOString();
  let template = `# 架构评审清单\n\n`;
  template += `> 生成时间: ${now}\n`;
  template += `> 触发来源: ${payload.source || 'event-bus'}\n\n`;
  template += `## 评审状态\n\n`;

  const stepLabels = {
    hasProposal: '📋 方案文档',
    hasArchitectReview: '🏗️ 架构师评审',
    hasEngineerReview: '⚙️ 工程师评审',
    hasQAReview: '🔍 质量分析师评审',
    hasFixLog: '🔧 修复循环记录',
    hasFinalReview: '🏛️ 裁决殿终审',
    hasUserDecision: '👤 用户裁决'
  };

  for (const [step, label] of Object.entries(stepLabels)) {
    const status = missingSteps.includes(step) ? '❌ 缺失' : '✅ 已完成';
    template += `- ${label}: ${status}\n`;
  }

  template += `\n## 待完成项\n\n`;
  for (const step of missingSteps) {
    template += `### ${stepLabels[step] || step}\n\n`;
    template += `- [ ] 待填写\n- 评审人: \n- 评审日期: \n- 评审意见: \n\n`;
  }

  return template;
}

function generateAppendTemplate(missingSteps) {
  let tpl = `\n---\n\n## 📝 评审记录（自动生成）\n\n`;

  const templates = {
    hasArchitectReview: '### 🏗️ 架构师评审\n- 评审人: \n- 日期: \n- 意见: \n- 结论: [ ] 通过 / [ ] 需修改\n',
    hasEngineerReview: '### ⚙️ 工程师评审\n- 评审人: \n- 日期: \n- 可行性: \n- 风险点: \n- 结论: [ ] 通过 / [ ] 需修改\n',
    hasQAReview: '### 🔍 质量分析师评审\n- 评审人: \n- 日期: \n- 质量风险: \n- 测试建议: \n- 结论: [ ] 通过 / [ ] 需修改\n',
    hasFixLog: '### 🔧 修复循环记录\n- 修复内容: \n- 修复日期: \n- 验证结果: \n',
    hasFinalReview: '### 🏛️ 裁决殿终审\n- 终审人: \n- 日期: \n- 最终意见: \n- 结论: [ ] 批准 / [ ] 驳回\n',
    hasUserDecision: '### 👤 用户裁决\n- 决策人: \n- 日期: \n- 决策: [ ] 采纳 / [ ] 否决\n- 备注: \n'
  };

  for (const step of missingSteps) {
    if (templates[step]) {
      tpl += templates[step] + '\n';
    }
  }

  return tpl;
}
