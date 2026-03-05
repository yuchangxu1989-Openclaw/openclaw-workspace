/**
 * 智谱 embedding-3 真实向量化模块
 * 替代 MD5 哈希伪向量，接入真实语义嵌入
 * 
 * 模型: embedding-3 (1024维)
 * API: https://open.bigmodel.cn/api/coding/paas/v4/embeddings
 */

const https = require('https');
const url = require('url');

// 智谱 embedding-3 配置
const ZHIPU_CONFIG = {
  apiUrl: 'https://open.bigmodel.cn/api/coding/paas/v4/embeddings',
  model: 'embedding-3',
  dimension: 2048,
  maxTokensPerRequest: 512,   // embedding-3 单条上限
  maxBatchSize: 16,            // 单次批量请求上限
  retryCount: 3,
  retryDelayMs: 1000,
  timeoutMs: 30000
};

/**
 * 获取智谱API Key（从环境变量读取）
 */
function getApiKey() {
  const ZhipuKeys = require('../../zhipu-keys/index.js');
  const key = ZhipuKeys.getKey('embedding');
  if (!key) {
    throw new Error('[ZhipuEmbedding] embedding key not found in openclaw.json');
  }
  return key;
}

/**
 * 发送HTTP请求（原生https，不依赖第三方库）
 */
function httpPost(apiUrl, body, apiKey, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(apiUrl);
    const postData = JSON.stringify(body);
    
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: timeoutMs
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`[ZhipuEmbedding] JSON解析失败: ${data.substring(0, 200)}`));
          }
        } else {
          reject(new Error(`[ZhipuEmbedding] HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`[ZhipuEmbedding] 请求超时 (${timeoutMs}ms)`));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 单条文本向量化
 * @param {string} text - 待向量化文本
 * @returns {Promise<number[]>} - 1024维向量
 */
async function embedSingle(text) {
  const apiKey = getApiKey();
  // 截断过长文本
  const truncated = text.substring(0, ZHIPU_CONFIG.maxTokensPerRequest * 4);
  
  const body = {
    model: ZHIPU_CONFIG.model,
    input: truncated
  };

  const response = await httpPost(ZHIPU_CONFIG.apiUrl, body, apiKey, ZHIPU_CONFIG.timeoutMs);
  
  if (!response.data || !response.data[0] || !response.data[0].embedding) {
    throw new Error(`[ZhipuEmbedding] 响应格式异常: ${JSON.stringify(response).substring(0, 200)}`);
  }

  return response.data[0].embedding;
}

/**
 * 批量文本向量化（带重试和限流）
 * @param {string[]} texts - 文本数组
 * @returns {Promise<number[][]>} - 向量数组
 */
async function embedBatch(texts) {
  const apiKey = getApiKey();
  const results = [];
  
  // 分批处理（每批最多16条）
  for (let i = 0; i < texts.length; i += ZHIPU_CONFIG.maxBatchSize) {
    const batch = texts.slice(i, i + ZHIPU_CONFIG.maxBatchSize)
      .map(t => t.substring(0, ZHIPU_CONFIG.maxTokensPerRequest * 4));
    
    let lastError = null;
    for (let retry = 0; retry < ZHIPU_CONFIG.retryCount; retry++) {
      try {
        const body = {
          model: ZHIPU_CONFIG.model,
          input: batch
        };

        const response = await httpPost(ZHIPU_CONFIG.apiUrl, body, apiKey, ZHIPU_CONFIG.timeoutMs);
        
        if (!response.data || !Array.isArray(response.data)) {
          throw new Error(`响应格式异常`);
        }

        // 按index排序确保顺序一致
        const sorted = response.data.sort((a, b) => a.index - b.index);
        for (const item of sorted) {
          results.push(item.embedding);
        }
        
        lastError = null;
        break; // 成功，跳出重试
      } catch (e) {
        lastError = e;
        console.warn(`[ZhipuEmbedding] 批次 ${i}/${texts.length} 重试 ${retry + 1}/${ZHIPU_CONFIG.retryCount}: ${e.message}`);
        if (retry < ZHIPU_CONFIG.retryCount - 1) {
          await new Promise(r => setTimeout(r, ZHIPU_CONFIG.retryDelayMs * (retry + 1)));
        }
      }
    }
    
    if (lastError) {
      throw new Error(`[ZhipuEmbedding] 批次失败（已重试${ZHIPU_CONFIG.retryCount}次）: ${lastError.message}`);
    }

    // 批间间隔，避免触发限流
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
