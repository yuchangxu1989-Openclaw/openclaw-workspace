/**
 * generate-real-conv-evalset.cjs — 评测集 Cron 生成器主流程
 * 
 * 每24小时自主抽取真实会话，生成评测集。
 * 
 * 核心能力：
 * 1. 从真实会话中采样高价值片段
 * 2. 与所有已有评测集（cron + ad-hoc）统一去重
 * 3. 严格闭卷安全（ISC-CLOSED-BOOK-001）
 * 4. 版本化生成器和采样策略
 * 5. 正式落盘到 evaluation-sets/ 并注册到 registry.json
 * 
 * 用法：
 *   node generate-real-conv-evalset.cjs --source cron        # cron 模式
 *   node generate-real-conv-evalset.cjs --source adhoc       # 按需模式
 *   node generate-real-conv-evalset.cjs --date 2026-03-07    # 指定日期
 *   node generate-real-conv-evalset.cjs --dry-run            # 干跑（不落盘）
 * 
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { sample } = require('./evalset-cron/session-sampler.cjs');
const { dedup, collectAllExistingCases, getDedupStats } = require('./evalset-cron/dedup-engine.cjs');

// ── 常量 ──────────────────────────────────────────────────────────
const GENERATOR_VERSION = '1.0.0';
const EVAL_SETS_DIR = path.join(__dirname, '../evaluation-sets');
const UNIFIED_DIR = path.join(__dirname, '../unified-evaluation-sets');
const REGISTRY_PATH = path.join(UNIFIED_DIR, 'registry.json');
const OUTPUT_DIR = path.join(__dirname, '../evalset-cron-output');
const RUN_LOG_PATH = path.join(OUTPUT_DIR, 'run-log.jsonl');

// ── CLI 参数解析 ──────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    source: 'cron',
    date: new Date().toISOString().slice(0, 10),
    dryRun: false,
    strategyVersion: 'v1.0',
    memoryDir: path.resolve(__dirname, '../../../memory'),
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source': opts.source = args[++i]; break;
      case '--date': opts.date = args[++i]; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--strategy': opts.strategyVersion = args[++i]; break;
      case '--memory-dir': opts.memoryDir = args[++i]; break;
      case '--verbose': opts.verbose = true; break;
    }
  }
  return opts;
}

// ── 注册到 registry.json ──────────────────────────────────────────
function registerInRegistry(evalSetId, metadata) {
  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch {
    console.warn('[registry] Could not load registry, skipping registration');
    return false;
  }

  const skillName = `real-conv-${metadata.date}`;

  // Check if already registered
  if (registry.sets && registry.sets[evalSetId]) {
    console.log(`[registry] ${evalSetId} already registered, updating...`);
  }

  // Build evaluation set entry
  const evalSetEntry = {
    id: evalSetId,
    name: `真实对话评测集 ${metadata.date}`,
    targetSkill: skillName,
    track: 'ai-effect',
    standard: 'standard',
    location: {
      type: 'file',
      path: `../evaluation-sets/${skillName}/test-cases.json`
    },
    metadata: {
      description: `从 ${metadata.date} 真实对话自动采样生成`,
      author: `evalset-cron-${GENERATOR_VERSION}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: GENERATOR_VERSION,
      testCaseCount: metadata.outputCases,
      generatorVersion: GENERATOR_VERSION,
      samplingStrategy: metadata.strategyVersion,
      source: metadata.source,
      dedupStats: metadata.dedupStats
    },
    dimensions: [
      { name: 'intent_accuracy', weight: 0.3, threshold: 0.8 },
      { name: 'context_awareness', weight: 0.25, threshold: 0.75 },
      { name: 'action_quality', weight: 0.25, threshold: 0.8 },
      { name: 'self_correction', weight: 0.2, threshold: 0.7 }
    ]
  };

  // Add to registry
  if (!registry.sets) registry.sets = {};
  registry.sets[evalSetId] = evalSetEntry;

  // Update indexing
  if (!registry.indexing) registry.indexing = { bySkill: {}, byTrack: {}, byStandard: {} };
  if (!registry.indexing.bySkill[skillName]) registry.indexing.bySkill[skillName] = [];
  if (!registry.indexing.bySkill[skillName].includes(evalSetId)) {
    registry.indexing.bySkill[skillName].push(evalSetId);
  }

  // Update metadata
  if (registry.registryMetadata) {
    registry.registryMetadata.totalSets = Object.keys(registry.sets).length;
    registry.registryMetadata.lastUpdated = new Date().toISOString();
  }

  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  console.log(`[registry] Registered ${evalSetId} ✓`);
  return true;
}

// ── 落盘评测集 ─────────────────────────────────────────────────────
function persistEvalSet(date, cases, metadata) {
  const skillName = `real-conv-${date}`;
  const targetDir = path.join(EVAL_SETS_DIR, skillName);
  fs.mkdirSync(targetDir, { recursive: true });

  // Write test-cases.json
  const testCasesData = {
    skill: `real-conversation-scenarios-${date}`,
    generatedAt: new Date().toISOString(),
    generatorVersion: GENERATOR_VERSION,
    samplingStrategy: metadata.strategyVersion,
    data_source: 'real_conversation',
    source_description: `从${date}真实对话自动采样，经统一去重后生成`,
    extraction_date: date,
    total_cases: cases.length,
    categories: [...new Set(cases.map(c => c.category))],
    dedup_stats: metadata.dedupStats,
    closed_book_evidence: metadata.closedBookEvidence,
    cases
  };

  const tcPath = path.join(targetDir, 'test-cases.json');
  fs.writeFileSync(tcPath, JSON.stringify(testCasesData, null, 2));

  // Write standard.json
  const standardData = {
    skill: skillName,
    type: 'ai-effect',
    generatedAt: new Date().toISOString(),
    generatorVersion: GENERATOR_VERSION,
    data_source: 'real_conversation',
    tracks: ['ai_effect_track'],
    dimensions: ['intent_accuracy', 'context_awareness', 'action_quality', 'self_correction'],
    thresholds: { pass: 0.75, excellent: 0.9 }
  };

  const stdPath = path.join(targetDir, 'standard.json');
  fs.writeFileSync(stdPath, JSON.stringify(standardData, null, 2));

  console.log(`[persist] Wrote ${cases.length} cases to ${tcPath}`);
  return { testCasesPath: tcPath, standardPath: stdPath };
}

// ── 记录运行日志 ──────────────────────────────────────────────────
function logRun(runData) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const line = JSON.stringify({ ...runData, ts: new Date().toISOString() }) + '\n';
  fs.appendFileSync(RUN_LOG_PATH, line);
}

// ── 主流程 ─────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();
  const startTime = Date.now();

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  评测集 Cron 生成器 v' + GENERATOR_VERSION + '                   ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Source:   ${opts.source.padEnd(33)}║`);
  console.log(`║  Date:     ${opts.date.padEnd(33)}║`);
  console.log(`║  Strategy: ${opts.strategyVersion.padEnd(33)}║`);
  console.log(`║  Dry-run:  ${String(opts.dryRun).padEnd(33)}║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log();

  // Step 1: 采样
  console.log('[1/5] 从真实会话中采样...');
  const { cases: rawCases, metadata: sampleMeta } = sample({
    date: opts.date,
    strategyVersion: opts.strategyVersion,
    memoryDir: opts.memoryDir
  });
  console.log(`  → 采集到 ${rawCases.length} 个候选用例 (从 ${sampleMeta.totalFragments} 个片段中)`);

  if (rawCases.length === 0) {
    console.log('[!] 无候选用例，跳过后续步骤');
    logRun({
      source: opts.source,
      date: opts.date,
      status: 'empty',
      rawCases: 0,
      uniqueCases: 0,
      duration: Date.now() - startTime
    });
    return { ok: true, status: 'empty', cases: 0 };
  }

  // Step 2: 收集已有评测集用例（用于交叉去重）
  console.log('[2/5] 收集已有评测集用于交叉去重...');
  const existingCases = collectAllExistingCases(EVAL_SETS_DIR);
  console.log(`  → 已有评测集中共 ${existingCases.length} 个用例`);

  // Step 3: 统一去重
  console.log('[3/5] 执行统一去重...');
  const { unique, duplicates, stats: dedupStats } = dedup(rawCases, {
    source: `${opts.source}-${opts.date}`,
    fuzzyThreshold: 0.85,
    persistFingerprints: !opts.dryRun,
    existingCases
  });
  console.log(`  → 去重结果: ${dedupStats.unique} 唯一 / ${dedupStats.exactDups} 精确重复 / ${dedupStats.fuzzyDups} 模糊重复`);

  if (unique.length === 0) {
    console.log('[!] 去重后无新用例');
    logRun({
      source: opts.source,
      date: opts.date,
      status: 'all_deduped',
      rawCases: rawCases.length,
      uniqueCases: 0,
      dedupStats,
      duration: Date.now() - startTime
    });
    return { ok: true, status: 'all_deduped', cases: 0, dedupStats };
  }

  // Step 4: 闭卷安全验证
  console.log('[4/5] 闭卷安全验证...');
  const closedBookEvidence = sampleMeta.closedBookEvidence;
  console.log(`  → enabled: ${closedBookEvidence.enabled}`);
  console.log(`  → no_hardcoded_evalset: ${closedBookEvidence.no_hardcoded_evalset}`);
  console.log(`  → no_reference_reads: ${closedBookEvidence.no_reference_reads}`);
  console.log(`  → forbidden_paths_checked: ${closedBookEvidence.forbidden_paths_checked.length} paths`);

  // Step 5: 落盘 & 注册
  if (opts.dryRun) {
    console.log('[5/5] DRY-RUN: 跳过落盘和注册');
  } else {
    console.log('[5/5] 落盘并注册到 registry...');
    
    const evalSetId = `eval.real-conv-${opts.date}.001`;
    
    // Persist
    persistEvalSet(opts.date, unique, {
      ...sampleMeta,
      dedupStats,
      closedBookEvidence,
      source: opts.source
    });

    // Register
    registerInRegistry(evalSetId, {
      date: opts.date,
      outputCases: unique.length,
      strategyVersion: opts.strategyVersion,
      source: opts.source,
      dedupStats
    });
  }

  const duration = Date.now() - startTime;
  const result = {
    ok: true,
    status: 'generated',
    source: opts.source,
    date: opts.date,
    generatorVersion: GENERATOR_VERSION,
    strategyVersion: opts.strategyVersion,
    rawCases: rawCases.length,
    uniqueCases: unique.length,
    dedupStats,
    closedBookEvidence,
    dryRun: opts.dryRun,
    duration
  };

  console.log();
  console.log('═══════════════ 生成完成 ═══════════════');
  console.log(`  新增用例: ${unique.length}`);
  console.log(`  去重率:   ${rawCases.length > 0 ? ((1 - unique.length / rawCases.length) * 100).toFixed(1) : 0}%`);
  console.log(`  耗时:     ${duration}ms`);
  console.log('════════════════════════════════════════');

  // Log run
  if (!opts.dryRun) {
    logRun(result);
  }

  return result;
}

// ── 模块导出 ──────────────────────────────────────────────────────
module.exports = { main, registerInRegistry, persistEvalSet, logRun, GENERATOR_VERSION };

// ── CLI 入口 ──────────────────────────────────────────────────────
if (require.main === module) {
  main().then(result => {
    if (!result.ok) {
      process.exit(1);
    }
  }).catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
  });
}
