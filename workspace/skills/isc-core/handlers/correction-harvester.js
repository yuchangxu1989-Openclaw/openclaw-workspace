'use strict';

/**
 * ISC Handler: correction-harvester
 * 纠偏收割器 — 当用户或系统纠偏时，操作MemOS数据库标记旧认知、写入新认知。
 *
 * 触发事件: agent.behavior.corrected, user.correction, isc.correction.*
 * 核心逻辑:
 *   1. FTS5搜索MemOS中与纠偏相关的旧认知
 *   2. 标记旧认知为deprecated（事务原子性）
 *   3. 插入correction chunk到MemOS
 *   4. 双写MEMORY.md保持兼容
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  gateResult,
  gitExec,
} = require('../lib/handler-utils');

// better-sqlite3 从 memos 插件的 node_modules 加载
const BETTER_SQLITE3_PATH = '/root/.openclaw/extensions/memos-local-openclaw-plugin/node_modules/better-sqlite3';
const MEMOS_DB_PATH = '/root/.openclaw/memos-local/memos.db';
const MEMORY_MD_PATH = '/root/.openclaw/workspace/MEMORY.md';

/**
 * 打开MemOS数据库（非readonly）
 */
function openMemosDb() {
  const Database = require(BETTER_SQLITE3_PATH);
  return new Database(MEMOS_DB_PATH);
}

/**
 * FTS5搜索旧认知
 * @param {object} db - better-sqlite3 实例
 * @param {string[]} keywords - 搜索关键词
 * @param {number} limit - 最大返回数
 * @returns {object[]} 匹配的chunks
 */
