/**
 * memos-reader.js - MemOS共用读取模块
 *
 * 所有组件通过此模块读取MemOS记忆，MEMORY.md仅作fallback。
 * 使用sqlite3 CLI（与evolve.js一致），无需额外npm依赖。
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MEMOS_DB = path.join(os.homedir(), '.openclaw', 'memos-local', 'memos.db');
const SEP = '<<|>>';

function runQuery(sql, timeoutMs = 5000) {
  try {
    if (!fs.existsSync(MEMOS_DB)) return '';
    const escaped = sql.replace(/"/g, '\\"');
    return execSync(`sqlite3 -separator '${SEP}' "${MEMOS_DB}" "${escaped}"`, {
      timeout: timeoutMs, encoding: 'utf8', maxBuffer: 1024 * 512
    }).trim();
  } catch { return ''; }
}

// Sanitize column to strip newlines (same approach as evolve.js)
const san = (col) => `replace(replace(${col}, char(10), ' '), char(13), '')`;

function parseRows(raw, columns) {
  if (!raw) return [];
  return raw.split('\n').filter(l => l.includes(SEP)).map(line => {
    const parts = line.split(SEP);
    const obj = {};
    columns.forEach((col, i) => { obj[col] = (parts[i] || '').trim(); });
    return obj;
  });
}

/** 读取最近n条活跃chunk */
function readLatest(n = 30) {
  const sql = `SELECT ${san('role')}, ${san('summary')}, ${san('substr(content,1,500)')}, datetime(created_at/1000,'unixepoch','+8 hours') FROM chunks WHERE dedup_status='active' ORDER BY created_at DESC LIMIT ${parseInt(n)};`;
  return parseRows(runQuery(sql), ['role', 'summary', 'content', 'time']);
}

/** FTS5全文搜索 */
function searchFTS(query, limit = 15) {
  const escaped = query.replace(/'/g, "''");
  const sql = `SELECT ${san('c.role')}, ${san('c.summary')}, ${san('substr(c.content,1,500)')}, datetime(c.created_at/1000,'unixepoch','+8 hours') FROM chunks_fts f JOIN chunks c ON c.rowid=f.rowid WHERE chunks_fts MATCH '${escaped}' AND c.dedup_status='active' ORDER BY rank LIMIT ${parseInt(limit)};`;
  return parseRows(runQuery(sql), ['role', 'summary', 'content', 'time']);
}

/** 按类型读取 */
function readByKind(kind, limit = 30) {
  const escaped = kind.replace(/'/g, "''");
  const sql = `SELECT ${san('role')}, ${san('summary')}, ${san('substr(content,1,500)')}, datetime(created_at/1000,'unixepoch','+8 hours') FROM chunks WHERE kind='${escaped}' AND dedup_status='active' ORDER BY created_at DESC LIMIT ${parseInt(limit)};`;
  return parseRows(runQuery(sql), ['role', 'summary', 'content', 'time']);
}

/** 获取统计信息 */
function getStats() {
  const countRaw = runQuery(`SELECT COUNT(*) FROM chunks WHERE dedup_status='active';`);
  const latestRaw = runQuery(`SELECT datetime(MAX(created_at)/1000,'unixepoch','+8 hours') FROM chunks WHERE dedup_status='active';`);
  return {
    activeChunks: parseInt(countRaw) || 0,
    latestTime: latestRaw || null
  };
}

/** MemOS是否可用且有数据 */
function isAvailable() {
  try {
    if (!fs.existsSync(MEMOS_DB)) return false;
    const count = parseInt(runQuery(`SELECT COUNT(*) FROM chunks WHERE dedup_status='active';`));
    return count > 0;
  } catch { return false; }
}

/** 格式化为可读文本（兼容原MEMORY.md使用场景） */
function readAsText(n = 30) {
  const rows = readLatest(n);
  if (!rows.length) return null;
  const stats = getStats();
  const lines = rows.map(r => {
    const display = r.summary || (r.content || '').slice(0, 120);
    return `  [${r.time}] ${r.role}: ${display}`;
  });
  return `[MemOS对话记忆 - 共${stats.activeChunks}条活跃记忆]\n${lines.join('\n')}`;
}

module.exports = { readLatest, searchFTS, readByKind, getStats, isAvailable, readAsText, MEMOS_DB };
