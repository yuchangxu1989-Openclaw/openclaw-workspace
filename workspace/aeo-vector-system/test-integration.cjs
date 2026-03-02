/** @format */
/**
 * AEO Vector System Integration Test
 * 向量系统集成测试
 */

const fs = require('fs');
const path = require('path');
const { VectorCore } = require('./vector-core.cjs');
const { CaseIndexer } = require('./case-indexer.cjs');
const { SimilaritySearch } = require('./similarity-search.cjs');
const { HistoryMatcher } = require('./history-matcher.cjs');

class TestRunner {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }

  async test(name, fn) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      this.passed++;
      this.results.push({ name, status: 'pass' });
    } catch (err) {
      console.log(`❌ ${name}: ${err.message}`);
      this.failed++;
      this.results.push({ name, status: 'fail', error: err.message });
    }
  }

  assertEqual(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
    }
  }

  assertTrue(value, msg) {
    if (!value) {
      throw new Error(msg || 'Expected true, got false');
    }
  }

  assertGt(a, b, msg) {
    if (!(a > b)) {
      throw new Error(`${msg || 'Assertion failed'}: expected ${a} > ${b}`);
    }
  }

  summary() {
    console.log(`\n═══════════════════════════`);
    console.log(`Test Summary: ${this.passed} passed, ${this.failed} failed`);
    console.log(`═══════════════════════════\n`);
    return this.failed === 0;
  }
}

