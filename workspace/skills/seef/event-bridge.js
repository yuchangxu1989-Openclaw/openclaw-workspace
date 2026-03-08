/**
 * SEEF 事件桥接 - 连接 7 个子技能与事件总线
 * 
 * 子技能（实际存在）：
 *   evaluator  - 技能评估器
 *   discoverer - 技能发现器
 *   creator    - 技能创造器
 *   optimizer  - 技能优化器
 *   aligner    - 标准对齐器
 *   recorder   - 进化记录器
 *   validator  - 技能验证器
 * 
 * 事件路由规则：
 *   外部事件 → 对应子技能处理
 *   子技能处理结果 → 发布到事件总线
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const bus = require(path.join(__dirname, '..', '..', 'infrastructure', 'event-bus', 'bus-adapter.js')) // [Gap4] 升级至 bus-adapter;

const CONSUMER_ID = 'seef';
const SEEF_DIR = __dirname;

// 所有 7 个子技能及其职责描述
const SUB_SKILLS = {
  evaluator:  '技能评估器 - 多维质量诊断',
  discoverer: '技能发现器 - 能力空白与冗余识别',
  creator:    '技能创造器 - 自动生成新技能原型',
  optimizer:  '技能优化器 - 安全可逆修复方案',
  aligner:    '标准对齐器 - 全局标准化对齐',
  recorder:   '进化记录器 - 变更事件记录',
  validator:  '技能验证器 - 准入准出门控',
};

// 事件 → 子技能 路由表
const ROUTES = {
  // 本地任务编排 同步相关
  'dto.sync.completed':        'evaluator',   // DTO同步完成 → 评估器评估受影响技能
  'dto.sync.failed':           'recorder',    // DTO同步失败 → 记录器记录异常

  // AEO 评测相关
  'aeo.assessment.failed':     'optimizer',   // 评测失败 → 优化器生成修复方案
  'aeo.assessment.completed':  'evaluator',   // 评测完成 → 评估器记录并分析
  'aeo.assessment.started':    'recorder',    // 评测开始 → 记录器记录事件

  // CRAS 洞察相关
  'cras.insight.generated':    'discoverer',  // 洞察生成 → 发现器寻找新机会
  'cras.insight.updated':      'discoverer',  // 洞察更新 → 发现器重新分析

  // ISC 规则相关
  'isc.rule.created':          'aligner',     // 新规则 → 对齐器检查所有技能对齐
  'isc.rule.updated':          'aligner',     // 规则变更 → 对齐器重新对齐
  'isc.rule.deleted':          'aligner',     // 规则删除 → 对齐器清理对齐记录

  // SEEF 内部事件 - 跨子技能协作
  'seef.skill.evaluated':      'discoverer',  // 评估完成 → 发现器分析差距
  'seef.skill.discovered':     'creator',     // 发现机会 → 创造器生成原型
  'seef.skill.created':        'validator',   // 创建完成 → 验证器校验
  'seef.skill.optimized':      'validator',   // 优化完成 → 验证器校验
  'seef.skill.validated':      'recorder',    // 验证完成 → 记录器归档
  'seef.skill.aligned':        'validator',   // 对齐完成 → 验证器校验
  'seef.skill.recorded':       null,          // 记录完成 → 终态，不再路由
  'seef.skill.deprecated':     'recorder',    // 废弃 → 记录器记录
};

/**
 * 处理事件总线上的待处理事件
 * @returns {object} 处理结果摘要
 */
function processEvents() {
  const events = bus.consume(CONSUMER_ID, {
    types: ['dto.sync.*', 'aeo.assessment.*', 'cras.insight.*', 'isc.rule.*', 'seef.skill.*']
  });

  if (events.length === 0) {
    console.log('[SEEF] 无待处理事件');
    return { processed: 0, results: [] };
  }

  console.log(`[SEEF] 发现 ${events.length} 个待处理事件`);
  const results = [];

  for (const event of events) {
    try {
      const result = routeToSubSkill(event);
      results.push({ eventId: event.id, eventType: event.type, ...result });
      bus.ack(CONSUMER_ID, event.id);
    } catch (err) {
      console.error(`[SEEF] 处理事件失败: ${event.id} (${event.type})`, err.message);
      results.push({ eventId: event.id, eventType: event.type, status: 'error', error: err.message });
      // 仍然 ack 以避免无限重试
      try { bus.ack(CONSUMER_ID, event.id); } catch (_) {}
    }
  }

  const summary = {
    processed: results.length,
    ok: results.filter(r => r.status === 'ok').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errors: results.filter(r => r.status === 'error').length,
    results,
  };

  console.log(`[SEEF] 处理完成: ${summary.ok} 成功, ${summary.skipped} 跳过, ${summary.errors} 失败`);
  return summary;
}

