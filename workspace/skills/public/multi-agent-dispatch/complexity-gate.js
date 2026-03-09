#!/usr/bin/env node
// complexity-gate.js — Task complexity pre-assessment gate
// Usage: node complexity-gate.js --task "task description"

const fs = require('fs');
const path = require('path');

// Patterns that indicate file operations
const FILE_PATH_RE = /(?:\/[\w.-]+){2,}(?:\.\w+)?/g;
const FILE_NAME_RE = /\b[\w-]+\.\w{1,10}\b/g;
const ACTION_KEYWORDS_ZH = /创建|修改|读取|删除|更新|写入|编辑|新建|添加|移动|重命名|上传/g;
const ACTION_KEYWORDS_EN = /\b(?:create|modify|read|delete|update|write|edit|add|move|rename|upload|remove|install|configure)\b/gi;
const SPLIT_MARKERS = /(?:^|\n)\s*(?:\d+[\.\)、]|[-*])\s+/g;

function assessComplexity(taskDescription) {
  const desc = taskDescription || '';

  // Extract file references
  const filePaths = new Set((desc.match(FILE_PATH_RE) || []).filter(p => !p.startsWith('/usr/') && !p.startsWith('/etc/')));
  const fileNames = new Set((desc.match(FILE_NAME_RE) || []).filter(f => !['e.g', 'i.e', 'vs.'].includes(f)));
  const allFiles = new Set([...filePaths, ...fileNames]);

  // Count action keywords
  const zhActions = (desc.match(ACTION_KEYWORDS_ZH) || []).length;
  const enActions = (desc.match(ACTION_KEYWORDS_EN) || []).length;
  const actionCount = zhActions + enActions;

  // Count list items (bullet points / numbered items) as proxy for sub-tasks
  const listItems = (desc.match(SPLIT_MARKERS) || []).length;

  // Estimate files: max of explicit file refs and action-implied files
  const estimatedFiles = Math.max(allFiles.size, Math.ceil(actionCount * 0.7), Math.ceil(listItems * 0.5)) || 1;

  // Estimate minutes based on file count
  const estimatedMinutes = Math.max(1, Math.ceil(estimatedFiles * 0.4));

  // Complexity
  let complexity;
  if (estimatedFiles <= 3) complexity = 'low';
  else if (estimatedFiles <= 9) complexity = 'medium';
  else complexity = 'high';

  // Split decision
  const shouldSplit = estimatedFiles >= 10;
  let splitSuggestion = null;

  if (shouldSplit) {
    const chunkSize = 7;
    const chunks = Math.ceil(estimatedFiles / chunkSize);
    splitSuggestion = `Split into ~${chunks} sub-tasks of ~${chunkSize} files each`;
  }

  // Timeout: base 60s + 20s per file, capped at 600s
  const recommendedTimeout = Math.min(600, Math.max(60, 60 + estimatedFiles * 20));

  return {
    estimated_files: estimatedFiles,
    estimated_minutes: estimatedMinutes,
    complexity,
    should_split: shouldSplit,
    split_suggestion: splitSuggestion,
    recommended_timeout: recommendedTimeout,
  };
}

function canDispatch(currentRunning, maxConcurrency = 19) {
  let running = currentRunning;
  if (running == null) {
    try {
      const board = JSON.parse(fs.readFileSync(path.join(__dirname, 'task-board.json'), 'utf8'));
      running = Array.isArray(board) ? board.filter(t => t.status === 'running').length : (board.running || 0);
    } catch { running = 0; }
  }
  return Math.max(0, maxConcurrency - running);
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const taskIdx = args.indexOf('--task');
  if (taskIdx === -1 || !args[taskIdx + 1]) {
    console.error('Usage: node complexity-gate.js --task "description"');
    process.exit(1);
  }
  const task = args[taskIdx + 1];
  console.log(JSON.stringify(assessComplexity(task), null, 2));
}

module.exports = { assessComplexity, canDispatch };
