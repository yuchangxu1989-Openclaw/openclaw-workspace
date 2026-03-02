/**
 * AEO Vector System Core
 * 向量系统核心 - 提供向量化和相似度计算基础能力
 */

class VectorCore {
  constructor() {
    this.vocab = new Map(); // 词汇表
    this.vocabSize = 0;
    this.idfCache = new Map(); // IDF缓存
  }

  /**
   * 中文分词（简单实现）
   */
  tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    // 清理文本
    const cleaned = text
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')
      .trim();
    
    // 英文单词分割
    const englishWords = cleaned.match(/[a-z]+/g) || [];
    
    // 中文逐字分割（简化版）
    const chineseChars = cleaned.match(/[\u4e00-\u9fa5]/g) || [];
    
    // 数字
    const numbers = cleaned.match(/\d+/g) || [];
    
    // 2-gram组合（中文）
    const bigrams = [];
    for (let i = 0; i < chineseChars.length - 1; i++) {
      bigrams.push(chineseChars[i] + chineseChars[i + 1]);
    }
    
    return [...englishWords, ...chineseChars, ...bigrams, ...numbers];
  }

  /**
   * 构建词汇表
   */
  buildVocabulary(documents) {
    this.vocab.clear();
    let idx = 0;
    
    for (const doc of documents) {
      const text = typeof doc === 'string' ? doc : doc.text || doc.content || JSON.stringify(doc);
      const tokens = this.tokenize(text);
      for (const token of [...new Set(tokens)]) {
        if (!this.vocab.has(token)) {
          this.vocab.set(token, idx++);
        }
      }
    }
    
    this.vocabSize = idx;
    this.computeIDF(documents);
    return this.vocabSize;
  }

  /**
   * 计算IDF
   */
  computeIDF(documents) {
    this.idfCache.clear();
    const docCount = documents.length;
    
    for (const [term] of this.vocab) {
      let docFreq = 0;
      for (const doc of documents) {
        const text = typeof doc === 'string' ? doc : doc.text || doc.content || JSON.stringify(doc);
        const tokens = this.tokenize(text);
        if (tokens.includes(term)) docFreq++;
      }
      // 平滑IDF
      this.idfCache.set(term, Math.log((docCount + 1) / (docFreq + 1)) + 1);
    }
  }

  /**
   * 将文本转换为TF-IDF向量
   */
  vectorize(text) {
    const tokens = this.tokenize(text);
    const vector = new Array(this.vocabSize).fill(0);
    
    // 计算TF
    const tf = {};
    for (const token of tokens) {
      tf[token] = (tf[token] || 0) + 1;
    }
    
    // TF-IDF
    for (const [token, count] of Object.entries(tf)) {
      if (this.vocab.has(token)) {
        const idx = this.vocab.get(token);
        const idf = this.idfCache.get(token) || 1;
        vector[idx] = (count / tokens.length) * idf;
      }
    }
    
    // L2归一化
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }
    
    return vector;
  }

  /**
   * 批量向量化
   */
  vectorizeBatch(documents) {
    return documents.map(doc => {
      const text = typeof doc === 'string' ? doc : doc.text || doc.content || JSON.stringify(doc);
      return {
        ...doc,
        vector: this.vectorize(text),
        text
      };
    });
  }

  /**
   * 余弦相似度
   */
  cosineSimilarity(v1, v2) {
    if (v1.length !== v2.length) return 0;
    let dot = 0;
    for (let i = 0; i < v1.length; i++) {
      dot += v1[i] * v2[i];
    }
    return dot; // 已归一化，直接返回点积
  }

  /**
   * 欧氏距离（归一化后）
   */
  euclideanDistance(v1, v2) {
    let sum = 0;
    for (let i = 0; i < v1.length; i++) {
      sum += Math.pow(v1[i] - v2[i], 2);
    }
    return Math.sqrt(sum);
  }

  /**
   * 找到最相似的K个
   */
  findTopK(query, vectors, k = 5, metric = 'cosine') {
    const queryVec = this.vectorize(query);
    
    const scores = vectors.map(item => {
      const score = metric === 'cosine' 
        ? this.cosineSimilarity(queryVec, item.vector)
        : 1 / (1 + this.euclideanDistance(queryVec, item.vector));
      return { ...item, score };
    });
    
    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

module.exports = { VectorCore };
