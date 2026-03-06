const fs = require('fs');
const path = require('path');
const { exists, readText, walk } = require('./p0-utils');

/**
 * 技能变更时自动更新CAPABILITY-ANCHOR.md中的索引
 * 感知：skill.general.created/updated/deleted / isc.skill_index.refresh_requested
 * 执行：扫描skills/→提取元数据→对比并更新CAPABILITY-ANCHOR.md→闭环
 */
module.exports = async function(event, rule, context) {
  const workspace = (context && context.workspace) || '/root/.openclaw/workspace';
  const logger = context.logger;
  const bus = context.bus;

  logger.info('[isc-skill-index-update] 启动技能索引更新');

  try {
    const skillsDir = path.join(workspace, 'skills');
    const anchorPath = path.join(workspace, 'CAPABILITY-ANCHOR.md');

    // 1. 扫描所有技能目录
    const skillEntries = [];
    if (exists(skillsDir)) {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
          if (exists(skillMdPath)) {
            const content = readText(skillMdPath);
            const skillInfo = extractSkillMeta(entry.name, content);
            skillEntries.push(skillInfo);
          } else {
            skillEntries.push({
              name: entry.name,
              description: '(无SKILL.md)',
              status: 'incomplete'
            });
          }
        }
      }
    } else {
      logger.warn('[isc-skill-index-update] skills目录不存在:', skillsDir);
    }

    logger.info(`[isc-skill-index-update] 扫描到 ${skillEntries.length} 个技能`);

    // 2. 读取现有CAPABILITY-ANCHOR.md
    let existingContent = '';
    if (exists(anchorPath)) {
      existingContent = readText(anchorPath);
    }

    // 3. 生成新的索引内容
    const indexSection = generateSkillIndex(skillEntries);

    // 4. 更新CAPABILITY-ANCHOR.md
    let newContent;
    const indexMarkerStart = '<!-- SKILL-INDEX-START -->';
    const indexMarkerEnd = '<!-- SKILL-INDEX-END -->';

    if (existingContent.includes(indexMarkerStart) && existingContent.includes(indexMarkerEnd)) {
      // 替换已有的索引区域
      const before = existingContent.split(indexMarkerStart)[0];
      const after = existingContent.split(indexMarkerEnd)[1] || '';
      newContent = before + indexMarkerStart + '\n' + indexSection + '\n' + indexMarkerEnd + after;
    } else if (existingContent) {
      // 追加索引区域
      newContent = existingContent + '\n\n' + indexMarkerStart + '\n' + indexSection + '\n' + indexMarkerEnd + '\n';
    } else {
      // 创建新文件
      newContent = `# CAPABILITY-ANCHOR.md\n\n能力锚点文档 - 技能索引\n\n${indexMarkerStart}\n${indexSection}\n${indexMarkerEnd}\n`;
    }

    // 5. 对比差异，决定是否写入
    if (newContent !== existingContent) {
      fs.writeFileSync(anchorPath, newContent, 'utf-8');
      logger.info(`[isc-skill-index-update] CAPABILITY-ANCHOR.md 已更新，${skillEntries.length} 个技能`);
    } else {
      logger.info('[isc-skill-index-update] 索引无变化，跳过写入');
    }

    bus.emit('skill.index.updated', {
      skillCount: skillEntries.length,
      anchorPath,
      skills: skillEntries.map(s => ({ name: s.name, status: s.status }))
    });

    return {
      status: 'completed',
      skillCount: skillEntries.length,
      skills: skillEntries,
      anchorPath
    };
  } catch (err) {
    logger.error('[isc-skill-index-update] 执行失败:', err.message);
    bus.emit('skill.index.update.failed', { error: err.message });
    throw err;
  }
};

function extractSkillMeta(dirName, content) {
  const meta = {
    name: dirName,
    description: '',
    status: 'active'
  };

  // 提取标题（第一个#行）
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    meta.displayName = titleMatch[1].trim();
  }

  // 提取描述（标题后第一个非空段落）
  const descMatch = content.match(/^#[^\n]+\n+([^\n#][^\n]+)/m);
  if (descMatch) {
    meta.description = descMatch[1].trim().substring(0, 200);
  }

  // 检测状态标记
  if (/status:\s*(deprecated|inactive|disabled)/i.test(content)) {
    meta.status = 'deprecated';
  } else if (/status:\s*(draft|wip)/i.test(content)) {
    meta.status = 'draft';
  }

  return meta;
}

function generateSkillIndex(skills) {
  if (skills.length === 0) {
    return '## 技能索引\n\n_暂无已注册技能_\n';
  }

  let index = '## 技能索引\n\n';
  index += `> 自动生成于 ${new Date().toISOString()} | 共 ${skills.length} 个技能\n\n`;
  index += '| 技能名称 | 描述 | 状态 |\n';
  index += '|---------|------|------|\n';

  for (const skill of skills.sort((a, b) => a.name.localeCompare(b.name))) {
    const statusEmoji = skill.status === 'active' ? '✅' : skill.status === 'draft' ? '📝' : '⚠️';
    const displayName = skill.displayName || skill.name;
    const desc = skill.description || '-';
    index += `| ${displayName} | ${desc} | ${statusEmoji} ${skill.status} |\n`;
  }

  return index;
}
