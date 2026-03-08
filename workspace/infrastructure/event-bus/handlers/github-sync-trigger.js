const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { exists, readText, readJson, walk, hasAny } = require('./p0-utils');

/**
 * GitHub Sync Trigger Handler
 * 
 * 规则意图：核心系统代码变更时自动git add + commit + push到GitHub
 * 感知：system.general.modified / system.commit.created / system.file.modified
 * 执行：检查scope，排除logs/tmp，执行git操作
 */
module.exports = async function(event, rule, context) {
  const logger = context.logger || console;
  const bus = context.bus;
  const workspace = context.workspace || process.cwd();

  logger.info(`[github-sync] Triggered by ${event.type}`, { eventId: event.id });

  // 允许同步的scope目录/文件
  const SYNC_SCOPE = [
    'skills/isc-core',
    'skills/lto-core',
    'infrastructure/event-bus',
    'infrastructure/evomap',
    'AGENTS.md',
    'CAPABILITY-ANCHOR.md',
    'SOUL.md',
    'MEMORY.md'
  ];

  // 排除的路径模式
  const EXCLUDE_PATTERNS = [
    'logs/',
    'tmp/',
    'node_modules/',
    '.git/',
    'reports/tmp',
    '*.log',
    '*.tmp'
  ];

  try {
    const payload = event.payload || {};
    const changedFiles = payload.files || payload.changed_files || payload.changedFiles || [];
    const commitMessage = payload.commit_message || payload.message || '';

    // === 感知：确定变更文件 ===
    let filesToSync = [];

    if (changedFiles.length > 0) {
      // 从事件中获取变更文件列表
      filesToSync = changedFiles.filter(f => isInScope(f, SYNC_SCOPE, EXCLUDE_PATTERNS));
    } else {
      // 自动检测git变更
      try {
        const gitStatus = execSync('git status --porcelain', {
          cwd: workspace,
          encoding: 'utf-8',
          timeout: 10000
        }).trim();

        if (gitStatus) {
          const allChanged = gitStatus.split('\n')
            .map(line => line.substring(3).trim())
            .filter(Boolean);
          filesToSync = allChanged.filter(f => isInScope(f, SYNC_SCOPE, EXCLUDE_PATTERNS));
        }
      } catch (gitErr) {
        logger.warn('[github-sync] Git status failed (not a git repo?)', gitErr.message);
        return {
          status: 'SKIPPED',
          reason: 'Not a git repository or git not available',
          timestamp: new Date().toISOString()
        };
      }
    }

    // === 判断：是否有需要同步的文件 ===
    if (filesToSync.length === 0) {
      logger.info('[github-sync] No in-scope files to sync');
      return {
        status: 'SKIPPED',
        reason: 'No in-scope files changed',
        timestamp: new Date().toISOString()
      };
    }

    logger.info(`[github-sync] ${filesToSync.length} file(s) to sync`, { files: filesToSync });

    // === 执行：git add + commit + push ===
    let gitResult = { added: false, committed: false, pushed: false };

    try {
      // git add
      for (const file of filesToSync) {
        try {
          execSync(`git add "${file}"`, {
            cwd: workspace,
            encoding: 'utf-8',
            timeout: 10000
          });
        } catch (addErr) {
          logger.warn(`[github-sync] Failed to add file: ${file}`, addErr.message);
        }
      }
      gitResult.added = true;
      logger.info('[github-sync] git add completed');

      // git commit
      const message = commitMessage ||
        `[auto-sync] ${event.type}: ${filesToSync.length} file(s) updated\n\nFiles:\n${filesToSync.map(f => `- ${f}`).join('\n')}`;

      try {
        execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
          cwd: workspace,
          encoding: 'utf-8',
          timeout: 15000
        });
        gitResult.committed = true;
        logger.info('[github-sync] git commit completed');
      } catch (commitErr) {
        // commit可能因为没有变更而失败
        if (commitErr.message.includes('nothing to commit')) {
          logger.info('[github-sync] Nothing to commit (already committed)');
          gitResult.committed = true;
        } else {
          throw commitErr;
        }
      }

      // git push
      try {
        execSync('git push', {
          cwd: workspace,
          encoding: 'utf-8',
          timeout: 30000
        });
        gitResult.pushed = true;
        logger.info('[github-sync] git push completed');
      } catch (pushErr) {
        logger.error('[github-sync] git push failed', pushErr.message);
        // push失败不阻断，但记录
        gitResult.pushError = pushErr.message;
      }
    } catch (gitErr) {
      logger.error('[github-sync] Git operation failed', gitErr.message);
      gitResult.error = gitErr.message;
    }

    // === 闭环：emit完成事件 ===
    if (bus) {
      await bus.emit('github.sync.completed', {
        source: 'github-sync-trigger',
        files: filesToSync,
        gitResult,
        trigger: event.type,
        timestamp: new Date().toISOString()
      });
    }

    return {
      status: gitResult.pushed ? 'SYNCED' : (gitResult.committed ? 'COMMITTED' : 'PARTIAL'),
      files: filesToSync,
      gitResult,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    logger.error('[github-sync] Unexpected error', err);
    throw err;
  }
};

function isInScope(filePath, scopes, excludes) {
  // 检查排除模式
  for (const exclude of excludes) {
    if (exclude.endsWith('/')) {
      if (filePath.startsWith(exclude) || filePath.includes('/' + exclude)) return false;
    } else if (exclude.startsWith('*')) {
      if (filePath.endsWith(exclude.substring(1))) return false;
    } else {
      if (filePath === exclude || filePath.includes(exclude)) return false;
    }
  }

  // 检查是否在scope内
  for (const scope of scopes) {
    if (filePath.startsWith(scope) || filePath === scope) return true;
  }

  return false;
}
