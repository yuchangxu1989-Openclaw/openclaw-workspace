'use strict';

/**
 * handler-template.js — ISC Handler 模板
 *
 * 复制此文件并重命名为你的 handler 名称，按注释填充逻辑即可。
 * 公共函数全部从 handler-utils.js 引入，避免重复实现。
 */

const fs = require('fs');
const path = require('path');
const {
  gitExec,
  writeReport,
  emitEvent,
  scanFiles,
  checkFileExists,
  readRuleJson,
  gateResult,
} = require('./handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  // ─── 1. 感知：收集信息 ───
  // 示例：扫描 .md 文件
  const mdFiles = scanFiles(root, /\.md$/i);
  logger.info?.(`[my-handler] 扫描到 ${mdFiles.length} 个 markdown 文件`);

  // 示例：读取规则配置
  const rulePath = path.join(root, 'isc-rules', `${rule?.id || 'default'}.json`);
  const ruleConfig = readRuleJson(rulePath);

  // 示例：获取 git 信息
  const lastCommit = gitExec(root, 'log --oneline -1');

  // ─── 2. 判断 & 执行：检查逻辑 ───
  const checks = [];

  // 示例检查项
  checks.push({
    name: 'config_exists',
    ok: checkFileExists(path.join(root, 'config.json')),
    message: checkFileExists(path.join(root, 'config.json'))
      ? 'config.json 存在'
      : 'config.json 缺失',
  });

  // ... 添加更多检查项 ...

  // ─── 3. 输出：门禁结果 ───
  const result = gateResult(rule?.id || 'my-handler', checks);

  // ─── 4. 持久化：写报告 ───
  const reportPath = path.join(root, 'reports', 'my-handler', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'my-handler',
    eventType: event?.type || null,
    ruleId: rule?.id || null,
    lastCommit,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  // ─── 5. 闭环：发射后续事件 ───
  await emitEvent(bus, 'my-handler.completed', {
    ok: result.ok,
    status: result.status,
    actions,
  });

  // ─── 6. 返回 ───
  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: result.ok
      ? `所有 ${result.total} 项检查通过`
      : `${result.failed}/${result.total} 项检查未通过`,
    ...result,
  };
};
