'use strict';

/**
 * 自主执行器：技能注册时自动触发SEEF质量评估
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 技能创建/更新 → 触发SEEF evaluator子技能 → 收集评估结果 → 记录
 */

const fs = require('fs');
const path = require('path');

module.exports = async function(event, rule, context) {
  const payload = event.payload || event.data || {};
  const skillPath = payload.skill_path || payload.skillId || payload.path || '';

  if (!skillPath) {
    return { status: 'skip', reason: '无技能路径或ID' };
  }

  const WORKSPACE = '/root/.openclaw/workspace';
  const seefDir = path.join(WORKSPACE, 'skills/seef');
  const evaluatorPath = path.join(seefDir, 'evaluator');

  // 检查SEEF evaluator是否存在
  const seefExists = fs.existsSync(seefDir);
  const evaluatorExists = fs.existsSync(evaluatorPath);

  // 通过事件总线触发SEEF评估
  if (context?.bus?.emit) {
    context.bus.emit('seef.evaluator.trigger', {
      skill_path: skillPath,
      trigger_rule: rule.id,
      trigger_event: event.type || event.event,
      timestamp: new Date().toISOString(),
    });
  }

  // 记录触发日志
  const logDir = path.resolve(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  try {
    fs.appendFileSync(
      path.join(logDir, 'seef-triggers.jsonl'),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        ruleId: rule.id,
        skill: skillPath,
        seef_available: seefExists,
        evaluator_available: evaluatorExists,
      }) + '\n'
    );
  } catch { /* best effort */ }

  if (!seefExists) {
    return {
      status: 'warn',
      reason: 'SEEF技能目录不存在，已发出触发事件但可能无法执行',
      skill: skillPath,
    };
  }

  return {
    status: 'triggered',
    skill: skillPath,
    seef_subskill: 'evaluator',
    message: 'SEEF质量评估已触发',
  };
};
