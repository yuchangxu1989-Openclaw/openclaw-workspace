/**
 * CRAS-C 知识治理系统 - 向量化模块（真实语义嵌入版）
 * 
 * 核心变更：MD5哈希伪向量 → 智谱 embedding-3 真实语义向量
 * 维度：384 → 1024（embedding-3 标准输出）
 * 相似度：Math.random() → 余弦相似度
 */

const fs = require('fs');
const path = require('path');
const { SKILLS_DIR } = require('../../_shared/paths');
const { embedSingle, embedBatch, cosineSimilarity, ZHIPU_CONFIG } = require('./zhipu-embedding');

// 优化配置
const OPTIMIZED_CONFIG = {
  vectorization: {
    globalTimeoutMs: 600000,       // 10分钟全局超时
    batchSize: 16,                 // 对齐embedding API批量上限
    maxConcurrency: 2,             // 降低并发（API限流友好）
    progressIntervalMs: 2000,
    checkpointInterval: 50,
    maxContentLength: 2000,        // embedding-3 token上限约512，~2000字符
    enablePartialResult: true,
    skipFailedDocs: true,
    vectorDimension: ZHIPU_CONFIG.dimension  // 1024
  }
};

class OptimizedVectorizationEngine {
  constructor(config = {}) {
    this.config = { ...OPTIMIZED_CONFIG.vectorization, ...config };
    this.vectorDB = new Map();
    this.index = new Map();
    this.stats = {
      processed: 0,
      failed: 0,
      skipped: 0,
      apiCalls: 0,
      startTime: null,
      lastCheckpoint: null
    };
    this.timeoutHandle = null;
    this.isCancelled = false;
  }

  /**
   * 带超时控制的向量化主流程
   */
  async vectorizeWithTimeout(entries, options = {}) {
    const timeoutMs = options.timeoutMs || this.config.globalTimeoutMs;
    
    return new Promise(async (resolve, reject) => {
      this.timeoutHandle = setTimeout(() => {
        this.isCancelled = true;
        const partialResults = this.getPartialResults();
        console.warn(`[CRAS-C] 超时警告: 已达到${timeoutMs}ms限制，返回部分结果`);
        resolve({ status: 'timeout', stats: this.stats, partialResults, vectorCount: this.vectorDB.size });
      }, timeoutMs);

      try {
        const result = await this.vectorizeContent(entries, options);
        clearTimeout(this.timeoutHandle);
        resolve({ status: 'success', ...result });
      } catch (error) {
        clearTimeout(this.timeoutHandle);
        if (this.config.enablePartialResult) {
          resolve({ status: 'partial_error', message: error.message, stats: this.stats, partialResults: this.getPartialResults(), vectorCount: this.vectorDB.size });
        } else {
          reject(error);
        }
      }
    });
  }

  /**
   * 向量化处理（真实语义嵌入）
   */
  async vectorizeContent(entries, options = {}) {
    const config = { ...this.config, ...options };
    const total = entries.length;
    
    if (total === 0) return { processed: 0, vectors: 0, duration: 0 };

    this.stats.startTime = Date.now();
    this.stats.processed = 0;
    this.stats.failed = 0;
    this.stats.skipped = 0;
    this.stats.apiCalls = 0;

    console.log(`[CRAS-C] 启动向量化 (embedding-3): ${total}个文档`);
    console.log(`  模型: ${ZHIPU_CONFIG.model}, 维度: ${ZHIPU_CONFIG.dimension}`);
    console.log(`  配置: 批大小=${config.batchSize}, 并发=${config.maxConcurrency}`);

    // 预过滤
    const validEntries = await this.prefilterEntries(entries);
    console.log(`  预过滤: ${validEntries.length}/${total} 个有效文档`);

    // 分批处理
    const batches = this.createBatches(validEntries, config.batchSize);
    console.log(`  分批: ${batches.length} 批次`);

    // 顺序处理批次（API限流友好）
    for (let i = 0; i < batches.length; i++) {
      if (this.isCancelled) {
        console.log('[CRAS-C] 处理被取消');
        break;
      }

      try {
        await this.processBatchWithEmbedding(batches[i], i, config);
      } catch (e) {
        console.error(`[CRAS-C] 批次 ${i} 错误: ${e.message}`);
        if (!config.skipFailedDocs) throw e;
      }

      this.reportProgress(i + 1, batches.length, total);

      // 检查点保存
      if (this.stats.processed % config.checkpointInterval === 0) {
        await this.saveCheckpoint();
      }
    }

    const duration = Date.now() - this.stats.startTime;
    console.log(`[CRAS-C] ✓ 向量化完成: ${this.vectorDB.size}个向量, API调用${this.stats.apiCalls}次, 耗时${(duration/1000).toFixed(1)}s`);

    return {
      processed: this.stats.processed,
      failed: this.stats.failed,
      skipped: this.stats.skipped,
      vectors: this.vectorDB.size,
      apiCalls: this.stats.apiCalls,
      duration
    };
  }

