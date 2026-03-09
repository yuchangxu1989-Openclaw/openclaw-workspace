/**
 * capability-anchor-register handler
 * 
 * 触发规则: capability-anchor-auto-register-001
 * 职责: 新增通用能力时自动写入 CAPABILITY-ANCHOR.md
 */
const fs = require('fs');
const path = require('path');
const { writeReport, scanFiles, checkFileExists } = require('../lib/handler-utils');

const ANCHOR_FILE = 'CAPABILITY-ANCHOR.md';
const LOG_PATH = path.join(__dirname, '..', 'logs', 'capability-anchor-register.jsonl');

module.exports = {
  name: 'capability-anchor-register',

  /**
   * @param {Object} context
   * @param {string} context.capabilityName - 能力名称
   * @param {string} context.capabilityType - 类型: tool|model|skill|interaction
   * @param {string} context.description - 能力描述
   * @param {string} [context.triggerWords] - 触发词
   * @param {string} [context.workspaceRoot] - 工作区根目录
   */
  async execute(context = {}) {
    const {
      capabilityName = 'unknown',
      capabilityType = 'tool',
      description = '',
      triggerWords = '',
      workspaceRoot = process.cwd(),
    } = context;

    const anchorPath = path.join(workspaceRoot, ANCHOR_FILE);
    const results = { registered: false, reason: '' };

    // 读取现有锚点文件
    let anchorContent = '';
    if (checkFileExists(anchorPath)) {
      anchorContent = fs.readFileSync(anchorPath, 'utf8');
    }

    // 检查是否已注册
    if (anchorContent.includes(capabilityName)) {
      results.reason = `capability "${capabilityName}" already registered`;
      console.log(`[capability-anchor-register] ${results.reason}`);
      return results;
    }

    // 生成锚点条目
    const entry = `\n- **${capabilityName}** (${capabilityType}): ${description}${triggerWords ? ` [触发词: ${triggerWords}]` : ''}`;

    // 查找对应分类区段并追加
    const sectionHeader = `## ${capabilityType}`;
    if (anchorContent.includes(sectionHeader)) {
      const idx = anchorContent.indexOf(sectionHeader);
      const nextSection = anchorContent.indexOf('\n## ', idx + sectionHeader.length);
      const insertPos = nextSection === -1 ? anchorContent.length : nextSection;
      anchorContent = anchorContent.slice(0, insertPos) + entry + '\n' + anchorContent.slice(insertPos);
    } else {
      anchorContent += `\n${sectionHeader}\n${entry}\n`;
    }

    fs.writeFileSync(anchorPath, anchorContent, 'utf8');
    results.registered = true;

    // 日志
    const logEntry = {
      timestamp: new Date().toISOString(),
      capabilityName,
      capabilityType,
      action: 'registered',
    };
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(logEntry) + '\n');

    console.log(`[capability-anchor-register] 已注册能力: ${capabilityName}`);
    return results;
  },
};
