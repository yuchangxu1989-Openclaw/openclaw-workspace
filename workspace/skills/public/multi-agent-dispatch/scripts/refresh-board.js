#!/usr/bin/env node
/**
 * 刷新看板 — 桥接 subagents list 原生数据 → multi-agent-reporting 标准输出
 * 用法: echo '<subagents_list_json>' | node scripts/refresh-board.js
 * 或:   node scripts/refresh-board.js --from-file state/subagents-snapshot.json
 */
'use strict';

const { renderText } = require('../skills/public/multi-agent-reporting/index.js');

// 从 stdin 或文件读取 subagents list 数据
async function getInput() {
  const args = process.argv.slice(2);
  if (args[0] === '--from-file') {
    return JSON.parse(require('fs').readFileSync(args[1], 'utf8'));
  }
  // stdin
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) data += chunk;
  return JSON.parse(data);
}

// 将 subagents list 格式转为 reporting 需要的 tasks 格式
function convertToTasks(subagentData) {
  const all = [...(subagentData.active || []), ...(subagentData.recent || [])];
  return all.map(item => ({
    taskId: item.runId,
    task: item.label || item.task?.substring(0, 60) || '—',
    title: item.label,
    model: item.model,
    status: item.status === 'running' ? 'active' : item.status,
    startedAt: item.startedAt ? new Date(item.startedAt).toISOString() : null,
    endedAt: item.endedAt ? new Date(item.endedAt).toISOString() : null,
    runtimeMs: item.runtimeMs,
    modelKey: item.model, // 用于 hasRuntimeModelKey 判定
  }));
}

(async () => {
  const input = await getInput();
  const tasks = convertToTasks(input);
  const text = renderText(tasks);
  console.log(text);
})();
