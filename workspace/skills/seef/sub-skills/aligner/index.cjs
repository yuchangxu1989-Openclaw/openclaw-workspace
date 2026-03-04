const { SKILLS_DIR, REPORTS_DIR } = require('../../../_shared/paths');
/**
 * SEEF Aligner - 标准对齐器
 * 监听 ISC 标准变更，自动检查并触发全链路技能对齐
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * 执行标准对齐检查
 * @param {Object} input - 输入参数
 * @param {string} input.skillId - 技能ID（可选，空则全量扫描）
 * @param {string} input.skillName - 技能名称
 * @param {string} input.trigger - 触发来源
 * @param {Object} input.event - 源事件
 * @returns {Promise<Object>} 对齐结果
 */
async function align(input) {
  const { skillId, skillName, trigger, event } = input;

  console.log(`[SEEF Aligner] 开始标准对齐检查`);
  console.log(`[SEEF Aligner] 触发来源: ${trigger}`);

  try {
    // 1. 加载当前 ISC 规则
    const rulePayload = event?.payload || {};
    const ruleId = rulePayload.rule_id || rulePayload.id || 'unknown';
    const ruleAction = event?.type?.split('.').pop() || 'unknown'; // created/updated/deleted

    console.log(`[SEEF Aligner] ISC 规则变更: ${ruleId} (${ruleAction})`);

    // 2. 扫描所有技能目录
    const skillDirs = [];
    if (fs.existsSync(SKILLS_DIR)) {
      const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.')) {
          skillDirs.push(path.join(SKILLS_DIR, entry.name));
        }
      }
    }

    // 3. 使用 isc_bridge 检查每个技能的合规性
    const alignmentResults = [];
    for (const skillDir of skillDirs.slice(0, 20)) {
      try {
        const output = execSync(
          `python3 "${path.join(__dirname, '..', '..', 'isc_bridge.py')}" "${skillDir}" --summary`,
          { encoding: 'utf8', timeout: 10000 }
        ).trim();
        const result = JSON.parse(output);
        alignmentResults.push(result);
      } catch (err) {
        alignmentResults.push({
          skill: path.basename(skillDir),
          score: 0,
          error: err.message.substring(0, 200),
        });
      }
    }

    // 4. 识别不合规技能
    const nonCompliant = alignmentResults.filter(r => (r.score || 0) < 0.7);
    const compliant = alignmentResults.filter(r => (r.score || 0) >= 0.7);

    const report = {
      subskill: 'aligner',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      input: { trigger, rule_id: ruleId, rule_action: ruleAction },
      result: {
        total_skills_checked: alignmentResults.length,
        compliant: compliant.length,
        non_compliant: nonCompliant.length,
        non_compliant_skills: nonCompliant.map(r => ({
          skill: r.skill,
          score: r.score,
          verdict: r.verdict || 'NON-COMPLIANT',
        })),
        action_needed: nonCompliant.length > 0,
      },
    };

    // 5. 保存报告
    const reportDir = path.join(REPORTS_DIR, 'seef', 'aligner');
    fs.mkdirSync(reportDir, { recursive: true });
    const reportFile = path.join(reportDir, `align-${ruleId}-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`[SEEF Aligner] 报告已保存: ${reportFile}`);
    console.log(`[SEEF Aligner] 合规: ${compliant.length}, 不合规: ${nonCompliant.length}`);

    return report;
  } catch (err) {
    console.error(`[SEEF Aligner] 对齐检查失败:`, err.message);
    return {
      subskill: 'aligner',
      error: err.message,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = { align };
