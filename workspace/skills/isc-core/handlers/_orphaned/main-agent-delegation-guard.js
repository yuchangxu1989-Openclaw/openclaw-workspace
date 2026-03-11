'use strict';

/**
 * ISC Handler: main-agent-delegation-guard
 * Rule: rule.main-agent-delegation-001
 * 主Agent禁止亲自做实现工作，必须委派子Agent。程序化守卫。
 */

const path = require('path');
const {
  writeReport,
  emitEvent,
  gateResult,
} = require('../lib/handler-utils');

const CODE_EXTENSIONS = /\.(js|py|json|sh|ts|jsx|tsx|css|html)$/;
const ALLOWED_FILES = /(MEMORY\.md|memory\/|AGENTS\.md|SOUL\.md|TOOLS\.md|USER\.md|HEARTBEAT\.md)/;

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const agentRole = event?.payload?.agent_role || event?.payload?.agentRole || 'unknown';
  const tool = event?.payload?.tool || event?.type || 'unknown';
  const filePath = event?.payload?.path || event?.payload?.file || '';

  logger.info?.(`[main-agent-delegation-guard] Agent: ${agentRole}, Tool: ${tool}, File: ${filePath}`);

  const checks = [];

  // Only enforce for main agent
  if (agentRole !== 'main') {
    checks.push({ name: 'agent_role', ok: true, message: `Agent role "${agentRole}" — not main, rule not applicable` });
  } else {
    // Check edit/write on code files
    if ((tool === 'edit' || tool === 'write') && filePath) {
      const isCodeFile = CODE_EXTENSIONS.test(filePath);
      const isAllowed = ALLOWED_FILES.test(filePath);

      if (isCodeFile && !isAllowed) {
        checks.push({
          name: 'main_agent_code_edit',
          ok: false,
          message: `主Agent直接编辑代码文件 ${path.basename(filePath)} — 应委派子Agent`,
        });
      } else {
        checks.push({
          name: 'main_agent_code_edit',
          ok: true,
          message: isAllowed ? 'Editing allowed file' : 'Non-code file edit — OK',
        });
      }
    }

    // Check exec with long scripts
    if (tool === 'exec') {
      const scriptLines = event?.payload?.script_lines || 0;
      const tooLong = scriptLines > 3;
      checks.push({
        name: 'main_agent_exec_length',
        ok: !tooLong,
        message: tooLong
          ? `主Agent执行${scriptLines}行脚本 — 超过3行应委派子Agent`
          : `Exec script length (${scriptLines}) within limit`,
      });
    }

    // Check feishu_doc write/append
    if (tool === 'feishu_doc') {
      const docAction = event?.payload?.action;
      const isWrite = docAction === 'write' || docAction === 'append';
      checks.push({
        name: 'main_agent_feishu_write',
        ok: !isWrite,
        message: isWrite
          ? `主Agent直接执行feishu_doc.${docAction} — 应委派子Agent`
          : `feishu_doc.${docAction} — non-write action OK`,
      });
    }

    if (checks.length === 0) {
      checks.push({ name: 'no_violation', ok: true, message: 'No delegation violation detected' });
    }
  }

  const result = gateResult(rule?.id || 'main-agent-delegation-001', checks);

  if (!result.ok) {
    actions.push('block_and_alert');
    logger.warn?.(`🚫 ISC-MAIN-AGENT-DELEGATION-001 违反：主Agent不得亲自做实现工作。请使用 sessions_spawn 委派子Agent。`);
  }

  const reportPath = path.join(root, 'reports', 'main-agent-delegation', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'main-agent-delegation-guard',
    agentRole,
    tool,
    filePath,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'main-agent-delegation-guard.completed', { ok: result.ok, status: result.status, actions });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
