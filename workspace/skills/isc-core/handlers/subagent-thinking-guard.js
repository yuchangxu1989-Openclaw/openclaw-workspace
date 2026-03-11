/**
 * subagent-thinking-guard - 子Agent必须开启thinking模式
 */
module.exports = {
  name: 'subagent-thinking-guard',
  ruleId: 'SUBAGENT-THINKING-MANDATORY-001',
  async handle(context) {
    const { thinking } = context;
    if (!thinking || thinking === 'off') {
      return { action: 'block', message: '子Agent必须开启thinking模式' };
    }
    return { action: 'allow' };
  }
};
