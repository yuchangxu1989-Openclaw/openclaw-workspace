/** @format */
/**
 * AEO Case Indexer
 * 用例向量化模块 - 将评测用例转换为向量索引
 * 
 * Usage:
 *   node case-indexer.cjs <test-cases.json>
 *   node case-indexer.cjs --build-db ./test-cases/
 */

const fs = require('fs');
const path = require('path');
const { VectorCore } = require('./vector-core.cjs');

class CaseIndexer {
  constructor(options = {}) {
    this.vectorCore = new VectorCore();
    this.indexDir = options.indexDir || './case-index';
    this.cases = new Map();
    this.indexed = false;
  }

  /**
   * 从文件加载测试用例
   */
  loadCases(inputPath) {
    const cases = [];
    
    if (fs.statSync(inputPath).isDirectory()) {
      // 递归加载目录中的所有JSON文件
      const files = this._walkDir(inputPath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = JSON.parse(fs.readFileSync(file, 'utf-8'));
          const fileCases = Array.isArray(content) ? content : [content];
          cases.push(...fileCases.map(c => ({ ...c, sourceFile: file })));
        }
      }
    } else {
      const content = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
      cases.push(...(Array.isArray(content) ? content : [content]));
    }
    
    return cases;
  }

  _walkDir(dir) {
    const files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this._walkDir(fullPath));
      } else {
        files.push(fullPath);
      }
    }
    return files;
  }

  /**
   * 提取用例的文本表示（用于向量化）
   */
  extractCaseText(testCase) {
    const parts = [];
    
    // 基本字段
    if (testCase.name) parts.push(testCase.name);
    if (testCase.description) parts.push(testCase.description);
    if (testCase.summary) parts.push(testCase.summary);
    
    // 输入/输出
    if (testCase.input) {
      parts.push('输入: ' + (typeof testCase.input === 'string' 
        ? testCase.input 
        : JSON.stringify(testCase.input)));
    }
    if (testCase.output) {
      parts.push('期望输出: ' + (typeof testCase.output === 'string' 
        ? testCase.output 
        : JSON.stringify(testCase.output)));
    }
    if (testCase.expected) {
      parts.push('期望: ' + (typeof testCase.expected === 'string' 
        ? testCase.expected 
        : JSON.stringify(testCase.expected)));
    }
    
    // 标签和类别
    if (testCase.tags?.length) parts.push('标签: ' + testCase.tags.join(' '));
    if (testCase.category) parts.push('类别: ' + testCase.category);
    if (testCase.domain) parts.push('领域: ' + testCase.domain);
    
    // 断言/检查点
    if (testCase.assertions?.length) {
      for (const assertion of testCase.assertions) {
        const text = typeof assertion === 'string' 
          ? assertion 
          : (assertion.description || assertion.check || JSON.stringify(assertion));
        parts.push('断言: ' + text);
      }
    }
    
    // 前置/后置条件
    if (testCase.preconditions?.length) {
      parts.push('前置条件: ' + testCase.preconditions.join(' '));
    }
    
    return parts.join(' | ');
  }

  /**
   * 构建索引
   */
  async buildIndex(inputPath) {
    console.log(`[CaseIndexer] Loading test cases from: ${inputPath}`);
    
    const rawCases = this.loadCases(inputPath);
    console.log(`[CaseIndexer] Loaded ${rawCases.length} test cases`);
    
    if (rawCases.length === 0) {
      throw new Error('No test cases found');
    }

    // 构建词汇表
    const caseTexts = rawCases.map(c => this.extractCaseText(c));
    console.log(`[CaseIndexer] Building vocabulary...`);
    const vocabSize = this.vectorCore.buildVocabulary(caseTexts);
    console.log(`[CaseIndexer] Vocabulary size: ${vocabSize}`);

    // 向量化
    console.log(`[CaseIndexer] Vectorizing test cases...`);
    const vectors = this.vectorCore.vectorizeBatch(
      rawCases.map((c, i) => ({ 
        ...c, 
        text: caseTexts[i],
        caseId: c.id || c.caseId || `case_${i}`
      }))
    );

    // 存储
    for (const v of vectors) {
      this.cases.set(v.caseId, v);
    }
    
    this.indexed = true;
    console.log(`[CaseIndexer] Index built: ${this.cases.size} cases`);
    
    return {
      total: this.cases.size,
      vocabSize,
      cases: Array.from(this.cases.keys())
    };
  }

  /**
   * 保存索引到文件
   */
  saveIndex(outputDir) {
    if (!this.indexed) {
      throw new Error('No index built. Call buildIndex() first.');
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 保存词汇表
    const vocabData = {
      vocab: Array.from(this.vectorCore.vocab.entries()),
      idf: Array.from(this.vectorCore.idfCache.entries()),
      vocabSize: this.vectorCore.vocabSize
    };
    fs.writeFileSync(
      path.join(outputDir, 'vocab.json'),
      JSON.stringify(vocabData, null, 2)
    );

    // 保存用例向量
    const caseData = Array.from(this.cases.entries()).map(([id, data]) => ({
      caseId: id,
      vector: data.vector,
      text: data.text,
      name: data.name || data.summary,
      category: data.category,
      tags: data.tags,
      domain: data.domain,
      sourceFile: data.sourceFile
    }));
    fs.writeFileSync(
      path.join(outputDir, 'case-vectors.json'),
      JSON.stringify(caseData, null, 2)
    );

    // 保存元数据
    const meta = {
      createdAt: new Date().toISOString(),
      totalCases: this.cases.size,
      vocabSize: this.vectorCore.vocabSize,
      version: '1.0.0'
    };
    fs.writeFileSync(
      path.join(outputDir, 'meta.json'),
      JSON.stringify(meta, null, 2)
    );

    console.log(`[CaseIndexer] Index saved to: ${outputDir}`);
    console.log(`  - vocab.json: ${vocabData.vocab.length} terms`);
    console.log(`  - case-vectors.json: ${caseData.length} vectors`);
    console.log(`  - meta.json: index metadata`);
    
    return meta;
  }

  /**
   * 加载已有索引
   */
  loadIndex(indexDir) {
    // 加载词汇表
    const vocabPath = path.join(indexDir, 'vocab.json');
    if (!fs.existsSync(vocabPath)) {
      throw new Error(`Vocabulary not found: ${vocabPath}`);
    }
    const vocabData = JSON.parse(fs.readFileSync(vocabPath, 'utf-8'));
    this.vectorCore.vocab = new Map(vocabData.vocab);
    this.vectorCore.idfCache = new Map(vocabData.idf);
    this.vectorCore.vocabSize = vocabData.vocabSize;

    // 加载用例
    const casesPath = path.join(indexDir, 'case-vectors.json');
    const caseData = JSON.parse(fs.readFileSync(casesPath, 'utf-8'));
    this.cases.clear();
    for (const c of caseData) {
      this.cases.set(c.caseId, c);
    }

    this.indexed = true;
    console.log(`[CaseIndexer] Index loaded: ${this.cases.size} cases`);
    
    return {
      total: this.cases.size,
      vocabSize: this.vectorCore.vocabSize
    };
  }

  /**
   * 获取所有用例向量
   */
  getAllVectors() {
    return Array.from(this.cases.values());
  }

  /**
   * 根据ID获取用例
   */
  getCase(caseId) {
    return this.cases.get(caseId);
  }
}

// CLI 支持
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
AEO Case Indexer - 用例向量化工具

Usage:
  node case-indexer.cjs <input-path> [output-dir]

Arguments:
  input-path    JSON文件或包含JSON文件的目录
  output-dir    索引输出目录（默认: ./case-index）

Examples:
  node case-indexer.cjs ./test-cases.json
  node case-indexer.cjs ./test-cases/ ./my-index/
`);
    process.exit(0);
  }

  const inputPath = args[0];
  const outputDir = args[1] || './case-index';

  (async () => {
    try {
      const indexer = new CaseIndexer({ indexDir: outputDir });
      await indexer.buildIndex(inputPath);
      indexer.saveIndex(outputDir);
      console.log('\n✅ Indexing completed successfully!');
    } catch (err) {
      console.error('❌ Error:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { CaseIndexer };
