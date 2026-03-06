const fs = require('fs');
const path = require('path');
const { exists, readText, readJson, walk, hasAny } = require('./p0-utils');

/**
 * Capability Anchor Register Handler
 * 
 * 规则意图：新增能力时自动写入CAPABILITY-ANCHOR.md
 * 感知：skill.general.created/updated/modified / system.general.discovered/added
 * 执行：从event提取能力信息，检查是否已存在，不存在则追加
 */
module.exports = async function(event, rule, context) {
  const logger = context.logger || console;
  const bus = context.bus;
  const workspace = context.workspace || process.cwd();

  logger.info(`[capability-anchor] Triggered by ${event.type}`, { eventId: event.id });

  try {
    const payload = event.payload || {};

    // === 感知：提取能力信息 ===
    const capabilityName = payload.capability_name || payload.name || payload.skill_name || '';
    const capabilityType = payload.capability_type || payload.type || payload.category || 'general';
    const triggerWords = payload.trigger_words || payload.triggers || payload.triggerWords || [];
    const description = payload.description || '';
    const source = payload.source || payload.skill_path || '';

    if (!capabilityName) {
      logger.warn('[capability-anchor] No capability name found in event payload');
      return {
        status: 'SKIPPED',
        reason: 'No capability name in payload',
        timestamp: new Date().toISOString()
      };
    }

    logger.info(`[capability-anchor] Processing capability: ${capabilityName} (type: ${capabilityType})`);

    // === 感知：读取现有CAPABILITY-ANCHOR.md ===
    const anchorPath = path.join(workspace, 'CAPABILITY-ANCHOR.md');
    let anchorContent = '';
    let anchorExists = false;

    if (await exists(anchorPath)) {
      anchorContent = await readText(anchorPath);
      anchorExists = true;
    }

    // === 判断：是否已存在 ===
    const normalizedName = capabilityName.toLowerCase().trim();
    if (anchorContent.toLowerCase().includes(normalizedName)) {
      logger.info(`[capability-anchor] Capability "${capabilityName}" already registered, checking for updates`);

      // 检查是否需要更新（触发词变更等）
      const existingLine = anchorContent.split('\n').find(
        l => l.toLowerCase().includes(normalizedName)
      );

      if (existingLine && description && !existingLine.includes(description.substring(0, 30))) {
        // 需要更新描述
        const updatedLine = formatCapabilityEntry(capabilityName, capabilityType, description, triggerWords, source);
        anchorContent = anchorContent.replace(existingLine, updatedLine);
        fs.writeFileSync(anchorPath, anchorContent, 'utf-8');
        logger.info(`[capability-anchor] Updated existing entry for: ${capabilityName}`);

        if (bus) {
          await bus.emit('capability.anchor.updated', {
            source: 'capability-anchor-register',
            capability: capabilityName,
            action: 'updated',
            trigger: event.type,
            timestamp: new Date().toISOString()
          });
        }

        return {
          status: 'UPDATED',
          capability: capabilityName,
          type: capabilityType,
          timestamp: new Date().toISOString()
        };
      }

      return {
        status: 'ALREADY_EXISTS',
        capability: capabilityName,
        timestamp: new Date().toISOString()
      };
    }

    // === 执行：追加到CAPABILITY-ANCHOR.md ===
    if (!anchorExists) {
      // 创建新文件
      anchorContent = generateAnchorHeader();
    }

    // 确定分类位置
    const categoryHeader = getCategoryHeader(capabilityType);
    const entry = formatCapabilityEntry(capabilityName, capabilityType, description, triggerWords, source);

    if (anchorContent.includes(categoryHeader)) {
      // 在对应分类下追加
      const insertPos = anchorContent.indexOf(categoryHeader) + categoryHeader.length;
      // 找到下一个分类或文件末尾
      const nextCategoryMatch = anchorContent.substring(insertPos).match(/\n### /);
      const insertEnd = nextCategoryMatch
        ? insertPos + nextCategoryMatch.index
        : anchorContent.length;

      const before = anchorContent.substring(0, insertEnd);
      const after = anchorContent.substring(insertEnd);
      anchorContent = before + '\n' + entry + after;
    } else {
      // 添加新分类
      anchorContent += `\n${categoryHeader}\n\n${entry}\n`;
    }

    fs.writeFileSync(anchorPath, anchorContent, 'utf-8');
    logger.info(`[capability-anchor] Registered new capability: ${capabilityName} under ${capabilityType}`);

    // === 闭环：emit完成事件 ===
    if (bus) {
      await bus.emit('capability.anchor.updated', {
        source: 'capability-anchor-register',
        capability: capabilityName,
        type: capabilityType,
        action: 'created',
        trigger: event.type,
        timestamp: new Date().toISOString()
      });
    }

    return {
      status: 'REGISTERED',
      capability: capabilityName,
      type: capabilityType,
      triggerWords,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    logger.error('[capability-anchor] Unexpected error', err);
    throw err;
  }
};

function generateAnchorHeader() {
  return `# CAPABILITY-ANCHOR.md

> 能力锚点注册表 — 自动维护，记录系统所有已注册能力

> 最后更新: ${new Date().toISOString()}

`;
}

function getCategoryHeader(type) {
  const categories = {
    'core': '### 🏗️ 核心能力 / Core',
    'skill': '### 🎯 技能能力 / Skills',
    'tool': '### 🔧 工具能力 / Tools',
    'automation': '### ⚡ 自动化能力 / Automation',
    'analysis': '### 📊 分析能力 / Analysis',
    'integration': '### 🔗 集成能力 / Integration',
    'general': '### 📌 通用能力 / General'
  };
  return categories[type.toLowerCase()] || categories['general'];
}

function formatCapabilityEntry(name, type, description, triggers, source) {
  let entry = `- **${name}**`;
  if (description) {
    entry += ` — ${description}`;
  }
  if (triggers && triggers.length > 0) {
    entry += `\n  - 触发词: \`${triggers.join('`, `')}\``;
  }
  if (source) {
    entry += `\n  - 来源: \`${source}\``;
  }
  return entry;
}
