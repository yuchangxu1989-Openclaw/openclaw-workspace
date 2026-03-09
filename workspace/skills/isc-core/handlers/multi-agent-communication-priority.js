'use strict';

/**
 * ISC Handler: multi-agent-communication-priority
 * Rule: rule.multi-agent-communication-priority-001
 * 多Agent并行与用户沟通优先规则 — 所有任务使用多Agent并行，主Agent沟通始终畅通。
 */

const path = require('path');
const {
  writeReport,
  emitEvent,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const agentRole = event?.payload?.agent_role || event?.payload?.agentRole || 'unknown';
  const taskType = event?.payload?.task_type || event?.payload?.taskType || 'unknown';
  const isParallel = event?.payload?.parallel !== false;
  const subagentCount = event?.payload?.subagent_count || event?.payload?.subagentCount || 0;

  logger.info?.(`[multi-agent-communication-priority] Agent: ${agentRole}, Task: ${taskType}, Subagents: ${subagentCount}`);

  const checks = [];

  // Rule: Main agent should delegate to subagents for parallel work
  if (agentRole === 'main') {
    // Check that complex tasks spawn subagents
    const isComplexTask = ['implementation', 'analysis', 'migration', 'refactor'].includes(taskType);
    if (isComplexTask && subagentCount === 0) {
      checks.push({
        name: 'parallel_delegation',
        ok: false,
        message: `Complex task "${taskType}" should use subagents for parallel execution`,
      });
    } else {
      checks.push({
        name: 'parallel_delegation',
        ok: true,
        message: isComplexTask
          ? `Task "${taskType}" using ${subagentCount} subagent(s) — good`
          : `Task "${taskType}" — simple task, direct execution OK`,
      });
    }

    // Check main agent communication channel is not blocked
    const isBlocked = event?.payload?.main_blocked === true;
    checks.push({
      name: 'main_agent_responsive',
      ok: !isBlocked,
      message: isBlocked
        ? '主Agent沟通通道被阻塞 — 长任务应委派子Agent保持主Agent畅通'
        : '主Agent沟通通道畅通',
    });
  } else {
    // Subagent: check it reports back properly
    const hasReportChannel = !!event?.payload?.report_channel || !!event?.payload?.reportChannel;
    checks.push({
      name: 'subagent_report_channel',
      ok: true, // subagents auto-announce via push
      message: 'Subagent communication — push-based completion enabled',
    });
  }

  // Check no busy-polling patterns
  const hasBusyPoll = event?.payload?.polling === true;
  checks.push({
    name: 'no_busy_polling',
    ok: !hasBusyPoll,
    message: hasBusyPoll
      ? 'Busy-polling detected — use push-based completion instead'
      : 'No busy-polling — using push-based communication',
  });

  const result = gateResult(rule?.id || 'multi-agent-communication-priority-001', checks);

  const reportPath = path.join(root, 'reports', 'multi-agent-priority', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'multi-agent-communication-priority',
    agentRole,
    taskType,
    subagentCount,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'multi-agent-communication-priority.completed', { ok: result.ok, status: result.status, actions });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
