'use strict';

/**
 * 自主执行器：SEEF子技能编排
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * DTO直接调度SEEF七大子技能，按顺序执行，处理失败重试和议会审议
 */

const fs = require('fs');
const path = require('path');

const SEEF_SUBSKILLS = [
  { name: 'evaluator', order: 1, description: '技能评估器', autoRetry: 2 },
  { name: 'discoverer', order: 2, description: '技能发现器', autoRetry: 2 },
  { name: 'optimizer', order: 3, description: '技能优化器', autoRetry: 2 },
  { name: 'creator', order: 4, description: '技能创造器', autoRetry: 1, councilRequired: true },
  { name: 'aligner', order: 5, description: '全局标准化对齐器', autoRetry: 2 },
  { name: 'validator', order: 6, description: '技能验证器', autoRetry: 2 },
  { name: 'recorder', order: 7, description: '技能记录器', autoRetry: 2 },
];

module.exports = async function(event, rule, context) {
  const payload = event.payload || event.data || {};
  const skillPath = payload.skill_path || payload.path || '';
  const requestedSubskills = payload.subskills || SEEF_SUBSKILLS.map(s => s.name);

  const results = [];
  const logDir = path.resolve(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  for (const subskill of SEEF_SUBSKILLS) {
    if (!requestedSubskills.includes(subskill.name)) continue;

    const taskResult = {
      name: subskill.name,
      order: subskill.order,
      status: 'pending',
      retries: 0,
    };

    // 通过事件总线分发子技能任务
    if (context?.bus?.emit) {
      context.bus.emit(`seef.${subskill.name}.dispatch`, {
        skill_path: skillPath,
        subskill: subskill.name,
        max_retries: subskill.autoRetry,
        council_required: subskill.councilRequired || false,
        trigger_rule: rule.id,
      });
      taskResult.status = 'dispatched';
    } else {
      taskResult.status = 'no_bus';
    }

    // 对需要议会审议的子技能标记
    if (subskill.councilRequired) {
      taskResult.note = '需议会审议，失败时escalate';
      if (context?.bus?.emit) {
        context.bus.emit('council.review.requested', {
          source: `seef.${subskill.name}`,
          skill: skillPath,
          ruleId: rule.id,
        });
      }
    }

    results.push(taskResult);
  }

  // 记录编排日志
  try {
    fs.appendFileSync(
      path.join(logDir, 'seef-orchestration.jsonl'),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        ruleId: rule.id,
        skill: skillPath,
        dispatched: results.filter(r => r.status === 'dispatched').length,
        total: results.length,
      }) + '\n'
    );
  } catch { /* best effort */ }

  return {
    status: 'dispatched',
    skill: skillPath,
    subskills_dispatched: results.filter(r => r.status === 'dispatched').length,
    total: results.length,
    details: results,
  };
};
