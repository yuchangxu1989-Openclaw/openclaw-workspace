'use strict';

const circuitBreaker = require('./circuit-breaker');

describe('circuit-breaker', () => {
  beforeEach(() => {
    circuitBreaker.reset();
    circuitBreaker.configure({
      perTypePerMinute: 2,
      maxChainDepth: 3,
      globalPerMinute: 4,
      cooldownMs: 100,
    });
  });

  test('rate limit per type', () => {
    expect(circuitBreaker.check('a').allowed).toBe(true);
    expect(circuitBreaker.check('a').allowed).toBe(true);
    const third = circuitBreaker.check('a');
    expect(third.allowed).toBe(false);
    expect(third.reason).toContain('rate');
  });

  test('chain depth limit', () => {
    expect(circuitBreaker.check('d', { chain_depth: 2 }).allowed).toBe(true);
    const blocked = circuitBreaker.check('d', { chain_depth: 3 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('chain depth');
  });

  test('global limit trips breaker and cooldown recovers', async () => {
    expect(circuitBreaker.check('t1').allowed).toBe(true);
    expect(circuitBreaker.check('t2').allowed).toBe(true);
    expect(circuitBreaker.check('t3').allowed).toBe(true);
    expect(circuitBreaker.check('t4').allowed).toBe(true);

    const tripped = circuitBreaker.check('t5');
    expect(tripped.allowed).toBe(false);
    expect(tripped.reason).toContain('tripped');

    const duringCooldown = circuitBreaker.check('t6');
    expect(duringCooldown.allowed).toBe(false);
    expect(duringCooldown.reason).toContain('circuit breaker tripped');

    await new Promise(r => setTimeout(r, 120));
    circuitBreaker.configure({ globalPerMinute: 10 });
    const recovered = circuitBreaker.check('t-new');
    expect(recovered.allowed).toBe(true);
  });

  test('boundary conditions for depth and limits', () => {
    expect(circuitBreaker.check('b', { chain_depth: 2 }).allowed).toBe(true);
    expect(circuitBreaker.check('b', { chain_depth: 3 }).allowed).toBe(false);

    expect(circuitBreaker.check('c').allowed).toBe(true);
    expect(circuitBreaker.check('c').allowed).toBe(true);
    expect(circuitBreaker.check('c').allowed).toBe(false);
  });
});
