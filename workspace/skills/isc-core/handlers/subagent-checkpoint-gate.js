/**
 * subagent-checkpoint-gate - 子Agent任务分段验证门禁
 *
 * 规则: rule.subagent-checkpoint-gate-001
 * 职责: 创建子Agent时检查任务复杂度，超标则要求拆分
 */
const path = require('path');
const { writeReport, emitEvent, gateResult } = require('../lib/handler-utils');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const MAX_DURATION_MIN = 5;
const MAX_TOKENS = 15000;
const MAX_STEPS_SINGLE = 3;

module.exports = {
  name: 'subagent-checkpoint-gate',
  ruleId: 'rule.subagent-checkpoint-gate-001',

  /**
   * @param {Object} context
   * @param {string} context.taskDescription - 任务描述
   * @param {number} [context.estimatedMinutes] - 预估时长（分钟）
   * @param {number} [context.estimatedTokens] - 预估token数
   * @param {string[]} [context.steps] - 任务步骤列表
   * @param {boolean} [context.hasIntermediateOutputs] - 是否有中间产出文件
   * @param {Object} [context.bus] - 事件总线
   */
  async execute(context = {}) {
    const {
      taskDescription = '',
      estimatedMinutes = 0,
      estimatedTokens = 0,
      steps = [],
      hasIntermediateOutputs = false,
      bus,
    } = context;
    const checks = [];

    // 时间复杂度检查
    if (estimatedMinutes > 0) {
      checks.push({
        name: 'duration_limit',
        ok: estimatedMinutes <= MAX_DURATION_MIN,
        message: `${estimatedMinutes}min (max: ${MAX_DURATION_MIN}min)`,
      });
    }

    // Token复杂度检查
    if (estimatedTokens > 0) {
      checks.push({
        name: 'token_limit',
        ok: estimatedTokens <= MAX_TOKENS,
        message: `${estimatedTokens} tokens (max: ${MAX_TOKENS})`,
      });
    }

    // 步骤数检查（单Agent不应同时做太多事）
    const stepCount = steps.length;
    if (stepCount > 0) {
      checks.push({
        name: 'step_count',
        ok: stepCount <= MAX_STEPS_SINGLE,
        message: `${stepCount} steps (max: ${MAX_STEPS_SINGLE} per agent)`,
      });
    }

    // 反模式检测：分析和修改是否分离
    const antiPatterns = [
      { pattern: /读.*分析.*修改.*测试/s, name: 'read_analyze_modify_test_combined' },
      { pattern: /分析.*修改.*验证/s, name: 'analyze_modify_verify_combined' },
    ];
    for (const ap of antiPatterns) {
      if (ap.pattern.test(taskDescription)) {
        checks.push({
          name: `anti_pattern_${ap.name}`,
          ok: false,
          message: `Anti-pattern detected: ${ap.name} — split analysis and modification`,
        });
      }
    }

    // 中间产出检查
    if (estimatedMinutes > MAX_DURATION_MIN || estimatedTokens > MAX_TOKENS) {
      checks.push({
        name: 'intermediate_outputs',
        ok: hasIntermediateOutputs,
        message: hasIntermediateOutputs ? 'has intermediate file outputs' : 'complex task must produce intermediate files',
      });
    }

    // 如果没有足够信息做检查，默认通过但警告
    if (checks.length === 0) {
      checks.push({ name: 'basic_info', ok: true, message: 'insufficient complexity info, passed by default' });
    }

    const result = gateResult('subagent-checkpoint-gate', checks);
    result.taskDescription = taskDescription.slice(0, 200);
    result.timestamp = new Date().toISOString();

    writeReport(path.join(LOG_DIR, 'subagent-gate-last.json'), result);
    await emitEvent(bus, `isc.subagent-gate.${result.ok ? 'passed' : 'rejected'}`, result);

    console.log(`[subagent-gate] ${result.status}: ${result.passed}/${result.total} checks passed`);
    return result;
  },
};
