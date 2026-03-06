const { runSelfBootstrapKernel } = require('../infrastructure/self-bootstrap-kernel');

describe('self-bootstrap-kernel', () => {
  test('runs and materializes minimal survival kernel artifacts', () => {
    const status = runSelfBootstrapKernel();

    expect(status).toBeTruthy();
    expect(status.kernel).toBe('self-bootstrap-kernel');
    expect(status.anchor).toBeTruthy();
    expect(status.anchor.path).toBe('CAPABILITY-ANCHOR.md');
    expect(status.dispatch).toBeTruthy();
    expect(status.eval).toBeTruthy();
    expect(['pass', 'partial', 'fail']).toContain(status.eval.verdict);
    expect(typeof status.eval.score).toBe('number');
  });
});
