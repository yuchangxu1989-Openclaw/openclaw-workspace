'use strict';
const assert = require('assert');

process.env.INTENT_SCANNER_ENABLED = 'false';

const llm = require('../../skills/cras/intent-extractor-llm');
llm.callLLM = async () => JSON.stringify({
  intents: [
    { type: 'QUERY', target: 'system status', summary: '查询当前系统状态和最近错误日志', confidence: 0.92, sentiment: 'neutral' }
  ]
});

const gateway = require('./l3-gateway');

(async () => {
  const result = await gateway.processEventL3({
    id: 'verify-query-inline',
    type: 'user.message',
    source: 'verify',
    payload: { text: '帮我查一下当前系统状态和最近错误日志' },
    metadata: {},
    timestamp: Date.now(),
  });

  const inlineStage = result.stages.find(s => s.name === 'IntentInlineHook');
  assert(inlineStage, 'missing IntentInlineHook stage');
  assert(Array.isArray(inlineStage.details), 'missing inline details');
  assert(inlineStage.details.some(d => d.type === 'QUERY'), 'QUERY not detected by inline hook');
  console.log(JSON.stringify({ ok: true, inlineStage, stages: result.stages.map(s => ({ name: s.name, status: s.status })) }, null, 2));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