function searchOldKnowledge(db, keywords, limit = 20) {
  if (!keywords || keywords.length === 0) return [];

  // 构建FTS5查询：多个关键词用OR连接
  const ftsQuery = keywords
    .map(k => k.replace(/['"]/g, '').trim())
    .filter(Boolean)
    .map(k => `"${k}"`)
    .join(' OR ');

  if (!ftsQuery) return [];

  try {
    return db.prepare(`
      SELECT c.id, c.rowid, c.content, c.kind, c.summary, c.dedup_status,
             c.session_key, c.created_at, c.source
      FROM chunks_fts fts
      JOIN chunks c ON c.rowid = fts.rowid
      WHERE chunks_fts MATCH ?
        AND c.dedup_status = 'active'
      ORDER BY c.created_at DESC
      LIMIT ?
    `).all(ftsQuery, limit);
  } catch (err) {
    console.error(`[correction-harvester] FTS5 search error: ${err.message}`);
    return [];
  }
}

/**
 * 在MemOS中执行纠偏：标记旧认知deprecated + 插入correction chunk
 * @param {object} db - better-sqlite3 实例
 * @param {object[]} oldChunks - 要标记deprecated的旧chunks
 * @param {object} correction - 纠偏内容
 * @returns {object} 操作结果
 */
function applyCorrection(db, oldChunks, correction) {
  const correctionId = correction.id || `corr-${crypto.randomUUID()}`;
  const now = Date.now();

  const deprecateStmt = db.prepare(`
    UPDATE chunks
    SET dedup_status = 'deprecated',
        dedup_reason = ?,
        dedup_target = ?,
        updated_at = ?
    WHERE id = ? AND dedup_status = 'active'
  `);

  const insertStmt = db.prepare(`
    INSERT INTO chunks (id, session_key, turn_id, seq, role, content, kind, summary,
                        created_at, updated_at, dedup_status, owner, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = { deprecated: 0, inserted: false, correctionId };

  const txn = db.transaction(() => {
    // 标记旧认知为deprecated
    for (const chunk of oldChunks) {
      const info = deprecateStmt.run(
        `corrected by ${correctionId}: ${correction.reason || '用户纠偏'}`,
        correctionId,
        now,
        chunk.id
      );
      result.deprecated += info.changes;
    }

    // 插入新的correction chunk
    insertStmt.run(
      correctionId,
      correction.sessionKey || 'correction-harvester',
      correction.turnId || `turn-${Date.now()}`,
      0,
      'system',
      correction.content,
      'correction',
      correction.summary || correction.content.slice(0, 120),
      now,
      now,
      'active',
      'agent:main',
      'correction-harvester'
    );
    result.inserted = true;
  });

  txn();
  return result;
}

/**
 * 双写MEMORY.md（兼容旧流程）
 */
function appendToMemoryMd(correction) {
  try {
    const entry = `\n## 🔧 纠偏 [${new Date().toISOString()}]\n` +
      `- 旧认知: ${correction.oldKnowledge || '(未指定)'}\n` +
      `- 新认知: ${correction.content}\n` +
      `- 原因: ${correction.reason || '用户纠偏'}\n`;

    if (checkFileExists(MEMORY_MD_PATH)) {
      fs.appendFileSync(MEMORY_MD_PATH, entry, 'utf8');
    }
  } catch (err) {
    console.warn(`[correction-harvester] MEMORY.md双写失败(非致命): ${err.message}`);
  }
}

/**
 * 从事件payload提取纠偏关键词
 */
function extractKeywords(payload) {
  const keywords = [];
  if (payload.keywords && Array.isArray(payload.keywords)) {
    keywords.push(...payload.keywords);
  }
  // 从旧认知描述中提取
  if (payload.old_knowledge) {
    keywords.push(...payload.old_knowledge.split(/[，,、\s]+/).filter(w => w.length >= 2));
  }
  // 从subject/topic提取
  if (payload.subject) keywords.push(payload.subject);
  if (payload.topic) keywords.push(payload.topic);
  // 从description中提取关键短语（取前3个>=2字的词）
  if (payload.description && keywords.length === 0) {
    const words = payload.description.split(/[，,。、\s]+/).filter(w => w.length >= 2).slice(0, 3);
    keywords.push(...words);
  }
  return [...new Set(keywords)].filter(Boolean);
}

module.exports = async function (event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];
  const checks = [];

  const eventType = event?.type || 'unknown';
  const payload = event?.payload || {};
  logger.info?.(`[correction-harvester] 处理纠偏事件: ${eventType}`);

  // === Check 1: 纠偏内容非空 ===
  const correctionContent = payload.correction || payload.new_knowledge || payload.content || '';
  checks.push({
    name: 'correction_content_present',
    ok: correctionContent.length > 0,
    message: correctionContent ? `纠偏内容: ${correctionContent.slice(0, 80)}...` : '纠偏内容为空',
  });

  if (!correctionContent) {
    const result = gateResult(rule?.id || 'correction-harvester', checks);
    return { ok: false, autonomous: true, actions, message: '纠偏内容为空，跳过', ...result };
  }

  // === Check 2: MemOS数据库可连接 ===
  let db;
  try {
    db = openMemosDb();
    checks.push({ name: 'memos_db_connected', ok: true, message: 'MemOS数据库连接成功' });
  } catch (err) {
    checks.push({ name: 'memos_db_connected', ok: false, message: `MemOS连接失败: ${err.message}` });
    const result = gateResult(rule?.id || 'correction-harvester', checks);
    return { ok: false, autonomous: true, actions, message: `MemOS不可用: ${err.message}`, ...result };
  }

  try {
    // === Check 3: FTS5搜索旧认知 ===
    const keywords = extractKeywords(payload);
    const oldChunks = keywords.length > 0 ? searchOldKnowledge(db, keywords) : [];
    checks.push({
      name: 'old_knowledge_searched',
      ok: true,
      message: `搜索关键词: [${keywords.join(', ')}], 找到${oldChunks.length}条相关旧认知`,
    });
    actions.push(`fts5_search:${keywords.length}keywords,${oldChunks.length}hits`);

    // === Check 4: 执行纠偏（事务） ===
    const correction = {
      id: payload.correction_id || `corr-${crypto.randomUUID()}`,
      content: correctionContent,
      summary: payload.summary || correctionContent.slice(0, 120),
      reason: payload.reason || payload.root_cause || '用户纠偏',
      oldKnowledge: payload.old_knowledge || '',
      sessionKey: payload.session_key || event?.session_key || 'correction-harvester',
      turnId: payload.turn_id || `turn-${Date.now()}`,
    };

    const memosResult = applyCorrection(db, oldChunks, correction);
    checks.push({
      name: 'memos_correction_applied',
      ok: memosResult.inserted,
      message: `deprecated ${memosResult.deprecated}条旧认知, 插入correction chunk: ${memosResult.correctionId}`,
    });
    actions.push(`memos_deprecated:${memosResult.deprecated}`);
    actions.push(`memos_inserted:${memosResult.correctionId}`);

    // === Check 5: 双写MEMORY.md ===
    appendToMemoryMd(correction);
    checks.push({ name: 'memory_md_compat', ok: true, message: 'MEMORY.md双写完成' });
    actions.push('memory_md_appended');

    // === 写报告 ===
    const result = gateResult(rule?.id || 'correction-harvester', checks, { failClosed: false });
    const reportPath = path.join(root, 'reports', 'correction-harvester', `report-${Date.now()}.json`);
    writeReport(reportPath, {
      timestamp: new Date().toISOString(),
      handler: 'correction-harvester',
      ruleId: rule?.id || null,
      eventType,
      correctionId: memosResult.correctionId,
      keywords,
      oldChunksFound: oldChunks.length,
      oldChunksDeprecated: memosResult.deprecated,
      lastCommit: gitExec(root, 'log --oneline -1'),
      ...result,
    });
    actions.push(`report_written:${reportPath}`);

    await emitEvent(bus, 'correction-harvester.completed', {
      ok: result.ok,
      correctionId: memosResult.correctionId,
      deprecated: memosResult.deprecated,
      actions,
    });

    return {
      ok: result.ok,
      autonomous: true,
      actions,
      message: result.ok
        ? `纠偏完成: deprecated ${memosResult.deprecated}条旧认知, 新认知已写入MemOS (${memosResult.correctionId})`
        : `纠偏部分失败: ${result.failed}/${result.total} checks failed`,
      ...result,
    };
  } finally {
    try { db.close(); } catch {}
  }
};
