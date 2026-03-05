/**
 * capability-anchor-sync handler
 * 
 * Triggers CAPABILITY-ANCHOR.md regeneration on relevant events:
 * - skill:created, skill:updated, skill:deleted
 * - isc:rule:changed
 * - infrastructure:changed
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');

const TRIGGER_EVENTS = [
  'skill:created',
  'skill:updated', 
  'skill:deleted',
  'isc:rule:changed',
  'infrastructure:changed'
];

module.exports = {
  events: TRIGGER_EVENTS,
  
  async handle(event) {
    const syncScript = path.join(__dirname, '../../../skills/isc-capability-anchor-sync/index.js');
    try {
      execSync(`node "${syncScript}"`, { 
        cwd: path.join(__dirname, '../../..'),
        timeout: 30000,
        stdio: 'pipe'
      });
      console.log(`[capability-anchor-sync] Regenerated CAPABILITY-ANCHOR.md on ${event.type}`);
    } catch (err) {
      console.error(`[capability-anchor-sync] Failed: ${err.message}`);
    }
  }
};
