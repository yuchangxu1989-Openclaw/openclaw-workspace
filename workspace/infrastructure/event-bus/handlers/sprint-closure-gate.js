#!/usr/bin/env node
'use strict';

/**
 * sprint-closure-gate — Sprint收工验收门禁处理器
 * 
 * 委托 artifact-gate-check 的 sprintClosureGate 函数执行四重验收。
 * 独立handler文件确保ISC规则handler名称与文件一一对应。
 */

const { sprintClosureGate } = require('./artifact-gate-check');

async function run(input, context) {
  const sprintName = input?.sprint || input?.payload?.sprint || 'current';
  return sprintClosureGate(sprintName);
}

module.exports = run;
module.exports.run = run;

if (require.main === module) {
  const result = sprintClosureGate(process.argv[2] || 'current');
  console.log(JSON.stringify(result, null, 2));
}
