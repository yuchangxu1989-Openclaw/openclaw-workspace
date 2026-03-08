#!/usr/bin/env node
/**
 * build-dashboard.js
 *
 * Reads dashboard/task-state.json, scans reports/ for real task data,
 * and produces a self-contained dashboard/snapshot.html with inline data.
 *
 * Usage:
 *   node dashboard/build-dashboard.js                    # auto-scan reports + state
 *   node dashboard/build-dashboard.js --state custom.json # custom state file
 *   node dashboard/build-dashboard.js --live              # update timestamps to now
 *
 * Output:
 *   dashboard/snapshot.html   — self-contained screenshot-ready HTML
 *   dashboard/task-state.json — updated with scanned report data (if --scan)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.resolve(__dirname, '..');
const DASHBOARD_DIR = path.join(WORKSPACE, 'dashboard');
const REPORTS_DIR = path.join(WORKSPACE, 'reports');
const TEMPLATE = path.join(DASHBOARD_DIR, 'render-dashboard.html');
const STATE_FILE = path.join(DASHBOARD_DIR, 'task-state.json');
const OUTPUT = path.join(DASHBOARD_DIR, 'snapshot.html');

// ── Helpers ───────────────────────────────────────────────
function readJson(f, fallback = null) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; }
}

function writeJson(f, data) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf8');
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--state' && argv[i + 1]) { flags.state = argv[++i]; }
    else if (argv[i] === '--live') { flags.live = true; }
    else if (argv[i] === '--scan') { flags.scan = true; }
    else if (argv[i] === '--help') { flags.help = true; }
  }
  return flags;
}

// ── Report Scanner ────────────────────────────────────────
// Infers task metadata from reports/ markdown files
function scanReports() {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.md'));
  const tasks = [];

  for (const f of files) {
    const fpath = path.join(REPORTS_DIR, f);
    const stat = fs.statSync(fpath);
    const content = fs.readFileSync(fpath, 'utf8');
    const lines = content.split('\n');

    // Extract title from first H1
    let title = f.replace(/\.md$/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/-/g, ' ');
    for (const line of lines.slice(0, 10)) {
      const m = line.match(/^#\s+(.+)/);
      if (m) { title = m[1].trim(); break; }
    }

    // Detect status from content.
    // Priority: explicit Status: field in frontmatter > structural signals in first 30 lines > default done
    let status = 'done';
    const head = lines.slice(0, 30).join('\n');

    // Check explicit status line first (e.g. "**Status:** ✅ Completed")
    const statusLine = head.match(/\*?\*?status\*?\*?[：:]\s*(.+)/i);
    if (statusLine) {
      const sv = statusLine[1];
      if (/✅|completed|done|已完成|已固化/i.test(sv)) status = 'done';
      else if (/❌|failed|error|失败/i.test(sv)) status = 'error';
      else if (/⚠|abnormal|异常/i.test(sv)) status = 'abnormal';
      else if (/🔄|running|进行中/i.test(sv)) status = 'running';
    }
    // Fallback: reports with structured result summaries are "done" by default.
    // Only mark as error if the *conclusion* section explicitly says the task failed.
    // A report that *discusses* failures (e.g. "FAIL-CLOSED") isn't itself a failure.
    // Check last 20 lines for a definitive signal:
    else {
      const tail = lines.slice(-20).join('\n');
      if (/已固化|all\s*(checks)?\s*passed|状态：\*?\*?已/i.test(tail)) {
        status = 'done';
      }
    }

    // Detect agent
    let agent = 'coder';
    if (/author:\s*main/i.test(content)) agent = 'main';
    if (/author:\s*reviewer/i.test(content)) agent = 'reviewer';

    // Detect tags from filename
    const tags = [];
    if (f.includes('benchmark')) tags.push('benchmark');
    if (f.includes('debt') || f.includes('fill-keys')) tags.push('debt');
    if (f.includes('watchdog')) tags.push('watchdog');
    if (f.includes('fix') || f.includes('rootfix')) tags.push('fix');
    if (f.includes('eval') || f.includes('evalset')) tags.push('eval');
    if (f.includes('hardening') || f.includes('hardened')) tags.push('hardening');
    if (f.includes('cleanup')) tags.push('cleanup');
    if (f.includes('routing')) tags.push('routing');
    if (f.includes('proof') || f.includes('resilience')) tags.push('resilience');
    if (f.includes('coverage')) tags.push('coverage');
    if (tags.length === 0) tags.push('general');

    tasks.push({
      id: f.replace(/\.md$/, ''),
      title,
      agent,
      status,
      startedAt: stat.birthtime ? stat.birthtime.toISOString() : stat.mtime.toISOString(),
      updatedAt: stat.mtime.toISOString(),
      completedAt: status === 'done' ? stat.mtime.toISOString() : null,
      reportFile: `reports/${f}`,
      tags,
    });
  }

  return tasks;
}

// ── Known agents (extend as needed) ───────────────────────
const KNOWN_AGENTS = {
  main: { label: 'Main Agent', model: 'boom-coder/gpt-5.4', emoji: '🧠' },
  coder: { label: 'Coder Agent', model: 'claude-coder/claude-opus-4-6', emoji: '💻' },
  reviewer: { label: 'Reviewer Agent', model: 'claude-coder/claude-opus-4-6', emoji: '🔍' },
  publisher: { label: 'Publisher Agent', model: 'boom-coder/gpt-5.4', emoji: '📦' },
};

// ── Detect active agents from tasks ───────────────────────
function inferAgents(tasks) {
  // Always include main + coder at minimum
  const agentMap = {};
  for (const [id, info] of Object.entries(KNOWN_AGENTS)) {
    agentMap[id] = {
      id,
      label: info.label,
      model: info.model,
      status: 'idle',
      currentTask: null,
    };
  }

  // Override from tasks
  const seen = new Set();
  for (const t of tasks) {
    const id = t.agent || 'unknown';
    seen.add(id);
    if (!agentMap[id]) {
      agentMap[id] = {
        id,
        label: id.charAt(0).toUpperCase() + id.slice(1) + ' Agent',
        model: 'unknown',
        status: 'idle',
        currentTask: null,
      };
    }
    if (t.status === 'running') {
      agentMap[id].status = 'active';
      agentMap[id].currentTask = t.title;
    }
  }

  // Only return agents that are known defaults or have tasks
  return Object.values(agentMap).filter(a =>
    a.id === 'main' || a.id === 'coder' || seen.has(a.id)
  );
}

// ── Build self-contained HTML ─────────────────────────────
function buildSnapshot(data) {
  let template = fs.readFileSync(TEMPLATE, 'utf8');

  // Inject inline data
  const injectMarker = 'let INLINE_DATA = null;';
  const replacement = `let INLINE_DATA = ${JSON.stringify(data, null, 2)};`;
  template = template.replace(injectMarker, replacement);

  // Remove the fetch() fallback since we've inlined data
  // (optional; the inline check runs first anyway)

  return template;
}

// ── Main ──────────────────────────────────────────────────
function main() {
  const flags = parseFlags(process.argv);

  if (flags.help) {
    console.log('Usage: node build-dashboard.js [--state file.json] [--live] [--scan]');
    process.exit(0);
  }

  let data;
  const stateFile = flags.state ? path.resolve(flags.state) : STATE_FILE;

  if (flags.scan || !fs.existsSync(stateFile)) {
    // Auto-scan reports
    console.log('Scanning reports/ for task data...');
    const tasks = scanReports();
    const agents = inferAgents(tasks);
    data = {
      generatedAt: new Date().toISOString(),
      agents,
      tasks,
    };
    writeJson(STATE_FILE, data);
    console.log(`  Found ${tasks.length} tasks, ${agents.length} agents`);
  } else {
    data = readJson(stateFile, { generatedAt: new Date().toISOString(), agents: [], tasks: [] });
  }

  if (flags.live) {
    data.generatedAt = new Date().toISOString();
  }

  // Build snapshot
  const html = buildSnapshot(data);
  fs.writeFileSync(OUTPUT, html, 'utf8');
  console.log(`✅ Dashboard snapshot: ${path.relative(WORKSPACE, OUTPUT)}`);
  console.log(`   ${data.tasks.length} tasks, ${data.agents.length} agents`);

  return { output: OUTPUT, data };
}

if (require.main === module) {
  main();
}

module.exports = { main, scanReports, inferAgents, buildSnapshot };
