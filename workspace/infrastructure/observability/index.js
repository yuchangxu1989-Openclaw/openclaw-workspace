'use strict';

/**
 * L3 Observability Module — Unified Entry Point
 * 
 * Exports:
 *   - metrics: Runtime metrics collector
 *   - health: Health check endpoint
 *   - alerts: Alert rules engine
 *   - dashboard: Report generation
 * 
 * @module infrastructure/observability
 */

const metrics = require('./metrics');
const health = require('./health');
const alerts = require('./alerts');
const dashboard = require('./l3-dashboard');

module.exports = {
  metrics,
  health,
  alerts,
  dashboard,
};
