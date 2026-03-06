'use strict';

/**
 * 自主执行器：流水线汇报过滤
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 检测汇报事件 → 判断是否为噪音 → 静默常规更新 / 告警失败 / 通报重大发布
 */

const fs = require('fs');
const path = require('path');

// 噪音模式：版本号自动递增、仅 package.json 版本变更等
const NOISE_PATTERNS = [
  /^bump.*version/i,
  /^chore.*version/i,
  /^auto.*increment/i,
  /version\s*[:=]\s*["']\d+\.\d+\.\d+["']/,
];

function isNoiseUpdate(payload) {
  const msg = payload.message || payload.commit_message || payload.description || '';
  const files = payload.changed_files || payload.files || [];
  // 仅版本号变更
  if (NOISE_PATTERNS.some(p => p.test(msg))) return true;
  // 仅改了 package.json 的 version 字段
  if (files.length === 1 && /package\.json$/.test(files[0])) return true;
  return false;
}

function isSyncFailure(payload) {
  const ghStatus = (payload.github_status || '').toLowerCase();
  const evoStatus = (payload.evomap_status || '').toLowerCase();
  return ghStatus === 'failed' || evoStatus === 'failed' || payload.error;
}

function isMajorRelease(payload) {
  const oldVer = payload.old_version || payload.previous_version || '0.0.0';
  const newVer = payload.new_version || payload.version || '0.0.0';
  const [oldMajor] = oldVer.split('.');
  const [newMajor] = newVer.split('.');
  return Number(newMajor) > Number(oldMajor);
}

module.exports = async function(event, rule, context) {
  const payload = event.payload || event.data || {};
  const logDir = path.resolve(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  // Priority 1: 同步失败 → 立即告警
  if (isSyncFailure(payload)) {
    const alertMsg = [
      `🚨 **发布失败**`,
      `技能: ${payload.skill_name || 'unknown'}`,
      `GitHub: ${payload.github_status || 'N/A'}`,
      `EvoMap: ${payload.evomap_status || 'N/A'}`,
      `时间: ${new Date().toISOString()}`,
    ].join('\n');

    if (context?.notify) {
      context.notify('feishu', alertMsg, { severity: 'critical' });
    }
    if (context?.bus?.emit) {
      context.bus.emit('pipeline.report.failure', { ...payload, alert: alertMsg });
    }

    return { status: 'alerted', type: 'sync_failure', message: alertMsg };
  }

  // Priority 2: 重大发布 → 通报
  if (isMajorRelease(payload)) {
    const announceMsg = `🎉 **重大发布** ${payload.skill_name || 'unknown'} v${payload.new_version || payload.version}`;
    if (context?.notify) {
      context.notify('feishu', announceMsg, { severity: 'normal' });
    }
    return { status: 'announced', type: 'major_release', message: announceMsg };
  }

  // Priority 3: 噪音更新 → 静默记录
  if (isNoiseUpdate(payload)) {
    try {
      fs.appendFileSync(
        path.join(logDir, 'pipeline-silent.jsonl'),
        JSON.stringify({ timestamp: new Date().toISOString(), type: 'noise_suppressed', payload: { skill: payload.skill_name } }) + '\n'
      );
    } catch { /* best effort */ }
    return { status: 'suppressed', reason: '常规版本更新，已静默记录' };
  }

  // 默认：正常记录
  return { status: 'pass', reason: '非噪音、非失败、非重大发布，正常通过' };
};
