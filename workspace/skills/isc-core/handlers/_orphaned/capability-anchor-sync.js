/**
 * capability-anchor-sync handler
 * 
 * 触发规则: capability-anchor-lifecycle-sync-001
 * 职责: 技能生命周期变更时同步能力锚点
 */
const fs = require('fs');
const path = require('path');
const { scanFiles, checkFileExists, writeReport } = require('../lib/handler-utils');

const ANCHOR_FILE = 'CAPABILITY-ANCHOR.md';
const LOG_PATH = path.join(__dirname, '..', 'logs', 'capability-anchor-sync.jsonl');

module.exports = {
  name: 'capability-anchor-sync',

  /**
   * @param {Object} context
   * @param {string} context.skillName - 变更的技能名称
   * @param {string} context.action - 变更类型: created|modified|deleted
   * @param {string} [context.workspaceRoot] - 工作区根目录
   */
  async execute(context = {}) {
    const {
      skillName = 'unknown',
      action = 'modified',
      workspaceRoot = process.cwd(),
    } = context;

    const anchorPath = path.join(workspaceRoot, ANCHOR_FILE);
    const results = { synced: false, skillName, action, updates: [] };

    console.log(`[capability-anchor-sync] 技能 ${skillName} ${action}，开始同步锚点`);

    if (!checkFileExists(anchorPath)) {
      results.updates.push('anchor file not found, skip');
      return results;
    }

    // 扫描技能目录获取最新能力声明
    const skillDir = path.join(workspaceRoot, 'skills', skillName);
    const capabilities = [];
    if (checkFileExists(skillDir)) {
      scanFiles(skillDir, /SKILL\.md$/i, (filePath) => {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const nameMatch = content.match(/^#\s+(.+)/m);
          if (nameMatch) capabilities.push(nameMatch[1].trim());
        } catch { /* skip */ }
      });
    }

    // 更新锚点：确保技能条目存在
    let anchorContent = fs.readFileSync(anchorPath, 'utf8');
    let changed = false;

    for (const cap of capabilities) {
      if (!anchorContent.includes(cap)) {
        anchorContent += `\n- **${cap}** (skill): auto-synced from ${skillName}\n`;
        results.updates.push(`added: ${cap}`);
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(anchorPath, anchorContent, 'utf8');
      results.synced = true;
    }

    // 日志
    const logEntry = {
      timestamp: new Date().toISOString(),
      skillName,
      action,
      updates: results.updates,
    };
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(logEntry) + '\n');

    console.log(`[capability-anchor-sync] 完成: ${results.updates.length} 项更新`);
    return results;
  },
};
