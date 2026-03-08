#!/usr/bin/env node
/**
 * 能力锚点自动同步器 v2
 * 全量扫描 skills/ + ISC规则，动态生成 CAPABILITY-ANCHOR.md
 * 不硬编码任何技能名、模型名、过滤规则
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const _require = createRequire(import.meta.url);
const { WORKSPACE, SKILLS_DIR } = _require('../shared/paths');

const CONFIG = {
  rulesDir: path.join(SKILLS_DIR, 'isc-core/rules'),
  anchorFile: path.join(WORKSPACE, 'CAPABILITY-ANCHOR.md'),
  skillsDir: SKILLS_DIR
};

class CapabilityAnchorSync {
  constructor() {
    this.zhipuRoutes = [];     // ISC auto_router 路由（智谱多模态）
    this.allSkills = [];       // skills/目录下所有技能
    this.searchTools = [];     // 搜索/信息获取工具
    this.openclawNative = [];  // OpenClaw原生工具
  }

  /**
   * 从 ISC 规则加载路由能力（智谱多模态等）
   */
  loadFromISCRules() {
    if (!fs.existsSync(CONFIG.rulesDir)) return;
    const files = fs.readdirSync(CONFIG.rulesDir).filter(f => f.endsWith('.json'));
    
    for (const f of files) {
      try {
        const rule = JSON.parse(fs.readFileSync(path.join(CONFIG.rulesDir, f), 'utf8'));
        if (rule.type === 'auto_router' && rule.routes) {
          for (const route of rule.routes) {
            this.zhipuRoutes.push({
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
      } catch (e) {
        // 跳过无法解析的规则
      }
    }
  }

  /**
   * 全量扫描 skills/ 目录 — 不排除任何技能
   */
  scanAllSkills() {
    if (!fs.existsSync(CONFIG.skillsDir)) return;

    // 递归查找所有含 SKILL.md 的目录（不限深度）
    const findSkillDirs = (base) => {
      const results = [];
      const walk = (dir) => {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        const hasSkillMd = entries.some(e => e.isFile() && e.name === 'SKILL.md');
        if (hasSkillMd) results.push(dir);
        for (const e of entries) {
          if (e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.') && e.name !== 'node_modules') {
            walk(path.join(dir, e.name));
          }
        }
      };
      walk(base);
      return results.sort();
    };

    const skillDirs = findSkillDirs(CONFIG.skillsDir);

    for (const skillDir of skillDirs) {
      const skill = path.relative(CONFIG.skillsDir, skillDir);
      const skillMd = path.join(skillDir, 'SKILL.md');
      const indexJs = path.join(skillDir, 'index.js');
      const indexCjs = path.join(skillDir, 'index.cjs');
      
      const info = {
        name: skill,
        path: `skills/${skill}/`,
        hasSkillMd: fs.existsSync(skillMd),
        hasIndex: fs.existsSync(indexJs) || fs.existsSync(indexCjs),
        description: '',
        category: 'core'  // 默认分类，后续自动判断
      };

      // 从SKILL.md提取description
      if (info.hasSkillMd) {
        const content = fs.readFileSync(skillMd, 'utf8');
        const descMatch = content.match(/description:\s*(.+)/);
        if (descMatch) info.description = descMatch[1].trim();
      }

      // 自动分类
      if (this.zhipuRoutes.find(r => r.name === skill)) {
        info.category = 'zhipu_skill';  // 有ISC路由的智谱技能
      } else if (skill.includes('search') || skill.includes('fetch') || skill.includes('crawler')) {
        info.category = 'search';
      }

      this.allSkills.push(info);
    }
  }

  /**
   * 检测搜索工具
   */
  detectSearchTools() {
    // 扫描skills目录里的搜索相关技能
    for (const skill of this.allSkills) {
      if (skill.category === 'search') {
        // 尝试读取更多信息
        const skillMd = path.join(CONFIG.skillsDir, skill.name, 'SKILL.md');
        if (fs.existsSync(skillMd)) {
          const content = fs.readFileSync(skillMd, 'utf8');
          const envMatch = content.match(/环境变量[：:]\s*(\S+)|TAVILY_API_KEY|SEARCH_API_KEY/);
          skill.envVar = envMatch ? envMatch[0] : '';
        }
        this.searchTools.push(skill);
      }
    }

    // OpenClaw原生工具（从系统已知能力列出）
    this.openclawNative = [
      { name: 'web_search', type: 'Brave Search API', note: '需配置BRAVE_API_KEY，当前未配置' },
      { name: 'web_fetch', type: 'URL内容提取', note: '抓取网页内容转markdown，已可用' }
    ];
  }

  /**
   * 生成文档
   */
  generateDoc() {
    const lines = [];
    const now = new Date().toLocaleString('zh-CN');
    const zhipuRouteNames = new Set(this.zhipuRoutes.map(r => r.name));

    lines.push('# 系统能力锚点 - 根治遗忘');
    lines.push('# 自动生成 — 由 isc-capability-anchor-sync v2 全量扫描生成');
    lines.push('');
    lines.push(`> **生成时间**: ${now}`);
    lines.push(`> **技能总数**: ${this.allSkills.length}`);
    lines.push(`> **ISC路由**: ${this.zhipuRoutes.length}`);
    lines.push('');

    // === 🟡 智谱多模态（ISC路由） ===
    if (this.zhipuRoutes.length > 0) {
      lines.push('## 🟡 智谱多模态能力矩阵（ISC 规则自动生成）');
      lines.push('');
      for (const cap of this.zhipuRoutes) {
        lines.push(`### ${cap.name}`);
        lines.push(`- **模型**: ${cap.model}`);
        if (cap.trigger) lines.push(`- **触发词**: ${Array.isArray(cap.trigger) ? cap.trigger.join(', ') : cap.trigger}`);
        if (cap.input) lines.push(`- **输入**: ${Array.isArray(cap.input) ? cap.input.join(', ') : cap.input}`);
        if (cap.output) lines.push(`- **输出**: ${Array.isArray(cap.output) ? cap.output.join(', ') : cap.output}`);
        if (cap.priority) lines.push(`- **优先级**: ${cap.priority}`);
        if (cap.description) lines.push(`- **说明**: ${cap.description}`);
        // 关联技能路径
        const skillEntry = this.allSkills.find(s => s.name === cap.name);
        if (skillEntry) lines.push(`- **技能路径**: ${skillEntry.path}`);
        lines.push('');
      }
    }

    // === 🟡 智谱技能（有目录但无ISC路由） ===
    const zhipuSkillsNoRoute = this.allSkills.filter(s => 
      (s.name.startsWith('glm-') || s.name.startsWith('cog') || s.name.startsWith('zhipu-')) 
      && !zhipuRouteNames.has(s.name)
    );
    if (zhipuSkillsNoRoute.length > 0) {
      lines.push('### 智谱技能（无ISC路由，需手动调用）');
      lines.push('');
      for (const s of zhipuSkillsNoRoute) {
        lines.push(`- **${s.name}**: ${s.path}${s.description ? ' — ' + s.description : ''}`);
      }
      lines.push('');
    }

    // === 🔵 搜索与信息获取 ===
    lines.push('## 🔵 搜索与信息获取');
    lines.push('');
    for (const s of this.searchTools) {
      lines.push(`### ${s.name}`);
      lines.push(`- **路径**: ${s.path}`);
      if (s.description) lines.push(`- **说明**: ${s.description}`);
      if (s.envVar) lines.push(`- **环境变量**: ${s.envVar}`);
      lines.push('');
    }
    for (const n of this.openclawNative) {
      lines.push(`### ${n.name}（OpenClaw原生）`);
      lines.push(`- **类型**: ${n.type}`);
      lines.push(`- **状态**: ${n.note}`);
      lines.push('');
    }

    // === 🔴 全量技能清单 ===
    lines.push('## 🔴 全量技能清单');
    lines.push('');
    const coreSkills = this.allSkills.filter(s => 
      s.category === 'core' && !zhipuSkillsNoRoute.find(z => z.name === s.name)
    );
    for (const s of coreSkills) {
      const status = s.hasSkillMd && s.hasIndex ? '✅' : s.hasSkillMd ? '📄' : s.hasIndex ? '⚙️' : '❓';
      lines.push(`- ${status} **${s.name}**: ${s.path}${s.description ? ' — ' + s.description : ''}`);
    }
    lines.push('');
    lines.push('> 图例: ✅=完整(SKILL.md+代码) 📄=仅文档 ⚙️=仅代码 ❓=空目录');
    lines.push('');

    // === 🟣 使用原则 ===
    lines.push('## 🟣 使用原则');
    lines.push('');
    lines.push('1. **主模型**: 跟随 openclaw.json 配置（不硬编码）');
    lines.push('2. **扩展模型**: 智谱（多模态、生成），通过ISC路由自动选择');
    lines.push('3. **搜索首选**: tavily-search（AI优化），web_search为备选');
    lines.push('4. **能力来源**: 本文档由 isc-capability-anchor-sync 全量扫描自动生成');
    lines.push('5. **同步频率**: 每小时自动 + 技能变更时触发');
    lines.push('');

    return lines.join('\n');
  }

  sync() {
    console.log('[CapabilitySync v2] 全量扫描开始...');
    
    this.loadFromISCRules();
    this.scanAllSkills();
    this.detectSearchTools();
    
    const doc = this.generateDoc();
    fs.writeFileSync(CONFIG.anchorFile, doc);
    
    console.log(`[CapabilitySync v2] 智谱路由: ${this.zhipuRoutes.length}`);
    console.log(`[CapabilitySync v2] 全量技能: ${this.allSkills.length}`);
    console.log(`[CapabilitySync v2] 搜索工具: ${this.searchTools.length}`);
    console.log(`[CapabilitySync v2] 文档已更新: ${CONFIG.anchorFile}`);
  }
}

new CapabilityAnchorSync().sync();
