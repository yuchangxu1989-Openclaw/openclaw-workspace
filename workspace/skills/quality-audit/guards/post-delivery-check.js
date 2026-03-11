'use strict';
/**
 * 第3层防护：子Agent交付审计（事后兜底）
 * 扫描最近的git commit，检测skills/核心文件变更是否有stamp
 * 无stamp → 告警 + 可选自动revert
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE
  || path.join(process.env.OPENCLAW_HOME || '/root/.openclaw', 'workspace');

// 需要拦截的核心文件模式
const CORE_FILE_RE = /(index\.(js|ts|py|mjs)|SKILL\.md)$/;
// 排除skill-creator自身
const SELF_EXCLUDE_RE = /^skills\/skill-creator\//;

/**
 * 检查最近N个commit中skills/核心文件变更是否有stamp
 * @param {Object} opts
 * @param {number} opts.commits - 检查最近多少个commit（默认3）
 * @param {boolean} opts.autoRevert - 是否自动revert无stamp的commit（默认false）
 * @returns {{ ok: boolean, violations: Array, events: Array }}
 */
function checkRecentCommits(opts = {}) {
  const { commits = 3, autoRevert = false } = opts;
  const violations = [];
  const events = [];

  let commitList;
  try {
    commitList = execSync(`git -C "${WORKSPACE}" log --format='%H %s' -n ${commits}`, { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean);
  } catch {
    return { ok: true, violations: [], events: [], note: 'git log失败，跳过检查' };
  }

  for (const line of commitList) {
    const [commitHash, ...msgParts] = line.split(' ');
    const commitMsg = msgParts.join(' ');

    // 获取此commit变更的文件
    let changedFiles;
    try {
      changedFiles = execSync(
        `git -C "${WORKSPACE}" diff-tree --no-commit-id --name-only -r ${commitHash}`,
        { encoding: 'utf8' }
      ).trim().split('\n').filter(Boolean);
    } catch { continue; }

    // 筛选skills/核心文件
    const coreChanges = changedFiles.filter(f =>
      f.startsWith('workspace/skills/') && CORE_FILE_RE.test(f) && !SELF_EXCLUDE_RE.test(f)
    );

    if (coreChanges.length === 0) continue;

    // 提取涉及的技能目录（去重）
    const skillDirs = [...new Set(coreChanges.map(f => {
      const m = f.match(/^(skills\/[^/]+)\//);
      return m ? m[1] : null;
    }).filter(Boolean))];

    for (const sdir of skillDirs) {
      const stampPath = path.join(WORKSPACE, sdir, '.skill-creator-stamp');
      if (!fs.existsSync(stampPath)) {
        const v = {
          commit: commitHash.slice(0, 8),
          commitMsg,
          skillDir: sdir,
          files: coreChanges.filter(f => f.startsWith(sdir + '/')),
          reason: '无.skill-creator-stamp，未经流水线',
        };
        violations.push(v);

        // 发出告警事件
        events.push({
          event_type: 'quality.audit.skill-creator-bypass-detected',
          timestamp: new Date().toISOString(),
          severity: 'critical',
          detail: v,
        });

        console.error(`🚨 [post-delivery-check] 违规检测: commit ${v.commit} 修改了 ${sdir} 但无stamp`);

        // 自动revert（可选）
        if (autoRevert) {
          try {
            execSync(`git -C "${WORKSPACE}" revert --no-edit ${commitHash}`, { encoding: 'utf8' });
            v.reverted = true;
            console.error(`⏪ 已自动revert commit ${v.commit}`);
          } catch (e) {
            v.reverted = false;
            v.revertError = e.message;
            console.error(`⚠️ 自动revert失败: ${e.message}`);
          }
        }
      }
    }
  }

  // 写入事件日志
  if (events.length > 0) {
    const logDir = path.join(WORKSPACE, 'reports', 'quality-audit');
    try {
      fs.mkdirSync(logDir, { recursive: true });
      const logFile = path.join(logDir, 'skill-bypass-events.jsonl');
      const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
      fs.appendFileSync(logFile, lines);
    } catch (e) {
      console.error(`⚠️ 事件日志写入失败: ${e.message}`);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    events,
    checked_commits: commitList.length,
  };
}

// CLI支持：node post-delivery-check.js [--auto-revert] [--commits N]
if (require.main === module) {
  const args = process.argv.slice(2);
  const autoRevert = args.includes('--auto-revert');
  const commitsIdx = args.indexOf('--commits');
  const commits = commitsIdx >= 0 ? parseInt(args[commitsIdx + 1]) || 3 : 3;

  const result = checkRecentCommits({ commits, autoRevert });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

module.exports = { checkRecentCommits };
