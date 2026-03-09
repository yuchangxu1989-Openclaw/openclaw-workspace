#!/usr/bin/env node
'use strict';

/**
 * Skill发布传感器 - 监控skills/public/目录变更，发射发布相关事件
 * 
 * 覆盖规则：
 *   - rule.public-skill-quality-gate-001 (skill.public.pre_publish)
 *   - rule.skill-distribution-separation-001 (skill.general.publish_requested)
 */

const fs = require('fs');
const path = require('path');
const bus = require('../bus-adapter');

const WORKSPACE = path.resolve(__dirname, '../../..');
const PUBLIC_SKILLS_DIR = path.join(WORKSPACE, 'skills/public');
const SKILLS_DIR = path.join(WORKSPACE, 'skills');
const STATE_FILE = path.join(__dirname, '.skill-publish-sensor-state.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch (_) { return { lastScan: 0, knownSkills: {} }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getSkillDirs(baseDir) {
  if (!fs.existsSync(baseDir)) return [];
  return fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => ({ name: d.name, path: path.join(baseDir, d.name) }));
}

function getSkillFingerprint(skillDir) {
  const files = [];
  try {
    const entries = fs.readdirSync(skillDir);
    for (const e of entries) {
      const fp = path.join(skillDir, e);
      try {
        const st = fs.statSync(fp);
        if (st.isFile()) files.push({ name: e, mtime: st.mtimeMs, size: st.size });
      } catch (_) {}
    }
  } catch (_) {}
  return JSON.stringify(files);
}

async function scan() {
  const state = loadState();
  const now = Date.now();
  
  // Scan public skills for quality gate
  const publicSkills = getSkillDirs(PUBLIC_SKILLS_DIR);
  for (const skill of publicSkills) {
    const fp = getSkillFingerprint(skill.path);
    const prev = state.knownSkills[`public/${skill.name}`];
    
    if (!prev) {
      // New public skill
      await bus.emit('skill.public.pre_publish', {
        skillName: skill.name,
        skillPath: `skills/public/${skill.name}`,
        action: 'new',
        sensor: 'skill-publish-sensor'
      }, 'skill-publish-sensor');
      state.knownSkills[`public/${skill.name}`] = fp;
    } else if (prev !== fp) {
      // Modified public skill
      await bus.emit('skill.public.modified', {
        skillName: skill.name,
        skillPath: `skills/public/${skill.name}`,
        action: 'modified',
        sensor: 'skill-publish-sensor'
      }, 'skill-publish-sensor');
      state.knownSkills[`public/${skill.name}`] = fp;
    }
  }

  // Scan all skills for distribution separation
  const allSkillDirs = getSkillDirs(SKILLS_DIR);
  for (const skill of allSkillDirs) {
    const fp = getSkillFingerprint(skill.path);
    const key = `all/${skill.name}`;
    const prev = state.knownSkills[key];
    
    if (!prev || prev !== fp) {
      // Check if skill has distribution metadata
      const skillMd = path.join(skill.path, 'SKILL.md');
      if (fs.existsSync(skillMd)) {
        const content = fs.readFileSync(skillMd, 'utf8');
        if (content.includes('distribution:') || content.includes('evomap')) {
          await bus.emit('skill.general.publish_requested', {
            skillName: skill.name,
            skillPath: `skills/${skill.name}`,
            action: prev ? 'modified' : 'new',
            sensor: 'skill-publish-sensor'
          }, 'skill-publish-sensor');
        }
      }
      state.knownSkills[key] = fp;
    }
  }

  state.lastScan = now;
  saveState(state);
}

if (require.main === module) {
  scan().then(() => console.log('[skill-publish-sensor] scan complete'))
    .catch(e => console.error('[skill-publish-sensor] error:', e.message));
}

module.exports = { scan };
