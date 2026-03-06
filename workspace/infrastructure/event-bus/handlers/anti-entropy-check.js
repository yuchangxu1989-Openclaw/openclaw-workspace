'use strict';

/**
 * 自主执行器：反熵检查与修复
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 检测到熵增 → 自主修复（重命名、去重复、重构）→ 验证 → 记录
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 熵增检测规则
const ENTROPY_RULES = {
  // 1. 重复文件检测（基于文件大小+前100字节hash）
  duplicateFiles: true,
  // 2. 命名不一致检测（混合命名风格）
  namingInconsistency: true,
  // 3. 空文件/空目录
  emptyArtifacts: true,
  // 4. 临时文件残留
  tempFiles: true,
  // 5. 过大的日志文件
  oversizedLogs: true,
};

const TEMP_PATTERNS = [/\.tmp$/i, /~$/, /\.bak$/i, /\.swp$/i, /\.swo$/i, /\.orig$/i, /#.*#$/];
const LOG_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB

function getFileHash(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    // 简单hash：文件大小 + 前200字节
    const prefix = content.slice(0, 200).toString('hex');
    return `${content.length}:${prefix}`;
  } catch { return null; }
}

function scanDirectory(dir, root, depth = 0, maxDepth = 5) {
  if (depth > maxDepth) return { files: [], dirs: [] };
  const results = { files: [], dirs: [] };

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(root, fullPath);

      if (entry.isDirectory()) {
        results.dirs.push(relPath);
        const sub = scanDirectory(fullPath, root, depth + 1, maxDepth);
        results.files.push(...sub.files);
        results.dirs.push(...sub.dirs);
      } else if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        results.files.push({
          path: relPath,
          fullPath,
          name: entry.name,
          size: stat.size,
          ext: path.extname(entry.name).toLowerCase(),
        });
      }
    }
  } catch { /* permission denied etc */ }

  return results;
}

