'use strict';

/**
 * _shared - 技能入口
 * 自动生成的骨架，请实现具体逻辑。
 */

async function run(input, context) {
  const logger = context?.logger || console;
  logger.info?.(`[_shared] 执行开始`);

  // TODO: 实现 _shared 的核心逻辑
  const result = {
    ok: true,
    skill: '_shared',
    message: '_shared 执行完成（骨架）',
  };

  logger.info?.(`[_shared] 执行完成`);
  return result;
}

module.exports = run;
module.exports.run = run;