  /**
   * 预过滤
   */
  async prefilterEntries(entries) {
    const valid = [];
    for (const [key, value] of entries) {
      try {
        const filePath = path.join(SKILLS_DIR, 'cras/knowledge', key);
        const stats = fs.statSync(filePath);
        if (stats.size > 10 * 1024 * 1024) {
          console.log(`  跳过过大文件: ${key} (${(stats.size/1024/1024).toFixed(1)}MB)`);
          this.stats.skipped++;
          continue;
        }
        valid.push([key, value]);
      } catch (e) {
        this.stats.skipped++;
      }
    }
    return valid;
  }

  createBatches(entries, batchSize) {
    const batches = [];
    for (let i = 0; i < entries.length; i += batchSize) {
      batches.push(entries.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 批量处理 — 调用真实 embedding API
   */
  async processBatchWithEmbedding(batch, batchIndex, config) {
    // 1. 读取所有文档内容
    const texts = [];
    const keys = [];
    const metadatas = [];

    for (const [key, value] of batch) {
      if (this.isCancelled) return;
      if (this.vectorDB.has(key)) {
        this.stats.processed++;
        continue;
      }

      try {
        const filePath = path.join(SKILLS_DIR, 'cras/knowledge', key);
        let content = '';
        const stats = fs.statSync(filePath);
        
        if (stats.size > 100000) {
          // 大文件：只读前 maxContentLength 字符
          const fd = fs.openSync(filePath, 'r');
          const buffer = Buffer.alloc(Math.min(stats.size, config.maxContentLength));
          fs.readSync(fd, buffer, 0, buffer.length, 0);
          fs.closeSync(fd);
          content = buffer.toString('utf-8');
        } else {
          const raw = fs.readFileSync(filePath, 'utf-8');
          try {
            const data = JSON.parse(raw);
            content = JSON.stringify(data).substring(0, config.maxContentLength);
          } catch {
            content = raw.substring(0, config.maxContentLength);
          }
        }

        if (content.trim().length === 0) {
          this.stats.skipped++;
          continue;
        }

        texts.push(content);
        keys.push(key);
        metadatas.push(value);
      } catch (e) {
        this.stats.failed++;
      }
    }

    if (texts.length === 0) return;

    // 2. 批量调用 embedding-3 API
    try {
      const vectors = await embedBatch(texts);
      this.stats.apiCalls++;

      // 3. 存入向量数据库
      for (let i = 0; i < vectors.length; i++) {
        this.vectorDB.set(keys[i], {
          embedding: vectors[i],
          metadata: metadatas[i],
          content: texts[i].substring(0, 200),
          processedAt: Date.now()
        });
        this.stats.processed++;
      }
    } catch (e) {
      console.error(`[CRAS-C] embedding API 调用失败: ${e.message}`);
      // 降级：逐条处理，隔离失败
      for (let i = 0; i < texts.length; i++) {
        try {
          const vector = await embedSingle(texts[i]);
          this.stats.apiCalls++;
          this.vectorDB.set(keys[i], {
            embedding: vector,
            metadata: metadatas[i],
            content: texts[i].substring(0, 200),
            processedAt: Date.now()
          });
          this.stats.processed++;
        } catch (e2) {
          console.error(`  文档 ${keys[i]} 向量化失败: ${e2.message}`);
          this.stats.failed++;
        }
      }
    }
  }

  reportProgress(currentBatch, totalBatches, totalDocs) {
    const elapsed = (Date.now() - this.stats.startTime) / 1000;
    const rate = this.stats.processed / elapsed;
    const percent = ((this.stats.processed / totalDocs) * 100).toFixed(1);
    console.log(
      `  进度: ${this.stats.processed}/${totalDocs} (${percent}%) | ` +
      `批次: ${currentBatch}/${totalBatches} | ` +
      `API调用: ${this.stats.apiCalls} | ` +
      `失败: ${this.stats.failed} | ` +
      `耗时: ${elapsed.toFixed(1)}s | ` +
      `速率: ${rate.toFixed(1)}doc/s`
    );
  }

  async saveCheckpoint() {
    this.stats.lastCheckpoint = Date.now();
  }

  getPartialResults() {
    return {
      vectorCount: this.vectorDB.size,
      processed: this.stats.processed,
      failed: this.stats.failed,
      apiCalls: this.stats.apiCalls,
      coverage: this.stats.processed > 0 ? 
        ((this.stats.processed - this.stats.failed) / this.stats.processed * 100).toFixed(1) + '%' : '0%'
    };
  }

  /**
   * 语义搜索（真实余弦相似度）
   */
  async search(query, topK = 10) {
    // 将查询文本向量化
    const queryVector = await embedSingle(query);
    this.stats.apiCalls++;
    
    const results = [];
    for (const [key, value] of this.vectorDB) {
      const similarity = cosineSimilarity(queryVector, value.embedding);
      results.push({ key, similarity, metadata: value.metadata, preview: value.content });
    }
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  }
}

module.exports = { OptimizedVectorizationEngine, OPTIMIZED_CONFIG };
