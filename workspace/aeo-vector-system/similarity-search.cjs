/** @format */
/**
 * AEO Similarity Search
 * 相似用例检索模块 - 基于向量相似度检索相关测试用例
 * 
 * Usage:
 *   node similarity-search.cjs --query "测试登录功能" --index ./case-index
 *   node similarity-search.cjs --case case_001 --index ./case-index
 */

const fs = require('fs');
const path = require('path');
const { VectorCore } = require('./vector-core.cjs');
const { CaseIndexer } = require('./case-indexer.cjs');

class SimilaritySearch {
  constructor(options = {}) {
    this.indexDir = options.indexDir || './case-index';
    this.indexer = new CaseIndexer({ indexDir: this.indexDir });
    this.resultsDir = options.resultsDir || './search-results';
    this.minSimilarity = options.minSimilarity || 0.3;
  }

  /**
   * 加载索引
   */
  load() {
    return this.indexer.loadIndex(this.indexDir);
  }

  /**
   * 文本相似度搜索
   */
  searchByText(query, options = {}) {
    const { k = 5, threshold = this.minSimilarity, metric = 'cosine' } = options;
    
    if (!this.indexer.indexed) {
      throw new Error('Index not loaded. Call load() first.');
    }

    const vectors = this.indexer.getAllVectors();
    const results = this.indexer.vectorCore.findTopK(query, vectors, k, metric);
    
    return results
      .filter(r => r.score >= threshold)
      .map(r => ({
        caseId: r.caseId,
        name: r.name,
        category: r.category,
        tags: r.tags,
        domain: r.domain,
        similarity: Math.round(r.score * 1000) / 1000,
        text: r.text?.substring(0, 200) + (r.text?.length > 200 ? '...' : '')
      }));
  }

  /**
   * 用例相似度搜索（找相似的用例）
   */
  searchByCase(caseId, options = {}) {
    const caseData = this.indexer.getCase(caseId);
    if (!caseData) {
      throw new Error(`Case not found: ${caseId}`);
    }

    const query = caseData.text;
    const results = this.searchByText(query, options);
    
    // 过滤掉自身
    return results.filter(r => r.caseId !== caseId);
  }

  /**
   * 批量搜索（多个查询）
   */
  searchBatch(queries, options = {}) {
    const results = [];
    for (const query of queries) {
      const queryText = typeof query === 'string' ? query : query.text;
      const searchResults = this.searchByText(queryText, options);
      results.push({
        query: queryText,
        results: searchResults
      });
    }
    return results;
  }

  /**
   * 基于分类的过滤搜索
   */
  searchWithFilter(query, filters, options = {}) {
    const { k = 10 } = options;
    const { category, domain, tags, excludeIds } = filters;
    
    let vectors = this.indexer.getAllVectors();
    
    // 应用过滤器
    if (category) {
      vectors = vectors.filter(v => v.category === category);
    }
    if (domain) {
      vectors = vectors.filter(v => v.domain === domain);
    }
    if (tags?.length) {
      vectors = vectors.filter(v =
        v.tags?.some(t => tags.includes(t))
      );
    }
    if (excludeIds?.length) {
      vectors = vectors.filter(v => !excludeIds.includes(v.caseId));
    }
    
    if (vectors.length === 0) {
      return [];
    }

    const results = this.indexer.vectorCore.findTopK(query, vectors, k, 'cosine');
    
    return results.map(r => ({
      caseId: r.caseId,
      name: r.name,
      category: r.category,
      tags: r.tags,
      domain: r.domain,
      similarity: Math.round(r.score * 1000) / 1000
    }));
  }

  /**
   * 推荐相关用例（基于一个用例推荐相似且互补的用例）
   */
  recommendCases(caseId, options = {}) {
    const { k = 3, diversity = 0.3 } = options;
    const caseData = this.indexer.getCase(caseId);
    
    if (!caseData) {
      throw new Error(`Case not found: ${caseId}`);
    }

    // 获取相似用例
    const similar = this.searchByCase(caseId, { k: k * 2 });
    
    // 获取同域但不同类别的用例（多样性）
    const vectors = this.indexer.getAllVectors();
    const sameDomain = vectors.filter(v => 
      v.domain === caseData.domain && 
      v.category !== caseData.category &&
      v.caseId !== caseId
    );
    
    const diverse = sameDomain.slice(0, Math.ceil(k * diversity)).map(v => ({
      caseId: v.caseId,
      name: v.name,
      category: v.category,
      tags: v.tags,
      domain: v.domain,
      similarity: null, // 多样性推荐，不计算相似度
      type: 'diverse'
    }));

    return {
      similar: similar.slice(0, k),
      diverse,
      combined: [...similar.slice(0, k), ...diverse]
    };
  }

