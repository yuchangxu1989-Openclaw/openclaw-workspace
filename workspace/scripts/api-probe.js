#!/usr/bin/env node
'use strict';
const { spawn } = require('child_process');
const child = spawn('node', ['/root/.openclaw/workspace/skills/public/system-monitor/scripts/api-probe.js', ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
