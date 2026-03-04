#!/usr/bin/env node
'use strict';

/**
 * memory-summary-cron.js — 定期扫描git变更并生成记忆摘要
 *
 * 功能：
 *   1. 扫描最近N小时的 git log（默认6小时）
 *   2. 按标签分类统计：[ARCH] [FIX] [CONFIG] [AUTO] [REFACTOR] 等
 *   3. 扫描 event-bus 中最近的事件
 *   4. 生成简洁的变更摘要
 *   5. 重要变更追加到 memory/YYYY-MM-DD.md
 *   6. 仅有 [AUTO] 空转提交时不写入（避免噪音）
 *   7. 输出摘要到 stdout 供 cron-worker 使用
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// --------------- 配置 ---------------
const WORKSPACE = '/root/.openclaw/workspace';
const REPO_ROOT = '/root/.openclaw';
const EVENT_BUS_DIR = path.join(WORKSPACE, 'infrastructure/event-bus');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const HOURS = parseInt(process.env.MEMORY_SUMMARY_HOURS || '6', 10);

// 标签分类
const IMPORTANT_TAGS = ['ARCH', 'FIX', 'CONFIG', 'BREAKING', 'REFACTOR', 'FEAT', 'PERF', 'SECURITY'];
const NOISE_TAGS = ['AUTO'];
const ALL_KNOWN_TAGS = [...IMPORTANT_TAGS, ...NOISE_TAGS];

// --------------- 工具函数 ---------------

function now() {
  return new Date();
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function dateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeStr(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 解析 commit message 中的标签，如 "[ARCH]", "[FIX]"
 * 返回 { tag: string|null, message: string }
 */
function parseTag(msg) {
  const m = msg.match(/^\[([A-Z_]+)\]\s*(.*)/);
  if (m) {
    return { tag: m[1], message: m[2] };
  }
  return { tag: null, message: msg };
}

// --------------- 1. 扫描 git log ---------------

function getGitLog(hours) {
  const since = `${hours} hours ago`;
  try {
    const raw = execSync(
      `git log --since="${since}" --pretty=format:"%H|||%s" --stat`,
      { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 15000 }
    );
    return raw.trim();
  } catch (e) {
    // 没有 commit 或 git 不可用
    return '';
  }
}

function parseGitLog(raw) {
  if (!raw) return [];

  const commits = [];
  const lines = raw.split('\n');
  let current = null;

  for (const line of lines) {
    if (line.includes('|||')) {
      // 新 commit 行
      if (current) commits.push(current);
      const [hash, ...msgParts] = line.split('|||');
      const msg = msgParts.join('|||');
      const { tag, message } = parseTag(msg);
      current = { hash: hash.trim(), tag, message, filesChanged: 0 };
    } else if (current && line.match(/\d+ files? changed/)) {
      // stat 总结行
      const m = line.match(/(\d+) files? changed/);
      if (m) current.filesChanged = parseInt(m[1], 10);
    }
  }
  if (current) commits.push(current);
  return commits;
}

// --------------- 2. 分类统计 ---------------

function classifyCommits(commits) {
  const important = [];
  const noise = [];
  const unknown = [];

  for (const c of commits) {
    if (c.tag && IMPORTANT_TAGS.includes(c.tag)) {
      important.push(c);
    } else if (c.tag && NOISE_TAGS.includes(c.tag)) {
      noise.push(c);
    } else {
      // 未知标签或无标签，保守归为 important
      important.push(c);
    }
  }

  // 按标签统计
  const tagCounts = {};
  for (const c of important) {
    const t = c.tag || 'OTHER';
    tagCounts[t] = (tagCounts[t] || 0) + 1;
  }

  return { important, noise, unknown, tagCounts };
}

// --------------- 3. 扫描事件总线 ---------------

