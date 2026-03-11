'use strict';

const { execSync } = require('child_process');
const path = require('path');

/**
 * dispatch-protocol - 调度协议入口
 * 核心能力：model-router.sh（模型路由决策）
 *
 * 根据任务描述返回建议的 model 和 agentId。
 */

async function run(input, context) {
  const logger = context?.logger || console;
  const task = input?.task || input?.description || '';

  if (!task) {
    return { ok: false, skill: 'dispatch-protocol', error: '缺少 task 参数（任务描述）' };
  }

  logger.info?.(`[dispatch-protocol] 路由任务: ${task.slice(0, 80)}`);

  const script = path.join(__dirname, 'model-router.sh');
  const output = execSync(`JSON_OUTPUT=1 bash "${script}" "${task.replace(/"/g, '\\"')}"`, {
    encoding: 'utf8',
    timeout: 10000,
  });

  // 提取 JSON 输出
  const jsonMatch = output.match(/\{[\s\S]*"model"[\s\S]*"agentId"[\s\S]*\}/);
  if (jsonMatch) {
    const result = JSON.parse(jsonMatch[0]);
    logger.info?.(`[dispatch-protocol] 路由结果: model=${result.model} agent=${result.agentId} tier=${result.tier}`);
    return { ok: true, skill: 'dispatch-protocol', ...result };
  }

  return { ok: true, skill: 'dispatch-protocol', raw: output.trim() };
}

module.exports = run;
module.exports.run = run;