  /**
   * 分析用例分布（聚类分析）
   */
  analyzeClusters() {
    const vectors = this.indexer.getAllVectors();
    const categories = {};
    const domains = {};
    const tagFreq = {};

    for (const v of vectors) {
      // 类别统计
      if (v.category) {
        categories[v.category] = (categories[v.category] || 0) + 1;
      }
      // 领域统计
      if (v.domain) {
        domains[v.domain] = (domains[v.domain] || 0) + 1;
      }
      // 标签频率
      for (const tag of (v.tags || [])) {
        tagFreq[tag] = (tagFreq[tag] || 0) + 1;
      }
    }

    return {
      totalCases: vectors.length,
      categories: Object.entries(categories)
        .sort((a, b) => b[1] - a[1]),
      domains: Object.entries(domains)
        .sort((a, b) => b[1] - a[1]),
      topTags: Object.entries(tagFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
    };
  }

  /**
   * 保存搜索结果
   */
  saveResults(searchId, results) {
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }

    const output = {
      searchId,
      timestamp: new Date().toISOString(),
      results
    };

    const filepath = path.join(this.resultsDir, `search-${searchId}.json`);
    fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
    return filepath;
  }
}

// CLI 支持
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // 解析参数
  const params = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    params[key] = args[i + 1];
  }

  if (!params.query && !params.case) {
    console.log(`
AEO Similarity Search - 相似用例检索工具

Usage:
  node similarity-search.cjs --query "搜索文本" --index ./case-index
  node similarity-search.cjs --case case_001 --index ./case-index
  node similarity-search.cjs --query "xxx" --category "unit" --index ./case-index

Options:
  --query <text>      搜索文本
  --case <id>         基于用例ID搜索相似用例
  --index <dir>       索引目录（默认: ./case-index）
  --k <n>             返回结果数量（默认: 5）
  --threshold <n>      最小相似度阈值（默认: 0.3）
  --category <cat>    按类别过滤
  --domain <dom>      按领域过滤
  --analyze           分析用例分布

Examples:
  node similarity-search.cjs --query "测试用户登录功能"
  node similarity-search.cjs --query "API性能测试" --k 10
  node similarity-search.cjs --case test_login_001
  node similarity-search.cjs --analyze --index ./case-index
`);
    process.exit(0);
  }

  const indexDir = params.index || './case-index';
  const k = parseInt(params.k) || 5;
  const threshold = parseFloat(params.threshold) || 0.3;

  (async () => {
    try {
      const searcher = new SimilaritySearch({ indexDir });
      searcher.load();

      if (params.analyze) {
        // 分析模式
        const analysis = searcher.analyzeClusters();
        console.log('\n📊 Case Distribution Analysis');
        console.log('═════════════════════════════');
        console.log(`Total Cases: ${analysis.totalCases}`);
        console.log('\nCategories:');
        analysis.categories.forEach(([cat, count]) => {
          console.log(`  ${cat}: ${count}`);
        });
        console.log('\nDomains:');
        analysis.domains.forEach(([dom, count]) => {
          console.log(`  ${dom}: ${count}`);
        });
        console.log('\nTop Tags:');
        analysis.topTags.slice(0, 10).forEach(([tag, count]) => {
          console.log(`  ${tag}: ${count}`);
        });
        process.exit(0);
      }

      let results;
      const filters = {};
      if (params.category) filters.category = params.category;
      if (params.domain) filters.domain = params.domain;

      if (params.case) {
        // 基于用例搜索
        console.log(`\n🔍 Searching similar cases to: ${params.case}`);
        results = searcher.searchByCase(params.case, { k, threshold });
      } else {
        // 基于文本搜索
        console.log(`\n🔍 Searching: "${params.query}"`);
        if (Object.keys(filters).length > 0) {
          results = searcher.searchWithFilter(params.query, filters, { k });
        } else {
          results = searcher.searchByText(params.query, { k, threshold });
        }
      }

      console.log(`\nFound ${results.length} similar cases:\n`);
      results.forEach((r, i) => {
        console.log(`${i + 1}. [${r.similarity}] ${r.name || r.caseId}`);
        console.log(`   Category: ${r.category || 'N/A'} | Domain: ${r.domain || 'N/A'}`);
        if (r.tags?.length) {
          console.log(`   Tags: ${r.tags.join(', ')}`);
        }
        console.log();
      });

      // 保存结果
      const searchId = `search_${Date.now()}`;
      const filepath = searcher.saveResults(searchId, results);
      console.log(`💾 Results saved to: ${filepath}`);

    } catch (err) {
      console.error('❌ Error:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { SimilaritySearch };
