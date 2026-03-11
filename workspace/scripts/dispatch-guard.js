/**
 * dispatch-guard.js v2 — 调度中枢
 * 
 * 功能：
 *   - discoverAgents(): 动态扫描 /root/.openclaw/agents/ 发现所有可用agent
 *   - globalSnapshot(): 返回每个agent的running任务数
 *   - pickBestAgent(role): 按角色匹配+负载均衡选择最空闲agent
 *   - batchAssign(tasks): 批量分配，每个任务自动选最佳agent
 *   - main永远不在候选列表
 * 
 * 检测running的逻辑：
 *   sessions.json中的subagent条目，如果对应的.jsonl文件存在且没有.deleted后缀，
 *   则视为running。
 */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = '/root/.openclaw/agents';
const BLOCKED = ['main']; // 永远不在候选列表

// 角色→agent前缀映射（用于pickBestAgent的角色匹配）
const ROLE_PREFIX_MAP = {
  code:     ['coder', 'worker'],
  coder:    ['coder', 'worker'],
  research: ['researcher', 'analyst'],
  researcher: ['researcher', 'analyst'],
  analyst:  ['analyst', 'researcher'],
  audit:    ['reviewer', 'analyst'],
  review:   ['reviewer'],
  reviewer: ['reviewer'],
  write:    ['writer'],
  writer:   ['writer'],
  scout:    ['scout'],
  cron:     ['cron-worker'],
  general:  ['worker', 'coder', 'writer', 'scout'],
};

/**
 * 动态扫描 agents 目录，发现所有可用agent（排除main和BLOCKED）
 */
function discoverAgents() {
  try {
    const entries = fs.readdirSync(AGENTS_DIR, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(name => !BLOCKED.includes(name))
      .filter(name => {
        // 必须有sessions目录才算有效agent
        const sessDir = path.join(AGENTS_DIR, name, 'sessions');
        return fs.existsSync(sessDir);
      })
      .sort();
  } catch (err) {
    console.error('[dispatch-guard] discoverAgents error:', err.message);
    return [];
  }
}

/**
 * 获取某个agent当前running的子任务数
 * 逻辑：读sessions.json，找:subagent:条目，检查对应.jsonl文件是否存在（未deleted）
 */
function getRunning(agentId) {
  const sessFile = path.join(AGENTS_DIR, agentId, 'sessions', 'sessions.json');
  const sessDir = path.join(AGENTS_DIR, agentId, 'sessions');
  
  try {
    const data = JSON.parse(fs.readFileSync(sessFile, 'utf8'));
    let running = 0;
    
    for (const [key, val] of Object.entries(data)) {
      // 只看subagent类型的session
      if (!key.includes(':subagent:')) continue;
      
      const sid = val.sessionId;
      if (!sid) continue;
      
      // 检查.jsonl文件是否存在（未被deleted）
      const jsonlPath = path.join(sessDir, sid + '.jsonl');
      if (fs.existsSync(jsonlPath)) {
        running++;
      }
    }
    
    return running;
  } catch {
    return 0;
  }
}

/**
 * 全局负载快照 — 返回所有agent的running数、利用率等
 */
function globalSnapshot() {
  const agents = discoverAgents();
  const snapshot = agents.map(id => ({
    id,
    running: getRunning(id),
  }));
  
  const totalRunning = snapshot.reduce((sum, a) => sum + a.running, 0);
  const totalAgents = agents.length;
  const idle = snapshot.filter(a => a.running === 0);
  const busy = snapshot.filter(a => a.running > 0);
  
  return {
    timestamp: new Date().toISOString(),
    totalAgents,
    totalRunning,
    totalIdle: idle.length,
    utilization: totalAgents > 0
      ? (totalRunning / totalAgents * 100).toFixed(1) + '%'
      : '0%',
    idleAgents: idle.map(a => a.id),
    busyAgents: busy.map(a => ({ id: a.id, running: a.running })),
    agents: snapshot,
  };
}

/**
 * 按角色匹配+负载均衡选择最空闲agent
 * @param {string} role - 角色提示（如 'coder', 'researcher', 'scout'）
 * @returns {{ agentId: string, running: number, reason: string }}
 */
function pickBestAgent(role) {
  const agents = discoverAgents();
  if (agents.length === 0) {
    return { agentId: null, running: 0, reason: 'no-agents-available' };
  }
  
  let candidates = agents;
  
  if (role) {
    const normalizedRole = role.toLowerCase().trim();
    
    // 1. 先查ROLE_PREFIX_MAP
    const prefixes = ROLE_PREFIX_MAP[normalizedRole];
    if (prefixes) {
      const matched = agents.filter(id =>
        prefixes.some(prefix => id.startsWith(prefix))
      );
      if (matched.length > 0) candidates = matched;
    } else {
      // 2. 直接用role作为前缀匹配
      const matched = agents.filter(id => id.startsWith(normalizedRole));
      if (matched.length > 0) candidates = matched;
    }
    
    // 3. 如果角色匹配无结果，fallback到worker-*通用池
    if (candidates === agents) {
      const workers = agents.filter(id => id.startsWith('worker'));
      if (workers.length > 0) candidates = workers;
      // 如果连worker都没有，用全部agent
    }
  }
  
  // 选running最少的
  let minRunning = Infinity;
  let pick = candidates[0];
  
  for (const id of candidates) {
    const r = getRunning(id);
    if (r === 0) {
      return { agentId: id, running: 0, reason: 'idle' };
    }
    if (r < minRunning) {
      minRunning = r;
      pick = id;
    }
  }
  
  return { agentId: pick, running: minRunning, reason: 'least-loaded' };
}

/**
 * 批量分配 — MECE拆解后一次性分配N个任务
 * 使用临时负载计数避免全部分到同一个agent
 * @param {Array<{label: string, roleHint?: string}>} tasks
 * @returns {Array<{label: string, agentId: string, currentLoad: number}>}
 */
function batchAssign(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return [];
  }
  
  const agents = discoverAgents();
  if (agents.length === 0) {
    return tasks.map(t => ({ label: t.label, agentId: null, currentLoad: 0, error: 'no-agents' }));
  }
  
  // 预加载所有agent的真实负载
  const realLoad = {};
  for (const id of agents) {
    realLoad[id] = getRunning(id);
  }
  
  // 临时负载计数（本批次内已分配的）
  const tempLoad = {};
  const allocated = [];
  
  for (const task of tasks) {
    let candidates = agents;
    
    // 角色匹配
    if (task.roleHint) {
      const normalizedRole = task.roleHint.toLowerCase().trim();
      const prefixes = ROLE_PREFIX_MAP[normalizedRole];
      
      if (prefixes) {
        const matched = agents.filter(id =>
          prefixes.some(prefix => id.startsWith(prefix))
        );
        if (matched.length > 0) candidates = matched;
      } else {
        const matched = agents.filter(id => id.startsWith(normalizedRole));
        if (matched.length > 0) candidates = matched;
      }
      
      // fallback到worker
      if (candidates === agents) {
        const workers = agents.filter(id => id.startsWith('worker'));
        if (workers.length > 0) candidates = workers;
      }
    }
    
    // 选总负载（真实+临时）最小的
    let minLoad = Infinity;
    let pick = candidates[0];
    
    for (const id of candidates) {
      const totalLoad = (realLoad[id] || 0) + (tempLoad[id] || 0);
      if (totalLoad < minLoad) {
        minLoad = totalLoad;
        pick = id;
      }
    }
    
    tempLoad[pick] = (tempLoad[pick] || 0) + 1;
    allocated.push({
      label: task.label,
      agentId: pick,
      currentLoad: minLoad,
    });
  }
  
  return allocated;
}

