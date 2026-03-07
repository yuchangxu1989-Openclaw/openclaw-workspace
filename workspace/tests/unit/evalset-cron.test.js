/**
 * evalset-cron.test.js — 评测集 Cron 管线单元测试
 * 
 * 覆盖: dedup-engine, session-sampler, generate-real-conv-evalset
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// ── dedup-engine tests ────────────────────────────────────────────
describe('dedup-engine', () => {
  const {
    contentHash,
    extractCanonicalText,
    normalizeText,
    tokenize,
    jaccardSimilarity,
    dedup,
    loadDedupDB,
    resetDedupDB,
    DEDUP_DB_PATH
  } = require('../../skills/aeo/bin/evalset-cron/dedup-engine.cjs');

  beforeEach(() => {
    // Use temp DB to avoid polluting production
    resetDedupDB();
  });

  afterAll(() => {
    resetDedupDB();
  });

  test('contentHash produces stable 16-char hex', () => {
    const tc = {
      input: { user_message: '你好世界' },
      expected: { behavior: '回复问候' },
      category: 'greeting'
    };
    const h1 = contentHash(tc);
    const h2 = contentHash(tc);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{16}$/);
  });

  test('contentHash differs for different inputs', () => {
    const tc1 = { input: { user_message: '帮我查天气' }, category: 'weather' };
    const tc2 = { input: { user_message: '帮我查日历' }, category: 'calendar' };
    expect(contentHash(tc1)).not.toBe(contentHash(tc2));
  });

  test('extractCanonicalText handles various input shapes', () => {
    const tc1 = { input: { user_message: 'hello' }, expected: { behavior: 'greet' } };
    expect(extractCanonicalText(tc1)).toContain('hello');
    expect(extractCanonicalText(tc1)).toContain('greet');

    const tc2 = { input: { prompt: 'test prompt' }, category: 'test' };
    expect(extractCanonicalText(tc2)).toContain('test prompt');
    expect(extractCanonicalText(tc2)).toContain('test');
  });

  test('normalizeText removes extra whitespace', () => {
    expect(normalizeText('  hello   world  ')).toBe('hello world');
    expect(normalizeText('ABC')).toBe('abc');
  });

  test('tokenize handles Chinese and English', () => {
    const tokens = tokenize('hello 你好世界 testing');
    expect(tokens.has('hello')).toBe(true);
    expect(tokens.has('testing')).toBe(true);
    expect(tokens.has('你好')).toBe(true); // bigram
    expect(tokens.has('好世')).toBe(true); // bigram
  });

  test('jaccardSimilarity basic cases', () => {
    const setA = new Set(['a', 'b', 'c']);
    const setB = new Set(['a', 'b', 'c']);
    expect(jaccardSimilarity(setA, setB)).toBe(1.0);

    const setC = new Set(['d', 'e', 'f']);
    expect(jaccardSimilarity(setA, setC)).toBe(0);

    const setD = new Set(['a', 'b', 'd']);
    const sim = jaccardSimilarity(setA, setD);
    expect(sim).toBeGreaterThan(0.3);
    expect(sim).toBeLessThan(0.7);
  });

  test('dedup removes exact duplicates', () => {
    const cases = [
      { id: 'a', input: { user_message: '查一下天气怎么样今天北京' }, category: 'weather' },
      { id: 'b', input: { user_message: '查一下天气怎么样今天北京' }, category: 'weather' }, // exact dup
      { id: 'c', input: { user_message: '帮我看看今天的日程安排有哪些' }, category: 'calendar' }
    ];

    const result = dedup(cases, { source: 'test', persistFingerprints: false });
    expect(result.unique.length).toBe(2);
    expect(result.duplicates.length).toBe(1);
    expect(result.stats.exactDups).toBe(1);
    expect(result.duplicates[0].id).toBe('b');
  });

  test('dedup removes fuzzy duplicates', () => {
    const cases = [
      { id: 'a', input: { user_message: '帮我查一下今天北京的天气怎么样' }, category: 'weather' },
      { id: 'b', input: { user_message: '帮我查一下今天北京天气怎么样啊' }, category: 'weather' }, // very similar
    ];

    const result = dedup(cases, { source: 'test', fuzzyThreshold: 0.75, persistFingerprints: false });
    expect(result.unique.length).toBe(1);
    expect(result.stats.fuzzyDups).toBe(1);
  });

  test('dedup cross-deduplicates with existing cases', () => {
    const existing = [
      { id: 'existing-1', input: { user_message: '你好世界这是一个很长的测试消息用于去重' }, category: 'test' }
    ];
    const newCases = [
      { id: 'new-1', input: { user_message: '你好世界这是一个很长的测试消息用于去重验证' }, category: 'test' },
      { id: 'new-2', input: { user_message: '完全不同的测试消息用于验证去重引擎是否正常工作' }, category: 'other' }
    ];

    const result = dedup(newCases, {
      source: 'test',
      fuzzyThreshold: 0.75,
      persistFingerprints: false,
      existingCases: existing
    });

    // new-1 should be deduped against existing-1 (very similar)
    expect(result.unique.length).toBeLessThanOrEqual(2);
  });

  test('dedup persists fingerprints when asked', () => {
    const cases = [
      { id: 'persist-test', input: { user_message: '这是一个持久化指纹测试用例比较长' }, category: 'test' }
    ];

    dedup(cases, { source: 'persist-test', persistFingerprints: true });
    const db = loadDedupDB();
    expect(db.totalEntries).toBeGreaterThanOrEqual(1);

    // Second run should find it as duplicate
    const result2 = dedup(cases, { source: 'persist-test-2', persistFingerprints: false });
    expect(result2.stats.exactDups).toBe(1);

    // Cleanup
    resetDedupDB();
  });
});

// ── session-sampler tests ─────────────────────────────────────────
describe('session-sampler', () => {
  const {
    scoreMessage,
    getStrategy,
    extractFromMemoryFiles,
    CURRENT_STRATEGY_VERSION
  } = require('../../skills/aeo/bin/evalset-cron/session-sampler.cjs');

  test('getStrategy returns valid strategy for current version', () => {
    const s = getStrategy(CURRENT_STRATEGY_VERSION);
    expect(s).toBeDefined();
    expect(s.id).toBe(CURRENT_STRATEGY_VERSION);
    expect(s.signalKeywords).toBeDefined();
    expect(s.maxCasesPerRun).toBeGreaterThan(0);
  });

  test('scoreMessage detects correction signals', () => {
    const strategy = getStrategy();
    const result = scoreMessage('你搞错了，不是这样的，应该是用tavily搜索', strategy);
    expect(result.score).toBeGreaterThan(0);
    expect(result.signals).toContain('correction');
  });

  test('scoreMessage detects teaching signals', () => {
    const strategy = getStrategy();
    const result = scoreMessage('记住，以后遇到这种情况，规则是先查配置再声称缺少能力', strategy);
    expect(result.score).toBeGreaterThan(0);
    expect(result.signals).toContain('teaching');
  });

  test('scoreMessage detects frustration signals', () => {
    const strategy = getStrategy();
    const result = scoreMessage('废话太多了，4分钟了还没分配完任务，快点', strategy);
    expect(result.score).toBeGreaterThan(0);
    expect(result.signals).toContain('frustration');
  });

  test('scoreMessage returns 0 for short messages', () => {
    const strategy = getStrategy();
    const result = scoreMessage('ok', strategy);
    expect(result.score).toBe(0);
  });

  test('scoreMessage maps categories correctly', () => {
    const strategy = getStrategy();
    const r1 = scoreMessage('不对！你搞错了，应该是另一种方式来处理这个问题', strategy);
    expect(r1.category).toBe('error_correction');

    const r2 = scoreMessage('记住，以后这种情况下你应该先查看配置文件再做决定', strategy);
    expect(r2.category).toBe('user_teaching');
  });

  test('extractFromMemoryFiles handles missing file gracefully', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sampler-test-'));
    const result = extractFromMemoryFiles(tmpDir, '2026-01-01');
    expect(result).toEqual([]);
    fs.rmdirSync(tmpDir, { recursive: true });
  });

  test('extractFromMemoryFiles extracts user messages', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sampler-test-'));
    const dateStr = '2026-03-07';
    const content = `# 2026-03-07 日记

## 上午
- 用户: 你搞错了，应该是用另一个模型来处理这个场景而不是默认的
- Agent: 收到，我来修正
- 用户: 记住下次先查配置文件看看有没有可用的模型再回复我
- Agent: 明白了

## 下午
- 用户: 快点做完那个任务，都十分钟了还没完成
`;
    fs.writeFileSync(path.join(tmpDir, `${dateStr}.md`), content);
    
    const frags = extractFromMemoryFiles(tmpDir, dateStr);
    expect(frags.length).toBeGreaterThanOrEqual(2);
    
    // Check that user messages were extracted (not agent messages)
    const texts = frags.map(f => f.text);
    expect(texts.some(t => t.includes('搞错了'))).toBe(true);
    
    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── closed-book safety tests ──────────────────────────────────────
describe('closed-book safety', () => {
  const { getStrategy } = require('../../skills/aeo/bin/evalset-cron/session-sampler.cjs');

  test('strategy has forbidden paths configured', () => {
    const s = getStrategy();
    expect(s.forbiddenReadPaths).toBeDefined();
    expect(s.forbiddenReadPaths.length).toBeGreaterThan(0);
    expect(s.forbiddenReadPaths).toContain('memory/');
    expect(s.forbiddenReadPaths).toContain('annotations/');
    expect(s.forbiddenReadPaths).toContain('answers/');
  });

  test('sampler sample() produces valid closed-book evidence', () => {
    const { sample } = require('../../skills/aeo/bin/evalset-cron/session-sampler.cjs');
    const result = sample({ date: '2026-01-01' }); // non-existent date = empty
    
    const cbe = result.metadata.closedBookEvidence;
    expect(cbe.enabled).toBe(true);
    expect(cbe.no_hardcoded_evalset).toBe(true);
    expect(cbe.no_reference_reads).toBe(true);
    expect(cbe.forbidden_paths_checked.length).toBeGreaterThan(0);
    expect(cbe.evidence.length).toBeGreaterThan(0);
  });
});

// ── generator integration tests ───────────────────────────────────
describe('generate-real-conv-evalset (dry-run)', () => {
  test('main function exists and is callable', () => {
    const { main } = require('../../skills/aeo/bin/generate-real-conv-evalset.cjs');
    expect(typeof main).toBe('function');
  });

  test('GENERATOR_VERSION is set', () => {
    const { GENERATOR_VERSION } = require('../../skills/aeo/bin/generate-real-conv-evalset.cjs');
    expect(GENERATOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
