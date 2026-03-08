const test = require('node:test');
const assert = require('node:assert/strict');

const dispatcher = require('../../infrastructure/dispatcher/dispatcher');

test('matchPattern no longer throws on object eventAction', () => {
  assert.equal(dispatcher.matchPattern({ type: 'log_only' }, 'isc.rule.*'), false);
  assert.equal(dispatcher.matchPattern(undefined, 'isc.rule.*'), false);
});

test('extractRuleAction falls back to event type for object action wrapper', () => {
  const action = dispatcher.extractRuleAction(
    {
      rule: {
        action: { type: 'log_only' },
        trigger: {
          events: {
            L1: ['isc.rule.modified'],
          },
        },
      },
    },
    { type: 'isc.rule.modified' }
  );

  assert.equal(action, 'log_only');
});

test('dispatch handles wrapped rule with object action without startsWith crash', async () => {
  const result = await dispatcher.dispatch(
    {
      id: 'rule.object-action',
      rule: {
        id: 'rule.object-action',
        action: { type: 'log_only' },
        trigger: {
          events: {
            L1: ['isc.rule.modified'],
          },
        },
      },
    },
    {
      id: 'evt_test_object_action',
      type: 'isc.rule.modified',
      payload: { changedFields: ['description'] },
    },
    {
      routes: {},
      timeoutMs: 1000,
    }
  );

  assert.equal(result.success, false);
  assert.match(result.error, /No handler found/);
  assert.doesNotMatch(result.error, /startsWith is not a function/);
});
