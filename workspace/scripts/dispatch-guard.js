#!/usr/bin/env node
// dispatch-guard.js — 调度守卫
// 用法: node dispatch-guard.js <agentId> <label>
// 功能: 1)拒绝空agentId或main 2)检查agent是否空闲 3)推荐空闲agent

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = '/root/.openclaw/agents';
const ROLE_MAP = {
  code: ['coder', 'coder-02', 'worker-03'],
  research: ['researcher', 'researcher-02', 'analyst', 'analyst-02'],
  audit: ['reviewer', 'reviewer-02'],
  write: ['writer', 'writer-02'],
  scout: ['scout', 'scout-02'],
  general: ['worker-04', 'worker-05', 'worker-06']
};
const BLOCKED = ['main']; // main永远不可以被指派

function getRunningCount(agentId) {
  try {
    const sessFile = path.join(AGENTS_DIR, agentId, 'sessions', 'sessions.json');
    const data = JSON.parse(fs.readFileSync(sessFile, 'utf8'));
    return Object.entries(data).filter(([k, v]) => 
      k.includes(':subagent:') && v.status === 'running'
    ).length;
  } catch { return 0; }
}

function validate(agentId) {
  if (!agentId || agentId.trim() === '') return { ok: false, error: '❌ agentId不能为空！必须指定子Agent' };
  if (BLOCKED.includes(agentId)) return { ok: false, error: '❌ 禁止派给main！主Agent只调度不执行' };
  return { ok: true };
}

function pickIdle(role) {
  const candidates = ROLE_MAP[role] || ROLE_MAP.general;
  const all = [...candidates, ...ROLE_MAP.general];
  for (const id of all) {
    if (getRunningCount(id) === 0) return id;
  }
  // 都忙就选负载最低的
  let min = Infinity, pick = candidates[0];
  for (const id of all) {
    const c = getRunningCount(id);
    if (c < min) { min = c; pick = id; }
  }
  return pick;
}

// CLI模式
if (require.main === module) {
  const [,, agentId, label] = process.argv;
  const result = validate(agentId);
  if (!result.ok) {
    console.error(result.error);
    console.log('推荐空闲Agent:');
    Object.entries(ROLE_MAP).forEach(([role, agents]) => {
      const idle = pickIdle(role);
      console.log(`  ${role}: ${idle} (running: ${getRunningCount(idle)})`);
    });
    process.exit(1);
  }
  const running = getRunningCount(agentId);
  console.log(`✅ ${agentId} | running: ${running} | label: ${label || 'N/A'}`);
}

module.exports = { validate, pickIdle, getRunningCount, ROLE_MAP, BLOCKED };
