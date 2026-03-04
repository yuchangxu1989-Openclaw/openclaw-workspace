#!/usr/bin/env node
/**
 * 能力锚点自动同步器
 * 从 ISC 规则自动生成 CAPABILITY-ANCHOR.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const _require = createRequire(import.meta.url);
const { WORKSPACE, SKILLS_DIR } = _require('../_shared/paths');

const CONFIG = {
  rulesDir: path.join(SKILLS_DIR, 'isc-core/rules'),
  anchorFile: path.join(WORKSPACE, 'CAPABILITY-ANCHOR.md'),
  skillsDir: SKILLS_DIR
};

class CapabilityAnchorSync {
  constructor() {
    this.capabilities = {
      core: [],
      zhipu: [],
      automation: [],
      external: []
    };
  }

  /**
   * 从 ISC 规则加载能力
   */
  loadFromISCRules() {
    const rules = fs.readdirSync(CONFIG.rulesDir)
      .filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(CONFIG.rulesDir, f), 'utf8')));

    for (const rule of rules) {
      if (rule.type === 'auto_router' && rule.routes) {
        for (const route of rule.routes) {
          this.capabilities.zhipu.push({
            name: route.skill,
            model: route.model,
            trigger: route.trigger,
            input: route.input_modal,
            output: route.output_modal,
            priority: route.priority,
            description: route.description || ''
          });
        }
      }
    }
  }

  /**
   * 从技能目录扫描
   */
  scanSkills() {
    const skills = fs.readdirSync(CONFIG.skillsDir)
      .filter(d => fs.statSync(path.join(CONFIG.skillsDir, d)).isDirectory());

    for (const skill of skills) {
      const skillMd = path.join(CONFIG.skillsDir, skill, 'SKILL.md');
      if (fs.existsSync(skillMd)) {
        const content = fs.readFileSync(skillMd, 'utf8');
        const match = content.match(/name:\s*(.+)/);
        if (match) {
          // 已记录的能力不再重复添加
          const exists = this.capabilities.zhipu.find(c => c.name === skill);
          if (!exists && !skill.startsWith('glm-') && !skill.startsWith('cog')) {
            this.capabilities.core.push({
              name: skill,
              path: `skills/${skill}/`
            });
          }
        }
      }
    }
  }

  /**
   * 生成能力锚点文档
   */
  generateAnchorDoc() {
    const lines = [];
    
    lines.push('# 系统能力锚点 - 根治遗忘');
    lines.push('# 自动生成的文档，请勿手动编辑（由 ISC 规则同步）');
    lines.push('');
    lines.push('> **生成时间**: ' + new Date().toLocaleString('zh-CN'));
    lines.push('> **来源**: ISC 规则自动同步');
    lines.push('');

    // 智谱能力矩阵（从 ISC 规则生成）
    lines.push('## 🟡 智谱多模态能力矩阵（ISC 规则自动生成）');
    lines.push('');
    
    for (const cap of this.capabilities.zhipu) {
      lines.push(`### ${cap.name}`);
      lines.push(`- **模型**: ${cap.model}`);
      lines.push(`- **触发词**: ${cap.trigger?.join(', ')}`);
      if (cap.input) lines.push(`- **输入**: ${cap.input.join(', ')}`);
      if (cap.output) lines.push(`- **输出**: ${cap.output.join(', ')}`);
      lines.push(`- **优先级**: ${cap.priority}`);
      if (cap.description) lines.push(`- **说明**: ${cap.description}`);
      lines.push('');
    }

    // 核心能力
    lines.push('## 🔴 核心能力');
    lines.push('');
    for (const cap of this.capabilities.core) {
      lines.push(`- **${cap.name}**: ${cap.path}`);
    }
    lines.push('');

    // 使用原则
    lines.push('## 🟣 使用原则');
    lines.push('');
    lines.push('1. **主模型**: Kimi K2.5（文本推理）');
    lines.push('2. **扩展模型**: 智谱（多模态、生成）');
    lines.push('3. **自动路由**: ISC规则自动识别需求，DTO调度对应模型');
    lines.push('4. **能力来源**: 本文档由 ISC 规则自动生成');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 同步
   */
  sync() {
    console.log('[CapabilitySync] 开始同步...');
    
    this.loadFromISCRules();
    this.scanSkills();
    
    const doc = this.generateAnchorDoc();
    fs.writeFileSync(CONFIG.anchorFile, doc);
    
    console.log(`[CapabilitySync] 已同步 ${this.capabilities.zhipu.length} 个智谱能力`);
    console.log(`[CapabilitySync] 已同步 ${this.capabilities.core.length} 个核心能力`);
    console.log(`[CapabilitySync] 文档已更新: ${CONFIG.anchorFile}`);
  }
}

// 运行
new CapabilityAnchorSync().sync();
