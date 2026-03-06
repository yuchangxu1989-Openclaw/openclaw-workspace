const fs = require('fs');
const path = require('path');
const { exists, readText, readJson, walk, hasAny } = require('./p0-utils');

/**
 * Auto-Skillization Handler
 * 
 * 规则意图：技能质量分>=50时自动触发技能化流程
 * 感知：isc.rule.matched / isc.category.matched
 * 执行：检查SKILL.md是否存在+完整，不完整则自动生成骨架SKILL.md
 */
module.exports = async function(event, rule, context) {
  const logger = context.logger || console;
  const bus = context.bus;
  const workspace = context.workspace || process.cwd();

  logger.info(`[auto-skillization] Triggered by ${event.type}`, { eventId: event.id });

  try {
    const payload = event.payload || {};
    const skillName = payload.skill_name || payload.name || payload.skillName || '';
    const qualityScore = payload.quality_score || payload.qualityScore || payload.score || 0;
    const skillDir = payload.skill_path || payload.skillDir || '';

    // === 判断：质量分是否达标 ===
    if (qualityScore < 50) {
      logger.info(`[auto-skillization] Skipping: quality_score=${qualityScore} (< 50)`);
      return {
        status: 'SKIPPED',
        reason: `Quality score ${qualityScore} below threshold (50)`,
        skill: skillName,
        timestamp: new Date().toISOString()
      };
    }

    logger.info(`[auto-skillization] Quality score ${qualityScore} >= 50, proceeding`);

    // === 感知：定位技能目录 ===
    let resolvedSkillDir = '';
    if (skillDir) {
      resolvedSkillDir = path.resolve(workspace, skillDir);
    } else if (skillName) {
      const candidates = [
        path.join(workspace, 'skills', skillName),
        path.join(workspace, 'skills', `${skillName}-core`),
        path.join(workspace, skillName)
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          resolvedSkillDir = c;
          break;
        }
      }
      // 如果都不存在，创建默认路径
      if (!resolvedSkillDir) {
        resolvedSkillDir = path.join(workspace, 'skills', skillName);
      }
    }

    if (!resolvedSkillDir) {
      logger.warn('[auto-skillization] Cannot determine skill directory');
      return {
        status: 'ERROR',
        reason: 'Cannot determine skill directory',
        timestamp: new Date().toISOString()
      };
    }

    // === 执行：检查SKILL.md存在性和完整性 ===
    const skillMdPath = path.join(resolvedSkillDir, 'SKILL.md');
    let needsGeneration = false;
    let needsCompletion = false;
    const missingParts = [];

    if (await exists(skillMdPath)) {
      const content = await readText(skillMdPath);

      // 完整性检查：必须包含以下段落
      const requiredSections = [
        { key: 'title', patterns: [/^#\s+/m] },
        { key: 'description', patterns: [/##\s*(描述|Description|简介|Overview)/i] },
        { key: 'capabilities', patterns: [/##\s*(能力|Capabilities|功能|Features)/i] },
        { key: 'usage', patterns: [/##\s*(使用|Usage|用法|How to)/i] },
        { key: 'triggers', patterns: [/##\s*(触发|Triggers|激活|Activation)/i] }
      ];

      for (const section of requiredSections) {
        const found = section.patterns.some(p => p.test(content));
        if (!found) {
          missingParts.push(section.key);
        }
      }

      if (missingParts.length > 0) {
        needsCompletion = true;
        logger.info(`[auto-skillization] SKILL.md incomplete, missing: ${missingParts.join(', ')}`);
      } else {
        logger.info('[auto-skillization] SKILL.md exists and is complete');
      }
    } else {
      needsGeneration = true;
      logger.info('[auto-skillization] SKILL.md does not exist, generating skeleton');
    }

    // === 执行：生成或补全SKILL.md ===
    if (needsGeneration) {
      // 确保目录存在
      if (!fs.existsSync(resolvedSkillDir)) {
        fs.mkdirSync(resolvedSkillDir, { recursive: true });
      }

      const skeleton = generateSkillSkeleton(skillName, payload);
      fs.writeFileSync(skillMdPath, skeleton, 'utf-8');
      logger.info(`[auto-skillization] Generated SKILL.md at: ${skillMdPath}`);
    } else if (needsCompletion) {
      const currentContent = await readText(skillMdPath);
      const completedContent = completeSkeleton(currentContent, missingParts, skillName, payload);
      fs.writeFileSync(skillMdPath, completedContent, 'utf-8');
      logger.info(`[auto-skillization] Completed SKILL.md with missing sections: ${missingParts.join(', ')}`);
    }

    // === 闭环：emit完成事件 ===
    const result = {
      status: needsGeneration ? 'GENERATED' : (needsCompletion ? 'COMPLETED' : 'ALREADY_COMPLETE'),
      skill: skillName,
      skillDir: path.relative(workspace, resolvedSkillDir),
      qualityScore,
      missingParts: needsGeneration ? ['all'] : missingParts,
      timestamp: new Date().toISOString()
    };

    if (bus) {
      await bus.emit('skill.skillization.triggered', {
        source: 'auto-skillization',
        ...result,
        trigger: event.type
      });
    }

    return result;
  } catch (err) {
    logger.error('[auto-skillization] Unexpected error', err);
    throw err;
  }
};

function generateSkillSkeleton(name, payload) {
  const displayName = name.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const desc = payload.description || `${displayName} skill auto-generated by skillization pipeline.`;

  return `# ${displayName}

## 描述 / Description

${desc}

## 能力 / Capabilities

- TODO: 列出该技能的核心能力

## 使用 / Usage

\`\`\`
TODO: 使用说明
\`\`\`

## 触发 / Triggers

- TODO: 列出触发该技能的条件或关键词

## 依赖 / Dependencies

- TODO: 列出依赖的其他技能或工具

## 配置 / Configuration

- TODO: 配置项说明

---

> 此文件由 auto-skillization handler 自动生成于 ${new Date().toISOString()}
> 质量评分: ${payload.quality_score || payload.qualityScore || 'N/A'}
`;
}

function completeSkeleton(content, missingParts, name, payload) {
  let result = content;

  const templates = {
    description: `\n## 描述 / Description\n\nTODO: 补充技能描述\n`,
    capabilities: `\n## 能力 / Capabilities\n\n- TODO: 列出核心能力\n`,
    usage: `\n## 使用 / Usage\n\n\`\`\`\nTODO: 使用说明\n\`\`\`\n`,
    triggers: `\n## 触发 / Triggers\n\n- TODO: 列出触发条件\n`,
    title: '' // title缺失时不追加，应该已有
  };

  for (const part of missingParts) {
    if (templates[part]) {
      result += templates[part];
    }
  }

  result += `\n---\n> 以上缺失段落由 auto-skillization handler 自动补全于 ${new Date().toISOString()}\n`;

  return result;
}
