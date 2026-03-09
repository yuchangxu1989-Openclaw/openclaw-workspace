'use strict';

/**
 * failure-pattern-code-escalation.js
 * Handler for ISC-FAILURE-PATTERN-CODE-ESCALATION-001
 *
 * 任何依赖LLM记忆/规则文本执行的行为模式，如果失败≥2次，
 * 必须从规则/记忆层下沉到代码层自动执行。
 * 禁止继续用AGENTS.md规则或MEMORY.md教训兜底。
 */

const path = require('path');
const fs = require('fs');
const { scanFiles, writeReport, gateResult } = require('../lib/handler-utils');

// 匹配"记忆兜底"模式的信号
const MEMORY_FALLBACK_PATTERNS = [
  { pattern: /记住|别忘|务必记得|下次注意|教训.*记住/g, label: 'memory-dependency-cn' },
  { pattern: /remember to|don't forget|lesson learned.*next time/gi, label: 'memory-dependency-en' },
  { pattern: /AGENTS\.md.*规则|MEMORY\.md.*教训/g, label: 'agents-memory-fallback' },
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

  // 扫描 memory 文件中的重复失败模式
  const memoryDir = path.join(repoRoot, 'memory');
  const failureCounts = {};

  scanFiles(memoryDir, /\.md$/, (filePath) => {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return;
    }

    // 查找重复出现的失败/教训模式
    const failureMatches = content.match(/失败|出错|遗忘|又忘了|再次.*错误|repeated failure/gi) || [];
    for (const m of failureMatches) {
      const key = m.toLowerCase().trim();
      failureCounts[key] = (failureCounts[key] || 0) + 1;
    }

    for (const { pattern, label } of MEMORY_FALLBACK_PATTERNS) {
      pattern.lastIndex = 0;
      const matches = content.match(pattern);
      if (matches && matches.length >= 2) {
        violations.push({
          file: path.relative(repoRoot, filePath),
          pattern: label,
          count: matches.length,
          sample: matches[0],
          action: '应下沉到代码层自动执行，禁止记忆兜底',
        });
      }
    }
  }, { maxDepth: 2 });

  // 检查重复失败是否超过阈值
  const repeatedFailures = Object.entries(failureCounts)
    .filter(([, count]) => count >= 2)
    .map(([pattern, count]) => ({ pattern, count }));

  checks.push({
    name: 'memory-fallback-detection',
    ok: violations.length === 0,
    message: violations.length === 0
      ? '未发现记忆兜底模式'
      : `发现 ${violations.length} 处记忆兜底模式，需下沉到代码层`,
  });

  checks.push({
    name: 'repeated-failure-threshold',
    ok: repeatedFailures.length === 0,
    message: repeatedFailures.length === 0
      ? '无重复失败模式'
      : `${repeatedFailures.length} 种失败模式重复≥2次，需代码化修复`,
  });

  const result = gateResult('failure-pattern-code-escalation-001', checks, { failClosed: false });

  writeReport(path.join(repoRoot, 'reports', 'failure-pattern-code-escalation.json'), {
    rule: 'ISC-FAILURE-PATTERN-CODE-ESCALATION-001',
    timestamp: new Date().toISOString(),
    summary: { violations: violations.length, repeatedFailures: repeatedFailures.length, status: result.status },
    violations: violations.slice(0, 30),
    repeatedFailures: repeatedFailures.slice(0, 20),
  });

  return result;
}

module.exports = handler;
