/**
 * 流水线测试
 * 
 * 功能：测试EvoMap技能自动进化流水线的核心功能
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { StateManager, PIPELINE_STATES } from '../src/state-manager.js';
import { ISCValidator } from '../src/validators/isc-validator.js';
import { EvoMapUploader } from '../src/uploaders/evomap-uploader.js';
import { PipelineEngine } from '../src/engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试配置
const TEST_CONFIG = {
  statePath: path.join(__dirname, '.test-state'),
  isc: { minScore: 70 },
  evomap: { offlineMode: true, autoSync: false }
};

/**
 * 测试工具函数
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(`断言失败: ${message}`);
  }
}

function log(message) {
  console.log(`[Test] ${message}`);
}

/**
 * 清理测试环境
 */
function cleanup() {
  if (fs.existsSync(TEST_CONFIG.statePath)) {
    fs.rmSync(TEST_CONFIG.statePath, { recursive: true, force: true });
  }
}

/**
 * 测试StateManager
 */
async function testStateManager() {
  log('测试 StateManager...');
  
  const manager = new StateManager({ statePath: TEST_CONFIG.statePath });
  const testSkillPath = '/root/.openclaw/workspace/skills/isc-core';
  
  // 测试状态创建
  const state = manager.getOrCreateState(testSkillPath);
  assert(state.skillId === 'isc-core', 'skillId应为isc-core');
  assert(state.currentState === PIPELINE_STATES.DEVELOP, '初始状态应为DEVELOP');
  log('✓ 状态创建成功');
  
  // 测试状态流转
  manager.transitionState('isc-core', PIPELINE_STATES.TEST, '测试流转', 'test');
  const updatedState = manager.getOrCreateState(testSkillPath);
  assert(updatedState.currentState === PIPELINE_STATES.TEST, '状态应流转到TEST');
  assert(updatedState.previousState === PIPELINE_STATES.DEVELOP, 'previousState应为DEVELOP');
  assert(updatedState.stateHistory.length === 1, '应有一条历史记录');
  log('✓ 状态流转成功');
  
  // 测试非法流转
  try {
    manager.transitionState('isc-core', PIPELINE_STATES.ONLINE, '非法流转', 'test');
    assert(false, '应抛出非法流转异常');
  } catch (e) {
    assert(e.message.includes('非法状态流转'), '应抛出非法流转错误');
    log('✓ 非法流转检查成功');
  }
  
  // 测试状态统计
  const stats = manager.getStateStatistics();
  assert(stats.total >= 1, '应至少有一个技能');
  assert(stats.byState[PIPELINE_STATES.TEST] >= 1, 'TEST状态应至少有一个');
  log('✓ 状态统计成功');
  
  log('StateManager 测试通过 ✓');
  return true;
}

/**
 * 测试ISCValidator
 */
async function testISCValidator() {
  log('测试 ISCValidator...');
  
  const validator = new ISCValidator({ minScore: 70 });
  const testSkillPath = '/root/.openclaw/workspace/skills/isc-core';
  
  // 测试校验（如果目录存在）
  if (fs.existsSync(testSkillPath)) {
    const result = await validator.validate(testSkillPath);
    
    assert(typeof result.passed === 'boolean', 'passed应为布尔值');
    assert(typeof result.score === 'number', 'score应为数字');
    assert(result.score >= 0 && result.score <= 100, 'score应在0-100之间');
    assert(result.details, '应有details');
    log(`✓ 校验完成: 得分 ${result.score}, 通过: ${result.passed}`);
  } else {
    log('⚠ isc-core不存在，跳过ISC校验测试');
  }
  
  log('ISCValidator 测试通过 ✓');
  return true;
}

/**
 * 测试EvoMapUploader
 */
async function testEvoMapUploader() {
  log('测试 EvoMapUploader...');
  
  const uploader = new EvoMapUploader({ offlineMode: true });
  
  // 测试构建Gene
  const mockState = {
    skillId: 'test-skill',
    skillName: 'Test Skill',
    skillPath: '/test/path',
    version: '1.0.0',
    description: 'Test description',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    iscScore: 85
  };
  
  const gene = uploader.buildGene(mockState);
  
  assert(gene.id, 'Gene应有id');
  assert(gene.type === 'Gene', 'Gene类型应为Gene');
  assert(gene.metadata.skillId === 'test-skill', 'metadata.skillId应匹配');
  assert(gene.metadata.iscScore === 85, 'metadata.iscScore应匹配');
  log('✓ Gene构建成功');
  
  // 测试允许列表检查
  const isAllowed = uploader.isSkillAllowed('isc-core');
  assert(typeof isAllowed === 'boolean', 'isAllowed应为布尔值');
  log('✓ 允许列表检查成功');
  
  log('EvoMapUploader 测试通过 ✓');
  return true;
}

/**
 * 测试PipelineEngine
 */
