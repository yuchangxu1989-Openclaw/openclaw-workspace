#!/usr/bin/env node
'use strict';

/**
 * Unified Test Runner v1.0
 * 
 * Usage:
 *   node tests/runner.js                          — run all executable tests
 *   node tests/runner.js --category unit           — only unit tests
 *   node tests/runner.js --category benchmark/intent — only intent benchmarks
 *   node tests/runner.js --module dispatcher       — only dispatcher-related
 *   node tests/runner.js --tag IC1                 — only tests tagged IC1
 *   node tests/runner.js --dry-run                 — list what would run, don't execute
 *   node tests/runner.js --coverage                — show coverage analysis after run
 *
 * Output: results written to tests/results/latest.json
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// ─── Paths ───
const TESTS_DIR = path.resolve(__dirname);
const REGISTRY_PATH = path.join(TESTS_DIR, 'registry.json');
const RESULTS_DIR = path.join(TESTS_DIR, 'results');
const LATEST_RESULT = path.join(RESULTS_DIR, 'latest.json');
const WORKSPACE = path.resolve(TESTS_DIR, '..');
const INFRA_DIR = path.join(WORKSPACE, 'infrastructure');

// ─── CLI Args ───
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}
const hasFlag = (name) => args.includes(`--${name}`);

const filterCategory = getArg('category');
const filterModule = getArg('module');
const filterTag = getArg('tag');
const dryRun = hasFlag('dry-run');
const showCoverage = hasFlag('coverage') || !filterCategory; // always show coverage on full run
const verbose = hasFlag('verbose');

// ─── Load Registry ───
if (!fs.existsSync(REGISTRY_PATH)) {
  console.error('❌ Registry not found:', REGISTRY_PATH);
  process.exit(1);
}
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
const entries = registry.entries || [];

// ─── Filter entries ───
function matchesFilter(entry) {
  if (filterCategory && !entry.category.startsWith(filterCategory)) return false;
  if (filterModule && entry.module !== filterModule) return false;
  if (filterTag && !(entry.tags || []).includes(filterTag)) return false;
  return true;
}

const runnableRunners = ['node', 'node-esm'];
const filtered = entries.filter(matchesFilter);
const executable = filtered.filter(e => runnableRunners.includes(e.runner));
const dataOnly = filtered.filter(e => e.runner === 'data-only');
const scenarioRunner = filtered.filter(e => e.runner === 'scenario-runner');
const library = filtered.filter(e => e.runner === 'library');

console.log('═══════════════════════════════════════════════════════');
console.log('  📋 Unified Test Runner v1.0');
console.log('═══════════════════════════════════════════════════════');
console.log(`  Registry: ${entries.length} total entries`);
console.log(`  Filter:   category=${filterCategory || '*'} module=${filterModule || '*'} tag=${filterTag || '*'}`);
console.log(`  Matched:  ${filtered.length} entries (${executable.length} executable, ${dataOnly.length} data, ${scenarioRunner.length} scenarios, ${library.length} library)`);
console.log('═══════════════════════════════════════════════════════\n');

if (dryRun) {
  console.log('🔍 DRY RUN — would execute:\n');
  for (const e of executable) {
    console.log(`  [${e.category}] ${e.id} → ${e.file}`);
  }
  if (scenarioRunner.length > 0) {
    console.log(`\n  + ${scenarioRunner.length} scenario definitions (via scenario runner)`);
  }
  process.exit(0);
}

// ─── Ensure results dir ───
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

// ─── Run a single test file ───
function runTest(entry) {
  const filePath = path.join(TESTS_DIR, entry.file);
  if (!fs.existsSync(filePath)) {
    return { id: entry.id, status: 'error', error: `File not found: ${entry.file}`, duration: 0 };
  }

  const start = Date.now();
  try {
    // Run in original location for correct require() paths
    const actualPath = entry.original 
      ? path.join(WORKSPACE, entry.original)
      : filePath;
    
    if (!fs.existsSync(actualPath)) {
      // Fallback to copied file
      const result = execSync(`node "${filePath}"`, {
        cwd: path.dirname(filePath),
        timeout: 30000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_PATH: INFRA_DIR }
      });
      const duration = Date.now() - start;
      return parseTestOutput(entry.id, result, '', duration);
    }

    const result = execSync(`node "${actualPath}"`, {
      cwd: path.dirname(actualPath),
      timeout: 30000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const duration = Date.now() - start;
    return parseTestOutput(entry.id, result, '', duration);
  } catch (err) {
    const duration = Date.now() - start;
    const stdout = err.stdout || '';
    const stderr = err.stderr || '';
    // Some tests exit with non-zero on failures but still produce output
    const parsed = parseTestOutput(entry.id, stdout, stderr, duration);
    if (parsed.passed > 0 || parsed.failed > 0) {
      return parsed; // It ran, just had failures
    }
    return { id: entry.id, status: 'error', error: (stderr || err.message).substring(0, 500), duration };
  }
}

// ─── Parse test output for pass/fail counts ───
function parseTestOutput(id, stdout, stderr, duration) {
  const combined = stdout + '\n' + stderr;
  
  // Count ✅/❌ or ✓/✗ markers
  const passMarkers = (combined.match(/[✅✓]/g) || []).length;
  const failMarkers = (combined.match(/[❌✗]/g) || []).length;
  
  // Also try to find summary lines like "Passed: X, Failed: Y" or "X passed, Y failed"
  let summaryPassed = 0, summaryFailed = 0;
  const summaryMatch = combined.match(/(\d+)\s*(?:passed|pass|✅)/i);
  const failMatch = combined.match(/(\d+)\s*(?:failed|fail|❌)/i);
  if (summaryMatch) summaryPassed = parseInt(summaryMatch[1]);
  if (failMatch) summaryFailed = parseInt(failMatch[1]);

  const passed = Math.max(passMarkers, summaryPassed);
  const failed = Math.max(failMarkers, summaryFailed);
  const total = passed + failed;

  return {
    id,
    status: failed > 0 ? 'failed' : (passed > 0 ? 'passed' : 'unknown'),
    passed,
    failed,
    total,
    duration,
    output: verbose ? combined.substring(0, 2000) : undefined
  };
}

// ─── Execute all tests ───
const results = [];
const startTime = Date.now();

for (const entry of executable) {
  // Skip ESM tests that need special handling
  if (entry.runner === 'node-esm') {
    console.log(`  ⏭️  [${entry.category}] ${entry.id} (ESM — skipped, needs import() support)`);
    results.push({ id: entry.id, status: 'skipped', reason: 'ESM module', duration: 0 });
    continue;
  }

  process.stdout.write(`  🔄 [${entry.category}] ${entry.id}...`);
  const result = runTest(entry);
  results.push(result);

  const icon = result.status === 'passed' ? '✅' :
               result.status === 'failed' ? '❌' :
               result.status === 'error' ? '💥' : '⏭️';
  console.log(`\r  ${icon} [${entry.category}] ${entry.id} — ${result.passed || 0}/${result.total || 0} passed (${result.duration}ms)`);
  
  if (result.status === 'error' && result.error) {
    console.log(`     └─ ${result.error.split('\n')[0]}`);
  }
}

const totalDuration = Date.now() - startTime;

// ─── Summary ───
console.log('\n═══════════════════════════════════════════════════════');
console.log('  📊 Results Summary');
console.log('═══════════════════════════════════════════════════════');

const totalPassed = results.filter(r => r.status === 'passed').length;
const totalFailed = results.filter(r => r.status === 'failed').length;
const totalError = results.filter(r => r.status === 'error').length;
const totalSkipped = results.filter(r => r.status === 'skipped').length;
const totalUnknown = results.filter(r => r.status === 'unknown').length;

const testsPassed = results.reduce((s, r) => s + (r.passed || 0), 0);
const testsFailed = results.reduce((s, r) => s + (r.failed || 0), 0);
const testsTotal = testsPassed + testsFailed;

console.log(`  Files:      ${results.length} executed`);
console.log(`  ✅ Passed:  ${totalPassed} files`);
console.log(`  ❌ Failed:  ${totalFailed} files`);
console.log(`  💥 Error:   ${totalError} files`);
console.log(`  ⏭️  Skipped: ${totalSkipped} files`);
console.log(`  Assertions: ${testsPassed}/${testsTotal} passed`);
console.log(`  Duration:   ${totalDuration}ms`);

// ─── By Category ───
console.log('\n  📂 By Category:');
const byCategory = {};
for (const e of filtered) {
  if (!byCategory[e.category]) byCategory[e.category] = { total: 0, executable: 0, ran: 0 };
  byCategory[e.category].total++;
  if (runnableRunners.includes(e.runner)) byCategory[e.category].executable++;
}
for (const r of results) {
  const entry = entries.find(e => e.id === r.id);
  if (entry && byCategory[entry.category]) byCategory[entry.category].ran++;
}
for (const [cat, info] of Object.entries(byCategory).sort()) {
  console.log(`     ${cat}: ${info.total} entries (${info.executable} executable)`);
}

// ─── By Module ───
console.log('\n  📦 By Module:');
const byModule = {};
for (const e of filtered) {
  if (!byModule[e.module]) byModule[e.module] = { total: 0, passed: 0, failed: 0 };
  byModule[e.module].total++;
}
for (const r of results) {
  const entry = entries.find(e => e.id === r.id);
  if (entry) {
    if (r.status === 'passed') (byModule[entry.module] || {}).passed = ((byModule[entry.module] || {}).passed || 0) + 1;
    if (r.status === 'failed' || r.status === 'error') (byModule[entry.module] || {}).failed = ((byModule[entry.module] || {}).failed || 0) + 1;
  }
}
for (const [mod, info] of Object.entries(byModule).sort()) {
  const status = info.failed > 0 ? '❌' : info.passed > 0 ? '✅' : '⚪';
  console.log(`     ${status} ${mod}: ${info.total} entries`);
}

// ─── Coverage Analysis ───
if (showCoverage) {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  🔍 Coverage Gap Analysis');
  console.log('═══════════════════════════════════════════════════════');

  // All infrastructure modules
  const allModules = fs.readdirSync(INFRA_DIR)
    .filter(f => fs.statSync(path.join(INFRA_DIR, f)).isDirectory())
    .filter(f => !f.startsWith('.') && f !== 'tests' && f !== 'logs');

  // Modules with tests
  const testedModules = new Set(entries.map(e => e.module));

  // Module name mapping (test module → infra dir)
  const moduleMap = {
    'event-bus': 'event-bus',
    'config': 'config',
    'intent-engine': 'intent-engine',
    'dispatcher': 'dispatcher',
    'rule-engine': 'rule-engine',
    'decision-log': 'decision-log',
    'mr': 'mr',
    'pipeline': 'pipeline'
  };

  const coveredInfraModules = new Set(Object.values(moduleMap));
  const uncoveredModules = allModules.filter(m => !coveredInfraModules.has(m));

  console.log('\n  📦 Module Coverage:');
  for (const m of allModules) {
    const covered = coveredInfraModules.has(m);
    console.log(`     ${covered ? '✅' : '❌'} ${m}`);
  }
  console.log(`\n  Coverage: ${coveredInfraModules.size}/${allModules.length} modules (${Math.round(coveredInfraModules.size / allModules.length * 100)}%)`);

  if (uncoveredModules.length > 0) {
    console.log(`\n  ⚠️  Uncovered modules: ${uncoveredModules.join(', ')}`);
  }

  // Category coverage
  const allCategories = ['unit', 'integration', 'e2e', 'benchmark/intent', 'benchmark/pipeline', 'benchmark/scenarios', 'regression'];
  const coveredCategories = new Set(entries.map(e => e.category));
  const uncoveredCategories = allCategories.filter(c => !coveredCategories.has(c));

  console.log('\n  📂 Category Coverage:');
  for (const c of allCategories) {
    const count = entries.filter(e => e.category === c).length;
    console.log(`     ${count > 0 ? '✅' : '❌'} ${c}: ${count} entries`);
  }

  if (uncoveredCategories.length > 0) {
    console.log(`\n  ⚠️  Empty categories: ${uncoveredCategories.join(', ')}`);
  }

  // Scenario domain coverage
  console.log('\n  🎭 Scenario Domain Coverage:');
  const scenarioDomains = new Set();
  const scenarioEntries = entries.filter(e => e.category === 'benchmark/scenarios' && e.runner === 'scenario-runner');
  for (const e of scenarioEntries) {
    const tags = e.tags || [];
    const domain = tags.find(t => !['scenario'].includes(t)) || 'unknown';
    scenarioDomains.add(domain);
  }
  const expectedDomains = ['analysis', 'content', 'CRAS', 'dev', 'system-admin', 'communication', 'data-processing'];
  for (const d of expectedDomains) {
    const has = scenarioDomains.has(d) || [...scenarioDomains].some(sd => sd.toLowerCase().includes(d.toLowerCase()));
    console.log(`     ${has ? '✅' : '❌'} ${d}`);
  }

  // Missing test types per module
  console.log('\n  📊 Test Type Matrix (module × category):');
  const moduleCategories = {};
  for (const e of entries) {
    const cat = e.category.split('/')[0]; // unit, integration, e2e, benchmark, regression
    if (!moduleCategories[e.module]) moduleCategories[e.module] = new Set();
    moduleCategories[e.module].add(cat);
  }
  const coreTypes = ['unit', 'integration', 'e2e'];
  for (const [mod, cats] of Object.entries(moduleCategories).sort()) {
    const missing = coreTypes.filter(c => !cats.has(c));
    if (missing.length > 0) {
      console.log(`     ⚠️  ${mod}: missing ${missing.join(', ')}`);
    } else {
      console.log(`     ✅ ${mod}: full coverage (${[...cats].join(', ')})`);
    }
  }
}

// ─── Write results ───
const report = {
  timestamp: new Date().toISOString(),
  duration_ms: totalDuration,
  filter: { category: filterCategory, module: filterModule, tag: filterTag },
  summary: {
    files_executed: results.length,
    files_passed: totalPassed,
    files_failed: totalFailed,
    files_error: totalError,
    files_skipped: totalSkipped,
    assertions_passed: testsPassed,
    assertions_failed: testsFailed,
    assertions_total: testsTotal
  },
  by_category: byCategory,
  by_module: byModule,
  results: results.map(r => ({ ...r, output: undefined }))  // strip verbose output from JSON
};

fs.writeFileSync(LATEST_RESULT, JSON.stringify(report, null, 2));
console.log(`\n📄 Results written to: tests/results/latest.json`);

// ─── Update registry with run results ───
const now = new Date().toISOString();
for (const r of results) {
  const entry = registry.entries.find(e => e.id === r.id);
  if (entry) {
    entry.last_run = now;
    entry.last_result = r.status;
  }
}
fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));

// ─── Exit code ───
process.exit(totalFailed + totalError > 0 ? 1 : 0);
