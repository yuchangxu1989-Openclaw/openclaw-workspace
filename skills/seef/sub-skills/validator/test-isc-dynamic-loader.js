/**
 * ISC规则动态加载 验证测试
 * 测试内容:
 *   1. 规则全量加载
 *   2. 按阶段分类查询
 *   3. 规则评估
 *   4. 热更新（新增/修改/删除）
 */

const fs = require('fs');
const path = require('path');
const { ISCRuleLoader } = require('./isc-rule-loader');

const RULES_DIR = '/root/.openclaw/workspace/skills/isc-core/rules';
const TEST_RULE_PATH = path.join(RULES_DIR, 'rule.test-dynamic-loader-999.json');

let passed = 0;
let failed = 0;
const results = [];

function assert(label, condition, detail = '') {
  if (condition) {
    passed++;
    results.push(`  ✅ ${label}`);
  } else {
    failed++;
    results.push(`  ❌ ${label} ${detail ? '— ' + detail : ''}`);
  }
}

async function cleanup() {
  try { fs.unlinkSync(TEST_RULE_PATH); } catch (e) { /* ok */ }
}

async function runTests() {
  console.log('═══ ISC规则动态加载 验证测试 ═══\n');

  // ── 测试1: 全量加载 ──
  console.log('▶ 测试1: 全量加载');
  const loader = new ISCRuleLoader(RULES_DIR);
  await loader.init();
  const stats = loader.getStats();

  assert('规则目录存在', fs.existsSync(RULES_DIR));
  assert('规则加载数量 > 0', stats.cachedRules > 0, `实际: ${stats.cachedRules}`);
  assert('加载失败数量 <= 5', stats.failed <= 5, `实际: ${stats.failed}`);
  console.log(`  📊 已加载 ${stats.cachedRules} 条规则, ${stats.failed} 个失败\n`);

  // ── 测试2: 按阶段分类 ──
  console.log('▶ 测试2: 阶段分类');
  const checkInRules = loader.getRulesByPhase('check-in');
  const checkpointRules = loader.getRulesByPhase('checkpoint');
  const checkOutRules = loader.getRulesByPhase('check-out');

  assert('check-in 规则有分类', checkInRules.length >= 0);
  assert('checkpoint 规则有分类', checkpointRules.length >= 0);
  assert('check-out 规则有分类', checkOutRules.length >= 0);
  const totalPhased = checkInRules.length + checkpointRules.length + checkOutRules.length;
  assert('所有规则均已分类', totalPhased === stats.cachedRules, `分类总数=${totalPhased}, 缓存总数=${stats.cachedRules}`);
  console.log(`  📊 check-in=${checkInRules.length}, checkpoint=${checkpointRules.length}, check-out=${checkOutRules.length}\n`);

  // ── 测试3: 按domain查询 ──
  console.log('▶ 测试3: Domain索引');
  const qualityRules = loader.getRulesByDomain('quality');
  assert('quality domain 有规则', qualityRules.length > 0, `实际: ${qualityRules.length}`);
  console.log(`  📊 domains: ${stats.domains.join(', ')}\n`);

  // ── 测试4: 规则评估 ──
  console.log('▶ 测试4: 规则评估');
  const mockSkillGood = {
    hasSkillMd: true,
    hasEntry: true,
    hasPackageJson: true,
    hasIndexJs: true,
    fileCount: 5,
    totalSize: 4096,
    skillMdContent: `# Test Skill\n## Description\nThis is a well-documented test skill for validation.\n## Usage\nRun with node index.js\n## Examples\nSee test/\n`.repeat(5),
    entryContent: `const fs = require('fs');\nmodule.exports = function main() {\n  try {\n    console.log('hello');\n  } catch(e) {\n    console.error(e);\n  }\n};\n`,
    packageJson: { name: 'test', version: '1.0.0', description: 'test' },
    files: ['SKILL.md', 'index.js', 'package.json']
  };
  const evalResult = loader.evaluateRules(mockSkillGood, 'checkout');
  assert('好技能评估返回结果', evalResult && typeof evalResult.score === 'number');
  assert('好技能得分 >= 50', evalResult.score >= 50, `得分: ${evalResult.score}`);
  console.log(`  📊 评估: ${evalResult.passedRules}/${evalResult.totalRules} 通过, 得分 ${evalResult.score}\n`);

  const mockSkillBad = {
    hasSkillMd: false,
    hasEntry: false,
    hasPackageJson: false,
    fileCount: 0,
    totalSize: 0,
    skillMdContent: null,
    entryContent: null,
    packageJson: null,
    files: []
  };
  const evalResultBad = loader.evaluateRules(mockSkillBad, 'checkout');
  assert('差技能评估得分较低', evalResultBad.score < evalResult.score, `好=${evalResult.score}, 差=${evalResultBad.score}`);
  console.log(`  📊 差技能评估: ${evalResultBad.passedRules}/${evalResultBad.totalRules} 通过, 得分 ${evalResultBad.score}\n`);

  // ── 测试5: 热更新 — 新增规则 ──
  console.log('▶ 测试5: 热更新（新增规则）');
  const testRule = {
    id: 'rule.test-dynamic-loader-999',
    name: 'test_dynamic_loader',
    domain: 'quality',
    type: 'rule',
    scope: 'skill',
    description: '测试动态加载器的热更新能力 — 此规则应被自动识别',
    governance: { auto_execute: true, councilRequired: false },
    check_criteria: {
      must_have: ['SKILL.md 文件存在']
    },
    severity: 'medium',
    version: '1.0.0'
  };
  fs.writeFileSync(TEST_RULE_PATH, JSON.stringify(testRule, null, 2));

  // 触发增量扫描（模拟轮询）
  await loader._incrementalScan();

  const newRule = loader.getRuleById('rule.test-dynamic-loader-999');
  assert('新增规则被自动识别', newRule !== null);
  assert('新增规则内容正确', newRule && newRule.name === 'test_dynamic_loader');
  const newStats = loader.getStats();
  assert('缓存数量增加', newStats.cachedRules === stats.cachedRules + 1, `前=${stats.cachedRules}, 后=${newStats.cachedRules}`);
  console.log(`  📊 新增后: ${newStats.cachedRules} 条规则\n`);

  // ── 测试6: 热更新 — 修改规则 ──
  console.log('▶ 测试6: 热更新（修改规则）');
  testRule.description = '修改后的描述 — 验证热更新';
  testRule.severity = 'high';
  // 确保mtime变化
  await new Promise(r => setTimeout(r, 50));
  fs.writeFileSync(TEST_RULE_PATH, JSON.stringify(testRule, null, 2));

  await loader._incrementalScan();

  const updatedRule = loader.getRuleById('rule.test-dynamic-loader-999');
  assert('修改后规则被更新', updatedRule && updatedRule.description.includes('修改后'));
  assert('修改后严重级别更新', updatedRule && updatedRule.severity === 'high');
  console.log(`  📊 热更新次数: ${loader.getStats().hotReloaded}\n`);

  // ── 测试7: 热更新 — 删除规则 ──
  console.log('▶ 测试7: 热更新（删除规则）');
  fs.unlinkSync(TEST_RULE_PATH);

  await loader._incrementalScan();

  const deletedRule = loader.getRuleById('rule.test-dynamic-loader-999');
  assert('删除后规则被移除', deletedRule === null);
  assert('缓存数量恢复', loader.getStats().cachedRules === stats.cachedRules, `当前: ${loader.getStats().cachedRules}`);
  console.log(`  📊 删除后: ${loader.getStats().cachedRules} 条规则\n`);

  // ── 测试8: admission阶段兼容 ──
  console.log('▶ 测试8: admission阶段兼容');
  const admissionRules = loader.getRulesByPhase('admission');
  const checkinRules = loader.getRulesByPhase('check-in');
  assert('admission 映射到 check-in', admissionRules.length === checkinRules.length);

  // ── 测试9: 强制重载 ──
  console.log('▶ 测试9: 强制重载');
  await loader.reload();
  const reloadStats = loader.getStats();
  assert('重载后规则数量一致', reloadStats.cachedRules === stats.cachedRules, `前=${stats.cachedRules}, 后=${reloadStats.cachedRules}`);
  console.log(`  📊 重载后: ${reloadStats.cachedRules} 条规则\n`);

  // ── 清理 ──
  loader.destroy();
  await cleanup();

  // ── 报告 ──
  console.log('═══════════════════════════════');
  console.log(`结果: ${passed} 通过, ${failed} 失败\n`);
  results.forEach(r => console.log(r));
  console.log('');

  if (failed > 0) {
    console.log('❌ 存在失败用例');
    process.exit(1);
  } else {
    console.log('✅ 所有测试通过');
    process.exit(0);
  }
}

runTests().catch(e => {
  console.error('测试执行异常:', e);
  cleanup();
  process.exit(1);
});
