#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const WS = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(WS, 'skills');

const LOCAL_PATTERNS = [
  /\/root\//,
  /\/home\//,
  /~\/.openclaw/,
  /MEMORY\.md/,
  /memory\//,
  /skills\/isc-core\//,
  /skills\/dto-core\//,
  /skills\/cras\//,
  /skills\/aeo\//,
  /cron\/jobs\.json/,
  /openclaw\.json/,
  /sk-[A-Za-z0-9]{20,}/,  // hardcoded API keys
];

function scanDir(dir) {
  const files = [];
  try {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.name === 'node_modules' || f.name === '.git') continue;
      if (f.isDirectory()) files.push(...scanDir(p));
      else if (/\.(js|ts|md|json)$/.test(f.name)) files.push(p);
    }
  } catch (_) {}
  return files;
}

function classifySkill(skillDir) {
  const name = path.basename(skillDir);
  const files = scanDir(skillDir);
  const hits = [];

  for (const f of files) {
    if (path.basename(f) === 'SKILL.md' && fs.statSync(f).size < 5) continue;
    try {
      const content = fs.readFileSync(f, 'utf8');
      for (const pat of LOCAL_PATTERNS) {
        if (pat.test(content)) {
          hits.push({ file: path.relative(skillDir, f), pattern: pat.source });
        }
      }
    } catch (_) {}
  }

  const hasSkillMd = fs.existsSync(path.join(skillDir, 'SKILL.md'));
  const unique = [...new Set(hits.map(h => h.pattern))];
  
  return {
    name,
    distribution: unique.length === 0 && hasSkillMd ? 'publishable' : 'local',
    local_indicators: unique,
    has_skill_md: hasSkillMd,
    files_scanned: files.length,
    hit_details: hits.slice(0, 10),
  };
}

// Main
const results = [];
const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => path.join(SKILLS_DIR, d.name));

let publishable = 0, local = 0;
for (const d of dirs) {
  const r = classifySkill(d);
  results.push(r);
  if (r.distribution === 'publishable') publishable++;
  else local++;
}

console.log(`\n=== 技能分类结果 ===`);
console.log(`总计: ${results.length} | Publishable: ${publishable} | Local: ${local}\n`);

console.log('📦 Publishable:');
results.filter(r => r.distribution === 'publishable').forEach(r => console.log(`  ✅ ${r.name}`));

console.log('\n🔒 Local:');
results.filter(r => r.distribution === 'local').forEach(r => 
  console.log(`  🏠 ${r.name} — ${r.local_indicators.slice(0,3).join(', ')}`)
);

if (process.argv.includes('--json')) {
  fs.writeFileSync(
    path.join(WS, 'reports', 'skill-distribution-classification.json'),
    JSON.stringify(results, null, 2)
  );
  console.log('\n→ 详细报告: reports/skill-distribution-classification.json');
}
