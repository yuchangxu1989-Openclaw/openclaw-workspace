/**
 * isc-skill-usage-protocol-001 - 技能使用协议守卫
 * 使用技能前必须先读取SKILL.md确认用法
 */
module.exports = {
  name: 'isc-skill-usage-protocol',
  ruleId: 'ISC-SKILL-USAGE-PROTOCOL-001',
  async handle(context) {
    const { skillId, hasReadSkillMd = false } = context;
    if (!hasReadSkillMd) {
      return { action: 'block', message: `必须先读取 SKILL.md 再使用技能 ${skillId}` };
    }
    return { action: 'allow' };
  }
};
