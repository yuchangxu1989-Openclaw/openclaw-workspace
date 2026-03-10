#!/usr/bin/env node
// 薄封装 — 实际逻辑在技能目录
const path = require('path');
require(path.resolve(__dirname, '..', 'skills', 'public', 'system-monitor', 'scripts', 'api-probe.js'));
