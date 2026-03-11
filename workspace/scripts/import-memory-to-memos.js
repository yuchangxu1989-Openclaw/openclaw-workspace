#!/usr/bin/env node
/**
 * import-memory-to-memos.js
 * 将 MEMORY.md 和 memory/*.md 中的静态知识导入 memos.db
 * 按 ## 标题拆分为 chunks，content_hash 去重
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// better-sqlite3 在 memos 插件目录
const Database = require('/root/.openclaw/extensions/memos-local-openclaw-plugin/node_modules/better-sqlite3');

const DB_PATH = '/root/.openclaw/memos-local/memos.db';
const WORKSPACE = '/root/.openclaw/workspace';
const MEMORY_MD = path.join(WORKSPACE, 'MEMORY.md');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');

// 生成与 memos 一致的短 hash（取前16位hex）
function contentHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function generateId() {
  return crypto.randomUUID();
}

/**
 * 按 ## 标题拆分 markdown 为 sections
 * 返回 [{ title, content }]
 */
function splitByH2(markdown) {
  const sections = [];
  const lines = markdown.split('\n');
  let currentTitle = null;
  let currentLines = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      // 保存上一个 section
      if (currentTitle !== null && currentLines.length > 0) {
        sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
      }
      currentTitle = line.replace(/^## /, '').trim();
      currentLines = [line];
    } else {
      if (currentTitle !== null) {
        currentLines.push(line);
      }
      // 忽略 ## 之前的内容（如果有的话，也收集）
    }
  }
  // 最后一个 section
  if (currentTitle !== null && currentLines.length > 0) {
    sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
  }

  return sections;
}

/**
 * 对整个文件不按标题拆分，作为单个 chunk（用于没有 ## 的文件）
 */
function asWholeChunk(filePath, text) {
  const name = path.basename(filePath, '.md');
  return [{ title: name, content: text.trim() }];
}

function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const now = Date.now();
  const sessionKey = 'static-knowledge-import';
  const turnId = `import-${now}`;

  // 查重用
  const findByHash = db.prepare('SELECT id FROM chunks WHERE content_hash = ?');
  const insert = db.prepare(`
    INSERT INTO chunks (id, session_key, turn_id, seq, role, content, kind, summary, created_at, updated_at, content_hash, dedup_status, owner, source, merge_history)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'agent:main', ?, '[]')
  `);

  let imported = 0;
  let skipped = 0;
  let seq = 0;

  function importSections(sections, sourceLabel) {
    for (const section of sections) {
      if (!section.content || section.content.length < 10) continue; // 跳过空/极短

      const hash = contentHash(section.content);
      const existing = findByHash.get(hash);
      if (existing) {
        skipped++;
        continue;
      }

      const id = generateId();
      // summary 取标题前80字符
      const summary = section.title.slice(0, 80);

      insert.run(id, sessionKey, turnId, seq++, 'system', section.content, 'static-knowledge', summary, now, now, hash, sourceLabel);
      imported++;
    }
  }

  // 1. 导入 MEMORY.md
  if (fs.existsSync(MEMORY_MD)) {
    const text = fs.readFileSync(MEMORY_MD, 'utf-8');
    const sections = splitByH2(text);
    console.log(`[MEMORY.md] 拆分为 ${sections.length} 个 sections`);
    importSections(sections, 'MEMORY.md');
  } else {
    console.log('[MEMORY.md] 文件不存在，跳过');
  }

  // 2. 导入 memory/*.md
  if (fs.existsSync(MEMORY_DIR)) {
    const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md')).sort();
    for (const file of files) {
      const filePath = path.join(MEMORY_DIR, file);
      const text = fs.readFileSync(filePath, 'utf-8');
      if (text.trim().length < 10) continue;

      const sections = splitByH2(text);
      if (sections.length > 0) {
        console.log(`[memory/${file}] 拆分为 ${sections.length} 个 sections`);
        importSections(sections, `memory/${file}`);
      } else {
        // 没有 ## 标题，整个文件作为一个 chunk
        const chunks = asWholeChunk(filePath, text);
        console.log(`[memory/${file}] 无##标题，作为整体导入`);
        importSections(chunks, `memory/${file}`);
      }
    }
  }

  db.close();

  console.log(`\n===== 导入完成 =====`);
  console.log(`导入: ${imported} chunks`);
  console.log(`跳过(已存在): ${skipped} chunks`);
  console.log(`总计处理: ${imported + skipped} chunks`);
}

main();
