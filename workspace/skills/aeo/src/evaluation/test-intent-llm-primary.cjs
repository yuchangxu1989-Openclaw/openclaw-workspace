#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { evaluateIntentCase, ARCHITECTURE_VERSION } = require('./intent-alignment.cjs');
const { EvaluationExecutor } = require('./executor.cjs');

async function main() {
  const direct = evaluateIntentCase({
    chunk: '用户：这次做得很好，以后都按这个格式输出。',
    expected: [
      { type: 'FEEDBACK', target: '输出格式' },
      { type: 'RULEIFY', target: '输出格式' }
    ],
    predicted: [
      { type: 'FEEDBACK', target: '输出格式', confidence: 0.92, summary: '用户正向评价当前输出格式' },
      { type: 'RULEIFY', target: '输出格式', confidence: 0.87, summary: '用户要求未来固化同样格式' }
    ]
  });

  assert.strictEqual(direct.passed, true, 'LLM主判断应通过');
  assert.strictEqual(direct.auxiliaryCrossCheck.usedForFinalDecision, false, '关键词/正则不能成为最终判定');
  assert.strictEqual(direct.architecture.version, ARCHITECTURE_VERSION, '架构版本应暴露');

  const executor = new EvaluationExecutor({ timeout: 1000, retryAttempts: 0 });
  const [result] = await executor.executeBatch([
    {
      id: 'intent-llm-primary-001',
      type: 'prompt',
      intentEvaluation: true,
      chunk: '用户：把 event-bus 的日志级别调成 debug，然后重启 gateway。',
      prompt: '分析以下消息的意图',
      expected: [
        { type: 'DIRECTIVE', target: 'event-bus日志级别' }
      ],
      intentExtractor: async () => ([
        { type: 'DIRECTIVE', target: 'event-bus日志级别', confidence: 0.95, summary: '用户要求调整日志并执行操作' }
      ])
    }
  ], { sandbox: true, testEnvironment: true });

  assert.strictEqual(result.status, 'passed', '评测runner应以LLM意图判断通过');
  assert.strictEqual(result.evaluation.policy, 'llm_primary_keyword_regex_auxiliary');
  assert.strictEqual(result.evaluation.auxiliaryCrossCheck.usedForFinalDecision, false);

  console.log(JSON.stringify({
    ok: true,
    architectureVersion: ARCHITECTURE_VERSION,
    result
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
