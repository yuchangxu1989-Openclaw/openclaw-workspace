'use strict';
/**
 * 第2层防护：主Agent派发拦截
 * 在spawn子Agent前调用，检测task描述是否涉及技能创建/修改/删除
 * 如涉及 → 阻断并建议走skill-creator流水线
 */

// 强信号关键词（命中任一即触发）
const STRONG_PATTERNS = [
  /创建.{0,10}技能/,
  /新建.{0,10}skill/i,
  /重写.{0,10}(index\.js|SKILL\.md)/i,
  /删除.{0,10}技能/,
  /技能.{0,10}(开发|编写|实现|重构)/,
  /skill.{0,10}(creat|develop|implement|rewrit|delet)/i,
  /写一个.{0,10}技能/,
  /skills\/[a-z].*\/(index|SKILL)/i,
];

// 弱信号（需2个以上同时命中）
const WEAK_PATTERNS = [
  /skills\//i,
  /技能/,
  /SKILL\.md/i,
  /index\.js/,
  /流水线/,
  /handler/i,
];

// 白名单：这些描述不拦截（配置微调、bugfix等）
const WHITELIST_PATTERNS = [
  /config\.(json|py|yaml)/i,
  /bugfix/i,
  /配置.{0,5}(修改|调整|更新)/,
  /eval/i,
  /评测/,
  /审计/,
  /检查/,
];

/**
 * 检查spawn任务描述是否涉及技能创建/修改
 * @param {string} taskDescription - 任务描述
 * @returns {{ blocked: boolean, reason?: string, suggestedAction?: string, confidence: number }}
 */
function checkSpawnTask(taskDescription) {
  if (!taskDescription || typeof taskDescription !== 'string') {
    return { blocked: false, confidence: 0 };
  }

  const desc = taskDescription;

  // 白名单优先放行
  for (const wp of WHITELIST_PATTERNS) {
    if (wp.test(desc)) {
      return { blocked: false, confidence: 0, note: '白名单放行' };
    }
  }

  // 强信号检测
  for (const sp of STRONG_PATTERNS) {
    if (sp.test(desc)) {
      return {
        blocked: true,
        reason: `任务涉及技能创建/修改（命中: ${sp}），必须通过skill-creator流水线`,
        suggestedAction: '改用skill-creator派发，通过 action=post-create 完成全流程',
        confidence: 0.95,
      };
    }
  }

  // 弱信号检测（2个以上同时命中）
  const weakHits = WEAK_PATTERNS.filter(wp => wp.test(desc));
  if (weakHits.length >= 2) {
    return {
      blocked: true,
      reason: `任务疑似涉及技能变更（${weakHits.length}个弱信号命中），建议走skill-creator流水线`,
      suggestedAction: '改用skill-creator派发，或确认仅为配置/bugfix后添加白名单标记',
      confidence: 0.7,
    };
  }

  return { blocked: false, confidence: 0 };
}

module.exports = { checkSpawnTask };
