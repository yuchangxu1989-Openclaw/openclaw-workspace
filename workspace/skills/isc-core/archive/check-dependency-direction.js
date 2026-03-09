#!/usr/bin/env node
/**
 * 依赖方向CI门禁
 * 规则：
 *   - infrastructure/ 不允许 import/require skills/
 *   - skills/ 可以 import infrastructure/
 *   - tests/ 可以 import 任何
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..');
const REQUIRE_PATTERN = /(?:require\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+.*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

function collectJsFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      collectJsFiles(full, files);
    } else if (entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

function getCategory(filePath) {
  const rel = path.relative(WORKSPACE, filePath).replace(/\\/g, '/');
  if (rel.startsWith('tests/')) return 'tests';
  if (rel.startsWith('infrastructure/')) return 'infrastructure';
  if (rel.startsWith('skills/')) return 'skills';
  return 'other';
}

function resolvedCategory(importPath, sourceFile) {
  // Only check relative imports
  if (!importPath.startsWith('.')) return null;
  const resolved = path.resolve(path.dirname(sourceFile), importPath).replace(/\\/g, '/');
  const rel = path.relative(WORKSPACE, resolved).replace(/\\/g, '/');
  if (rel.startsWith('skills/') || rel.startsWith('skills\\')) return 'skills';
  if (rel.startsWith('infrastructure/') || rel.startsWith('infrastructure\\')) return 'infrastructure';
  if (rel.startsWith('tests/') || rel.startsWith('tests\\')) return 'tests';
  return 'other';
}

function check() {
  const violations = [];
  const dirs = ['infrastructure', 'skills', 'scripts'].map(d => path.join(WORKSPACE, d));
  const files = [];
  for (const d of dirs) collectJsFiles(d, files);

  for (const file of files) {
    const cat = getCategory(file);
    if (cat === 'tests') continue; // tests can import anything
    const content = fs.readFileSync(file, 'utf-8');
    let m;
    REQUIRE_PATTERN.lastIndex = 0;
    while ((m = REQUIRE_PATTERN.exec(content)) !== null) {
      const imp = m[1] || m[2] || m[3];
      const targetCat = resolvedCategory(imp, file);
      if (cat === 'infrastructure' && targetCat === 'skills') {
        violations.push({
          file: path.relative(WORKSPACE, file),
          import: imp,
          rule: 'infrastructure/ must not import skills/'
        });
      }
    }
  }
  return violations;
}

if (require.main === module) {
  const violations = check();
  if (violations.length > 0) {
    console.error('❌ Dependency direction violations found:\n');
    for (const v of violations) {
      console.error(`  ${v.file}: imports "${v.import}" — ${v.rule}`);
    }
    process.exit(1);
  } else {
    console.log('✅ No dependency direction violations.');
    process.exit(0);
  }
}

module.exports = { check, collectJsFiles, getCategory, resolvedCategory };
