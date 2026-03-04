/**
 * auto-archive.js — 失败 case 自动归档到 regression 测试集
 * 
 * ISC Rule: rule.eval-sample-auto-collection-001
 * 
 * 输入: 测试运行结果（哪些 case 失败了）
 * 输出: 将失败 case 归档到 tests/regression/ 并更新 registry.json
 * 标记 source: "regression"
 */

const fs = require('fs');
const path = require('path');

const REGRESSION_DIR = path.resolve(__dirname);
const REGISTRY_PATH = path.resolve(__dirname, '../registry.json');
const ARCHIVED_DIR = path.join(REGRESSION_DIR, 'archived');

/**
 * Ensure directories and registry exist.
 */
function ensureSetup() {
  fs.mkdirSync(ARCHIVED_DIR, { recursive: true });

  if (!fs.existsSync(REGISTRY_PATH)) {
    const initialRegistry = {
      version: "1.0.0",
      description: "评测样本注册表 - 包含手工用例和自动回收的回归用例",
      created: new Date().toISOString(),
      samples: [],
      stats: {
        total: 0,
        by_source: {},
        by_event_type: {}
      }
    };
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(initialRegistry, null, 2), 'utf-8');
  }
}

/**
 * Archive failed test cases as regression samples.
 * 
 * @param {Array<object>} failedCases - Array of failed test cases, each with:
 *   - {string} test_id - Unique test identifier
 *   - {string} test_name - Human-readable name
 *   - {*} input - Test input
 *   - {*} expected - Expected output
 *   - {*} actual - Actual output
 *   - {string} [error] - Error message if any
 *   - {object} [context] - Additional context
 * @returns {{ archived: number, skipped: number, files: string[] }}
 */
function archiveFailedCases(failedCases) {
  ensureSetup();

  if (!Array.isArray(failedCases) || failedCases.length === 0) {
    return { archived: 0, skipped: 0, files: [] };
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  const existingIds = new Set(registry.samples.map(s => s.test_id));

  let archived = 0;
  let skipped = 0;
  const files = [];

  for (const failedCase of failedCases) {
    const testId = failedCase.test_id || `unknown-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Skip duplicates
    if (existingIds.has(testId)) {
      skipped++;
      continue;
    }

    const timestamp = new Date().toISOString();
    const fileTimestamp = timestamp.replace(/[:.]/g, '-').replace('T', '_').slice(0, 23);
    const filename = `${fileTimestamp}-regression-${sanitize(testId)}.json`;

    const regressionSample = {
      id: `regression-${testId}`,
      test_id: testId,
      test_name: failedCase.test_name || testId,
      source: 'regression',
      archived_at: timestamp,
      input: failedCase.input || null,
      expected: failedCase.expected || null,
      actual: failedCase.actual || null,
      error: failedCase.error || null,
      context: failedCase.context || {},
      metadata: {
        source: 'regression',
        auto_archived: true,
        rule_id: 'rule.eval-sample-auto-collection-001',
        status: 'active'
      }
    };

    // Write individual file
    const filepath = path.join(ARCHIVED_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(regressionSample, null, 2), 'utf-8');
    files.push(filename);

    // Add to registry
    registry.samples.push({
      id: regressionSample.id,
      test_id: testId,
      test_name: regressionSample.test_name,
      source: 'regression',
      file: `regression/archived/${filename}`,
      archived_at: timestamp,
      status: 'active'
    });

    existingIds.add(testId);
    archived++;
  }

  // Update stats
  registry.stats.total = registry.samples.length;
  registry.stats.by_source = {};
  for (const s of registry.samples) {
    registry.stats.by_source[s.source] = (registry.stats.by_source[s.source] || 0) + 1;
  }
  registry.stats.last_updated = new Date().toISOString();

  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');

  return { archived, skipped, files };
}

/**
 * Handle a test.failed event from EventBus.
 * Convenience wrapper for single-case archival.
 * 
 * @param {object} payload - Event payload
 * @param {object} [context={}] - Event context
 * @returns {object} Archive result
 */
function onTestFailed(payload, context = {}) {
  return archiveFailedCases([{
    test_id: payload.test_id || payload.id,
    test_name: payload.test_name || payload.name,
    input: payload.input,
    expected: payload.expected,
    actual: payload.actual,
    error: payload.error,
    context
  }]);
}

/**
 * Register with EventBus to auto-archive on test.failed events.
 * 
 * @param {object} eventBus - EventBus with .on() method
 */
function register(eventBus) {
  if (!eventBus || typeof eventBus.on !== 'function') {
    console.warn('[auto-archive] Invalid eventBus, skipping registration');
    return;
  }

  eventBus.on('test.failed', (payload, context) => {
    try {
      const result = onTestFailed(payload, context);
      console.log(`[auto-archive] Archived ${result.archived} failed case(s), skipped ${result.skipped}`);
    } catch (err) {
      console.error('[auto-archive] Failed to archive:', err.message);
    }
  });

  console.log('[auto-archive] Registered for event: test.failed');
}

/**
 * List all regression samples from registry.
 * 
 * @returns {Array<object>} Registry entries with source=regression
 */
function listRegressions() {
  ensureSetup();
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  return registry.samples.filter(s => s.source === 'regression');
}

/**
 * Get regression stats.
 */
function getStats() {
  ensureSetup();
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  return registry.stats;
}

function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

module.exports = {
  archiveFailedCases,
  onTestFailed,
  register,
  listRegressions,
  getStats
};
