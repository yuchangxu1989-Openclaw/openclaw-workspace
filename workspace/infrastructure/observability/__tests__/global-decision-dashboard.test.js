'use strict';

const { buildDashboard } = require('../global-decision-dashboard');

describe('global autonomous decision dashboard', () => {
  test('should build five-layer dashboard structure', () => {
    const dashboard = buildDashboard({ hours: 24 });

    expect(dashboard).toBeDefined();
    expect(dashboard).toHaveProperty('overall_status');
    expect(dashboard).toHaveProperty('layers');
    expect(dashboard.layers).toHaveProperty('cognition');
    expect(dashboard.layers).toHaveProperty('decision');
    expect(dashboard.layers).toHaveProperty('execution');
    expect(dashboard.layers).toHaveProperty('effect');
    expect(dashboard.layers).toHaveProperty('system_health');
  });

  test('execution layer should expose success rate', () => {
    const dashboard = buildDashboard({ hours: 24 });
    expect(dashboard.layers.execution).toHaveProperty('success_rate');
    expect(typeof dashboard.layers.execution.success_rate).toBe('number');
  });
});
