/**
 * Intent Registry Manager v1.0
 * 意图注册表管理模块 - 加载、查询、MECE校验、生命周期管理
 * CommonJS, 纯 Node.js, 零依赖
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, 'intent-registry.json');
const VALID_CATEGORIES = ['IC1', 'IC2', 'IC3', 'IC4', 'IC5'];
const VALID_STATUSES = ['active', 'draft', 'deprecated', 'archived'];
const REQUIRED_FIELDS = ['id', 'category', 'name', 'description', 'examples', 'anti_examples', 'confidence_threshold'];

class RegistryManager {
  constructor(registryPath) {
    this._path = registryPath || REGISTRY_PATH;
    this._registry = null;
  }

  // ── 核心加载 ──────────────────────────────────────────────

  /**
   * 加载注册表JSON，返回完整registry对象
   */
  loadRegistry() {
    const raw = fs.readFileSync(this._path, 'utf-8');
    this._registry = JSON.parse(raw);
    return this._registry;
  }

  /**
   * 确保registry已加载
   */
  _ensureLoaded() {
    if (!this._registry) this.loadRegistry();
  }

  /**
   * 持久化当前registry到磁盘
   */
  _save() {
    this._registry.updated_at = new Date().toISOString();
    this._registry.metadata.total_intents = this._registry.intents.length;
    // 重新计算分类统计
    const byCat = {};
    for (const cat of VALID_CATEGORIES) byCat[cat] = 0;
    for (const intent of this._registry.intents) {
      if (byCat[intent.category] !== undefined) byCat[intent.category]++;
    }
    this._registry.metadata.by_category = byCat;
    fs.writeFileSync(this._path, JSON.stringify(this._registry, null, 2) + '\n', 'utf-8');
  }

  // ── 查询 ──────────────────────────────────────────────────

  /**
   * 获取单个意图
   * @param {string} id - 意图ID
   * @returns {object|null}
   */
  getIntent(id) {
    this._ensureLoaded();
    return this._registry.intents.find(i => i.id === id) || null;
  }

  /**
   * 按IC分类查询
   * @param {string} category - IC1-IC5
   * @returns {object[]}
   */
  listByCategory(category) {
    this._ensureLoaded();
    if (!VALID_CATEGORIES.includes(category)) {
      throw new Error(`Invalid category "${category}". Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }
    return this._registry.intents.filter(i => i.category === category);
  }

  /**
   * 列出所有意图（可选按status过滤）
   * @param {string} [status]
   * @returns {object[]}
   */
  listAll(status) {
    this._ensureLoaded();
    if (status) return this._registry.intents.filter(i => i.status === status);
    return [...this._registry.intents];
  }

  // ── MECE校验 ──────────────────────────────────────────────

  /**
   * 校验新意图是否符合MECE原则（与现有意图不重叠）
   * 返回 { valid: boolean, errors: string[] }
   */
  validateNewIntent(intent) {
    const errors = [];

    // 1. 必填字段检查
    for (const field of REQUIRED_FIELDS) {
      if (intent[field] === undefined || intent[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    if (errors.length > 0) return { valid: false, errors };

    // 2. 分类有效性
    if (!VALID_CATEGORIES.includes(intent.category)) {
      errors.push(`Invalid category "${intent.category}". Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    // 3. ID唯一性
    this._ensureLoaded();
    if (this._registry.intents.some(i => i.id === intent.id)) {
      errors.push(`Duplicate intent ID: "${intent.id}"`);
    }

    // 4. examples/anti_examples 数量
    if (!Array.isArray(intent.examples) || intent.examples.length < 2) {
      errors.push('examples must have at least 2 entries');
    }
    if (!Array.isArray(intent.anti_examples) || intent.anti_examples.length < 1) {
      errors.push('anti_examples must have at least 1 entry');
    }

    // 5. confidence_threshold 范围
    if (typeof intent.confidence_threshold !== 'number' || intent.confidence_threshold < 0 || intent.confidence_threshold > 1) {
      errors.push('confidence_threshold must be a number between 0 and 1');
    }

    // 6. MECE语义重叠检测（基于name相似度 + example交叉）
    const sameCategory = this._registry.intents.filter(i => i.category === intent.category && i.status !== 'archived');
    for (const existing of sameCategory) {
      // 名称相似性检测
      if (this._stringSimilarity(existing.name, intent.name) > 0.7) {
        errors.push(`Potential overlap: name "${intent.name}" is too similar to existing "${existing.name}" (${existing.id})`);
      }
      // example交叉检测
      const overlapExamples = intent.examples.filter(ex =>
        existing.examples.some(eex => this._stringSimilarity(ex, eex) > 0.8)
      );
      if (overlapExamples.length > 0) {
        errors.push(`Example overlap with ${existing.id}: ${JSON.stringify(overlapExamples)}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 简易字符串相似度（Jaccard on bigrams）
   */
  _stringSimilarity(a, b) {
    if (!a || !b) return 0;
    const bigramsA = new Set();
    const bigramsB = new Set();
    for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));
    for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2));
    if (bigramsA.size === 0 && bigramsB.size === 0) return 1;
    let intersection = 0;
    for (const bg of bigramsA) if (bigramsB.has(bg)) intersection++;
    return intersection / (bigramsA.size + bigramsB.size - intersection);
  }

  // ── 生命周期管理 ──────────────────────────────────────────

  /**
   * 添加新意图（自动校验MECE）
   * @param {object} intent - 意图定义
   * @returns {{ success: boolean, errors?: string[] }}
   */
  addIntent(intent) {
    const validation = this.validateNewIntent(intent);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }
    // 补齐默认字段
    intent.status = intent.status || 'draft';
    intent.created_at = intent.created_at || new Date().toISOString();

    this._registry.intents.push(intent);
    this._save();
    return { success: true };
  }

  /**
   * 废弃意图（标记为deprecated，保留数据）
   * @param {string} id
   * @returns {{ success: boolean, error?: string }}
   */
  deprecateIntent(id) {
    this._ensureLoaded();
    const intent = this._registry.intents.find(i => i.id === id);
    if (!intent) return { success: false, error: `Intent not found: ${id}` };
    if (intent.status === 'archived') return { success: false, error: `Cannot deprecate archived intent: ${id}` };
    intent.status = 'deprecated';
    intent.deprecated_at = new Date().toISOString();
    this._save();
    return { success: true };
  }

  /**
   * 归档意图（标记为archived，不再参与MECE校验）
   * @param {string} id
   * @returns {{ success: boolean, error?: string }}
   */
  archiveIntent(id) {
    this._ensureLoaded();
    const intent = this._registry.intents.find(i => i.id === id);
    if (!intent) return { success: false, error: `Intent not found: ${id}` };
    intent.status = 'archived';
    intent.archived_at = new Date().toISOString();
    this._save();
    return { success: true };
  }
}

// ── 自带测试 ────────────────────────────────────────────────

function runTests() {
  const testDir = path.join(__dirname, '__test_tmp__');
  const testFile = path.join(testDir, 'test-registry.json');
  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) { passed++; process.stdout.write(`  ✅ ${msg}\n`); }
    else { failed++; process.stdout.write(`  ❌ ${msg}\n`); }
  }

  // Setup: copy registry to temp
  fs.mkdirSync(testDir, { recursive: true });
  fs.copyFileSync(REGISTRY_PATH, testFile);

  try {
    const mgr = new RegistryManager(testFile);

    // Test 1: loadRegistry
    const reg = mgr.loadRegistry();
    assert(reg && reg.version === '1.0.0', 'loadRegistry returns valid object');
    assert(Array.isArray(reg.intents) && reg.intents.length > 0, 'Registry has intents');

    // Test 2: getIntent
    const pos = mgr.getIntent('user.emotion.positive');
    assert(pos !== null && pos.category === 'IC1', 'getIntent finds IC1 intent');
    const missing = mgr.getIntent('nonexistent.id');
    assert(missing === null, 'getIntent returns null for missing ID');

    // Test 3: listByCategory
    const ic1 = mgr.listByCategory('IC1');
    assert(ic1.length === 3, `listByCategory IC1 returns 3 intents (got ${ic1.length})`);
    const ic2 = mgr.listByCategory('IC2');
    assert(ic2.length >= 2, `listByCategory IC2 returns >=2 intents (got ${ic2.length})`);
    const ic5 = mgr.listByCategory('IC5');
    assert(ic5.length >= 2, `listByCategory IC5 returns >=2 intents (got ${ic5.length})`);

    // Test 3b: invalid category throws
    let threw = false;
    try { mgr.listByCategory('IC9'); } catch (e) { threw = true; }
    assert(threw, 'listByCategory throws on invalid category');

    // Test 4: validateNewIntent - valid
    const validIntent = {
      id: 'test.new.intent',
      category: 'IC1',
      name: '测试新意图XYZ',
      description: '测试用意图',
      examples: ['测试例子1', '测试例子2', '测试例子3'],
      anti_examples: ['反例1', '反例2'],
      confidence_threshold: 0.7
    };
    const v1 = mgr.validateNewIntent(validIntent);
    assert(v1.valid === true, 'validateNewIntent passes for valid intent');

    // Test 5: validateNewIntent - duplicate ID
    const dupIntent = { ...validIntent, id: 'user.emotion.positive' };
    const v2 = mgr.validateNewIntent(dupIntent);
    assert(v2.valid === false && v2.errors.some(e => e.includes('Duplicate')), 'validateNewIntent catches duplicate ID');

    // Test 6: validateNewIntent - missing fields
    const v3 = mgr.validateNewIntent({ id: 'incomplete' });
    assert(v3.valid === false && v3.errors.length > 0, 'validateNewIntent catches missing fields');

    // Test 7: addIntent
    const addResult = mgr.addIntent({ ...validIntent });
    assert(addResult.success === true, 'addIntent succeeds for valid intent');
    const added = mgr.getIntent('test.new.intent');
    assert(added !== null && added.status === 'draft', 'Added intent is retrievable with draft status');

    // Test 8: addIntent duplicate rejected
    const addDup = mgr.addIntent({ ...validIntent });
    assert(addDup.success === false, 'addIntent rejects duplicate');

    // Test 9: deprecateIntent
    const depResult = mgr.deprecateIntent('test.new.intent');
    assert(depResult.success === true, 'deprecateIntent succeeds');
    const dep = mgr.getIntent('test.new.intent');
    assert(dep.status === 'deprecated', 'Deprecated intent has correct status');

    // Test 10: archiveIntent
    const archResult = mgr.archiveIntent('test.new.intent');
    assert(archResult.success === true, 'archiveIntent succeeds');
    const arch = mgr.getIntent('test.new.intent');
    assert(arch.status === 'archived', 'Archived intent has correct status');

    // Test 11: deprecate archived fails
    const depArchived = mgr.deprecateIntent('test.new.intent');
    assert(depArchived.success === false, 'Cannot deprecate archived intent');

    // Test 12: deprecate nonexistent fails
    const depMissing = mgr.deprecateIntent('nonexistent');
    assert(depMissing.success === false, 'Cannot deprecate nonexistent intent');

    // Test 13: metadata auto-updated after save
    const reloaded = new RegistryManager(testFile);
    const reg2 = reloaded.loadRegistry();
    assert(reg2.metadata.total_intents === reg2.intents.length, 'Metadata total_intents auto-updated');

    // Test 14: all categories covered
    for (const cat of VALID_CATEGORIES) {
      const list = mgr.listByCategory(cat);
      assert(list.length >= 2, `Category ${cat} has >=2 intents (got ${list.length})`);
    }

    // Test 15: MECE overlap detection (name similarity)
    const overlapIntent = {
      id: 'user.emotion.positive.v2',
      category: 'IC1',
      name: '正向情绪',  // same name as existing
      description: '重复的正向情绪',
      examples: ['完全不同的例子A', '完全不同的例子B'],
      anti_examples: ['反例X'],
      confidence_threshold: 0.7
    };
    const v4 = mgr.validateNewIntent(overlapIntent);
    assert(v4.valid === false && v4.errors.some(e => e.includes('overlap')), 'MECE detects name overlap');

  } finally {
    // Cleanup
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  return failed === 0;
}

// ── 导出 & CLI ──────────────────────────────────────────────

module.exports = { RegistryManager, VALID_CATEGORIES, VALID_STATUSES };

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === 'test' || arg === '--test') {
    console.log('\n🧪 Intent Registry Manager - Tests\n');
    const ok = runTests();
    process.exit(ok ? 0 : 1);
  } else {
    // Quick summary
    const mgr = new RegistryManager();
    const reg = mgr.loadRegistry();
    console.log(`Intent Registry v${reg.version}`);
    console.log(`Total intents: ${reg.intents.length}`);
    for (const [cat, count] of Object.entries(reg.metadata.by_category)) {
      console.log(`  ${cat} (${reg.categories[cat].name}): ${count}`);
    }
  }
}
