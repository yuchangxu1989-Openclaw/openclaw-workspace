'use strict';
/**
 * spawn-agentid-guard.js
 * 程序化守卫：检测sessions_spawn是否携带agentId
 * 
 * 用法：在主Agent spawn前调用
 *   node spawn-agentid-guard.js <label> <agentId>
 *   - 如果agentId为空或"main"，输出告警并exit 1
 *   - 否则exit 0
 * 
 * 也可作为模块引用：
 *   const { validateSpawn } = require('./spawn-agentid-guard');
 *   validateSpawn(label, agentId); // throws if invalid
 */

const ROLE_MAP = {
  // label前缀 → 推荐agentId
  'fix': 'coder',
  'batch': 'coder',
  'refactor': 'coder',
  'impl': 'coder',
  'auto': 'coder',
  'backlog': 'analyst',
  'review': 'reviewer',
  'audit': 'analyst',
  'check': 'analyst',
  'scan': 'analyst',
  'doc': 'writer',
  'write': 'writer',
  'report': 'writer',
  'research': 'researcher',
  'scout': 'scout',
};

function suggestAgent(label) {
  if (!label) return 'worker';
  const prefix = label.split('-')[0].toLowerCase();
  return ROLE_MAP[prefix] || 'worker';
}

function validateSpawn(label, agentId) {
  if (!agentId || agentId === 'main') {
    const suggested = suggestAgent(label);
    const msg = `⚠️ [spawn-agentid-guard] label="${label}" 未指定agentId（或为main）。建议使用 agentId="${suggested}"`;
    console.error(msg);
    return { valid: false, suggested, message: msg };
  }
  return { valid: true, agentId };
}

// CLI模式
if (require.main === module) {
  const [,, label, agentId] = process.argv;
  const result = validateSpawn(label, agentId);
  if (!result.valid) {
    process.exit(1);
  } else {
    console.log(`✅ agentId="${agentId}" OK`);
  }
}

module.exports = { validateSpawn, suggestAgent };