// ===== CLI =====
if (require.main === module) {
  const cmd = process.argv[2];
  
  switch (cmd) {
    case '--snapshot':
    case 'snapshot': {
      const snap = globalSnapshot();
      console.log(JSON.stringify(snap, null, 2));
      break;
    }
    
    case '--pick':
    case 'pick': {
      const role = process.argv[3] || '';
      const result = pickBestAgent(role);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    
    case '--batch':
    case 'batch': {
      const json = process.argv[3];
      if (!json) {
        console.error('用法: node dispatch-guard.js batch \'[{"label":"t1","roleHint":"coder"}]\'');
        process.exit(1);
      }
      try {
        const tasks = JSON.parse(json);
        const result = batchAssign(tasks);
        console.log(JSON.stringify(result, null, 2));
      } catch (e) {
        console.error('JSON解析失败:', e.message);
        process.exit(1);
      }
      break;
    }
    
    case '--help':
    case 'help':
    default:
      console.log(`dispatch-guard.js v2 — 调度中枢

用法:
  node dispatch-guard.js snapshot              显示全局负载快照
  node dispatch-guard.js pick [role]           按角色选最佳agent
  node dispatch-guard.js batch '<json>'        批量分配任务

示例:
  node dispatch-guard.js snapshot
  node dispatch-guard.js pick coder
  node dispatch-guard.js pick researcher
  node dispatch-guard.js batch '[{"label":"审计ISC","roleHint":"audit"},{"label":"写报告","roleHint":"writer"}]'
`);
      break;
  }
}

module.exports = {
  discoverAgents,
  getRunning,
  globalSnapshot,
  pickBestAgent,
  batchAssign,
  BLOCKED,
  ROLE_PREFIX_MAP,
};
