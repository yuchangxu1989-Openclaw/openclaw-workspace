'use strict';
/**
 * spawn-agentid-guard.js
 * 调度层守卫：强制sessions_spawn必须指定agentId且不能是main
 * 
 * 铁令：
 *   1. 每次spawn必须指定agentId
 *   2. main不可被指定为agentId（main是调度者，不是执行者）
 * 
 * 用法：spawn前调用
 *   node spawn-agentid-guard.js <label> <agentId>
 *   exit 0 = 放行, exit 1 = 拒绝
 */

const VALID_AGENTS = [
  'coder', 'coder-02',
  'analyst', 'analyst-02',
  'reviewer', 'reviewer-02',
  'writer', 'writer-02',
  'researcher', 'researcher-02',
  'scout', 'scout-02',
  'worker-03', 'worker-04', 'worker-05', 'worker-06', 'worker-07', 'worker-08',
  'cron-worker', 'cron-worker-02',
  'architect', 'architect-02',
];

const BLOCKED = ['main']; // main是调度者，不可作为执行agentId

function validate(label, agentId) {
  if (!agentId) {
    return { valid: false, reason: `❌ 拒绝：label="${label}" 未指定agentId。spawn必须指定agentId。` };
  }
  if (BLOCKED.includes(agentId)) {
    return { valid: false, reason: `❌ 拒绝：agentId="${agentId}" 不可用。main是调度者不是执行者。` };
  }
  if (!VALID_AGENTS.includes(agentId)) {
    return { valid: false, reason: `⚠️ 警告：agentId="${agentId}" 不在已知agent列表中。` };
  }
  return { valid: true };
}

if (require.main === module) {
  const [,, label, agentId] = process.argv;
  const result = validate(label, agentId);
  console.log(result.reason || `✅ agentId="${agentId}" 放行`);
  process.exit(result.valid ? 0 : 1);
}

module.exports = { validate, VALID_AGENTS, BLOCKED };
