/**
 * 语义嵌入模块（通过 llm-context 统一路由）
 * 替代直接HTTP调用智谱embedding API
 * 
 * 模型由 llm-context 自动路由
 */

const path = require('path');
const llmContext = require(path.join(__dirname, '../../../infrastructure/llm-context'));

// 配置（保留兼容接口）
const ZHIPU_CONFIG = {
  model: 'embedding-3',
  dimension: 2048,
  maxTokensPerRequest: 512,
  maxBatchSize: 16,
  retryCount: 3,
  retryDelayMs: 1000,
  timeoutMs: 30000
};

/**
 * 单条文本向量化
 * @param {string} text - 待向量化文本
 * @returns {Promise<number[]>} - 向量
 */
async function embedSingle(text) {
  const truncated = text.substring(0, ZHIPU_CONFIG.maxTokensPerRequest * 4);
  const result = await llmContext.embed(truncated, { timeout: ZHIPU_CONFIG.timeoutMs });
  return result.embedding;
}

/**
 * 批量文本向量化（带重试）
 * @param {string[]} texts - 文本数组
 * @returns {Promise<number[][]>} - 向量数组
 */
async function embedBatch(texts) {
  const results = [];
  
  for (let i = 0; i < texts.length; i += ZHIPU_CONFIG.maxBatchSize) {
    const batch = texts.slice(i, i + ZHIPU_CONFIG.maxBatchSize)
      .map(t => t.substring(0, ZHIPU_CONFIG.maxTokensPerRequest * 4));
    
    let lastError = null;
    for (let retry = 0; retry < ZHIPU_CONFIG.retryCount; retry++) {
      try {
        // Process each text individually through llm-context
        for (const t of batch) {
          const result = await llmContext.embed(t, { timeout: ZHIPU_CONFIG.timeoutMs });
          results.push(result.embedding);
        }
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        console.warn(`[Embedding] 批次 ${i}/${texts.length} 重试 ${retry + 1}/${ZHIPU_CONFIG.retryCount}: ${e.message}`);
        if (retry < ZHIPU_CONFIG.retryCount - 1) {
          await new Promise(r => setTimeout(r, ZHIPU_CONFIG.retryDelayMs * (retry + 1)));
        }
      }
    }
    
    if (lastError) {
      throw new Error(`[Embedding] 批次失败（已重试${ZHIPU_CONFIG.retryCount}次）: ${lastError.message}`);
    }

    if (i + ZHIPU_CONFIG.maxBatchSize < texts.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return results;
}

/**
 * 计算余弦相似度
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

module.exports = {
  embedSingle,
  embedBatch,
  cosineSimilarity,
  ZHIPU_CONFIG
};
