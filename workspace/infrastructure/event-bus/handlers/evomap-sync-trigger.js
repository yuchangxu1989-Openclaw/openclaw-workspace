const fs = require('fs');
const path = require('path');
const { exists, readText, readJson, walk, hasAny } = require('./p0-utils');

/**
 * EvoMap Sync Trigger Handler
 * 
 * 规则意图：技能创建/更新时自动同步到EvoMap网络
 * 感知：skill.general.published / skill.version.updated / skill.lifecycle.status_changed
 * 执行：读取SKILL.md，提取gene信息，写入/更新evomap registry JSON
 */
module.exports = async function(event, rule, context) {
  const logger = context.logger || console;
  const bus = context.bus;
  const workspace = context.workspace || process.cwd();

  logger.info(`[evomap-sync] Triggered by ${event.type}`, { eventId: event.id });

  try {
    const payload = event.payload || {};
    const skillName = payload.skill_name || payload.name || payload.skillName || '';
    const skillPath = payload.skill_path || payload.path || '';

    // === 感知：定位技能SKILL.md ===
    let skillMdPath = '';
    if (skillPath) {
      const candidate = path.resolve(workspace, skillPath, 'SKILL.md');
      if (await exists(candidate)) {
        skillMdPath = candidate;
      }
    }

    // 未指定路径时，尝试在 skills/ 目录下搜索
    if (!skillMdPath && skillName) {
      const candidates = [
        path.join(workspace, 'skills', skillName, 'SKILL.md'),
        path.join(workspace, 'skills', `${skillName}-core`, 'SKILL.md'),
        path.join(workspace, skillName, 'SKILL.md')
      ];
      for (const c of candidates) {
        if (await exists(c)) {
          skillMdPath = c;
          break;
        }
      }
    }

    if (!skillMdPath) {
      logger.warn(`[evomap-sync] Cannot locate SKILL.md for skill: ${skillName || skillPath}`);
      return {
        status: 'SKIPPED',
        reason: 'SKILL.md not found',
        skill: skillName || skillPath,
        timestamp: new Date().toISOString()
      };
    }

    logger.info(`[evomap-sync] Found SKILL.md at: ${skillMdPath}`);

    // === 执行：提取gene信息 ===
    const skillContent = await readText(skillMdPath);
    const geneInfo = extractGeneInfo(skillContent, skillName);

    logger.info(`[evomap-sync] Extracted gene info`, { gene: geneInfo.gene_id, capabilities: geneInfo.capabilities.length });

    // === 执行：更新EvoMap registry ===
    const registryPath = path.join(workspace, 'infrastructure/evomap/registry.json');
    const registryDir = path.dirname(registryPath);

    let registry = { version: '1.0.0', genes: {}, lastUpdated: null };

    if (await exists(registryPath)) {
      try {
        registry = await readJson(registryPath);
      } catch (e) {
        logger.warn('[evomap-sync] Failed to parse existing registry, creating new one');
      }
    }

    // 确保目录存在
    if (!fs.existsSync(registryDir)) {
      fs.mkdirSync(registryDir, { recursive: true });
    }

    // 更新或创建gene条目
    const geneId = geneInfo.gene_id;
    const existingGene = registry.genes[geneId];

    registry.genes[geneId] = {
      ...geneInfo,
      version: (existingGene ? (existingGene.version || 0) + 1 : 1),
      previousVersion: existingGene ? existingGene.version : null,
      updatedAt: new Date().toISOString(),
      createdAt: existingGene ? existingGene.createdAt : new Date().toISOString(),
      source: path.relative(workspace, skillMdPath),
      trigger: event.type
    };

    registry.lastUpdated = new Date().toISOString();

    // 写入registry
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
    logger.info(`[evomap-sync] Registry updated: ${registryPath}`);

    // === 闭环：emit完成事件 ===
    if (bus) {
      await bus.emit('evomap.sync.completed', {
        source: 'evomap-sync-trigger',
        gene_id: geneId,
        skill: skillName,
        action: existingGene ? 'updated' : 'created',
        registry: path.relative(workspace, registryPath),
        trigger: event.type,
        timestamp: new Date().toISOString()
      });
    }

    return {
      status: 'SYNCED',
      gene_id: geneId,
      skill: skillName,
      action: existingGene ? 'updated' : 'created',
      geneInfo,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    logger.error('[evomap-sync] Unexpected error', err);
    throw err;
  }
};

/**
 * 从SKILL.md中提取gene信息
 */
function extractGeneInfo(content, fallbackName) {
  const info = {
    gene_id: '',
    name: fallbackName || 'unknown',
    description: '',
    capabilities: [],
    triggers: [],
    dependencies: [],
    tags: []
  };

  // 提取标题作为名称
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    info.name = titleMatch[1].trim();
  }

  // 生成gene_id
  info.gene_id = (fallbackName || info.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // 提取描述（第一段非空文本）
  const descMatch = content.match(/^#.+\n+([^#\n].+)/m);
  if (descMatch) {
    info.description = descMatch[1].trim();
  }

  // 提取能力列表
  const capSection = content.match(/##\s*(能力|Capabilities|功能|Features)[\s\S]*?(?=\n##|\n$|$)/i);
  if (capSection) {
    const caps = capSection[0].match(/[-*]\s+(.+)/g);
    if (caps) {
      info.capabilities = caps.map(c => c.replace(/^[-*]\s+/, '').trim());
    }
  }

  // 提取触发词
  const triggerSection = content.match(/##\s*(触发|Triggers|触发词|Activation)[\s\S]*?(?=\n##|\n$|$)/i);
  if (triggerSection) {
    const triggers = triggerSection[0].match(/[-*]\s+(.+)/g);
    if (triggers) {
      info.triggers = triggers.map(t => t.replace(/^[-*]\s+/, '').trim());
    }
  }

  // 提取依赖
  const depSection = content.match(/##\s*(依赖|Dependencies|前置)[\s\S]*?(?=\n##|\n$|$)/i);
  if (depSection) {
    const deps = depSection[0].match(/[-*]\s+(.+)/g);
    if (deps) {
      info.dependencies = deps.map(d => d.replace(/^[-*]\s+/, '').trim());
    }
  }

  // 提取标签
  const tagMatch = content.match(/tags?:\s*\[?([^\]\n]+)\]?/i);
  if (tagMatch) {
    info.tags = tagMatch[1].split(/[,，]/).map(t => t.trim()).filter(Boolean);
  }

  return info;
}
