'use strict';

const { execSync } = require('child_process');
const path = require('path');

/**
 * seef - 技能生态进化工厂入口
 * 子技能：skillify-candidates.sh（技能发现→技能化闭环）
 */

async function run(input, context) {
  const logger = context?.logger || console;
  const action = input?.action || 'skillify';

  if (action === 'skillify') {
    logger.info?.('[seef] 执行 skillify-candidates.sh');
    const script = path.join(__dirname, 'skillify-candidates.sh');
    const output = execSync(`bash "${script}"`, {
      cwd: path.join(__dirname, '../..'),
      encoding: 'utf8',
      timeout: 60000,
    });
    logger.info?.(`[seef] skillify 完成`);
    return { ok: true, skill: 'seef', action, output: output.trim() };
  }

  return { ok: true, skill: 'seef', message: `未知 action: ${action}，支持: skillify` };
}

module.exports = run;
module.exports.run = run;