async function testPipelineEngine() {
  log('测试 PipelineEngine...');
  
  const engine = new PipelineEngine({
    storage: { statePath: TEST_CONFIG.statePath },
    isc: { minScore: 70 },
    evomap: { offlineMode: true }
  });
  
  // 测试初始化
  await engine.initialize();
  log('✓ 引擎初始化成功');
  
  // 测试版本递增
  const v1 = engine.incrementVersion('1.0.0');
  assert(v1 === '1.0.1', '版本应递增为1.0.1');
  
  const v2 = engine.incrementVersion('1.0.99');
  assert(v2 === '1.1.0', '版本应递增为1.1.0');
  
  const v3 = engine.incrementVersion('invalid');
  assert(v3 === '0.0.1', '无效版本应返回默认值');
  log('✓ 版本递增成功');
  
  // 测试统计
  const stats = engine.getStats();
  assert(typeof stats.jobsProcessed === 'number', '应有jobsProcessed统计');
  assert(stats.startTime, '应有startTime');
  log('✓ 统计功能正常');
  
  // 关闭引擎
  await engine.shutdown();
  log('✓ 引擎关闭成功');
  
  log('PipelineEngine 测试通过 ✓');
  return true;
}

/**
 * 测试状态流转规则
 */
async function testStateTransitions() {
  log('测试状态流转规则...');
  
  const manager = new StateManager({ statePath: TEST_CONFIG.statePath });
  
  // 定义期望的流转规则
  const expectedTransitions = {
    [PIPELINE_STATES.DEVELOP]: [PIPELINE_STATES.TEST],
    [PIPELINE_STATES.TEST]: [PIPELINE_STATES.REVIEW, PIPELINE_STATES.DEVELOP],
    [PIPELINE_STATES.REVIEW]: [PIPELINE_STATES.RELEASE, PIPELINE_STATES.DEVELOP],
    [PIPELINE_STATES.RELEASE]: [PIPELINE_STATES.SYNC],
    [PIPELINE_STATES.SYNC]: [PIPELINE_STATES.ONLINE, PIPELINE_STATES.FAILED],
    [PIPELINE_STATES.ONLINE]: [PIPELINE_STATES.DEVELOP],
    [PIPELINE_STATES.FAILED]: [PIPELINE_STATES.SYNC, PIPELINE_STATES.DEVELOP]
  };
  
  // 测试每个状态的合法流转
  for (const [fromState, toStates] of Object.entries(expectedTransitions)) {
    for (const toState of toStates) {
      const isValid = manager.isValidTransition(fromState, toState);
      assert(isValid, `${fromState} -> ${toState} 应为合法流转`);
    }
  }
  
  // 测试非法流转
  assert(!manager.isValidTransition(PIPELINE_STATES.DEVELOP, PIPELINE_STATES.ONLINE), 
    'DEVELOP -> ONLINE 应为非法流转');
  assert(!manager.isValidTransition(PIPELINE_STATES.ONLINE, PIPELINE_STATES.RELEASE),
    'ONLINE -> RELEASE 应为非法流转');
  
  log('✓ 所有状态流转规则验证通过');
  log('状态流转规则测试通过 ✓');
  return true;
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              EvoMap技能自动进化流水线测试套件                ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // 清理测试环境
  cleanup();
  
  const tests = [
    { name: 'StateManager', fn: testStateManager },
    { name: 'ISCValidator', fn: testISCValidator },
    { name: 'EvoMapUploader', fn: testEvoMapUploader },
    { name: 'PipelineEngine', fn: testPipelineEngine },
    { name: 'StateTransitions', fn: testStateTransitions }
  ];
  
  const results = [];
  
  for (const test of tests) {
    console.log(`\n--- 开始测试: ${test.name} ---`);
    try {
      const startTime = Date.now();
      await test.fn();
      const duration = Date.now() - startTime;
      results.push({ name: test.name, passed: true, duration });
    } catch (e) {
      results.push({ name: test.name, passed: false, error: e.message });
      console.error(`[Test] ${test.name} 失败: ${e.message}`);
    }
  }
  
  // 清理
  cleanup();
  
  // 输出测试报告
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                      测试报告                               ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  
  for (const result of results) {
    const status = result.passed ? '✓ 通过' : '✗ 失败';
    const duration = result.duration ? `(${result.duration}ms)` : '';
    const error = result.error ? `: ${result.error}` : '';
    console.log(`║ ${result.name.padEnd(20)} ${status.padEnd(10)} ${duration.padEnd(12)}${error.padEnd(10)} ║`);
  }
  
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║ 总计: ${results.length} | 通过: ${passed} | 失败: ${failed}${''.padEnd(30)} ║`);
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  // 返回退出码
  process.exit(failed > 0 ? 1 : 0);
}

// 运行测试
runAllTests().catch(e => {
  console.error('测试套件执行失败:', e);
  process.exit(1);
});