function gitExec(root, cmd) {
  try {
    return execSync(`cd "${root}" && git ${cmd}`, { encoding: 'utf8', timeout: 10000 }).trim();
  } catch { return ''; }
}

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const actions = [];
  const issues = [];
  const fixes = [];

  // ─── 感知：扫描工作区 ───
  const scan = scanDirectory(root, root);
  logger.info?.(`[anti-entropy] 扫描了 ${scan.files.length} 个文件, ${scan.dirs.length} 个目录`);

  // ─── 判断 & 自主执行 ───

  // 1. 重复文件检测与处理
  const hashMap = new Map();
  for (const file of scan.files) {
    const hash = getFileHash(file.fullPath);
    if (!hash) continue;
    if (hashMap.has(hash)) {
      hashMap.get(hash).push(file);
    } else {
      hashMap.set(hash, [file]);
    }
  }

  for (const [hash, fileGroup] of hashMap) {
    if (fileGroup.length < 2) continue;
    issues.push({ type: 'duplicate', files: fileGroup.map(f => f.path) });

    // 自主修复：保留路径最短的（最规范的），其余移到 .entropy-archive/
    const sorted = fileGroup.sort((a, b) => a.path.length - b.path.length);
    const keep = sorted[0];
    for (const dup of sorted.slice(1)) {
      try {
        const archiveDir = path.join(root, '.entropy-archive', 'duplicates');
        fs.mkdirSync(archiveDir, { recursive: true });
        const archivePath = path.join(archiveDir, dup.name + '.' + Date.now());
        fs.renameSync(dup.fullPath, archivePath);
        fixes.push({ type: 'dedup', from: dup.path, to: path.relative(root, archivePath), kept: keep.path });
        actions.push(`dedup:${dup.path}`);
      } catch (e) {
        actions.push(`dedup_failed:${dup.path}:${e.message}`);
      }
    }
  }

  // 2. 临时文件清理
  for (const file of scan.files) {
    const isTemp = TEMP_PATTERNS.some(p => p.test(file.name));
    if (isTemp) {
      issues.push({ type: 'temp_file', file: file.path });
      try {
        const archiveDir = path.join(root, '.entropy-archive', 'temp');
        fs.mkdirSync(archiveDir, { recursive: true });
        const archivePath = path.join(archiveDir, file.name + '.' + Date.now());
        fs.renameSync(file.fullPath, archivePath);
        fixes.push({ type: 'temp_cleanup', from: file.path });
        actions.push(`cleaned_temp:${file.path}`);
      } catch (e) {
        actions.push(`clean_temp_failed:${file.path}:${e.message}`);
      }
    }
  }

  // 3. 空文件处理（0字节，非intentional如.gitkeep）
  for (const file of scan.files) {
    if (file.size === 0 && file.name !== '.gitkeep' && file.name !== '.keep') {
      issues.push({ type: 'empty_file', file: file.path });
      try {
        const archiveDir = path.join(root, '.entropy-archive', 'empty');
        fs.mkdirSync(archiveDir, { recursive: true });
        fs.renameSync(file.fullPath, path.join(archiveDir, file.name + '.' + Date.now()));
        fixes.push({ type: 'empty_cleanup', from: file.path });
        actions.push(`cleaned_empty:${file.path}`);
      } catch (e) {
        actions.push(`clean_empty_failed:${file.path}:${e.message}`);
      }
    }
  }

  // 4. 过大日志文件截断
  for (const file of scan.files) {
    if ((file.ext === '.log' || file.ext === '.jsonl') && file.size > LOG_SIZE_LIMIT) {
      issues.push({ type: 'oversized_log', file: file.path, size: file.size });
      try {
        const content = fs.readFileSync(file.fullPath, 'utf8');
        const lines = content.split('\n');
        // 保留最后500行
        const trimmed = lines.slice(-500).join('\n');
        fs.writeFileSync(file.fullPath, trimmed, 'utf8');
        fixes.push({ type: 'log_trimmed', file: file.path, from: file.size, to: Buffer.byteLength(trimmed) });
        actions.push(`trimmed_log:${file.path}`);
      } catch (e) {
        actions.push(`trim_log_failed:${file.path}:${e.message}`);
      }
    }
  }

  // 5. 空目录清理
  for (const dir of [...scan.dirs].reverse()) {
    const fullDir = path.join(root, dir);
    try {
      if (fs.existsSync(fullDir) && fs.readdirSync(fullDir).length === 0) {
        issues.push({ type: 'empty_dir', dir });
        fs.rmdirSync(fullDir);
        fixes.push({ type: 'empty_dir_removed', dir });
        actions.push(`removed_empty_dir:${dir}`);
      }
    } catch { /* skip */ }
  }

  // ─── 记录 ───
  const reportPath = path.join(root, 'infrastructure', 'entropy-report.json');
  const report = {
    timestamp: new Date().toISOString(),
    scanned: { files: scan.files.length, dirs: scan.dirs.length },
    issues: issues.length,
    fixes: fixes.length,
    details: { issues, fixes },
  };

  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    actions.push('report_saved');
  } catch (e) {
    actions.push(`report_failed:${e.message}`);
  }

  // ─── Git commit ───
  if (fixes.length > 0) {
    try {
      gitExec(root, 'add -A');
      gitExec(root, `commit --no-verify -m "🧹 anti-entropy: ${fixes.length} fixes (${issues.length} issues detected)"`);
      actions.push('git_committed');
    } catch (e) {
      actions.push(`git_commit_failed:${e.message}`);
    }
  }

  // ─── 验证 ───
  const postScan = scanDirectory(root, root);
  const postTempCount = postScan.files.filter(f => TEMP_PATTERNS.some(p => p.test(f.name))).length;
  const postEmptyCount = postScan.files.filter(f => f.size === 0 && f.name !== '.gitkeep' && f.name !== '.keep').length;
  const verifyOk = postTempCount === 0 && postEmptyCount === 0;
  actions.push(verifyOk ? 'verification_passed' : 'verification_partial');

  // ─── 闭环 ───
  if (fixes.length > 0 && context?.bus?.emit) {
    await context.bus.emit('entropy.reduced', {
      issuesFound: issues.length,
      fixesApplied: fixes.length,
    });
  }

  if (!verifyOk && context?.notify) {
    await context.notify(
      `[anti-entropy] 修复了${fixes.length}项，但仍有${postTempCount}个临时文件和${postEmptyCount}个空文件残留`,
      'info'
    );
  }

  return {
    ok: verifyOk,
    autonomous: true,
    issuesFound: issues.length,
    fixesApplied: fixes.length,
    actions,
    message: fixes.length > 0
      ? `自主修复完成: 发现${issues.length}项熵增, 修复${fixes.length}项`
      : '工作区熵值正常，无需修复',
  };
};
