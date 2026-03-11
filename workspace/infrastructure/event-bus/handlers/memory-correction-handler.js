/**
 * memory-correction-handler.js
 * 用户纠偏 → 反查 MemOS → 标记废弃旧记忆 → 写入新认知
 * （MEMORY.md已废弃，MemOS为唯一记忆源）
 *
 * 事件: user.feedback.correction
 * 输入 payload: { newConcept: string, oldConcept: string, keywords: string[] }
 * 输出: { correctedCount: number, memosDeprecated: number, report: string }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MEMOS_DB_PATH = process.env.MEMOS_DB || '/root/.openclaw/memos-local/memos.db';

// better-sqlite3 从 MemOS 插件的 node_modules 加载
const BETTER_SQLITE3_PATH = '/root/.openclaw/extensions/memos-local-openclaw-plugin/node_modules/better-sqlite3';

/**
 * 获取 MemOS 数据库连接（写模式）
 */
function getMemosDb() {
  try {
    const Database = require(BETTER_SQLITE3_PATH);
    return Database(MEMOS_DB_PATH);
  } catch (err) {
    console.error('[memory-correction-handler] MemOS DB不可用:', err.message);
    return null;
  }
}

// ─── MEMORY.md操作已废弃，MemOS为唯一记忆源 ───

// ─── MemOS 操作（新增） ───

/**
 * 在 MemOS 中搜索与纠偏相关的 active chunks
 * 使用 FTS5 全文搜索 + 关键词匹配
 */
function searchMemosChunks(db, keywords, oldConcept) {
  if (!keywords || keywords.length === 0) return [];

  // 构建 FTS5 查询：用 OR 连接关键词
  const ftsTerms = keywords
    .map(kw => kw.replace(/['"]/g, '').trim())
    .filter(Boolean)
    .map(kw => `"${kw}"`)
    .join(' OR ');

  if (!ftsTerms) return [];

  try {
    const rows = db.prepare(`
      SELECT c.id, c.summary, c.content, c.role, c.session_key, c.created_at, c.dedup_status, rank
      FROM chunks_fts f
      JOIN chunks c ON c.rowid = f.rowid
      WHERE chunks_fts MATCH ?
        AND c.dedup_status = 'active'
      ORDER BY rank
      LIMIT 50
    `).all(ftsTerms);

    return rows;
  } catch (err) {
    console.error('[memory-correction-handler] MemOS FTS搜索失败:', err.message);
    return [];
  }
}

/**
 * 判断 MemOS chunk 是否与旧认知矛盾
 */
function isChunkContradictory(chunk, oldConcept, keywords) {
  if (!oldConcept) return false;
  const text = (chunk.summary + ' ' + chunk.content).toLowerCase();
  // 直接包含旧概念
  if (text.includes(oldConcept.toLowerCase())) return true;
  // 至少匹配2个关键词
  let matchCount = 0;
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) matchCount++;
  }
  return matchCount >= 2;
}

/**
 * 在 MemOS 中标记旧 chunks 为 deprecated，并插入新纠偏 chunk
 */
function correctMemosDb(db, newConcept, oldConcept, keywords) {
  const related = searchMemosChunks(db, keywords, oldConcept);
  const contradictions = related.filter(c => isChunkContradictory(c, oldConcept, keywords || []));

  const now = Date.now();
  const today = todayStr();
  const correctionId = crypto.randomUUID();

  // 开启事务
  const deprecateStmt = db.prepare(`
    UPDATE chunks
    SET dedup_status = 'deprecated',
        dedup_reason = ?,
        dedup_target = ?,
        updated_at = ?
    WHERE id = ? AND dedup_status = 'active'
  `);

  const insertStmt = db.prepare(`
    INSERT INTO chunks (id, session_key, turn_id, seq, role, content, kind, summary, created_at, updated_at, content_hash, dedup_status, owner)
    VALUES (?, 'correction', ?, 0, 'assistant', ?, 'correction', ?, ?, ?, ?, 'active', 'agent:main')
  `);

  const transaction = db.transaction(() => {
    let deprecatedCount = 0;
    const deprecatedIds = [];

    // 标记矛盾 chunks 为 deprecated
    for (const chunk of contradictions) {
      const reason = `用户纠偏[${today}]: "${oldConcept}" → "${newConcept}"`;
      const result = deprecateStmt.run(reason, correctionId, now, chunk.id);
      if (result.changes > 0) {
        deprecatedCount++;
        deprecatedIds.push(chunk.id);
      }
    }

    // 插入新纠偏 chunk
    const correctionContent = newConcept;
    const correctionSummary = `[纠偏${today}] ${oldConcept ? `"${oldConcept}"→` : ''}${newConcept}`.substring(0, 200);
    const contentHash = crypto.createHash('md5').update(correctionContent).digest('hex');

    insertStmt.run(
      correctionId,
      `correction-${today}-${correctionId.substring(0, 8)}`,
      correctionContent,
      correctionSummary,
      now,
      now,
      contentHash
    );

    return { deprecatedCount, deprecatedIds, correctionChunkId: correctionId };
  });

  return transaction();
}

// ─── 主处理函数 ───

async function handle(event, _context) {
  const { newConcept, oldConcept, keywords } = event.payload || {};

  if (!newConcept) {
    return { correctedCount: 0, memosDeprecated: 0, report: '纠偏内容为空，跳过处理' };
  }

  // MemOS 修正（唯一记忆源）
  let memosResult = { deprecatedCount: 0, deprecatedIds: [], correctionChunkId: null };
  const db = getMemosDb();
  if (db) {
    try {
      memosResult = correctMemosDb(db, newConcept, oldConcept, keywords);
      console.log(`[memory-correction-handler] MemOS: deprecated ${memosResult.deprecatedCount} chunks, new correction chunk: ${memosResult.correctionChunkId}`);
      if (memosResult.deprecatedIds.length > 0) {
        console.log(`[memory-correction-handler] Deprecated chunk IDs: ${memosResult.deprecatedIds.join(', ')}`);
      }
    } catch (err) {
      console.error('[memory-correction-handler] MemOS修正失败:', err.message);
    } finally {
      db.close();
    }
  }

  const report = `纠偏处理完成：MemOS ${memosResult.deprecatedCount} 条旧chunk已deprecated，新认知chunk已写入(${memosResult.correctionChunkId || 'N/A'})。`;

  console.log(`[memory-correction-handler] ${report}`);
  return {
    correctedCount: memosResult.deprecatedCount,
    memosDeprecated: memosResult.deprecatedCount,
    memosNewChunkId: memosResult.correctionChunkId,
    report,
  };
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = { handle, correctMemosDb, searchMemosChunks };
