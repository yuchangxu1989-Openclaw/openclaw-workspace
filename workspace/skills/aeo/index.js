const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SKILLS_DIR = path.join(ROOT, 'skills');
const AEO_DIR = path.join(SKILLS_DIR, 'aeo');
const EVAL_SETS_DIR = path.join(AEO_DIR, 'evaluation-sets');
const REPORTS_DIR = path.join(AEO_DIR, 'reports');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function slugify(value) {
  return String(value || 'unknown-skill')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown-skill';
}

function readJsonSafe(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

// ── AEO配置 ──
const aeoConfig = readJsonSafe(path.join(AEO_DIR, 'config', 'aeo-config.json'), {});

// ── 内部模块引入（从外部技能搬入AEO的模块） ──
const iscDocQuality = require('./modules/isc-doc-quality');
const layeredArchCheck = path.join(__dirname, 'modules', 'layered-arch-check.js');

function detectSkillType(skillName, skillDoc = '') {
  const lower = `${skillName}\n${skillDoc}`.toLowerCase();
  const aiHints = ['llm', 'ai', 'agent', 'chat', 'prompt', 'semantic', 'reasoning', 'vision', 'glm', 'claude'];
  const funcHints = ['api', 'tool', 'workflow', 'sync', 'etl', 'executor', 'router', 'uploader', 'downloader'];

  const aiScore = aiHints.filter(h => lower.includes(h)).length;
  const funcScore = funcHints.filter(h => lower.includes(h)).length;

  if (aiScore > 0 && funcScore > 0) return 'mixed';
  if (aiScore > 0) return 'ai-effect';
  if (funcScore > 0) return 'function-quality';
  return 'mixed';
}

function getTrackSelection(skillType) {
  if (skillType === 'ai-effect') return ['ai_effect_track', 'function_quality_track'];
  if (skillType === 'function-quality') return ['function_quality_track'];
  return ['ai_effect_track', 'function_quality_track'];
}

function buildStandard(skillName, skillType, tracks) {
  const dimensions = [];
  if (tracks.includes('ai_effect_track')) {
    dimensions.push('accuracy', 'creativity', 'relevance', 'reasoning');
  }
  if (tracks.includes('function_quality_track')) {
    dimensions.push('availability', 'reliability', 'performance', 'correctness');
  }

  return {
    skill: skillName,
    type: skillType,
    generatedAt: new Date().toISOString(),
    data_source: 'system_generated_from_skill_metadata',
    data_source_details: {
      basis: ['skill_name', 'SKILL.md_if_present'],
      trigger: 'aeo_evaluation_required'
    },
    tracks,
    dimensions: [...new Set(dimensions)],
    thresholds: {
      pass: 0.75,
      excellent: 0.9
    }
  };
}

function buildTestCases(skillName, tracks) {
  const cases = [];
  let i = 1;

  if (tracks.includes('ai_effect_track')) {
    for (const dimension of ['accuracy', 'relevance', 'reasoning']) {
      cases.push({
        id: `tc_${String(i++).padStart(3, '0')}`,
        track: 'ai_effect_track',
        dimension,
        input: { prompt: `验证 ${skillName} 在 ${dimension} 维度的输出质量` },
        expected: { quality: 'pass' }
      });
    }
  }

  if (tracks.includes('function_quality_track')) {
    for (const dimension of ['availability', 'performance', 'correctness']) {
      cases.push({
        id: `tc_${String(i++).padStart(3, '0')}`,
        track: 'function_quality_track',
        dimension,
        input: { action: `验证 ${skillName} 在 ${dimension} 维度的功能表现` },
        expected: { quality: 'pass' }
      });
    }
  }

  return {
    skill: skillName,
    generatedAt: new Date().toISOString(),
    data_source: 'system_generated_from_skill_metadata',
    data_source_details: {
      basis: ['skill_name', 'SKILL.md_if_present'],
      trigger: 'aeo_evaluation_required'
    },
    cases
  };
}

function evaluateTrackReadiness(skillName, tracks) {
  return tracks.map(track => ({
    track,
    skill: skillName,
    status: 'prepared',
    score: 1,
    summary: track === 'ai_effect_track'
      ? '已生成语义评测所需维度与基础用例'
      : '已生成功能质量评测所需维度与基础用例'
  }));
}

async function run(input = {}, context = {}) {
  const logger = context?.logger || console;
  const payload = input?.payload || input || {};
  const requestedSkill = payload.skillName || payload.skill || payload.targetSkill || payload.name;

  let skillName = requestedSkill;
  let skillDoc = '';

  if (skillName) {
    const skillMd = path.join(SKILLS_DIR, skillName, 'SKILL.md');
    if (fs.existsSync(skillMd)) skillDoc = fs.readFileSync(skillMd, 'utf8');
  }

  if (!skillName && payload.sourceEvent) {
    skillName = payload.sourceEvent.skillName || payload.sourceEvent.skill || null;
  }

  if (!skillName) {
    const fallback = fs.readdirSync(SKILLS_DIR)
      .filter(name => fs.existsSync(path.join(SKILLS_DIR, name, 'SKILL.md')))
      .sort()[0];
    skillName = fallback || 'aeo';
    const skillMd = path.join(SKILLS_DIR, skillName, 'SKILL.md');
    if (fs.existsSync(skillMd)) skillDoc = fs.readFileSync(skillMd, 'utf8');
  }

  const skillType = detectSkillType(skillName, skillDoc);
  const tracks = getTrackSelection(skillType);
  const skillSlug = slugify(skillName);
  const targetDir = path.join(EVAL_SETS_DIR, skillSlug);

  ensureDir(targetDir);
  ensureDir(REPORTS_DIR);

  const standardPath = path.join(targetDir, 'standard.json');
  const testCasesPath = path.join(targetDir, 'test-cases.json');

  const standard = buildStandard(skillName, skillType, tracks);
  const testCases = buildTestCases(skillName, tracks);

  fs.writeFileSync(standardPath, JSON.stringify(standard, null, 2));
  fs.writeFileSync(testCasesPath, JSON.stringify(testCases, null, 2));

  const report = {
    handler: 'aeo-evaluation-required',
    timestamp: new Date().toISOString(),
    skill: skillName,
    type: skillType,
    data_source: 'system_generated_from_skill_metadata',
    data_source_details: {
      basis: ['skill_name', 'SKILL.md_if_present'],
      trigger: 'aeo_evaluation_required'
    },
    tracks,
    generated: {
      standardPath: path.relative(ROOT, standardPath),
      testCasesPath: path.relative(ROOT, testCasesPath)
    },
    readiness: evaluateTrackReadiness(skillName, tracks)
  };

  const reportPath = path.join(REPORTS_DIR, `${skillSlug}-evaluation-required.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  logger.info?.(`[aeo] evaluation_required handled for ${skillName}`);

  // ── ISC-INTENT-EVAL-001 + ISC-CLOSED-BOOK-001 enforcement ──
  // AEO evaluations that produce pass/fail verdicts MUST carry ISC gate evidence.
  // Default: fail-closed. Gate evidence must be supplied by the caller payload.
  let iscGateResult = null;
  try {
    const { evaluateAll } = require(path.join(ROOT, 'infrastructure', 'enforcement', 'isc-eval-gates'));
    iscGateResult = evaluateAll(payload);
  } catch (_) {
    iscGateResult = { ok: false, gateStatus: 'FAIL-CLOSED', summary: 'isc-eval-gates module not loadable — fail-closed' };
  }

  return {
    ok: true,
    skill: 'aeo',
    action: 'aeo_evaluation_required',
    targetSkill: skillName,
    skillType,
    tracks,
    standard: readJsonSafe(standardPath, standard),
    testCases: readJsonSafe(testCasesPath, testCases),
    reportPath: path.relative(ROOT, reportPath),
    isc_gates: iscGateResult
  };
}

// ── PDCA子模块（从skills/pdca-engine整合而来） ──
const pdcaEngine = require('./pdca/index');
const pdcaCheckLoop = './pdca/check-loop.js'; // CLI入口，由cron直接调用

// ═══════════════════════════════════════════════════════════════════════
// 子技能调度器 — 统一调度AEO管辖的外部质量子技能
// ═══════════════════════════════════════════════════════════════════════

/**
 * 调度AEO子技能
 * @param {string} name - 子技能名（qualityAudit | architectureReview | selfCheckScanners）
 * @param {Object} args - 传递给子技能的参数
 * @param {Object} context - 运行上下文
 * @returns {Object} 子技能执行结果
 */
async function invokeSubSkill(name, args = {}, context = {}) {
  const logger = context?.logger || console;
  const subSkillConfig = (aeoConfig.subSkills || {})[name];

  if (!subSkillConfig) {
    const available = Object.keys(aeoConfig.subSkills || {}).join(', ');
    throw new Error(`[aeo] 未知子技能: ${name}，可用: ${available}`);
  }

  if (subSkillConfig.enabled === false) {
    return { ok: false, skill: name, reason: '子技能已禁用' };
  }

  const skillPath = path.join(SKILLS_DIR, subSkillConfig.path, 'index.js');
  if (!fs.existsSync(skillPath)) {
    throw new Error(`[aeo] 子技能入口不存在: ${skillPath}`);
  }

  logger.info?.(`[aeo] 调度子技能 ${name} (${subSkillConfig.path})`);

  try {
    const subSkill = require(skillPath);
    // 兼容 module.exports = run 和 module.exports = { run }
    const runFn = typeof subSkill === 'function' ? subSkill : subSkill.run;

    if (typeof runFn !== 'function') {
      throw new Error(`子技能 ${name} 没有导出可执行的 run 函数`);
    }

    const result = await runFn(args, context);
    logger.info?.(`[aeo] 子技能 ${name} 完成`);
    return { ok: true, skill: name, result };
  } catch (err) {
    logger.error?.(`[aeo] 子技能 ${name} 执行失败: ${err.message}`);
    return { ok: false, skill: name, error: err.message };
  }
}

/**
 * 列出所有已注册的子技能和内部模块
 */
function listQualityCapabilities() {
  return {
    subSkills: aeoConfig.subSkills || {},
    internalModules: aeoConfig.internalModules || {},
    pdca: { path: 'aeo/pdca', description: 'PDCA持续改进引擎' }
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 内部模块API — ISC文档质量评估 & 分层架构检查
// ═══════════════════════════════════════════════════════════════════════

/**
 * 调用ISC文档质量评估（内部模块）
 * @param {string} skillPath - 待评估的技能路径
 * @returns {Object} 评估报告
 */
function assessDocQuality(skillPath) {
  return iscDocQuality.generateAssessmentReport(skillPath);
}

/**
 * 调用分层架构合规检查（内部模块，CLI方式）
 * @param {string} targetPath - 检查目标路径
 * @param {Object} opts - 选项 { strict, json }
 * @returns {string} 执行命令路径
 */
function getLayeredArchCheckCmd(targetPath, opts = {}) {
  const flags = [];
  if (opts.strict) flags.push('--strict');
  if (opts.json) flags.push('--json');
  return `node "${layeredArchCheck}" "${targetPath}" ${flags.join(' ')}`.trim();
}

module.exports = run;
module.exports.run = run;
module.exports.pdca = pdcaEngine;
module.exports.pdcaCheckLoopPath = path.join(__dirname, 'pdca', 'check-loop.js');
// 子技能调度
module.exports.invokeSubSkill = invokeSubSkill;
module.exports.listQualityCapabilities = listQualityCapabilities;
// 内部模块直接API
module.exports.assessDocQuality = assessDocQuality;
module.exports.getLayeredArchCheckCmd = getLayeredArchCheckCmd;
module.exports.iscDocQuality = iscDocQuality;
