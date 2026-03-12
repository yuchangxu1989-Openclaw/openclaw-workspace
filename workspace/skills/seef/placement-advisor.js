#!/usr/bin/env node
/**
 * placement-advisor.js — 文件放置决策模块
 * 
 * 根据文件名、功能描述、内容摘要，推断文件应放在项目中的哪个目录。
 * 
 * Usage:
 *   node placement-advisor.js --name "handler-utils.js" --desc "ISC handler公共函数库"
 *   node placement-advisor.js --name "event-bus.js" --desc "全局事件总线" --content "EventEmitter, publish, subscribe"
 * 
 * Output: JSON { suggestedDir, reason, confidence }
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.SEEF_WORKSPACE || '/root/.openclaw/workspace';

// ── Rule definitions ────────────────────────────────────────────────

const INFRA_KEYWORDS = [
  'event-bus', 'event bus', 'dispatcher', 'intent-engine', 'intent engine',
  'state-tracker', 'rule-engine', 'pipeline', 'bootstrap', 'kernel',
  'enforcement', 'gate', 'condition-evaluator', 'resilience', 'self-healing',
  'monitoring', 'observability', 'probes', 'feedback', 'decision-log',
  'feature-flag', 'llm-context', 'vector-service', 'message-hook',
];

const SCRIPT_KEYWORDS = [
  'cron', 'backup', 'cleanup', 'governor', 'monitor', 'probe', 'report',
  'check', 'migrate', 'install', 'deploy', 'maintenance', 'retry',
  'snapshot', 'refresh', 'send-', 'push-', 'auto-', 'safe-interrupt',
];

const SCRIPT_EXTENSIONS = ['.sh', '.bash'];

// Skills that exist under skills/
let _skillList = null;
function getSkillList() {
  if (_skillList) return _skillList;
  const skillsDir = path.join(WORKSPACE, 'skills');
  try {
    _skillList = fs.readdirSync(skillsDir).filter(d => {
      try { return fs.statSync(path.join(skillsDir, d)).isDirectory(); } catch { return false; }
    });
  } catch {
    _skillList = [];
  }
  return _skillList;
}

// ── Matching helpers ────────────────────────────────────────────────

function matchesAny(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.filter(k => lower.includes(k));
}

function findRelatedSkill(name, desc, content) {
  const combined = `${name} ${desc} ${content}`.toLowerCase();
  const skills = getSkillList();

  // Direct prefix/contains match
  for (const skill of skills) {
    const norm = skill.replace(/-/g, ' ');
    if (combined.includes(skill) || combined.includes(norm)) {
      return skill;
    }
  }

  // Heuristic: "isc-xxx" → isc-core, "feishu-xxx" → check feishu-* skills, etc.
  const prefixMap = {
    'isc': 'isc-core',
    'seef': 'seef',
    'evomap': 'evomap',
    'cras': 'cras',
    'dto': 'dto-core',
    'lto': 'lto-core',
    'lep': 'lep-executor',
    'pdca': 'aeo/pdca',
    'glm': null, // multiple glm-* skills, need more context
  };

  for (const [prefix, target] of Object.entries(prefixMap)) {
    if (combined.includes(prefix) && target && skills.includes(target)) {
      return target;
    }
  }

  // Check for "feishu" — multiple feishu-* skills, try desc matching
  if (combined.includes('feishu')) {
    const feishuSkills = skills.filter(s => s.startsWith('feishu-'));
    for (const fs of feishuSkills) {
      const key = fs.replace('feishu-', '');
      if (combined.includes(key)) return fs;
    }
    // Default to feishu-common if generic
    if (skills.includes('feishu-common')) return 'feishu-common';
  }

  return null;
}

// ── Core decision logic ─────────────────────────────────────────────

function advise(name, desc, content = '') {
  const combined = `${name} ${desc} ${content}`;
  const ext = path.extname(name);

  // 1. Related skill match
  const relatedSkill = findRelatedSkill(name, desc, content);
  if (relatedSkill) {
    // Decide subdirectory: if it's a lib/util, suggest lib/
    const isLib = /util|helper|common|shared|lib/i.test(combined);
    const subDir = isLib ? `skills/${relatedSkill}/lib` : `skills/${relatedSkill}`;
    return {
      suggestedDir: subDir,
      reason: `文件功能关联已有技能 "${relatedSkill}"${isLib ? '，属于工具/库文件，放入lib子目录' : ''}`,
      confidence: 0.85,
    };
  }

  // 2. Shared utility (multi-skill)
  if (/shared|common|util.*多|公共|通用/i.test(combined) && !/特定|专用/i.test(combined)) {
    // Check if desc mentions multiple skills
    const mentionedSkills = getSkillList().filter(s => combined.toLowerCase().includes(s));
    if (mentionedSkills.length >= 2 || /多个|跨|共用|shared/i.test(combined)) {
      return {
        suggestedDir: 'skills/shared',
        reason: `多个技能共用的工具函数${mentionedSkills.length >= 2 ? `（涉及: ${mentionedSkills.join(', ')}）` : ''}`,
        confidence: 0.8,
      };
    }
  }

  // 3. Infrastructure
  const infraMatches = matchesAny(combined, INFRA_KEYWORDS);
  if (infraMatches.length > 0) {
    // Try to find specific infra subdir
    const infraDir = path.join(WORKSPACE, 'infrastructure');
    let subDir = 'infrastructure';
    try {
      const infraDirs = fs.readdirSync(infraDir).filter(d =>
        fs.statSync(path.join(infraDir, d)).isDirectory()
      );
      for (const d of infraDirs) {
        if (combined.toLowerCase().includes(d.replace(/-/g, ' ')) || combined.toLowerCase().includes(d)) {
          subDir = `infrastructure/${d}`;
          break;
        }
      }
    } catch {}
    return {
      suggestedDir: subDir,
      reason: `基础设施组件（匹配关键词: ${infraMatches.slice(0, 3).join(', ')}）`,
      confidence: 0.75,
    };
  }

  // 4. Operations script
  if (SCRIPT_EXTENSIONS.includes(ext) || matchesAny(combined, SCRIPT_KEYWORDS).length > 0) {
    const scriptMatches = matchesAny(combined, SCRIPT_KEYWORDS);
    return {
      suggestedDir: 'scripts',
      reason: `运维/工具脚本${scriptMatches.length ? `（匹配: ${scriptMatches.slice(0, 3).join(', ')}）` : `（扩展名: ${ext}）`}`,
      confidence: 0.7,
    };
  }

  // 5. Default: suggest new skill directory
  const baseName = name.replace(/\.[^.]+$/, '').replace(/[._]/g, '-');
  return {
    suggestedDir: `skills/${baseName}`,
    reason: '未匹配已有目录，建议创建新技能目录',
    confidence: 0.4,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : '';
  };

  const name = get('--name');
  const desc = get('--desc');
  const content = get('--content');

  if (!name) {
    console.error('Usage: node placement-advisor.js --name <filename> --desc <description> [--content <summary>]');
    process.exit(1);
  }

  const result = advise(name, desc, content);
  console.log(JSON.stringify(result, null, 2));
}

// Export for programmatic use
module.exports = { advise };

if (require.main === module) main();
