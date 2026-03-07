/**
 * dedup-engine.cjs — 评测集统一去重引擎
 * 
 * 核心职责：
 * 1. 对 cron 自动生成 与 按需(ad-hoc)生成 的评测用例统一去重
 * 2. 基于 SHA-256 content hash 做精确去重
 * 3. 基于 Jaccard 文本相似度做模糊去重
 * 4. 维护全局 dedup 指纹库
 * 
 * @version 1.0.0
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEDUP_DB_PATH = path.join(__dirname, '../../evalset-cron-output/.dedup-fingerprints.json');

/**
 * 计算 test case 的 content hash
 * 使用 user_message + expected behavior 的规范化文本
 */
function contentHash(testCase) {
  const canonical = normalizeText(extractCanonicalText(testCase));
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/**
 * 提取用例的核心文本用于去重
 */
function extractCanonicalText(tc) {
  const parts = [];
  // input side
  if (tc.input?.user_message) parts.push(tc.input.user_message);
  if (tc.input?.prompt) parts.push(tc.input.prompt);
  if (tc.input?.action) parts.push(tc.input.action);
  if (typeof tc.input === 'string') parts.push(tc.input);
  // expected side
  if (tc.expected?.behavior) parts.push(tc.expected.behavior);
  if (tc.expected?.quality) parts.push(tc.expected.quality);
  if (tc.expected?.must_contain && Array.isArray(tc.expected.must_contain)) parts.push(tc.expected.must_contain.join('|'));
  // category/dimension
  if (tc.category) parts.push(tc.category);
  if (tc.dimension) parts.push(tc.dimension);
  return parts.join(' :: ');
}

/**
 * 文本规范化：去除多余空白、统一大小写
 */
function normalizeText(text) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * 文本 token 化（中英文混合分词）
 */
function tokenize(text) {
  const normalized = normalizeText(text);
  // 简单分词：中文按字，英文按空格/标点
  const tokens = new Set();
  // English words
  for (const w of normalized.match(/[a-z0-9_]+/g) || []) {
    if (w.length > 1) tokens.add(w);
  }
  // Chinese chars (bigrams for better precision)
  const chars = normalized.replace(/[a-z0-9_\s\-\.\,\;\:\!\?]+/g, '');
  for (let i = 0; i < chars.length - 1; i++) {
    tokens.add(chars.slice(i, i + 2));
  }
  // Also individual Chinese chars for single-char coverage
  for (const c of chars) {
    tokens.add(c);
  }
  return tokens;
}

/**
 * Jaccard similarity between two token sets
 */
function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * 加载去重指纹库
 */
function loadDedupDB() {
  try {
    if (fs.existsSync(DEDUP_DB_PATH)) {
      return JSON.parse(fs.readFileSync(DEDUP_DB_PATH, 'utf8'));
    }
  } catch (e) {
    console.warn('[dedup] Failed to load DB, starting fresh:', e.message);
  }
  return {
    version: '1.0.0',
    lastUpdated: null,
    hashes: {},       // hash -> { id, source, addedAt }
    totalEntries: 0,
    totalDedups: 0
  };
}

/**
 * 保存去重指纹库
 */
function saveDedupDB(db) {
  db.lastUpdated = new Date().toISOString();
  fs.mkdirSync(path.dirname(DEDUP_DB_PATH), { recursive: true });
  fs.writeFileSync(DEDUP_DB_PATH, JSON.stringify(db, null, 2));
}

/**
 * 对一组 test cases 执行去重
 * 
 * @param {Array} newCases - 新生成的评测用例
 * @param {Object} options
 * @param {string} options.source - 来源标识 (e.g. 'cron-2026-03-07', 'adhoc-xxx')
 * @param {number} options.fuzzyThreshold - 模糊去重阈值 (default 0.85)
 * @param {boolean} options.persistFingerprints - 是否持久化指纹 (default true)
 * @param {Array} options.existingCases - 额外已有用例（用于 ad-hoc 与 cron 交叉去重）
 * @returns {{ unique: Array, duplicates: Array, stats: Object }}
 */
function dedup(newCases, options = {}) {
  const {
    source = 'unknown',
    fuzzyThreshold = 0.85,
    persistFingerprints = true,
    existingCases = []
  } = options;

  const db = loadDedupDB();
  const unique = [];
  const duplicates = [];
  const stats = {
    input: newCases.length,
    exactDups: 0,
    fuzzyDups: 0,
    unique: 0,
    source
  };

  // Build token cache for existing cases (for fuzzy matching)
  const existingTokenSets = [];
  for (const ec of existingCases) {
    existingTokenSets.push({
      id: ec.id,
      tokens: tokenize(extractCanonicalText(ec))
    });
  }

  // Also build token sets from already-accepted unique cases
  const acceptedTokenSets = [];

  for (const tc of newCases) {
    const hash = contentHash(tc);

    // Phase 1: Exact dedup via hash
    if (db.hashes[hash]) {
      stats.exactDups++;
      duplicates.push({
        ...tc,
        _dedup: {
          reason: 'exact_hash',
          matchedId: db.hashes[hash].id,
          matchedSource: db.hashes[hash].source,
          hash
        }
      });
      continue;
    }

    // Phase 2: Fuzzy dedup against existing cases
    const tcTokens = tokenize(extractCanonicalText(tc));
    let fuzzyMatch = null;

    // Check against existingCases (ad-hoc / prior cron runs)
    for (const et of existingTokenSets) {
      const sim = jaccardSimilarity(tcTokens, et.tokens);
      if (sim >= fuzzyThreshold) {
        fuzzyMatch = { id: et.id, similarity: sim, source: 'existing' };
        break;
      }
    }

    // Check against already-accepted cases in this batch
    if (!fuzzyMatch) {
      for (const at of acceptedTokenSets) {
        const sim = jaccardSimilarity(tcTokens, at.tokens);
        if (sim >= fuzzyThreshold) {
          fuzzyMatch = { id: at.id, similarity: sim, source: 'batch' };
          break;
        }
      }
    }

    if (fuzzyMatch) {
      stats.fuzzyDups++;
      duplicates.push({
        ...tc,
        _dedup: {
          reason: 'fuzzy_similar',
          matchedId: fuzzyMatch.id,
          similarity: fuzzyMatch.similarity,
          matchSource: fuzzyMatch.source,
          hash
        }
      });
      continue;
    }

    // Accepted as unique
    unique.push(tc);
    stats.unique++;

    // Register fingerprint
    db.hashes[hash] = {
      id: tc.id || `auto-${hash}`,
      source,
      addedAt: new Date().toISOString()
    };
    db.totalEntries++;

    // Add to accepted token sets for intra-batch dedup
    acceptedTokenSets.push({
      id: tc.id || `auto-${hash}`,
      tokens: tcTokens
    });
  }

  db.totalDedups += stats.exactDups + stats.fuzzyDups;

  if (persistFingerprints) {
    saveDedupDB(db);
  }

  return { unique, duplicates, stats };
}

/**
 * 从所有已有评测集中收集 test cases（用于交叉去重）
 */
function collectAllExistingCases(evalSetsDir) {
  const allCases = [];
  const baseDir = evalSetsDir || path.join(__dirname, '../../evaluation-sets');

  if (!fs.existsSync(baseDir)) return allCases;

  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const tcPath = path.join(baseDir, entry.name, 'test-cases.json');
    if (!fs.existsSync(tcPath)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(tcPath, 'utf8'));
      const cases = data.cases || data.testCases || [];
      for (const c of cases) {
        allCases.push({ ...c, _sourceSet: entry.name });
      }
    } catch (e) {
      // skip corrupt files
    }
  }

  // Also load unified eval sets
  const unifiedDir = path.join(__dirname, '../../unified-evaluation-sets');
  if (fs.existsSync(unifiedDir)) {
    for (const f of fs.readdirSync(unifiedDir)) {
      if (!f.endsWith('.json') || f === 'registry.json' || f === 'index.json') continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(unifiedDir, f), 'utf8'));
        for (const c of (data.testCases || data.cases || [])) {
          allCases.push({ ...c, _sourceSet: `unified/${f}` });
        }
      } catch (e) { /* skip */ }
    }
  }

  return allCases;
}

/**
 * 获取去重统计
 */
function getDedupStats() {
  const db = loadDedupDB();
  return {
    totalFingerprints: db.totalEntries,
    totalDeduped: db.totalDedups,
    lastUpdated: db.lastUpdated,
    version: db.version
  };
}

/**
 * 重置去重指纹库（危险操作，仅测试用）
 */
function resetDedupDB() {
  if (fs.existsSync(DEDUP_DB_PATH)) {
    fs.unlinkSync(DEDUP_DB_PATH);
  }
}

module.exports = {
  contentHash,
  extractCanonicalText,
  normalizeText,
  tokenize,
  jaccardSimilarity,
  dedup,
  collectAllExistingCases,
  getDedupStats,
  resetDedupDB,
  loadDedupDB,
  saveDedupDB,
  DEDUP_DB_PATH
};
