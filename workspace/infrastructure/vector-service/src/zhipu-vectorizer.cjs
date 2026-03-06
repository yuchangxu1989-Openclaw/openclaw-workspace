/**
 * 智谱Embedding向量化服务
 * 使用智谱API生成1024维向量，替代TF-IDF
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

class ZhipuVectorizer {
  constructor() {
    // 加载API密钥
    this.apiKey = this._loadApiKey();
    this.apiUrl = 'open.bigmodel.cn';
    this.embeddingModel = 'embedding-3';
    this.vectorDimension = 1024;
    this.batchSize = 5; // 智谱API限制批量数
    this.delayMs = 200; // API调用间隔
  }

  /**
   * 加载智谱API密钥
   * 优先从 zhipu-keys 模块读取，其次环境变量，最后从 openclaw.json
   */
  _loadApiKey() {
    // 优先使用 zhipu-keys 模块（统一真相源）
    try {
      const zhipuKeys = require('/root/.openclaw/workspace/skills/zhipu-keys/index.js');
      return zhipuKeys.getKey('embedding');
    } catch (e) {
      console.error('[zhipu-vectorizer] 无法从 zhipu-keys 模块加载:', e.message);
    }
    
    // 环境变量
    if (process.env.ZHIPU_API_KEY) {
      return process.env.ZHIPU_API_KEY;
    }
    
    // 直接从 openclaw.json 读取
    const configPath = '/root/.openclaw/openclaw.json';
    if (fs.existsSync(configPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return cfg?.models?.providers?.['zhipu-embedding']?.apiKey;
      } catch (e) {
        console.error('[zhipu-vectorizer] 解析 openclaw.json 失败:', e.message);
      }
    }
    
    return null;
  }

  /**
   * 生成JWT Token
   */
  _generateToken() {
    const [keyId, secret] = this.apiKey.split('.');
    const header = Buffer.from(JSON.stringify({
      alg: 'HS256',
      sign_type: 'SIGN'
    })).toString('base64url');
    
    const payload = Buffer.from(JSON.stringify({
      api_key: keyId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      timestamp: Math.floor(Date.now() / 1000)
    })).toString('base64url');
    
    const crypto = require('crypto');
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    
    return `${header}.${payload}.${signature}`;
  }

  /**
   * 调用智谱Embedding API
   */
  async _callEmbeddingAPI(texts) {
    return new Promise((resolve, reject) => {
      const token = this._generateToken();
      const postData = JSON.stringify({
        model: this.embeddingModel,
        input: texts
      });

      const options = {
        hostname: this.apiUrl,
        path: '/api/coding/paas/v4/embeddings',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.error) {
              reject(new Error(`API Error: ${response.error.message}`));
            } else {
              resolve(response.data.map(item => item.embedding));
            }
          } catch (e) {
            reject(new Error(`Parse Error: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  /**
   * 向量化单个文本
   */
  async vectorize(text, metadata = {}) {
    const vectors = await this._callEmbeddingAPI([text]);
    return {
      vector: vectors[0],
      dimension: this.vectorDimension,
      model: this.embeddingModel,
      text_length: text.length,
      ...metadata,
      vectorized_at: new Date().toISOString()
    };
  }

  /**
   * 批量向量化
   */
  async vectorizeBatch(items) {
    const results = [];
    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      const texts = batch.map(item => 
        typeof item === 'string' ? item : item.text || item.content || JSON.stringify(item)
      );
      
      try {
        const vectors = await this._callEmbeddingAPI(texts);
        vectors.forEach((vector, idx) => {
          results.push({
            ...batch[idx],
            vector,
            dimension: this.vectorDimension,
            model: this.embeddingModel,
            vectorized_at: new Date().toISOString()
          });
        });
      } catch (e) {
        console.error(`Batch ${i} failed:`, e.message);
        // 失败时返回空向量
        batch.forEach(item => {
          results.push({
            ...item,
            vector: null,
            error: e.message,
            vectorized_at: new Date().toISOString()
          });
        });
      }
      
      // API调用间隔
      if (i + this.batchSize < items.length) {
        await this._sleep(this.delayMs);
      }
    }
    return results;
  }

  /**
   * 计算余弦相似度
   */
  cosineSimilarity(v1, v2) {
    if (!v1 || !v2 || v1.length !== v2.length) return 0;
    let dot = 0, norm1 = 0, norm2 = 0;
    for (let i = 0; i < v1.length; i++) {
      dot += v1[i] * v2[i];
      norm1 += v1[i] * v1[i];
      norm2 += v2[i] * v2[i];
    }
    return dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 找到最相似的K个
   */
  findTopK(queryVector, candidates, k = 5) {
    const scores = candidates.map(item => ({
      ...item,
      score: this.cosineSimilarity(queryVector, item.vector)
    }));
    return scores.sort((a, b) => b.score - a.score).slice(0, k);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { ZhipuVectorizer };
