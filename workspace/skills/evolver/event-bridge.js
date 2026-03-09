/**
 * Event Bridge - Connects the Capability Evolver to the LTO Event Bus.
 *
 * Subscribed events:
 *   - aeo.evaluation.completed
 *   - pdca.check.critical
 *   - system.failure.pattern_detected
 *   - skill.quality.degraded
 *
 * On any subscribed event, triggers an evolution cycle and emits
 * skill.evolution.completed when done.
 */

const path = require('path');
const { execFile } = require('child_process');

// LTO event bus — resolve from workspace root
const LTO_BUS_PATH = '../../core/lto-bus';
let bus;
try {
  bus = require(LTO_BUS_PATH);
} catch {
  // Fallback: minimal EventEmitter bus for standalone testing
  const { EventEmitter } = require('events');
  bus = new EventEmitter();
  bus.emit = bus.emit.bind(bus);
  bus.on = bus.on.bind(bus);
  console.warn('[evolver/event-bridge] LTO bus not found, using local EventEmitter fallback');
}

const SUBSCRIBED_EVENTS = [
  'aeo.evaluation.completed',
  'pdca.check.critical',
  'system.failure.pattern_detected',
  'skill.quality.degraded',
];

const EVOLVER_ENTRY = path.resolve(__dirname, 'index.js');

let running = false;
const queue = [];

function runEvolver(triggerEvent, payload) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      EVOLVE_TRIGGER_EVENT: triggerEvent,
      EVOLVE_TRIGGER_PAYLOAD: JSON.stringify(payload || {}),
    };

    const child = execFile(process.execPath, [EVOLVER_ENTRY], { env, cwd: __dirname, timeout: 300_000 }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve({ stdout, stderr });
    });
  });
}

async function processQueue() {
  if (running) return;
  running = true;

  while (queue.length > 0) {
    const { event, payload } = queue.shift();
    const startTime = Date.now();
    try {
      console.log(`[evolver/event-bridge] Evolution triggered by: ${event}`);
      const result = await runEvolver(event, payload);
      const duration = Date.now() - startTime;

      bus.emit('skill.evolution.completed', {
        trigger_event: event,
        trigger_payload: payload,
        duration_ms: duration,
        success: true,
        timestamp: new Date().toISOString(),
      });

      console.log(`[evolver/event-bridge] Evolution completed (${duration}ms), triggered by: ${event}`);
    } catch (err) {
      const duration = Date.now() - startTime;
      console.error(`[evolver/event-bridge] Evolution failed for ${event}:`, err.message);

      bus.emit('skill.evolution.completed', {
        trigger_event: event,
        trigger_payload: payload,
        duration_ms: duration,
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  running = false;
}

function onEvent(eventName, payload) {
  queue.push({ event: eventName, payload });
  processQueue();
}

// Subscribe to all configured events
function subscribe() {
  for (const evt of SUBSCRIBED_EVENTS) {
    bus.on(evt, (payload) => onEvent(evt, payload));
  }
  console.log(`[evolver/event-bridge] Subscribed to ${SUBSCRIBED_EVENTS.length} events`);
}

// Auto-subscribe on require
subscribe();

module.exports = { bus, SUBSCRIBED_EVENTS, subscribe };
