'use strict';

/**
 * automation-gap-scanner.js
 * Handler for rule.arch-machine-over-human-004
 *
 * 扫描项目中依赖人工检查/人工纪律的约束，识别自动化缺口。
 * 原则：所有"应该做"必须自动化为"必须做"，依赖人记忆的约束等于没有约束。
 */

const path = require('path');
const { scanFiles, writeReport, gateResult } = require('../lib/handler-utils');

// 人工依赖的信号模式
const MANUAL_PATTERNS = [
  { pattern: /请手动|手动检查|手动执行|人工检查|人工确认/g, label: 'manual-check-cn' },
  { pattern: /TODO:\s*(remember|don't forget|manually)/gi, label: 'todo-manual' },
  { pattern: /\bmanual(ly)?\s+(check|verify|run|execute|review)\b/gi, label: 'manual-check-en' },
  { pattern: /记得|别忘了|务必人工/g, label: 'human-memory-dependency' },
];

/**
 * @param {object} context - ISC 运行时上下文
 * @param {string} context.repoRoot - 仓库根目录
 * @param {object} [context.bus] - 事件总线
 * @returns {object} gate result
 */
async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const checks = [];
  const gaps = [];

  // 扫描规则文件、技能文件、脚本中的人工依赖
  const scanDirs = [
    path.join(repoRoot, 'skills'),
    path.join(repoRoot, 'scripts'),
    path.join(repoRoot, 'docs'),
  ];

  for (const dir of scanDirs) {
    scanFiles(dir, /\.(js|sh|md|json)$/, (filePath) => {
      let content;
      try {
        content = require('fs').readFileSync(filePath, 'utf8');
      } catch {
        return;
      }

      for (const { pattern, label } of MANUAL_PATTERNS) {
        // Reset lastIndex for global regex
        pattern.lastIndex = 0;
        const matches = content.match(pattern);
        if (matches && matches.length > 0) {
          gaps.push({
            file: path.relative(repoRoot, filePath),
            pattern: label,
            count: matches.length,
            sample: matches[0],
          });
        }
      }
    }, { maxDepth: 4, skip: ['node_modules', '.git', '.entropy-archive', 'vendor'] });
  }

  // 构建检查结果
  checks.push({
    name: 'automation-gap-scan',
    ok: gaps.length === 0,
    message: gaps.length === 0
      ? '未发现人工依赖缺口'
      : `发现 ${gaps.length} 处自动化缺口，需要将人工检查转为自动化`,
  });

  const result = gateResult('arch-machine-over-human-004', checks, { failClosed: false });

  // 写报告
  const reportPath = path.join(repoRoot, 'reports', 'automation-gap-scan.json');
  writeReport(reportPath, {
    rule: 'rule.arch-machine-over-human-004',
    timestamp: new Date().toISOString(),
    summary: {
      totalGaps: gaps.length,
      status: result.status,
    },
    gaps: gaps.slice(0, 50), // cap at 50
  });

  return result;
}

module.exports = handler;
