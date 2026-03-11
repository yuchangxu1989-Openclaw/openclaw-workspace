/**
 * Generate embeddings for static-import chunks that don't have embeddings yet.
 * Uses the same Xenova/all-MiniLM-L6-v2 model as the MemOS plugin.
 * Run from: /root/.openclaw/extensions/memos-local-openclaw-plugin/
 */
const Database = require('better-sqlite3');

const DB_PATH = '/root/.openclaw/memos-local/memos.db';

async function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Find chunks without embeddings
  const missing = db.prepare(`
    SELECT c.id, c.content, c.summary
    FROM chunks c
    LEFT JOIN embeddings e ON e.chunk_id = c.id
    WHERE c.source = 'static-import' AND e.chunk_id IS NULL
  `).all();

  console.log(`Found ${missing.length} chunks without embeddings`);
  if (missing.length === 0) {
    console.log('Nothing to do.');
    db.close();
    return;
  }

  // Load the same model as MemOS plugin
  console.log('Loading Xenova/all-MiniLM-L6-v2 model...');
  const { pipeline } = require('@huggingface/transformers');
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    dtype: 'q8',
    device: 'cpu',
  });
  console.log('Model loaded.');

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO embeddings (chunk_id, vector, dimensions, updated_at)
    VALUES (?, ?, ?, ?)
  `);

  const now = Date.now();
  let count = 0;

  for (const chunk of missing) {
    const text = chunk.summary ? `${chunk.summary}\n${chunk.content}` : chunk.content;
    const truncated = text.slice(0, 2000);

    const output = await extractor(truncated, { pooling: 'mean', normalize: true });
    const vec = Array.from(output.data);

    // Store as Float32 buffer (same as plugin)
    const buf = Buffer.alloc(vec.length * 4);
    for (let i = 0; i < vec.length; i++) {
      buf.writeFloatLE(vec[i], i * 4);
    }

    insertStmt.run(chunk.id, buf, vec.length, now);
    count++;
    console.log(`  [${count}/${missing.length}] ${(chunk.summary || chunk.id).slice(0, 60)}`);
  }

  // Verify
  const total = db.prepare('SELECT count(*) as c FROM embeddings').get().c;
  const staticCount = db.prepare(`
    SELECT count(*) as c FROM embeddings e
    JOIN chunks c ON e.chunk_id = c.id
    WHERE c.source = 'static-import'
  `).get().c;

  console.log(`\nDone. Total embeddings: ${total}, Static-import embeddings: ${staticCount}`);
  db.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
