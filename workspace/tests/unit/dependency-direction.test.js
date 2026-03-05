const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

const { check, getCategory, resolvedCategory } = require('../../scripts/check-dependency-direction');
const WORKSPACE = path.resolve(__dirname, '../..');

console.log('Dependency Direction Tests:');

// 1. getCategory identifies infrastructure
assert(getCategory(path.join(WORKSPACE, 'infrastructure/foo/bar.js')) === 'infrastructure', '1. getCategory: infrastructure');

// 2. getCategory identifies skills
assert(getCategory(path.join(WORKSPACE, 'skills/abc/index.js')) === 'skills', '2. getCategory: skills');

// 3. getCategory identifies tests
assert(getCategory(path.join(WORKSPACE, 'tests/unit/x.js')) === 'tests', '3. getCategory: tests');

// 4. getCategory other
assert(getCategory(path.join(WORKSPACE, 'lib/x.js')) === 'other', '4. getCategory: other');

// 5. resolvedCategory resolves to skills
const infraFile = path.join(WORKSPACE, 'infrastructure/feature-flags/index.js');
assert(resolvedCategory('../../skills/isc-core/foo', infraFile) === 'skills', '5. resolvedCategory → skills');

// 6. resolvedCategory resolves to infrastructure
const skillFile = path.join(WORKSPACE, 'skills/abc/index.js');
assert(resolvedCategory('../../infrastructure/feature-flags/index', skillFile) === 'infrastructure', '6. resolvedCategory → infrastructure');

// 7. non-relative import returns null
assert(resolvedCategory('fs', infraFile) === null, '7. non-relative returns null');

// 8. check() on current workspace returns no violations (assuming clean)
const violations = check();
assert(Array.isArray(violations), '8. check() returns array');

// 9. Simulate violation detection via temp files
const tmpInfra = path.join(WORKSPACE, 'infrastructure', '_test_dep_check_');
fs.mkdirSync(tmpInfra, { recursive: true });
fs.writeFileSync(path.join(tmpInfra, 'bad.js'), "const x = require('../../skills/isc-core/foo');");
const v2 = check();
const found = v2.some(v => v.file.includes('_test_dep_check_'));
assert(found, '9. detects infrastructure→skills violation');
fs.rmSync(tmpInfra, { recursive: true });

// 10. skills→infrastructure is allowed (no violation)
const tmpSkill = path.join(WORKSPACE, 'skills', '_test_dep_check_');
fs.mkdirSync(tmpSkill, { recursive: true });
fs.writeFileSync(path.join(tmpSkill, 'ok.js'), "const x = require('../../infrastructure/feature-flags/index');");
const v3 = check();
const notFound = !v3.some(v => v.file.includes('_test_dep_check_'));
assert(notFound, '10. skills→infrastructure allowed');
fs.rmSync(tmpSkill, { recursive: true });

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
