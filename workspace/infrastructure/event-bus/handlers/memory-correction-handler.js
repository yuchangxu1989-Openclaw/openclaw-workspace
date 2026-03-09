/**
 * memory-correction-handler.js
 * 用户纠偏 → 反查 MEMORY.md → 标记废弃旧记忆 → 写入新认知
 *
 * 事件: user.feedback.correction
 * 输入 payload: { newConcept: string, oldConcept: string, keywords: string[] }
 * 输出: { correctedCount: number, report: string }
 */

const fs = require('fs');
const path = require('path');

const MEMORY_PATH = path.resolve(__dirname, '../../../MEMORY.md');

/**
 * 在 MEMORY.md 中按关键词搜索相关段落
 * 返回包含任一关键词的段落（以空行分隔的文本块）
 */
function findRelatedParagraphs(content, keywords) {
  if (!keywords || keywords.length === 0) return [];

  // 按双换行切段落
  const paragraphs = content.split(/\n{2,}/);
  const results = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    // 跳过已废弃的段落
    if (para.includes('**[已废弃')) continue;

    const lowerPara = para.toLowerCase();
    const matched = keywords.some(kw => lowerPara.includes(kw.toLowerCase()));
    if (matched) {
      results.push({ index: i, text: para });
    }
  }

  return results;
}

/**
 * 判断段落是否与新认知矛盾
 * 简单策略：段落包含旧概念的关键词即视为潜在矛盾
 */
function isContradictory(paragraph, oldConcept, keywords) {
  if (!oldConcept) return false;
  const lowerPara = paragraph.toLowerCase();
  const lowerOld = oldConcept.toLowerCase();

  // 段落包含旧概念的核心描述
  if (lowerPara.includes(lowerOld)) return true;

  // 至少匹配2个关键词才视为相关+矛盾候选
  let matchCount = 0;
  for (const kw of keywords) {
    if (lowerPara.includes(kw.toLowerCase())) matchCount++;
  }
  return matchCount >= 2;
}

/**
 * 主处理函数
 */
async function handle(event, _context) {
  const { newConcept, oldConcept, keywords } = event.payload || {};

  if (!newConcept) {
    return { correctedCount: 0, report: '纠偏内容为空，跳过处理' };
  }

  // 读取 MEMORY.md
  let content = '';
  try {
    content = fs.readFileSync(MEMORY_PATH, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      // MEMORY.md 不存在，直接创建并写入新认知
      const newEntry = `\n## 纠偏记录 ${todayStr()}\n\n${newConcept}\n`;
      fs.writeFileSync(MEMORY_PATH, newEntry, 'utf-8');
      return { correctedCount: 0, report: 'MEMORY.md不存在，已创建并写入新认知' };
    }
    throw err;
  }

  // 反查相关段落
  const related = findRelatedParagraphs(content, keywords || []);

  // 识别矛盾段落
  const contradictions = related.filter(p => isContradictory(p.text, oldConcept, keywords || []));

  // 修正矛盾段落
  let correctedCount = 0;
  if (contradictions.length > 0) {
    const paragraphs = content.split(/\n{2,}/);
    const today = todayStr();

    for (const c of contradictions) {
      const deprecationMark = `\n**[已废弃 ${today}]** 被以下纠偏替代：${newConcept}`;
      paragraphs[c.index] = paragraphs[c.index] + deprecationMark;
      correctedCount++;
    }

    content = paragraphs.join('\n\n');
  }

  // 追加新认知
  const newEntry = `\n\n## 纠偏更新 ${todayStr()}\n\n${newConcept}\n`;
  content = content.trimEnd() + newEntry;

  // 写回
  fs.writeFileSync(MEMORY_PATH, content, 'utf-8');

  const report = `纠偏处理完成：反查到 ${related.length} 条相关记忆，其中 ${correctedCount} 条矛盾记忆已标记废弃，新认知已写入。`;

  console.log(`[memory-correction-handler] ${report}`);
  return { correctedCount, report };
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = { handle, findRelatedParagraphs, isContradictory };
