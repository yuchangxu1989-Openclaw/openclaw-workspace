/**
 * main-tool-whitelist.js — 主Agent工具权限清单
 * 
 * 白名单：主Agent允许使用的工具（调度+感知类）
 * 黑名单：主Agent禁止使用的工具（执行类，防止自己干活）
 * 临时授权：读取 /tmp/main-elevated-until.txt，时间戳未过期则放行所有工具
 */

const fs = require('fs');

const ELEVATION_FILE = '/tmp/main-elevated-until.txt';

// 白名单：主Agent允许使用的工具
const WHITELIST = new Set([
  'sessions_spawn',
  'subagents',
  'memory_search',
  'memory_write_public',
  'memory_timeline',
  'memory_viewer',
  'task_summary',
  'skill_get',
  'skill_search',
  'skill_install',
  'skill_publish',
  'skill_unpublish',
  'message',
  'web_search',
  'web_fetch',
  'sessions_list',
  'sessions_history',
  'sessions_spawn',
  'tts',
  // 飞书只读类
  'feishu_doc',          // read action only ideally
  'feishu_wiki',
  'feishu_chat',
  'feishu_drive',
  'feishu_app_scopes',
  'feishu_bitable_get_meta',
  'feishu_bitable_list_fields',
  'feishu_bitable_list_records',
  'feishu_bitable_get_record',
  // 浏览器（只读快照）
  'browser',
  // 节点
  'nodes',
  // canvas
  'canvas',
]);

// 黑名单：主Agent禁止使用的工具（执行类）
const BLACKLIST = new Set([
  'exec',
  'read',
  'write',
  'edit',
  'apply_patch',
  'process',
  // 飞书写入类
  'feishu_bitable_create_record',
  'feishu_bitable_update_record',
  'feishu_bitable_create_field',
  'feishu_bitable_create_app',
]);

/**
 * 检查临时授权是否生效
 * 读取 /tmp/main-elevated-until.txt，如果时间戳未过期则返回true
 */
function checkElevation() {
  try {
    const content = fs.readFileSync(ELEVATION_FILE, 'utf8').trim();
    const until = parseInt(content, 10);
    if (isNaN(until)) {
      return { elevated: false, reason: '授权文件格式无效' };
    }
    const now = Date.now();
    if (now < until) {
      const remainMs = until - now;
      const remainMin = Math.ceil(remainMs / 60000);
      return {
        elevated: true,
        reason: `临时授权生效中，剩余${remainMin}分钟`,
        expiresAt: new Date(until).toISOString(),
      };
    }
    return { elevated: false, reason: '临时授权已过期' };
  } catch {
    return { elevated: false, reason: '无临时授权' };
  }
}

/**
 * 验证工具调用是否允许
 * @param {string} toolName - 工具名称
 * @returns {{ allowed: boolean, reason: string }}
 */
function validateToolCall(toolName) {
  if (!toolName || typeof toolName !== 'string') {
    return { allowed: false, reason: '工具名称无效' };
  }
  
  const name = toolName.trim().toLowerCase();
  
  // 1. 先检查临时授权
  const elevation = checkElevation();
  if (elevation.elevated) {
    return {
      allowed: true,
      reason: `临时授权放行: ${elevation.reason}`,
    };
  }
  
  // 2. 检查黑名单（优先级高于白名单）
  if (BLACKLIST.has(name)) {
    return {
      allowed: false,
      reason: `工具 "${name}" 在黑名单中 — 主Agent禁止直接执行，请派子Agent`,
    };
  }
  
  // 3. 检查白名单
  if (WHITELIST.has(name)) {
    return {
      allowed: true,
      reason: `工具 "${name}" 在白名单中`,
    };
  }
  
  // 4. 未知工具 — 默认拒绝
  return {
    allowed: false,
    reason: `工具 "${name}" 未在白名单中，默认拒绝`,
  };
}

// ===== CLI =====
if (require.main === module) {
  const toolName = process.argv[2];
  
  if (!toolName || toolName === '--help' || toolName === 'help') {
    console.log(`main-tool-whitelist.js — 主Agent工具权限验证

用法:
  node main-tool-whitelist.js <tool_name>     验证工具是否允许
  node main-tool-whitelist.js --list           列出白名单和黑名单
  node main-tool-whitelist.js --elevation      检查临时授权状态

示例:
  node main-tool-whitelist.js exec             → 拒绝
  node main-tool-whitelist.js sessions_spawn   → 允许
  node main-tool-whitelist.js read             → 拒绝
`);
    process.exit(0);
  }
  
  if (toolName === '--list') {
    console.log('=== 白名单（允许） ===');
    [...WHITELIST].sort().forEach(t => console.log('  ✅', t));
    console.log('\n=== 黑名单（禁止） ===');
    [...BLACKLIST].sort().forEach(t => console.log('  ❌', t));
    console.log('\n=== 临时授权 ===');
    const elev = checkElevation();
    console.log(' ', elev.elevated ? '🔓' : '🔒', elev.reason);
    process.exit(0);
  }
  
  if (toolName === '--elevation') {
    const elev = checkElevation();
    console.log(JSON.stringify(elev, null, 2));
    process.exit(0);
  }
  
  // 验证工具
  const result = validateToolCall(toolName);
  const icon = result.allowed ? '✅' : '❌';
  console.log(`${icon} ${result.reason}`);
  process.exit(result.allowed ? 0 : 1);
}

module.exports = {
  WHITELIST,
  BLACKLIST,
  ELEVATION_FILE,
  checkElevation,
  validateToolCall,
};
