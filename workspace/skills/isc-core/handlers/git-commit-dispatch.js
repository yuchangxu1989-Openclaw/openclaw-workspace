'use strict';

/**
 * git-commit-dispatch.js
 * Handler for rule.git-commit-dispatch-001
 *
 * git.commit.completed 事件的路由分发器，将提交事件路由到
 * 质量检查、架构审查、规则-代码配对检查等下游管道。
 */

const path = require('path');
const { gitExec, writeReport, emitEvent, gateResult } = require('../lib/handler-utils');

const DOWNSTREAM_ACTIONS = [
  'git.commit.quality_check',
  'git.commit.architecture_review',
  'git.commit.rule_code_pairing',
];

/**
 * @param {object} context - ISC 运行时上下文
 * @param {string} context.repoRoot - 仓库根目录
 * @param {object} [context.bus] - 事件总线
 * @param {object} [context.event] - 触发事件
 * @returns {object} gate result
 */
async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const bus = context.bus;
  const checks = [];

  // 获取最新提交信息
  const lastCommit = gitExec(repoRoot, 'log -1 --pretty=format:"%H|%s|%an"');
  const [commitHash, commitMsg, author] = lastCommit ? lastCommit.replace(/"/g, '').split('|') : ['', '', ''];

  checks.push({
    name: 'commit-info-available',
    ok: !!commitHash,
    message: commitHash
      ? `最新提交: ${commitHash.slice(0, 8)} - ${commitMsg}`
      : '无法获取提交信息',
  });

  // 获取变更文件
  const changedFiles = gitExec(repoRoot, 'diff --name-only HEAD~1 HEAD 2>/dev/null') || '';
  const fileList = changedFiles.split('\n').filter(Boolean);

  checks.push({
    name: 'changed-files-detected',
    ok: fileList.length > 0,
    message: fileList.length > 0
      ? `${fileList.length} 个文件变更`
      : '未检测到文件变更',
  });

  // 向下游管道分发事件
  const dispatched = [];
  for (const action of DOWNSTREAM_ACTIONS) {
    const payload = {
      commitHash,
      commitMsg,
      author,
      changedFiles: fileList,
      timestamp: new Date().toISOString(),
    };
    const sent = await emitEvent(bus, action, payload);
    dispatched.push({ action, sent });
  }

  const dispatchedCount = dispatched.filter(d => d.sent).length;
  checks.push({
    name: 'downstream-dispatch',
    ok: true, // dispatch is best-effort
    message: bus
      ? `已分发到 ${dispatchedCount}/${DOWNSTREAM_ACTIONS.length} 个下游管道`
      : '事件总线不可用，跳过分发（dry-run模式）',
  });

  const result = gateResult('git-commit-dispatch-001', checks, { failClosed: false });

  writeReport(path.join(repoRoot, 'reports', 'git-commit-dispatch.json'), {
    rule: 'rule.git-commit-dispatch-001',
    timestamp: new Date().toISOString(),
    commit: { hash: commitHash, message: commitMsg, author },
    changedFiles: fileList.slice(0, 100),
    dispatched,
    status: result.status,
  });

  return result;
}

module.exports = handler;
