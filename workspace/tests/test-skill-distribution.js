#!/usr/bin/env node
/**
 * Test Suite: Skill Distribution Separation
 * 
 * 测试 skill-distribution-checker.js 的合规检查逻辑
 * 
 * Usage: node test-skill-distribution.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHECKER = path.resolve(__dirname, '../scripts/skill-distribution-checker.js');
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'skill-distribution');

// === Test Helpers ===

let passed = 0;
let failed = 0;
let total = 0;

function createFixture(name, files) {
  const dir = path.join(FIXTURES_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [filename, content] of Object.entries(files)) {
    const filePath = path.join(dir, filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return dir;
}

function runChecker(skillDir) {
  try {
    const output = execSync(`node ${CHECKER} "${skillDir}" --json`, { encoding: 'utf-8' });
    return JSON.parse(output);
  } catch (e) {
    // Checker exits with code 1 for non-compliant, but still outputs JSON
    if (e.stdout) {
      try { return JSON.parse(e.stdout); } catch (_) {}
    }
    throw e;
  }
}

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✅ TC-${String(total).padStart(2, '0')}: ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ TC-${String(total).padStart(2, '0')}: ${name}`);
    console.log(`     Error: ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// === Setup ===

function setup() {
  // Clean old fixtures
  if (fs.existsSync(FIXTURES_DIR)) {
    fs.rmSync(FIXTURES_DIR, { recursive: true });
  }
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

// === Test Cases ===

function runTests() {
  console.log('\n=== Skill Distribution Separation Test Suite ===\n');
  setup();

  // TC-01: Internal skill with .secrets reference → PASS
  test('Internal skill can reference .secrets → pass', () => {
    const dir = createFixture('tc01-internal-secrets', {
      'SKILL.md': '# Test Skill\ndistribution: internal\n\nAn internal skill.',
      'index.js': 'const key = fs.readFileSync("/root/.openclaw/.secrets/api-key.txt");\nconsole.log("loaded");',
    });
    const result = runChecker(dir);
    assert(result.compliant === true, `Expected compliant=true, got ${result.compliant}`);
    assert(result.distribution === 'internal', `Expected internal, got ${result.distribution}`);
  });

  // TC-02: External skill with .secrets reference → FAIL
  test('External skill referencing .secrets → fail (blocked)', () => {
    const dir = createFixture('tc02-external-secrets', {
      'SKILL.md': '# Test Skill\ndistribution: external\npermissions:\n  filesystem: 1\n  network: 0\n  shell: 0\n  credential: 0\n',
      'index.js': 'const key = fs.readFileSync(".secrets/api-key.txt");\nconsole.log(key);',
    });
    const result = runChecker(dir);
    assert(result.compliant === false, `Expected compliant=false, got ${result.compliant}`);
    const secretCheck = result.checks.find(c => c.id === 'NO_SECRETS_REFS');
    assert(secretCheck && !secretCheck.pass, 'NO_SECRETS_REFS check should fail');
  });

  // TC-03: External skill without permissions declaration → FAIL
  test('External skill without permissions → fail', () => {
    const dir = createFixture('tc03-external-no-perms', {
      'SKILL.md': '# Test Skill\ndistribution: external\n\nNo permissions declared.',
    });
    const result = runChecker(dir);
    assert(result.compliant === false, `Expected compliant=false, got ${result.compliant}`);
    const permCheck = result.checks.find(c => c.id === 'PERMISSIONS_DECLARED');
    assert(permCheck && !permCheck.pass, 'PERMISSIONS_DECLARED check should fail');
  });

  // TC-04: External skill with complete permissions → PASS
  test('External skill with complete permissions → pass', () => {
    const dir = createFixture('tc04-external-complete', {
      'SKILL.md': '# Test Skill\ndistribution: external\npermissions:\n  filesystem: 1\n  network: 0\n  shell: 0\n  credential: 0\n',
      'index.js': 'console.log("clean external skill");',
    });
    const result = runChecker(dir);
    assert(result.compliant === true, `Expected compliant=true, got ${result.compliant}`);
  });

  // TC-05: Both-type skill clean code → PASS
  test('Both-type skill with clean code and permissions → pass', () => {
    const dir = createFixture('tc05-both-clean', {
      'SKILL.md': '# Test Skill\ndistribution: both\npermissions:\n  filesystem: 2\n  network: 1\n  shell: 0\n  credential: 0\n',
      'lib/helper.js': 'function greet(name) { return `Hello ${name}`; }\nmodule.exports = { greet };',
      'index.js': 'const { greet } = require("./lib/helper");\nconsole.log(greet("world"));',
    });
    const result = runChecker(dir);
    assert(result.compliant === true, `Expected compliant=true, got ${result.compliant}`);
  });

  // TC-06: Skill with no SKILL.md → FAIL
  test('Skill with no SKILL.md → fail', () => {
    const dir = createFixture('tc06-no-skillmd', {
      'index.js': 'console.log("orphan skill");',
    });
    const result = runChecker(dir);
    assert(result.compliant === false, `Expected compliant=false, got ${result.compliant}`);
  });

  // TC-07: Skill with no distribution field → FAIL
  test('Skill with no distribution field → fail', () => {
    const dir = createFixture('tc07-no-distribution', {
      'SKILL.md': '# Test Skill\n\nA skill without distribution field.',
    });
    const result = runChecker(dir);
    assert(result.compliant === false, `Expected compliant=false, got ${result.compliant}`);
  });

  // TC-08: External skill with internal paths → FAIL
  test('External skill with internal absolute paths → fail', () => {
    const dir = createFixture('tc08-external-internal-paths', {
      'SKILL.md': '# Test Skill\ndistribution: external\npermissions:\n  filesystem: 1\n  network: 0\n  shell: 0\n  credential: 0\n',
      'config.js': 'const CONFIG_PATH = "/root/.openclaw/workspace/config.json";\nmodule.exports = { CONFIG_PATH };',
    });
    const result = runChecker(dir);
    assert(result.compliant === false, `Expected compliant=false, got ${result.compliant}`);
    const pathCheck = result.checks.find(c => c.id === 'NO_INTERNAL_PATHS');
    assert(pathCheck && !pathCheck.pass, 'NO_INTERNAL_PATHS check should fail');
  });

  // TC-09: External skill with sensitive env vars → FAIL
  test('External skill with sensitive env vars → fail', () => {
    const dir = createFixture('tc09-external-env-vars', {
      'SKILL.md': '# Test Skill\ndistribution: external\npermissions:\n  filesystem: 0\n  network: 1\n  shell: 0\n  credential: 0\n',
      'api.js': 'const apiKey = process.env.ZHIPU_API_KEY;\nfetch(`https://api.example.com?key=${apiKey}`);',
    });
    const result = runChecker(dir);
    assert(result.compliant === false, `Expected compliant=false, got ${result.compliant}`);
    const envCheck = result.checks.find(c => c.id === 'NO_SENSITIVE_ENV');
    assert(envCheck && !envCheck.pass, 'NO_SENSITIVE_ENV check should fail');
  });

  // TC-10: External skill with credential != 0 → FAIL
  test('External skill with credential > 0 → fail', () => {
    const dir = createFixture('tc10-external-credential-nonzero', {
      'SKILL.md': '# Test Skill\ndistribution: external\npermissions:\n  filesystem: 1\n  network: 0\n  shell: 0\n  credential: 1\n',
      'index.js': 'console.log("uses host credentials");',
    });
    const result = runChecker(dir);
    assert(result.compliant === false, `Expected compliant=false, got ${result.compliant}`);
    const credCheck = result.checks.find(c => c.id === 'CREDENTIAL_ZERO');
    assert(credCheck && !credCheck.pass, 'CREDENTIAL_ZERO check should fail');
  });

  // TC-11: External skill with hardcoded API key → FAIL
  test('External skill with hardcoded credentials → fail', () => {
    const dir = createFixture('tc11-external-hardcoded-creds', {
      'SKILL.md': '# Test Skill\ndistribution: external\npermissions:\n  filesystem: 0\n  network: 1\n  shell: 0\n  credential: 0\n',
      'client.js': 'const api_key = "sk-1234567890abcdefghijklmnop";\nfetch("https://api.example.com", { headers: { Authorization: api_key } });',
    });
    const result = runChecker(dir);
    assert(result.compliant === false, `Expected compliant=false, got ${result.compliant}`);
    const credCheck = result.checks.find(c => c.id === 'NO_HARDCODED_CREDS');
    assert(credCheck && !credCheck.pass, 'NO_HARDCODED_CREDS check should fail');
  });

  // TC-12: Both-type skill with mixed violations → FAIL
  test('Both-type skill with multiple violations → fail with all flagged', () => {
    const dir = createFixture('tc12-both-multi-violations', {
      'SKILL.md': '# Test Skill\ndistribution: both\npermissions:\n  filesystem: 2\n  network: 1\n  shell: 0\n  credential: 0\n',
      'main.js': 'const secret = fs.readFileSync(".secrets/key.txt");\nconst path = "/root/.openclaw/workspace/data";\nconst token = process.env.ACCESS_TOKEN;',
    });
    const result = runChecker(dir);
    assert(result.compliant === false, `Expected compliant=false, got ${result.compliant}`);
    assert(result.violations.length >= 3, `Expected >= 3 violations, got ${result.violations.length}`);
  });

  // TC-13: Internal skill with incomplete permissions → PASS (internal doesn't need perms)
  test('Internal skill without permissions → pass (not required)', () => {
    const dir = createFixture('tc13-internal-no-perms', {
      'SKILL.md': '# Internal Tool\ndistribution: internal\n\nInternal only.',
      'tool.sh': '#!/bin/bash\ncat /root/.openclaw/.secrets/master.key',
    });
    const result = runChecker(dir);
    assert(result.compliant === true, `Expected compliant=true, got ${result.compliant}`);
  });

  // TC-14: External skill with partial permissions → FAIL
  test('External skill with partial permissions (missing dimensions) → fail', () => {
    const dir = createFixture('tc14-external-partial-perms', {
      'SKILL.md': '# Test Skill\ndistribution: external\npermissions:\n  filesystem: 1\n  network: 0\n',
      'index.js': 'console.log("partial perms");',
    });
    const result = runChecker(dir);
    assert(result.compliant === false, `Expected compliant=false, got ${result.compliant}`);
    const permCheck = result.checks.find(c => c.id === 'PERMISSIONS_COMPLETE');
    assert(permCheck && !permCheck.pass, 'PERMISSIONS_COMPLETE check should fail');
  });

  // TC-15: External skill — fully clean, all checks pass
  test('External skill fully clean with all dimensions → pass', () => {
    const dir = createFixture('tc15-external-perfect', {
      'SKILL.md': '# Perfect External Skill\ndistribution: external\npermissions:\n  filesystem: 1\n  network: 2\n  shell: 1\n  credential: 0\n\nA perfectly compliant external skill.',
      'src/main.js': 'function process(input) {\n  return input.toUpperCase();\n}\nmodule.exports = { process };',
      'README.md': '# My Skill\n\nDoes stuff cleanly.',
    });
    const result = runChecker(dir);
    assert(result.compliant === true, `Expected compliant=true, got ${result.compliant}`);
    assert(result.violations.length === 0, `Expected 0 violations, got ${result.violations.length}`);
  });

  // === Summary ===
  console.log(`\n--- Results: ${passed}/${total} passed, ${failed} failed ---\n`);
  
  // Cleanup
  if (fs.existsSync(FIXTURES_DIR)) {
    fs.rmSync(FIXTURES_DIR, { recursive: true });
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
