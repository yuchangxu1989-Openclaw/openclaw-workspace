const { SKILLS_DIR, REPORTS_DIR } = require('../../../_shared/paths');
/**
 * SEEF Creator - 技能创造器
 * 基于发现器的洞察自动生成新技能原型
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

/**
 * 创建新技能原型
 * @param {Object} input - 输入参数
 * @param {string} input.skillId - 目标技能ID
 * @param {string} input.skillName - 技能名称
 * @param {string} input.trigger - 触发来源
 * @param {Object} input.event - 源事件
 * @returns {Promise<Object>} 创建结果
 */
async function create(input) {
  const { skillId, skillName, trigger, event } = input;

  console.log(`[SEEF Creator] 开始创建技能原型: ${skillName} (${skillId})`);
  console.log(`[SEEF Creator] 触发来源: ${trigger}`);

  try {
    // 1. 分析发现器输出，确定创建需求
    const discoveryPayload = event?.payload || {};
    const gaps = discoveryPayload.gaps || [];
    const opportunities = discoveryPayload.opportunities || [];

    // 2. 生成技能模板
    const template = generateTemplate(skillName, gaps, opportunities);

    // 3. 记录创建计划
    const report = {
      subskill: 'creator',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      input: { skillId, skillName, trigger },
      result: {
        template_generated: true,
        skill_name: skillName,
        gaps_addressed: gaps.length,
        opportunities_leveraged: opportunities.length,
        template,
      },
    };

    // 4. 保存报告
    const reportDir = path.join(REPORTS_DIR, 'seef', 'creator');
    fs.mkdirSync(reportDir, { recursive: true });
    const reportFile = path.join(reportDir, `create-${skillId || skillName}-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`[SEEF Creator] 报告已保存: ${reportFile}`);

    return report;
  } catch (err) {
    console.error(`[SEEF Creator] 创建失败:`, err.message);
    return {
      subskill: 'creator',
      error: err.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * 生成技能模板
 */
function generateTemplate(skillName, gaps, opportunities) {
  return {
    name: skillName,
    structure: ['SKILL.md', 'index.js', 'config/'],
    skill_md: {
      name: skillName,
      description: `Auto-generated skill to address: ${gaps.join(', ') || 'discovered opportunities'}`,
      version: '0.1.0',
    },
    gaps_addressed: gaps,
    opportunities: opportunities,
  };
}

module.exports = { create };
