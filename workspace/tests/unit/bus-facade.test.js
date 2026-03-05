'use strict';

const fs = require('fs');
const path = require('path');
const { BusFacade } = require('../../infrastructure/event-bus/bus-facade');
const bus = require('../../infrastructure/event-bus/bus');

// ─── Test Helpers ────────────────────────────────────────────────

let testCount = 0;
let passCount = 0;
let failCount = 0;

function assert(condition, msg) {
  testCount++;
  if (condition) {
    passCount++;
    console.log(`  ✅ ${msg}`);
  } else {
    failCount++;
    console.error(`  ❌ ${msg}`);
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}

// ─── Mock Dispatcher ─────────────────────────────────────────────

class MockDispatcher {
  constructor({ failOnDispatch = false } = {}) {
    this.dispatched = [];
    this.initCalled = false;
    this.failOnDispatch = failOnDispatch;
  }
  async init() { this.initCalled = true; }
  async dispatch(eventType, payload) {
    if (this.failOnDispatch) throw new Error('mock dispatch failure');
    this.dispatched.push({ eventType, payload });
  }
  getStats() { return { dispatched: this.dispatched.length, matched: 0, executed: 0, skipped: 0, failed: 0 }; }
  getRuleCount() { return 5; }
}

// ─── Tests ───────────────────────────────────────────────────────

async function runTests() {
  console.log('\n=== BusFacade Tests ===\n');

  // Clean up bus state before tests
  bus.purge();

  // 1. Constructor defaults
  {
    const facade = new BusFacade();
    assert(facade.bus === bus, '1. Default bus is the real bus module');
    assert(facade.dispatcher === null, '1b. Dispatcher is null before init');
    assert(facade._ready === false, '1c. Not ready before init');
  }

  // 2. Constructor with custom options
  {
    const mockDisp = new MockDispatcher();
    const facade = new BusFacade({ dispatcher: mockDisp });
    assert(facade.dispatcher === mockDisp, '2. Custom dispatcher injected');
  }

  // 3. Init initializes dispatcher
  {
    const mockDisp = new MockDispatcher();
    const facade = new BusFacade({ dispatcher: mockDisp });
    await facade.init();
    assert(mockDisp.initCalled, '3. Dispatcher.init() called during facade.init()');
    assert(facade._ready === true, '3b. Facade is ready after init');
  }

  // 4. Emit writes to bus event log
  {
    bus.purge();
    const mockDisp = new MockDispatcher();
    const facade = new BusFacade({ dispatcher: mockDisp });
    await facade.init();
    const evt = facade.emit('test.event', { key: 'value' }, 'test');
    assert(evt && evt.type === 'test.event', '4. Emit returns event with correct type');
    assert(evt.id && evt.id.startsWith('evt_'), '4b. Event has valid id');
  }

  // 5. Emit triggers dispatcher.dispatch
  {
    bus.purge();
    const mockDisp = new MockDispatcher();
    const facade = new BusFacade({ dispatcher: mockDisp });
    await facade.init();
    facade.emit('rule.fired', { ruleId: 'R001' }, 'test');
    // Give async dispatch a tick
    await new Promise(r => setTimeout(r, 10));
    assert(mockDisp.dispatched.length === 1, '5. Dispatcher received one dispatch call');
    assertEqual(mockDisp.dispatched[0].eventType, 'rule.fired', '5b. Dispatched correct event type');
  }

  // 6. Dispatcher failure does not break emit
  {
    bus.purge();
    const mockDisp = new MockDispatcher({ failOnDispatch: true });
    const facade = new BusFacade({ dispatcher: mockDisp });
    await facade.init();
    let threw = false;
    try {
      const evt = facade.emit('fail.event', {}, 'test');
      assert(evt.type === 'fail.event', '6. Event still written despite dispatcher failure');
    } catch (e) {
      threw = true;
    }
    assert(!threw, '6b. Emit did not throw on dispatcher failure');
  }

  // 7. Emit before init — dispatcher not called, no error
  {
    bus.purge();
    const mockDisp = new MockDispatcher();
    const facade = new BusFacade({ dispatcher: mockDisp });
    // NOT calling init
    let threw = false;
    try {
      facade.emit('early.event', {}, 'test');
    } catch (e) {
      threw = true;
    }
    assert(!threw, '7. Emit before init does not throw');
    await new Promise(r => setTimeout(r, 10));
    assertEqual(mockDisp.dispatched.length, 0, '7b. Dispatcher not called before init');
  }

  // 8. getDispatcherStats with dispatcher
  {
    const mockDisp = new MockDispatcher();
    const facade = new BusFacade({ dispatcher: mockDisp });
    await facade.init();
    const stats = facade.getDispatcherStats();
    assert(stats !== null, '8. Stats returned');
    assertEqual(stats.ready, true, '8b. Stats shows ready');
    assertEqual(stats.ruleCount, 5, '8c. Stats shows rule count');
  }

  // 9. getDispatcherStats without dispatcher
  {
    const facade = new BusFacade();
    const stats = facade.getDispatcherStats();
    assert(stats === null, '9. Null stats when no dispatcher');
  }

  // 10. Proxy: consume works through facade
  {
    bus.purge();
    const facade = new BusFacade();
    facade.emit = bus.emit.bind(bus); // use bus emit directly for this test
    bus.emit('proxy.test', { x: 1 }, 'test');
    const events = facade.consume('test-consumer', { types: ['proxy.test'] });
    assert(events.length === 1, '10. Consume proxies to bus');
  }

  // 11. Proxy: history works through facade
  {
    bus.purge();
    bus.emit('history.test', { y: 2 }, 'test');
    const facade = new BusFacade();
    const events = facade.history({ type: 'history.test' });
    assert(events.length >= 1, '11. History proxies to bus');
  }

  // 12. Proxy: stats works through facade
  {
    const facade = new BusFacade();
    const s = facade.stats();
    assert(typeof s.totalEvents === 'number', '12. Stats proxy returns totalEvents');
  }

  // 13. Proxy: purge works through facade
  {
    bus.emit('purge.test', {}, 'test');
    const facade = new BusFacade();
    facade.purge();
    const s = facade.stats();
    assertEqual(s.totalEvents, 0, '13. Purge clears all events');
  }

  // 14. Proxy: ack works through facade
  {
    bus.purge();
    bus.emit('ack.test', {}, 'test');
    const facade = new BusFacade();
    const evts = facade.consume('acker', { types: ['ack.test'] });
    assert(evts.length === 1, '14. Got event to ack');
    facade.ack('acker', evts[0].id);
    const evts2 = facade.consume('acker', { types: ['ack.test'] });
    assertEqual(evts2.length, 0, '14b. After ack, no unconsumed events');
  }

  // 15. Multiple emits dispatch multiple times
  {
    bus.purge();
    const mockDisp = new MockDispatcher();
    const facade = new BusFacade({ dispatcher: mockDisp });
    await facade.init();
    facade.emit('multi.1', {}, 'test');
    facade.emit('multi.2', {}, 'test');
    facade.emit('multi.3', {}, 'test');
    await new Promise(r => setTimeout(r, 20));
    assertEqual(mockDisp.dispatched.length, 3, '15. Three emits = three dispatches');
  }

  // 16. bus.js dispatcher integration — initDispatcher
  {
    // Test that bus module exposes initDispatcher
    assert(typeof bus.initDispatcher === 'function', '16. bus.initDispatcher is a function');
    assert(typeof bus.getDispatcher === 'function', '16b. bus.getDispatcher is a function');
  }

  // ─── Summary ───────────────────────────────────────────────────
  console.log(`\n=== Results: ${passCount}/${testCount} passed, ${failCount} failed ===\n`);
  
  // Clean up
  bus.purge();
  
  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
