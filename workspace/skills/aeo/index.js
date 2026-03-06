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

  return { skill: skillName, generatedAt: new Date().toISOString(), cases };
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

  return {
    ok: true,
    skill: 'aeo',
    action: 'aeo_evaluation_required',
    targetSkill: skillName,
    skillType,
    tracks,
    standard: readJsonSafe(standardPath, standard),
    testCases: readJsonSafe(testCasesPath, testCases),
    reportPath: path.relative(ROOT, reportPath)
  };
}

module.exports = run;
module.exports.run = run;
