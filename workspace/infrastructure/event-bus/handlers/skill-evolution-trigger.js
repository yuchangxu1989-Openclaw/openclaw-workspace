'use strict';

/**
 * 自主执行器：技能进化自动触发
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 技能变更/使用模式变化/性能下降 → 触发SEEF进化流水线 → 排队执行
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';

function getSkillISCScore(skillPath) {
  // 从SKILL.md或manifest中提取ISC得分
  const candidates = [
    path.join(skillPath, 'manifest.json'),
    path.join(skillPath, 'skill.json'),
    path.join(skillPath, 'evaluation-result.json'),
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) {
      try {
        const data = JSON.parse(fs.readFileSync(f, 'utf8'));
        return data.isc_score || data.score || data.quality_score || 100;
      } catch { /* continue */ }
    }
  }
  return 100; // default: assume good
}

function shouldExclude(filePath) {
  const excludePatterns = [
    /node_modules/,
    /\.git/,
    /\.log$/,
    /\.tmp$/,
  ];
  return excludePatterns.some(p => p.test(filePath));
}

module.exports = async function(event, rule, context) {
  const payload = event.payload || event.data || {};
  const skillPath = payload.skill_path || payload.path || '';
  const eventType = event.type || event.event || '';

  if (!skillPath || shouldExclude(skillPath)) {
    return { status: 'skip', reason: '无技能路径或路径被排除' };
  }

  const fullPath = path.isAbsolute(skillPath) ? skillPath : path.join(WORKSPACE, skillPath);

  // 检查ISC得分是否达到触发阈值
  const minScore = rule.condition?.minISCScore || 50;
  const iscScore = getSkillISCScore(fullPath);

  if (iscScore >= minScore && eventType !== 'skill.performance.degraded') {
    // 高分技能在非性能下降时不触发进化
    return { status: 'skip', reason: `ISC得分${iscScore}≥${minScore}，无需触发进化`, score: iscScore };
  }

  // 触发SEEF进化流水线
  const triggerPayload = {
    skill_path: skillPath,
    trigger_event: eventType,
    isc_score: iscScore,
    trigger_rule: rule.id,
    timestamp: new Date().toISOString(),
    immediate: rule.action?.parameters?.immediate || false,
    queue_if_running: rule.action?.parameters?.queueIfRunning || true,
  };

  if (context?.bus?.emit) {
    context.bus.emit('seef.evolution.pipeline.trigger', triggerPayload);
  }

  // 记录日志
  const logDir = path.resolve(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  try {
    fs.appendFileSync(
      path.join(logDir, 'skill-evolution-triggers.jsonl'),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        skill: skillPath,
        event: eventType,
        score: iscScore,
        triggered: true,
      }) + '\n'
    );
  } catch { /* best effort */ }

  return {
    status: 'triggered',
    skill: skillPath,
    isc_score: iscScore,
    event: eventType,
    message: `SEEF进化流水线已触发 (ISC=${iscScore})`,
  };
};
