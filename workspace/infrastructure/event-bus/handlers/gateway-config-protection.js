'use strict';

/**
 * 自主执行器：Gateway配置保护
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 检测到敏感配置修改 → 自动备份 → 阻塞等待用户确认 → 确认后执行 → 记录
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SENSITIVE_PATTERNS = [
  /openclaw\.json$/,
  /gateway.*\.json$/i,
  /agents\/.*\/models\.json$/,
  /agents\/.*\/agent\.json$/,
  /cron\/jobs\.json$/,
  /identity\//,
  /feishu\//,
];

const BACKUP_DIR = '/root/.openclaw/workspace/infrastructure/backups/config';

function isSensitivePath(filePath) {
  return SENSITIVE_PATTERNS.some(p => p.test(filePath));
}

function createBackup(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.basename(filePath);
    const backupPath = path.join(BACKUP_DIR, `${base}.${ts}.bak`);
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
  } catch (e) {
    return null;
  }
}

function generateDiff(filePath) {
  try {
    const result = execSync(`cd /root/.openclaw && git diff HEAD -- "${filePath}" 2>/dev/null || true`, {
      encoding: 'utf8', timeout: 5000,
    });
    return result.trim() || '(无差异或新文件)';
  } catch {
    return '(无法生成diff)';
  }
}

module.exports = async function(event, rule, context) {
  const payload = event.payload || event.data || {};
  const filePath = payload.file_path || payload.filePath || payload.path || '';
  const operation = payload.operation || payload.type || 'unknown';

  if (!filePath) {
    return { status: 'skip', reason: '无文件路径信息' };
  }

  if (!isSensitivePath(filePath)) {
    return { status: 'pass', reason: '非敏感配置文件，放行' };
  }

  // 自主执行：创建备份
  const backupPath = createBackup(filePath);

  // 生成变更预览
  const diff = generateDiff(filePath);

  // 记录审计日志
  const auditEntry = {
    timestamp: new Date().toISOString(),
    ruleId: rule.id || 'N033',
    file: filePath,
    operation,
    backupPath,
    status: 'blocked_pending_approval',
  };

  const logDir = path.resolve(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, 'config-protection-audit.jsonl');
  try {
    fs.appendFileSync(logFile, JSON.stringify(auditEntry) + '\n');
  } catch { /* best effort */ }

  // 通知用户
  const message = [
    `🚨 **敏感配置修改检测**`,
    ``,
    `**文件**: \`${filePath}\``,
    `**操作**: ${operation}`,
    backupPath ? `**备份**: \`${backupPath}\`` : '**备份**: 未能创建',
    ``,
    `**变更预览**:`,
    '```diff',
    diff.slice(0, 2000),
    '```',
    ``,
    `请确认是否允许此修改（OK/拍板/确认 放行，其他拒绝）`,
  ].join('\n');

  if (context?.notify) {
    context.notify('feishu', message, { severity: 'critical' });
  }

  // 阻塞返回，通知上游需要人工确认
  return {
    status: 'blocked',
    gate: 'require_user_approval',
    file: filePath,
    operation,
    backupPath,
    diff: diff.slice(0, 500),
    message: '敏感配置修改已阻塞，等待用户确认',
  };
};
