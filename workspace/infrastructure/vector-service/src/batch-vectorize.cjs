#!/usr/bin/env node
/**
 * 批量向量化脚本 - 智谱API版
 * 读取文件列表，调用智谱Embedding API，生成向量文件
 */

const fs = require('fs');
const path = require('path');
const { ZhipuVectorizer } = require('./zhipu-vectorizer.cjs');

const [,, fileList, outputDir] = process.argv;

if (!fileList || !outputDir) {
  console.error('用法: node batch-vectorize.cjs <file-list> <output-dir>');
  process.exit(1);
}

const vectorizer = new ZhipuVectorizer();

/**
 * 读取文件内容
 */
function readFileContent(filePath, fileType) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  switch (fileType) {
    case 'SKILL':
      // 提取SKILL.md的核心内容（前5000字符）
      return {
        text: content.substring(0, 5000),
        metadata: {
          type: 'skill',
          name: path.basename(path.dirname(filePath)),
          file: filePath,
          length: content.length
        }
      };
    
    case 'MEMORY':
      // 提取记忆文件核心内容
      return {
        text: content.substring(0, 4000),
        metadata: {
          type: 'memory',
          name: path.basename(filePath, '.md'),
          date: path.basename(filePath, '.md'),
          file: filePath,
          length: content.length
        }
      };
    
    case 'KNOWLEDGE':
      // 解析JSON并提取文本
      try {
        const json = JSON.parse(content);
        const text = extractTextFromJson(json);
        return {
          text: text.substring(0, 5000),
          metadata: {
            type: 'knowledge',
            name: path.basename(filePath, '.json'),
            file: filePath,
            keys: Object.keys(json).join(',')
          }
        };
      } catch (e) {
        return {
          text: content.substring(0, 3000),
          metadata: {
            type: 'knowledge',
            name: path.basename(filePath, '.json'),
            file: filePath,
            parse_error: true
          }
        };
      }
    
    case 'AEO':
      // 解析AEO评测用例
      try {
        const json = JSON.parse(content);
        const text = extractTextFromJson(json);
        return {
          text: text.substring(0, 5000),
          metadata: {
            type: 'aeo',
            name: path.basename(filePath, '.json'),
            file: filePath,
            category: json.category || 'unknown'
          }
        };
      } catch (e) {
        return {
          text: content.substring(0, 3000),
          metadata: {
            type: 'aeo',
            name: path.basename(filePath, '.json'),
            file: filePath,
            parse_error: true
          }
        };
      }
    
    default:
      return {
        text: content.substring(0, 3000),
        metadata: {
          type: 'unknown',
          file: filePath
        }
      };
  }
}

/**
 * 从JSON对象中提取文本
 */
function extractTextFromJson(obj, depth = 0) {
  if (depth > 5) return '';
  
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'number') return String(obj);
  if (typeof obj === 'boolean') return String(obj);
  if (obj === null) return '';
  
  if (Array.isArray(obj)) {
    return obj.map(item => extractTextFromJson(item, depth + 1)).join(' ');
  }
  
  if (typeof obj === 'object') {
    const texts = [];
    for (const [key, value] of Object.entries(obj)) {
      // 优先提取关键字段
      const priorityFields = ['name', 'title', 'description', 'content', 'text', 'summary', 'query', 'expectation'];
      if (priorityFields.includes(key.toLowerCase())) {
        texts.push(extractTextFromJson(value, depth + 1));
      } else {
        texts.push(`${key}: ${extractTextFromJson(value, depth + 1)}`);
      }
    }
    return texts.join(' ');
  }
  
  return '';
}

/**
 * 生成向量文件名
 */
function getVectorFileName(fileType, metadata) {
  switch (fileType) {
    case 'SKILL':
      return `skill-${metadata.name}.json`;
    case 'MEMORY':
      return `memory-${metadata.name}.json`;
    case 'KNOWLEDGE':
      return `knowledge-${metadata.name}.json`;
    case 'AEO':
      return `aeo-${metadata.name.replace(/\//g, '-')}.json`;
    default:
      return `unknown-${Date.now()}.json`;
  }
}

/**
 * 主函数
 */
async function main() {
  // 读取文件列表
  const lines = fs.readFileSync(fileList, 'utf-8').trim().split('\n');
  
  console.log(`[批量向量化] 共 ${lines.length} 个文件待处理`);
  
  // 收集所有文件内容
  const items = [];
  for (const line of lines) {
    const [fileType, ...pathParts] = line.split('|');
    const filePath = pathParts.join('|'); // 处理路径中可能包含|的情况
    
    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`[跳过] 文件不存在: ${filePath}`);
      continue;
    }
    
    const { text, metadata } = readFileContent(filePath, fileType);
    items.push({
      fileType,
      filePath,
      text,
      metadata
    });
  }
  
  if (items.length === 0) {
    console.log('[批量向量化] 没有有效文件需要处理');
    process.exit(0);
  }
  
  // 批量向量化
  console.log(`[批量向量化] 开始调用智谱API，批量大小: ${vectorizer.batchSize}`);
  
  const results = await vectorizer.vectorizeBatch(items);
  
  // 保存向量文件
  let successCount = 0;
  let failCount = 0;
  
  for (const result of results) {
    if (!result.vector) {
      console.error(`[失败] ${result.filePath}: ${result.error}`);
      failCount++;
      continue;
    }
    
    const fileName = getVectorFileName(result.fileType, result.metadata);
    const outputPath = path.join(outputDir, fileName);
    
    const vectorData = {
      source_type: result.fileType,
      source_path: result.filePath,
      vector: result.vector,
      dimension: result.dimension,
      model: result.model,
      metadata: result.metadata,
      vectorized_at: result.vectorized_at
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(vectorData, null, 2));
    console.log(`[成功] ${fileName}`);
    successCount++;
  }
  
  console.log(`[批量向量化] 完成: ${successCount}成功, ${failCount}失败`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[批量向量化] 错误:', err.message);
  process.exit(1);
});
