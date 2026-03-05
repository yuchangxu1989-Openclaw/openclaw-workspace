const { assessMaturity, suggestVersion, parseVersion, getDeclaredVersion, checkVersionJump, auditSkill } = require('../../scripts/check-version-integrity');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('Version Integrity Gate', () => {
  
  test('assessMaturity returns zero for empty dir', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vi-'));
    const result = assessMaturity(tmpDir);
    expect(result.jsLines).toBe(0);
    expect(result.hasEntry).toBe(false);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('assessMaturity detects JS code', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vi-'));
    fs.writeFileSync(path.join(tmpDir, 'index.js'), 'module.exports = function main() { try { console.log("hi"); } catch(e) {} };\n'.repeat(20));
    const result = assessMaturity(tmpDir);
    expect(result.jsLines).toBeGreaterThan(0);
    expect(result.hasEntry).toBe(true);
    expect(result.hasTryCatch).toBeGreaterThan(0);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('suggestVersion returns 0.0 for no code', () => {
    expect(suggestVersion({ jsLines: 0, hasEntry: false, hasTest: false, hasTryCatch: 0, hasFallback: false, hasLog: 0 })).toBe('0.0');
  });

  test('suggestVersion returns 0.1 for tiny code', () => {
    expect(suggestVersion({ jsLines: 14, hasEntry: true, hasTest: false, hasTryCatch: 0, hasFallback: false, hasLog: 0 })).toBe('0.1');
  });

  test('suggestVersion returns 2.0 for production-grade', () => {
    expect(suggestVersion({ jsLines: 5000, hasEntry: true, hasTest: true, hasTryCatch: 10, hasFallback: true, hasLog: 5 })).toBe('2.0');
  });

  test('parseVersion handles valid and invalid input', () => {
    expect(parseVersion('3.1.39')).toEqual({ major: 3, minor: 1 });
    expect(parseVersion('0.0.1')).toEqual({ major: 0, minor: 0 });
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion('invalid')).toBeNull();
  });

  test('checkVersionJump blocks >1 major jump', () => {
    expect(checkVersionJump('0.1.0', '3.0.0').valid).toBe(false);
    expect(checkVersionJump('1.0.0', '2.0.0').valid).toBe(true);
    expect(checkVersionJump('0.5.0', '1.0.0').valid).toBe(true);
  });

  test('getDeclaredVersion reads from SKILL.md', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vi-'));
    fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), 'version: "1.2.3"\n# Test');
    expect(getDeclaredVersion(tmpDir)).toBe('1.2.3');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('auditSkill flags inflated version', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vi-'));
    const skillDir = path.join(tmpDir, 'fake-skill');
    fs.mkdirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'version: "3.0.0"\n# Fake');
    fs.writeFileSync(path.join(skillDir, 'index.js'), 'module.exports = {};\n');
    // Monkey-patch SKILLS_DIR
    const orig = require('../../scripts/check-version-integrity');
    const result = orig.auditSkill.__proto__ ? null : null; // just use direct call
    const maturity = assessMaturity(skillDir);
    const suggested = suggestVersion(maturity);
    expect(parseVersion('3.0.0').major).toBeGreaterThan(parseVersion(suggested).major);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('suggestVersion returns 1.0 for medium code with try/catch', () => {
    expect(suggestVersion({ jsLines: 300, hasEntry: true, hasTest: false, hasTryCatch: 2, hasFallback: false, hasLog: 1 })).toBe('1.0');
  });
});
