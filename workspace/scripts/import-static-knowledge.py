#!/usr/bin/env python3
"""
Import static knowledge from MEMORY.md and memory/*.md into MemOS SQLite.
Splits by ## sections, inserts into chunks table with source='static-import'.
FTS triggers auto-update the search index on INSERT.
"""

import sqlite3
import uuid
import hashlib
import time
import os
import re
import glob

DB_PATH = "/root/.openclaw/memos-local/memos.db"
MEMORY_MD = "/root/.openclaw/workspace/MEMORY.md"
MEMORY_DIR = "/root/.openclaw/workspace/memory"

SESSION_KEY = "static-knowledge"
ROLE = "system"
KIND = "paragraph"
OWNER = "agent:main"
SOURCE = "static-import"

def ensure_source_column(db):
    """Add source column if it doesn't exist."""
    cols = [row[1] for row in db.execute("PRAGMA table_info(chunks)").fetchall()]
    if "source" not in cols:
        db.execute("ALTER TABLE chunks ADD COLUMN source TEXT DEFAULT NULL")
        db.execute("CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source)")
        db.commit()
        print("[OK] Added 'source' column to chunks table")
    else:
        print("[OK] 'source' column already exists")

def split_sections(text, filename):
    """Split markdown by ## headers into chunks. Each chunk = one section."""
    sections = []
    lines = text.split('\n')
    current_title = None
    current_lines = []

    for line in lines:
        if line.startswith('## '):
            if current_title and current_lines:
                content = '\n'.join(current_lines).strip()
                if content:
                    sections.append({
                        'title': current_title,
                        'content': content,
                        'file': filename
                    })
            current_title = line.lstrip('#').strip()
            current_lines = [line]
        else:
            current_lines.append(line)

    # Last section
    if current_title and current_lines:
        content = '\n'.join(current_lines).strip()
        if content:
            sections.append({
                'title': current_title,
                'content': content,
                'file': filename
            })

    # If no ## headers found, treat entire file as one chunk
    if not sections and text.strip():
        sections.append({
            'title': os.path.basename(filename),
            'content': text.strip(),
            'file': filename
        })

    return sections

def content_hash(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]

def clear_old_imports(db):
    """Remove previous static imports to avoid duplicates."""
    count = db.execute("SELECT count(*) FROM chunks WHERE source=?", (SOURCE,)).fetchone()[0]
    if count > 0:
        # Delete embeddings first (foreign key)
        db.execute("DELETE FROM embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE source=?)", (SOURCE,))
        db.execute("DELETE FROM chunks WHERE source=?", (SOURCE,))
        db.commit()
        print(f"[OK] Cleared {count} old static-import chunks")
    return count

def insert_chunks(db, sections):
    """Insert sections as chunks into the database."""
    now = int(time.time() * 1000)
    turn_id = f"static-import-{int(time.time())}"
    inserted = 0

    for seq, section in enumerate(sections):
        chunk_id = str(uuid.uuid4())
        summary = f"[{section['file']}] {section['title']}"
        content = section['content']
        chash = content_hash(content)

        db.execute("""
            INSERT INTO chunks (id, session_key, turn_id, seq, role, content, kind, summary,
                                created_at, updated_at, content_hash, owner, source,
                                merge_count, merge_history, dedup_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', 'active')
        """, (chunk_id, SESSION_KEY, turn_id, seq, ROLE, content, KIND, summary,
              now, now, chash, OWNER, SOURCE))
        inserted += 1
        print(f"  [{seq+1}] {summary} ({len(content)} chars)")

    db.commit()
    return inserted

def main():
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA journal_mode=WAL")

    # Step 1: Ensure source column
    ensure_source_column(db)

    # Step 2: Clear old imports
    clear_old_imports(db)

    # Step 3: Read and split MEMORY.md
    all_sections = []

    print(f"\n--- Reading {MEMORY_MD} ---")
    with open(MEMORY_MD, 'r', encoding='utf-8') as f:
        text = f.read()
    sections = split_sections(text, "MEMORY.md")
    print(f"  Found {len(sections)} sections")
    all_sections.extend(sections)

    # Step 4: Read key memory/*.md files (skip daily logs which are conversation records)
    # Only import structured knowledge files, not daily conversation logs
    skip_patterns = [
        r'^\d{4}-\d{2}-\d{2}\.md$',  # Daily logs like 2026-03-05.md
        r'MEMORY-backup',              # Backups
    ]

    print(f"\n--- Scanning {MEMORY_DIR}/ ---")
    for md_file in sorted(glob.glob(os.path.join(MEMORY_DIR, "*.md"))):
        basename = os.path.basename(md_file)
        skip = False
        for pat in skip_patterns:
            if re.match(pat, basename):
                skip = True
                break
        if skip:
            print(f"  [SKIP] {basename} (daily log / backup)")
            continue

        print(f"  [READ] {basename}")
        with open(md_file, 'r', encoding='utf-8') as f:
            text = f.read()
        sections = split_sections(text, basename)
        print(f"    Found {len(sections)} sections")
        all_sections.extend(sections)

    # Step 5: Also check for important JSON knowledge files
    for json_file in sorted(glob.glob(os.path.join(MEMORY_DIR, "*.json"))):
        basename = os.path.basename(json_file)
        if basename in ('heartbeat-state.json',):  # Skip runtime state
            continue
        print(f"  [READ] {basename}")
        with open(json_file, 'r', encoding='utf-8') as f:
            text = f.read()
        if len(text) > 100:  # Only import non-trivial files
            all_sections.append({
                'title': basename,
                'content': text[:4000],  # Cap at 4000 chars for JSON
                'file': basename
            })

    # Step 6: Insert all
    print(f"\n--- Inserting {len(all_sections)} chunks ---")
    inserted = insert_chunks(db, all_sections)

    # Step 7: Verify
    total = db.execute("SELECT count(*) FROM chunks").fetchone()[0]
    static = db.execute("SELECT count(*) FROM chunks WHERE source=?", (SOURCE,)).fetchone()[0]
    print(f"\n--- Verification ---")
    print(f"Total chunks: {total}")
    print(f"Static-import chunks: {static}")

    # FTS search test
    test_queries = ["裁决殿", "反熵增", "ISC规则", "事件总线", "评测铁令"]
    print(f"\n--- FTS Search Tests ---")
    for q in test_queries:
        results = db.execute("""
            SELECT c.id, c.summary, substr(c.content, 1, 80)
            FROM chunks c
            JOIN chunks_fts f ON f.rowid = c.rowid
            WHERE chunks_fts MATCH ?
            ORDER BY rank
            LIMIT 3
        """, (q,)).fetchall()
        print(f"  '{q}': {len(results)} hits")
        for r in results:
            print(f"    -> {r[1][:60]}...")

    db.close()
    print(f"\n[DONE] Imported {inserted} static knowledge chunks into MemOS.")

if __name__ == "__main__":
    main()