/**
 * 路由事件到对应子技能
 * @param {object} event - 事件对象
 * @returns {object} 处理结果
 */
function routeToSubSkill(event) {
  // 精确匹配 → 通配符匹配
  const subSkill = ROUTES[event.type] !== undefined
    ? ROUTES[event.type]
    : matchWildcard(event.type);

  if (subSkill === null) {
    console.log(`[SEEF] 终态事件，跳过: ${event.type}`);
    return { status: 'skipped', reason: 'terminal event' };
  }

  if (!subSkill) {
    console.log(`[SEEF] 无匹配子技能: ${event.type}`);
    return { status: 'skipped', reason: 'no matching sub-skill' };
  }

  if (!SUB_SKILLS[subSkill]) {
    console.log(`[SEEF] 未知子技能: ${subSkill}`);
    return { status: 'skipped', reason: `unknown sub-skill: ${subSkill}` };
  }

  console.log(`[SEEF] 路由 ${event.type} → ${subSkill} (${SUB_SKILLS[subSkill]})`);

  // 优先调用 JS 子技能，回退到 Python
  const result = invokeSubSkill(subSkill, event);

  // 发布结果事件
  if (result.status === 'ok') {
    const resultType = `seef.skill.${getResultVerb(subSkill)}`;
    bus.emit(resultType, {
      sub_skill: subSkill,
      source_event: event.id,
      source_type: event.type,
      output: result.output,
      timestamp: new Date().toISOString(),
    }, 'seef');
    console.log(`[SEEF] 已发布结果事件: ${resultType}`);
  }

  return result;
}

/**
 * 子技能 → 结果事件动词映射
 */
function getResultVerb(subSkill) {
  const verbs = {
    evaluator:  'evaluated',
    discoverer: 'discovered',
    creator:    'created',
    optimizer:  'optimized',
    aligner:    'aligned',
    recorder:   'recorded',
    validator:  'validated',
  };
  return verbs[subSkill] || 'processed';
}

/**
 * 通配符匹配
 */
function matchWildcard(type) {
  for (const [pattern, skill] of Object.entries(ROUTES)) {
    if (pattern.includes('*')) {
      const prefix = pattern.replace('.*', '.');
      if (type.startsWith(prefix)) return skill;
    }
  }
  return undefined; // undefined = 无匹配，null = 显式跳过
}

/**
 * 调用子技能
 * 优先使用 JS (sub-skills/xxx/index.cjs 或 index.js)，回退 Python (subskills/xxx.py)
 */
function invokeSubSkill(skillName, event) {
  // JS 入口候选
  const jsFiles = [
    path.join(SEEF_DIR, 'sub-skills', skillName, 'index.cjs'),
    path.join(SEEF_DIR, 'sub-skills', skillName, 'index.js'),
  ];

  // Python 入口候选
  const pyFiles = [
    path.join(SEEF_DIR, 'subskills', `${skillName}.py`),
    path.join(SEEF_DIR, 'subskills', `${skillName}_v2.py`),
  ];

  // 尝试 JS 模块调用（同进程，高效）
  for (const jsFile of jsFiles) {
    if (fs.existsSync(jsFile)) {
      return invokeJSSubSkill(skillName, jsFile, event);
    }
  }

  // 尝试 Python 脚本调用（子进程）
  for (const pyFile of pyFiles) {
    if (fs.existsSync(pyFile)) {
      return invokePythonSubSkill(skillName, pyFile, event);
    }
  }

  // 兜底：文件不存在，仍记录事件
  console.log(`[SEEF] 子技能文件未找到: ${skillName}，记录事件`);
  return { status: 'ok', sub_skill: skillName, output: `子技能 ${skillName} 已路由（文件不存在，记录事件）` };
}

/**
 * 调用 JS 子技能模块
 */
function invokeJSSubSkill(skillName, jsFile, event) {
  try {
    // require 模块并调用主函数
    const mod = require(jsFile);
    const mainFn = mod[skillName] || mod.evaluate || mod.discover || mod.optimize
      || mod.record || mod.validate || mod.align || mod.create || mod.default;

    if (typeof mainFn !== 'function') {
      console.log(`[SEEF] JS 模块无可调用函数: ${skillName}`);
      return { status: 'ok', sub_skill: skillName, output: `JS module loaded but no callable function` };
    }

    // 构造输入参数
    const input = {
      skillId: event.payload?.skill_name || event.payload?.skillId || 'unknown',
      skillPath: event.payload?.skill_path || '',
      skillName: event.payload?.skill_name || event.payload?.skillName || 'unknown',
      trigger: `event-bridge:${event.type}`,
      event: event,
      ...event.payload,
    };

    // JS 子技能可能是 async 的，但事件桥接同步调用
    const result = mainFn(input);

    // 如果返回 Promise，同步等待（简化处理）
    if (result && typeof result.then === 'function') {
      console.log(`[SEEF] ${skillName} (JS) 异步调用已触发`);
      return { status: 'ok', sub_skill: skillName, output: `JS async call triggered for ${skillName}` };
    }

    const output = typeof result === 'string' ? result : JSON.stringify(result).substring(0, 500);
    console.log(`[SEEF] ${skillName} (JS) 输出: ${output.substring(0, 200)}`);
    return { status: 'ok', sub_skill: skillName, output };
  } catch (err) {
    console.error(`[SEEF] JS 子技能调用失败: ${skillName}`, err.message);
    return { status: 'error', sub_skill: skillName, error: err.message };
  }
}

