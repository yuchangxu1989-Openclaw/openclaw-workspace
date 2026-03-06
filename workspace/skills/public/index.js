'use strict';

/**
 * public - 技能入口
 * 自动生成的骨架，请实现具体逻辑。
 */

async function run(input, context) {
  const logger = context?.logger || console;
  logger.info?.(`[public] 执行开始`);

  // TODO: 实现 public 的核心逻辑
  const result = {
    ok: true,
    skill: 'public',
    message: 'public 执行完成（骨架）',
  };

  logger.info?.(`[public] 执行完成`);
  return result;
}

module.exports = run;
module.exports.run = run;
