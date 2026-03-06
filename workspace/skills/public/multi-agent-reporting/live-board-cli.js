#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { renderReport, renderText, renderCard } = require('./index.js');

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.error('Usage: node live-board-cli.js <tasks.json> [--card] [--json]');
  console.error('  --card   Output Feishu card JSON instead of text');
  console.error('  --json   Output full { text, card, title, stats }');
  process.exit(1);
}

const tasksFile = args.find(a => !a.startsWith('-'));
const tasks = JSON.parse(fs.readFileSync(path.resolve(tasksFile), 'utf8'));
const wantCard = args.includes('--card');
const wantJson = args.includes('--json');

if (wantJson) {
  const result = renderReport(tasks);
  process.stdout.write(JSON.stringify(result, null, 2));
} else if (wantCard) {
  const card = renderCard(tasks);
  process.stdout.write(JSON.stringify(card, null, 2));
} else {
  process.stdout.write(renderText(tasks));
}
process.stdout.write('\n');