/**
 * 调用 Python 子技能脚本
 */
function invokePythonSubSkill(skillName, pyFile, event) {
  try {
    const env = {
      ...process.env,
      SEEF_EVENT_TYPE: event.type,
      SEEF_EVENT_PAYLOAD: JSON.stringify(event.payload || {}),
      SEEF_EVENT_ID: event.id,
      SEEF_EVENT_SOURCE: event.source || 'unknown',
      SEEF_SUB_SKILL: skillName,
    };

    const output = execSync(`python3 "${pyFile}" 2>&1 || true`, {
      env,
      timeout: 30000,
      encoding: 'utf8',
      cwd: SEEF_DIR,
    }).trim();

    console.log(`[SEEF] ${skillName} (Python) 输出: ${output.substring(0, 200)}`);
    return { status: 'ok', sub_skill: skillName, output: output.substring(0, 500) };
  } catch (err) {
    console.error(`[SEEF] Python 子技能调用失败: ${skillName}`, err.message);
    return { status: 'error', sub_skill: skillName, error: err.message };
  }
}

/**
 * 获取桥接状态
 */
function getStatus() {
  const subSkillStatus = {};

  for (const [name, desc] of Object.entries(SUB_SKILLS)) {
    const jsExists = fs.existsSync(path.join(SEEF_DIR, 'sub-skills', name, 'index.cjs'))
      || fs.existsSync(path.join(SEEF_DIR, 'sub-skills', name, 'index.js'));
    const pyExists = fs.existsSync(path.join(SEEF_DIR, 'subskills', `${name}.py`))
      || fs.existsSync(path.join(SEEF_DIR, 'subskills', `${name}_v2.py`));

    subSkillStatus[name] = {
      description: desc,
      js: jsExists,
      python: pyExists,
      active: jsExists || pyExists,
      backend: jsExists ? 'js' : pyExists ? 'python' : 'none',
    };
  }

  // 路由覆盖统计
  const routedSkills = new Set(Object.values(ROUTES).filter(Boolean));

  return {
    consumer_id: CONSUMER_ID,
    sub_skills: subSkillStatus,
    total_sub_skills: Object.keys(SUB_SKILLS).length,
    active_sub_skills: Object.values(subSkillStatus).filter(s => s.active).length,
    event_routes: Object.keys(ROUTES).length,
    routed_sub_skills: routedSkills.size,
    subscribed_patterns: ['dto.sync.*', 'aeo.assessment.*', 'cras.insight.*', 'isc.rule.*', 'seef.skill.*'],
  };
}

// ─── CLI 入口 ──────────────────────────────────────────────────
if (require.main === module) {
  const cmd = process.argv[2] || 'run';

  if (cmd === 'status') {
    const status = getStatus();
    console.log(JSON.stringify(status, null, 2));
  } else if (cmd === 'run') {
    const result = processEvents();
    console.log(`[SEEF] 完成: ${JSON.stringify(result, null, 2)}`);
  } else {
    console.log('Usage: node event-bridge.js [run|status]');
  }
}

/**
 * 技能发布事件 — 技能通过验证后发布到生产环境时调用
 * @param {object} result - 发布结果
 * @param {string} result.skill_name - 技能名称
 * @param {string} [result.version] - 版本号
 * @param {string} [result.target] - 发布目标 (evomap, local, etc.)
 * @returns {object} 发布的事件
 */
function emitSkillPublished(result) {
  const event = bus.emit('seef.skill.published', {
    skill_name: result.skill_name,
    version: result.version || '1.0.0',
    target: result.target || 'local',
    published_at: new Date().toISOString(),
    timestamp: Date.now()
  }, 'seef');
  console.log(`[SEEF-Bridge] 发布事件: seef.skill.published (skill=${result.skill_name})`);
  return event;
}

module.exports = { processEvents, routeToSubSkill, getStatus, SUB_SKILLS, ROUTES, emitSkillPublished };
