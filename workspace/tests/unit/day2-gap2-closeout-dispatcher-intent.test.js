'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const dispatcher = require(path.join(workspaceRoot, 'infrastructure', 'dispatcher', 'dispatcher.js'));

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(workspaceRoot, relPath), 'utf8'));
}

function testResolveHandlerSupportsPathLikeAndAliasHandlers() {
  const routes = readJson('infrastructure/dispatcher/routes.json');
  const handlerMap = dispatcher.loadHandlers();

  const completeness = dispatcher.resolveHandler('completeness-check', handlerMap);
  assert.strictEqual(typeof completeness, 'function', 'completeness-check should resolve from dispatcher/handlers');

  const logAction = dispatcher.resolveHandler('log-action', handlerMap);
  assert.strictEqual(typeof logAction, 'function', 'log-action alias should resolve');

  const directPath = dispatcher.resolveHandler('infrastructure/event-bus/handlers/log-action.js', handlerMap);
  assert.strictEqual(typeof directPath, 'function', 'path-like handler should resolve via workspace-relative path');

  assert(routes['intent.ruleify'], 'intent.ruleify route should exist');
  assert.strictEqual(routes['intent.ruleify'].handler, 'intent-event-handler');
}

async function testIntentEventHandlerDispatchesAcrossThreeIntents() {
  const handlerMap = dispatcher.loadHandlers();
  const cases = [
    {
      type: 'intent.ruleify',
      payload: {
        target: 'Day2 Gap2 dispatcher intent route validation',
        summary: 'Validate dispatcher can consume intent.ruleify through intent-event-handler',
        evidence: 'subagent closeout regression'
      },
      expectAction: 'ruleify'
    },
    {
      type: 'intent.reflect',
      payload: {
        target: 'Day2 Gap2 reflection path',
        summary: 'Validate dispatcher can consume intent.reflect through intent-event-handler'
      },
      expectAction: 'reflect'
    },
    {
      type: 'intent.directive',
      payload: {
        target: 'Day2 Gap2 directive task',
        summary: 'Validate dispatcher can consume intent.directive through intent-event-handler'
      },
      expectAction: 'directive'
    }
  ];

  for (const item of cases) {
    const result = await dispatcher.dispatch(
      { action: item.type },
      { id: `test-${item.expectAction}-${Date.now()}`, type: item.type, payload: item.payload },
      { handlerMap, routes: readJson('infrastructure/dispatcher/routes.json'), timeoutMs: 15000 }
    );

    assert.strictEqual(result.success, true, `${item.type} should dispatch successfully`);
    assert.strictEqual(result.handler, 'intent-event-handler', `${item.type} should route to intent-event-handler`);
    assert.strictEqual(result.result?.action, item.expectAction, `${item.type} should return expected action result`);
  }
}

(async () => {
  testResolveHandlerSupportsPathLikeAndAliasHandlers();
  await testIntentEventHandlerDispatchesAcrossThreeIntents();
  console.log('day2-gap2-closeout-dispatcher-intent.test.js passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
