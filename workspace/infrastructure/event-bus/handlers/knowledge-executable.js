const fs = require('fs');
const path = require('path');
const { exists, readText, walk } = require('./p0-utils');

/**
 * 可执行知识发现与规则生成
 * 感知：knowledge.general.created / user.teaching.received / system.error.lesson_extracted
 * 执行：扫描MEMORY.md→发现可执行知识→自动创建规则→验证→闭环
 */
module.exports = async function(event, rule, context) {
  const workspace = (context && context.workspace) || '/root/.openclaw/workspace';
  const logger = context.logger;
  const bus = context.bus;

  logger.info('[knowledge-executable] 启动可执行知识发现');

  try {
    // 1. 收集知识源文件
    const sources = [];
    const memoryMd = path.join(workspace, 'MEMORY.md');
    const memoryDir = path.join(workspace, 'memory');

    if (exists(memoryMd)) {
      sources.push({ file: memoryMd, content: readText(memoryMd) });
    }
    if (exists(memoryDir)) {
      const mdFiles = walk(memoryDir, ['.md']);
      for (const f of mdFiles) {
        sources.push({ file: f, content: readText(f) });
      }
    }

    // 也接受事件携带的内容
    if (event.content || event.payload?.content) {
      sources.push({ file: 'event-payload', content: event.content || event.payload.content });
    }

    if (sources.length === 0) {
      logger.info('[knowledge-executable] 无知识源文件');
      return { status: 'skipped', reason: 'no_knowledge_sources' };
    }

    logger.info(`[knowledge-executable] 发现 ${sources.length} 个知识源文件`);

    // 2. 正则识别可执行模式
    const executablePatterns = [
      { regex: /每次(.{5,80})必须(.{5,80})/g, type: 'mandatory', template: 'enforcement' },
      { regex: /禁止(.{5,80})/g, type: 'prohibition', template: 'gate' },
      { regex: /规则[：:](.{5,200})/g, type: 'rule', template: 'enforcement' },
      { regex: /总是(.{5,80})(?:然后|再|并)(.{5,80})/g, type: 'always', template: 'automation' },
      { regex: /如果(.{5,80})(?:则|就|应该)(.{5,80})/g, type: 'conditional', template: 'conditional' },
      { regex: /不要(.{5,80})/g, type: 'prohibition', template: 'gate' },
      { regex: /必须先(.{5,80})(?:再|才能|然后)(.{5,80})/g, type: 'sequence', template: 'gate' },
      { regex: /永远不(.{5,80})/g, type: 'prohibition', template: 'gate' },
    ];

    const discoveries = [];

    for (const source of sources) {
      for (const pattern of executablePatterns) {
        let match;
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        while ((match = regex.exec(source.content)) !== null) {
          const fullMatch = match[0].trim();
          // 去重：避免同一条知识被多次发现
          if (!discoveries.find(d => d.text === fullMatch)) {
            discoveries.push({
              text: fullMatch,
              type: pattern.type,
              template: pattern.template,
              source: path.basename(source.file),
              groups: match.slice(1).map(g => g?.trim())
            });
          }
        }
      }
    }

    logger.info(`[knowledge-executable] 发现 ${discoveries.length} 条可执行知识`);

    // 3. 检查已有规则，避免重复
    const rulesDir = path.join(workspace, 'infrastructure', 'isc', 'rules');
    if (!fs.existsSync(rulesDir)) {
      fs.mkdirSync(rulesDir, { recursive: true });
    }
    const existingRules = exists(rulesDir) ? walk(rulesDir, ['.json']) : [];
    const existingRuleContents = existingRules.map(f => {
      try { return readText(f); } catch { return ''; }
    }).join('\n');

    const created = [];
    const skipped = [];

    for (const discovery of discoveries) {
      // 生成规则ID（基于知识内容的简化hash）
      const ruleId = generateRuleId(discovery);

      // 检查是否已有类似规则
      if (existingRuleContents.includes(discovery.text.substring(0, 30)) || 
          existingRules.some(f => path.basename(f).includes(ruleId))) {
        skipped.push({ ruleId, reason: 'already_exists', text: discovery.text });
        continue;
      }

      // 生成规则JSON骨架
      const ruleJson = {
        id: `rule.knowledge-${ruleId}-001`,
        name: `knowledge-${ruleId}`,
        domain: 'knowledge',
        type: discovery.template,
        scope: 'workspace',
        description: `自动从知识发现生成: ${discovery.text.substring(0, 100)}`,
        source: {
          file: discovery.source,
          originalText: discovery.text,
          discoveredAt: new Date().toISOString()
        },
        trigger: {
          events: [`knowledge.${discovery.type}.triggered`]
        },
        action: {
          type: 'handler',
          handler: `knowledge-${ruleId}.js`
        },
        governance: {
          auto_execute: false,
          councilRequired: true,
          reason: '自动生成规则需人工确认'
        }
      };

      const ruleFileName = `rule.knowledge-${ruleId}-001.json`;
      const ruleFilePath = path.join(rulesDir, ruleFileName);

      fs.writeFileSync(ruleFilePath, JSON.stringify(ruleJson, null, 2), 'utf-8');

      // 验证文件可读
      try {
        JSON.parse(fs.readFileSync(ruleFilePath, 'utf-8'));
        created.push({ ruleId, file: ruleFileName, text: discovery.text });
        logger.info(`[knowledge-executable] 已创建规则: ${ruleFileName}`);
      } catch (e) {
        logger.error(`[knowledge-executable] 规则验证失败: ${ruleFileName}`, e.message);
        fs.unlinkSync(ruleFilePath);
      }
    }

    const result = {
      status: 'completed',
      discovered: discoveries.length,
      created: created.length,
      skipped: skipped.length,
      createdRules: created,
      skippedRules: skipped
    };

    bus.emit('knowledge.executable.created', {
      discovered: discoveries.length,
      created: created.length,
      rules: created.map(c => c.file)
    });

    logger.info('[knowledge-executable] 完成', result);
    return result;
  } catch (err) {
    logger.error('[knowledge-executable] 执行失败:', err.message);
    bus.emit('knowledge.executable.failed', { error: err.message });
    throw err;
  }
};

function generateRuleId(discovery) {
  // 简化的ID生成：从文本中提取关键词
  const text = discovery.text
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
    .substring(0, 20);
  // 简单hash
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash = hash & hash; // 32bit int
  }
  return Math.abs(hash).toString(36).substring(0, 8);
}
