'use strict';

/**
 * check-dependency-direction.js
 * Handler for rule.dependency-direction-check-001
 *
 * skills不得直接引用infrastructure目录，依赖方向必须自顶向下。
 */

const fs = require('fs');
const path = require('path');
const { scanFiles, writeReport, gateResult } = require('../lib/handler-utils');

const INFRA_IMPORT_PATTERNS = [
  /require\s*\(\s*['"].*infrastructure/g,
  /from\s+['"].*infrastructure/g,
  /import.*infrastructure/g,
  /source\s+.*infrastructure/g,
];

/**
 * @param {object} context - ISC 运行时上下文
 * @param {string} context.repoRoot - 仓库根目录
 * @returns {object} gate result
 */
async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const checks = [];
  const violations = [];

  const skillsDir = path.join(repoRoot, 'skills');

  scanFiles(skillsDir, /\.(js|ts|sh)$/, (filePath) => {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return;
    }

    for (const pat of INFRA_IMPORT_PATTERNS) {
      pat.lastIndex = 0;
      const matches = content.match(pat);
      if (matches && matches.length > 0) {
        violations.push({
          file: path.relative(repoRoot, filePath),
          pattern: matches[0],
          count: matches.length,
        });
        break;
      }
    }
  }, { maxDepth: 5, skip: ['node_modules', '.git', '.entropy-archive'] });

  checks.push({
    name: 'no-upward-dependency',
    ok: violations.length === 0,
    message: violations.length === 0
      ? 'skills目录未发现对infrastructure的直接引用'
      : `${violations.length} 个文件违反依赖方向约束，skills直接引用infrastructure`,
  });

  const result = gateResult('dependency-direction-check-001', checks, { failClosed: true });

  writeReport(path.join(repoRoot, 'reports', 'dependency-direction-check.json'), {
    rule: 'rule.dependency-direction-check-001',
    timestamp: new Date().toISOString(),
    summary: { status: result.status, violationCount: violations.length },
    violations: violations.slice(0, 50),
  });

  return result;
}

module.exports = handler;
