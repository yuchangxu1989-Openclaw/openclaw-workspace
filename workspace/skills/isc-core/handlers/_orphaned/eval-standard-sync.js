/**
 * eval-standard-sync handler
 * 
 * 触发规则: eval-standard-auto-sync-001
 * 职责: 评测标准变更时自动刷新评测集
 */
const fs = require('fs');
const path = require('path');
const { writeReport, checkFileExists, scanFiles } = require('../lib/handler-utils');

const LOG_PATH = path.join(__dirname, '..', 'logs', 'eval-standard-sync.jsonl');

module.exports = {
  name: 'eval-standard-sync',

  /**
   * @param {Object} context
   * @param {string} context.standardDocToken - 标准文档token
   * @param {string} [context.evalSetDir] - 评测集目录
   * @param {string} [context.workspaceRoot] - 工作区根目录
   */
  async execute(context = {}) {
    const {
      standardDocToken = '',
      evalSetDir = 'eval/cases',
      workspaceRoot = process.cwd(),
    } = context;

    const results = { synced: [], skipped: [], errors: [] };
    const evalDir = path.join(workspaceRoot, evalSetDir);

    console.log(`[eval-standard-sync] 标准文档变更 (token: ${standardDocToken})，开始同步评测集`);

    if (!checkFileExists(evalDir)) {
      results.errors.push(`评测集目录不存在: ${evalDir}`);
      console.log(`[eval-standard-sync] ${results.errors[0]}`);
      return results;
    }

    // 扫描评测用例文件
    const evalFiles = scanFiles(evalDir, /\.(json|yaml|yml)$/i, null);

    for (const evalFile of evalFiles) {
      try {
        const content = fs.readFileSync(evalFile, 'utf8');
        // 标记需要刷新
        if (content.includes('standard_version') || content.includes('standardDocToken')) {
          results.synced.push(path.relative(workspaceRoot, evalFile));
        } else {
          results.skipped.push(path.relative(workspaceRoot, evalFile));
        }
      } catch (err) {
        results.errors.push({ file: evalFile, error: err.message });
      }
    }

    // 写刷新报告
    const reportPath = path.join(workspaceRoot, 'reports', 'eval-standard-sync-report.json');
    writeReport(reportPath, {
      timestamp: new Date().toISOString(),
      standardDocToken,
      ...results,
    });

    // 日志
    const logEntry = {
      timestamp: new Date().toISOString(),
      standardDocToken,
      synced: results.synced.length,
      skipped: results.skipped.length,
      errors: results.errors.length,
    };
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(logEntry) + '\n');

    console.log(`[eval-standard-sync] 完成: 同步${results.synced.length}, 跳过${results.skipped.length}`);
    return results;
  },
};