async function runTests() {
  const runner = new TestRunner();
  const testDataDir = path.join(__dirname, 'test-data');
  const indexDir = path.join(__dirname, 'test-index');
  
  // 清理旧索引
  if (fs.existsSync(indexDir)) {
    fs.rmSync(indexDir, { recursive: true });
  }

  console.log('\n📦 AEO Vector System Integration Test');
  console.log('═════════════════════════════════════\n');

  // ═══════════════════════════════════════════════
  // Test 1: Vector Core Tests
  // ═══════════════════════════════════════════════
  console.log('Testing VectorCore...');
  
  await runner.test('VectorCore: tokenize English text', () => {
    const vc = new VectorCore();
    const tokens = vc.tokenize('Test login functionality with valid credentials');
    runner.assertTrue(tokens.includes('test'), 'Should include "test"');
    runner.assertTrue(tokens.includes('login'), 'Should include "login"');
  });

  await runner.test('VectorCore: tokenize Chinese text', () => {
    const vc = new VectorCore();
    const tokens = vc.tokenize('测试用户登录功能');
    runner.assertTrue(tokens.includes('测试'), 'Should include "测试"');
    runner.assertTrue(tokens.includes('登录'), 'Should include "登录"');
  });

  await runner.test('VectorCore: build vocabulary', () => {
    const vc = new VectorCore();
    const docs = ['test login', 'test logout', 'user profile'];
    const size = vc.buildVocabulary(docs);
    runner.assertGt(size, 0, 'Vocabulary size should be > 0');
    runner.assertEqual(vc.vocab.has('test'), true, 'Should have "test" in vocab');
  });

  await runner.test('VectorCore: vectorize text', () => {
    const vc = new VectorCore();
    vc.buildVocabulary(['test login', 'test logout']);
    const vec = vc.vectorize('test login');
    runner.assertEqual(vec.length, vc.vocabSize, 'Vector length should match vocab size');
    
    // 检查归一化
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    runner.assertTrue(Math.abs(norm - 1) < 0.01, 'Vector should be normalized');
  });

  await runner.test('VectorCore: cosine similarity', () => {
    const vc = new VectorCore();
    vc.buildVocabulary(['user login test', 'user logout test', 'database query']);
    const v1 = vc.vectorize('user login test');
    const v2 = vc.vectorize('user logout test');
    const v3 = vc.vectorize('database query');
    
    const sim1 = vc.cosineSimilarity(v1, v2);
    const sim2 = vc.cosineSimilarity(v1, v3);
    
    runner.assertTrue(sim1 > sim2, 'Similar texts should have higher similarity');
    runner.assertTrue(sim1 > 0, 'Similar texts should have positive similarity');
  });

  // ═══════════════════════════════════════════════
  // Test 2: Case Indexer Tests
  // ═══════════════════════════════════════════════
  console.log('\nTesting CaseIndexer...');

  const indexer = new CaseIndexer({ indexDir });

  await runner.test('CaseIndexer: load test cases from file', () => {
    const cases = indexer.loadCases(path.join(testDataDir, 'test-cases.json'));
    runner.assertGt(cases.length, 0, 'Should load test cases');
    runner.assertTrue(cases[0].id, 'First case should have an id');
  });

  await runner.test('CaseIndexer: extract case text', () => {
    const testCase = {
      name: 'Login Test',
      description: 'Test user login',
      input: { username: 'test' },
      expected: { success: true },
      category: 'function',
      tags: ['auth', 'login']
    };
    const text = indexer.extractCaseText(testCase);
    runner.assertTrue(text.includes('Login Test'), 'Should include name');
    runner.assertTrue(text.includes('auth'), 'Should include tags');
  });

  await runner.test('CaseIndexer: build index', async () => {
    const result = await indexer.buildIndex(path.join(testDataDir, 'test-cases.json'));
    runner.assertGt(result.total, 0, 'Should index test cases');
    runner.assertGt(result.vocabSize, 0, 'Should build vocabulary');
  });

  await runner.test('CaseIndexer: save and load index', () => {
    indexer.saveIndex(indexDir);
    
    const newIndexer = new CaseIndexer({ indexDir });
    const loaded = newIndexer.loadIndex(indexDir);
    runner.assertGt(loaded.total, 0, 'Should load cases');
    runner.assertGt(loaded.vocabSize, 0, 'Should load vocabulary');
  });

  // ═══════════════════════════════════════════════
  // Test 3: Similarity Search Tests
  // ═══════════════════════════════════════════════
  console.log('\nTesting SimilaritySearch...');

  await runner.test('SimilaritySearch: load index', () => {
    const searcher = new SimilaritySearch({ indexDir });
    const loaded = searcher.load();
    runner.assertGt(loaded.total, 0, 'Should load index');
  });

  await runner.test('SimilaritySearch: search by text', () => {
    const searcher = new SimilaritySearch({ indexDir });
    searcher.load();
    
    const results = searcher.searchByText('登录测试', { k: 3, threshold: 0.1 });
    runner.assertTrue(Array.isArray(results), 'Should return array');
    runner.assertTrue(results.length > 0, 'Should find results');
    runner.assertTrue(results[0].similarity > 0, 'Should have similarity score');
  });

  await runner.test('SimilaritySearch: search by case ID', () => {
    const searcher = new SimilaritySearch({ indexDir });
    searcher.load();
    
    const results = searcher.searchByCase('case_login_001', { k: 3, threshold: 0.1 });
    runner.assertTrue(Array.isArray(results), 'Should return array');
    // 不应该包含自身
    runner.assertTrue(!results.find(r => r.caseId === 'case_login_001'), 'Should exclude self');
  });

  await runner.test('SimilaritySearch: search with filter', () => {
    const searcher = new SimilaritySearch({ indexDir });
    searcher.load();
    
    const results = searcher.searchWithFilter(
      '性能测试',
      { category: 'performance' },
      { k: 5 }
    );
    runner.assertTrue(Array.isArray(results), 'Should return array');
    // 过滤后所有结果都应该符合类别
    for (const r of results) {
      if (r.category) {
        runner.assertEqual(r.category, 'performance', 'Should match filter');
      }
    }
  });

  await runner.test('SimilaritySearch: analyze clusters', () => {
    const searcher = new SimilaritySearch({ indexDir });
    searcher.load();
    
    const analysis = searcher.analyzeClusters();
    runner.assertGt(analysis.totalCases, 0, 'Should count total cases');
    runner.assertTrue(Array.isArray(analysis.categories), 'Should have categories');
    runner.assertTrue(Array.isArray(analysis.domains), 'Should have domains');
  });

  // ═══════════════════════════════════════════════
  // Test 4: History Matcher Tests
  // ═══════════════════════════════════════════════
  console.log('\nTesting HistoryMatcher...');

  const matcher = new HistoryMatcher();

  await runner.test('HistoryMatcher: load history issues', () => {
    const count = matcher.loadHistory(path.join(testDataDir, 'history-issues.json'));
    runner.assertGt(count, 0, 'Should load issues');
  });

  await runner.test('HistoryMatcher: build index', () => {
    const vocabSize = matcher.buildIndex();
    runner.assertGt(vocabSize, 0, 'Should build vocabulary');
    runner.assertTrue(matcher.indexed, 'Should be indexed');
  });

  await runner.test('HistoryMatcher: match issue', () => {
    const newIssue = {
      title: '用户登录时服务器返回500错误',
      description: '在高并发情况下登录偶尔失败',
      error: { message: 'Connection pool exhausted' }
    };
    
    const matches = matcher.match(newIssue, { k: 3 });
    runner.assertTrue(Array.isArray(matches), 'Should return array');
    runner.assertTrue(matches.length > 0, 'Should find matches');
    runner.assertTrue(matches[0].similarity > 0, 'Should have similarity score');
  });

  await runner.test('HistoryMatcher: detect duplicate', () => {
    // 使用与历史问题非常相似的描述
    const duplicate = {
      title: '登录接口偶尔返回500错误',
      description: '用户在高并发情况下登录时，偶尔会收到500内部服务器错误',
      component: 'authentication'
    };
    
    const result = matcher.detectDuplicate(duplicate);
    runner.assertTrue(result.hasOwnProperty('isDuplicate'), 'Should return duplicate check result');
  });

  await runner.test('HistoryMatcher: find known flaky', () => {
    const testCase = {
      name: '用户登录流程测试',
      description: '自动化测试中登录测试偶尔失败'
    };
    
    const result = matcher.findKnownFlaky(testCase, matcher.historyData);
    runner.assertTrue(result.hasOwnProperty('isPotentiallyFlaky'), 'Should return flaky check result');
  });

  await runner.test('HistoryMatcher: analyze trends', () => {
    const trends = matcher.analyzeTrends();
    runner.assertGt(trends.totalIssues, 0, 'Should count total issues');
    runner.assertTrue(Array.isArray(trends.byComponent), 'Should have component breakdown');
    runner.assertTrue(Array.isArray(trends.byLabel), 'Should have label breakdown');
  });

  // ═══════════════════════════════════════════════
  // Test 5: Integration Flow Test
  // ═══════════════════════════════════════════════
  console.log('\nTesting Integration Flow...');

  await runner.test('Integration: end-to-end workflow', async () => {
    // 1. 构建索引
    const idx = new CaseIndexer({ indexDir: path.join(indexDir, 'e2e') });
    await idx.buildIndex(path.join(testDataDir, 'test-cases.json'));
    idx.saveIndex(path.join(indexDir, 'e2e'));
    
    // 2. 搜索相似用例
    const searcher = new SimilaritySearch({ indexDir: path.join(indexDir, 'e2e') });
    searcher.load();
    const similarCases = searcher.searchByText('数据库性能测试', { k: 3, threshold: 0.05 });
    runner.assertTrue(similarCases.length > 0, 'Should find similar cases');
    
    // 3. 匹配历史问题
    const matcher2 = new HistoryMatcher();
    matcher2.loadHistory(path.join(testDataDir, 'history-issues.json'));
    matcher2.buildIndex();
    const matches = matcher2.match({
      title: '数据库查询很慢',
      description: '查询响应时间超过预期'
    }, { k: 3 });
    runner.assertTrue(matches.length > 0, 'Should find matching issues');
  });

  // ═══════════════════════════════════════════════
  // Test 6: Semantic Accuracy Test
  // ═══════════════════════════════════════════════
  console.log('\nTesting Semantic Accuracy...');

  await runner.test('Semantic: login-related queries find auth cases', () => {
    const searcher = new SimilaritySearch({ indexDir });
    searcher.load();
    
    const results = searcher.searchByText('用户登录功能测试', { k: 5 });
    const authCases = results.filter(r => 
      r.domain === 'authentication' || 
      (r.tags && r.tags.some(t => t.includes('login') || t.includes('auth')))
    );
    runner.assertGt(authCases.length, 0, 'Should find authentication-related cases');
  });

  await runner.test('Semantic: performance queries find perf cases', () => {
    const searcher = new SimilaritySearch({ indexDir });
    searcher.load();
    
    const results = searcher.searchByText('API接口响应时间测试', { k: 5 });
    const perfCases = results.filter(r => 
      r.category === 'performance' || 
      (r.tags && r.tags.some(t => t.includes('performance')))
    );
    runner.assertGt(perfCases.length, 0, 'Should find performance-related cases');
  });

  await runner.test('Semantic: security queries find security cases', () => {
    const searcher = new SimilaritySearch({ indexDir });
    searcher.load();
    
    const results = searcher.searchByText('SQL注入和XSS攻击防护', { k: 5 });
    const securityCases = results.filter(r => 
      r.category === 'security' || 
      (r.tags && r.tags.some(t => t.includes('security') || t.includes('sql-injection') || t.includes('xss')))
    );
    runner.assertGt(securityCases.length, 0, 'Should find security-related cases');
  });

  // 打印总结
  const success = runner.summary();
  
  // 保存测试报告
  const reportPath = path.join(__dirname, 'test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    total: runner.results.length,
    passed: runner.passed,
    failed: runner.failed,
    results: runner.results
  }, null, 2));
  console.log(`📄 Test report saved to: ${reportPath}`);
  
  process.exit(success ? 0 : 1);
}

// 运行测试
runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
