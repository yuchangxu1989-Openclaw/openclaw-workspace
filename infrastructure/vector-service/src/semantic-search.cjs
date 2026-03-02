#!/usr/bin/env node
/**
 * 语义搜索 - 智谱向量版
 * 基于1024维智谱Embedding向量的相似度搜索
 */

const fs = require('fs');
const path = require('path');
const { ZhipuVectorizer } = require('./zhipu-vectorizer.cjs');

const [,, query, topK = '5', typeFilter = 'all'] = process.argv;

const VECTOR_DIR = '/root/.openclaw/workspace/infrastructure/vector-service/vectors';

/**
 * 加载所有向量文件
 */
function loadVectors() {
  const vectors = [];
  const files = fs.readdirSync(VECTOR_DIR).filter(f => f.endsWith('.json') && f !== 'index-meta.json');
  
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(VECTOR_DIR, file), 'utf-8'));
      if (data.vector && Array.isArray(data.vector)) {
        vectors.push({
          file: file,
          type: data.source_type || 'unknown',
          name: data.metadata?.name || file.replace(/\.(json)$/, ''),
          source_path: data.source_path,
          vector: data.vector,
          metadata: data.metadata,
          vectorized_at: data.vectorized_at
        });
      }
    } catch (e) {
      // 跳过无效文件
    }
  }
  
  return vectors;
}

/**
 * 主函数
 */
async function main() {
  if (!query) {
    console.error('用法: node semantic-search.cjs <query> [topK] [typeFilter]');
    process.exit(1);
  }

  // 加载向量
  console.log('📂 加载向量索引...');
  const allVectors = loadVectors();
  
  // 类型过滤
  let filteredVectors = allVectors;
  if (typeFilter !== 'all') {
    filteredVectors = allVectors.filter(v => v.type.toLowerCase() === typeFilter.toLowerCase());
  }
  
  if (filteredVectors.length === 0) {
    console.log('⚠️  没有找到匹配的向量文件');
    process.exit(0);
  }
  
  console.log(`📊 已加载 ${filteredVectors.length} 个向量`);
  
  // 对查询进行向量化
  console.log('🔮 正在向量化查询...');
  const vectorizer = new ZhipuVectorizer();
  const queryResult = await vectorizer.vectorize(query, {
    type: 'query',
    query_text: query
  });
  
  if (!queryResult.vector) {
    console.error('❌ 查询向量化失败:', queryResult.error);
    process.exit(1);
  }
  
  // 计算相似度
  console.log('🔍 计算语义相似度...\n');
  const results = filteredVectors.map(item => ({
    ...item,
    score: vectorizer.cosineSimilarity(queryResult.vector, item.vector)
  }));
  
  // 排序并截取topK
  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, parseInt(topK));
  
  // 显示结果
  console.log('═══════════════════════════════════════════════════');
  console.log('                   搜索结果');
  console.log('═══════════════════════════════════════════════════');
  
  topResults.forEach((result, idx) => {
    const typeIcon = {
      'skill': '🔧',
      'memory': '📝',
      'knowledge': '📚',
      'aeo': '🧪'
    }[result.type] || '📄';
    
    const scorePercent = (result.score * 100).toFixed(1);
    const typeName = {
      'skill': '技能',
      'memory': '记忆',
      'knowledge': '知识',
      'aeo': '评测用例'
    }[result.type] || result.type;
    
    console.log(`\n${idx + 1}. ${typeIcon} [${typeName}] ${result.name}`);
    console.log(`   📈 相似度: ${scorePercent}%`);
    console.log(`   📁 文件: ${result.source_path || result.file}`);
    if (result.metadata?.keys) {
      console.log(`   🔑 关键字段: ${result.metadata.keys.substring(0, 50)}...`);
    }
  });
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`✅ 找到 ${topResults.length} 个相关结果`);
  console.log(`🤖 使用模型: embedding-3 (1024维)`);
}

main().catch(err => {
  console.error('搜索错误:', err.message);
  process.exit(1);
});