function getRecentEvents(hours) {
  const eventsFile = path.join(EVENT_BUS_DIR, 'events.jsonl');
  if (!fs.existsSync(eventsFile)) return [];

  const cutoff = Date.now() - hours * 3600 * 1000;
  const events = [];

  try {
    const content = fs.readFileSync(eventsFile, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line);
        if (evt.timestamp && evt.timestamp >= cutoff) {
          events.push(evt);
        }
      } catch (_) {
        // 跳过解析失败的行
      }
    }
  } catch (_) {
    // 文件读取失败
  }
  return events;
}

function summarizeEvents(events) {
  const typeCounts = {};
  for (const evt of events) {
    const t = evt.type || 'unknown';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  return { total: events.length, typeCounts };
}

// --------------- 4. 生成摘要 ---------------

function generateSummary(classified, eventSummary) {
  const d = now();
  const header = `### [${timeStr(d)}] 自动记忆摘要（过去${HOURS}小时）`;

  const importantCount = classified.important.length;
  const noiseCount = classified.noise.length;

  // 标签分布
  const tagDistParts = Object.entries(classified.tagCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => `[${tag}]x${count}`);
  const tagDist = tagDistParts.length > 0 ? ` (${tagDistParts.join(', ')})` : '';

  const lines = [
    header,
    `- 重要变更: ${importantCount}个${tagDist}`,
    `- 空转提交: ${noiseCount}个（已忽略）`,
    `- 事件总线: ${eventSummary.total}个事件`,
  ];

  if (importantCount > 0) {
    lines.push('- 关键变更列表:');
    for (let i = 0; i < classified.important.length; i++) {
      const c = classified.important[i];
      const tagLabel = c.tag ? `[${c.tag}]` : '[OTHER]';
      const filesInfo = c.filesChanged > 0 ? ` - 影响${c.filesChanged}个文件` : '';
      lines.push(`  ${i + 1}. ${tagLabel} ${c.message}${filesInfo}`);
    }
  }

  // 事件类型分布（仅当有事件时）
  if (eventSummary.total > 0) {
    const eventParts = Object.entries(eventSummary.typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)  // top 5
      .map(([type, count]) => `${type}: ${count}`);
    lines.push(`- 事件类型分布(Top5): ${eventParts.join(', ')}`);
  }

  return lines.join('\n');
}

// --------------- 5. 写入记忆文件 ---------------

function writeToMemory(summary) {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }

  const d = now();
  const filename = `${dateStr(d)}.md`;
  const filepath = path.join(MEMORY_DIR, filename);

  const separator = '\n\n---\n\n';
  const content = fs.existsSync(filepath)
    ? fs.readFileSync(filepath, 'utf-8')
    : `# ${dateStr(d)} 记忆日志\n`;

  const updated = content.trimEnd() + separator + summary + '\n';
  fs.writeFileSync(filepath, updated, 'utf-8');

  return filepath;
}

// --------------- 主流程 ---------------

function main() {
  // 1. 扫描 git log
  const rawLog = getGitLog(HOURS);
  const commits = parseGitLog(rawLog);

  // 2. 分类
  const classified = classifyCommits(commits);

  // 3. 扫描事件总线
  const events = getRecentEvents(HOURS);
  const eventSummary = summarizeEvents(events);

  // 4. 生成摘要
  const summary = generateSummary(classified, eventSummary);

  // 5. 决定是否写入记忆
  const hasImportant = classified.important.length > 0;

  if (hasImportant) {
    const filepath = writeToMemory(summary);
    console.log(summary);
    console.log(`\n✅ 已写入记忆文件: ${filepath}`);
  } else {
    console.log(summary);
    console.log(`\nℹ️ 仅有空转提交，未写入记忆文件。`);
  }

  // 总是输出摘要供 cron-worker 使用
  return { summary, hasImportant, commitCount: commits.length };
}

// 运行
try {
  const result = main();
  process.exit(0);
} catch (err) {
  console.error('❌ 记忆摘要生成失败:', err.message);
  process.exit(1);
}
