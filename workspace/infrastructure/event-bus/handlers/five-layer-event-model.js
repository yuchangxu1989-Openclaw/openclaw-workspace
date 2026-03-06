'use strict';
/**
 * Five-Layer Event Model Handler
 * 
 * Wraps skills/five-layer-event-model to classify events and check layer coverage.
 * Triggered by: system.architecture.changed, isc.rule.matched
 */
const path = require('path');

let _model = null;
function getModel() {
  if (_model) return _model;
  _model = require(path.resolve(__dirname, '../../../skills/five-layer-event-model/index.js'));
  return _model;
}

module.exports = async function fiveLayerEventModelHandler(event, rule, context) {
  const logger = context.logger || console;
  const model = getModel();

  logger.info(`[five-layer-event-model] Triggered by ${event.type}`);

  try {
    // Classify the triggering event
    const classification = model.classifyEventType(event.type);
    logger.info(`[five-layer-event-model] Event "${event.type}" classified as ${classification.layer} (confidence: ${classification.confidence})`);

    // Run coverage check if event log is available
    const eventsLogPath = path.resolve(__dirname, '../../logs/events.jsonl');
    const fs = require('fs');
    let coverage = null;
    if (fs.existsSync(eventsLogPath)) {
      const events = model.coverageCheck ? 
        fs.readFileSync(eventsLogPath, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
      if (events.length > 0 && model.coverageCheck) {
        coverage = model.coverageCheck(events);
      }
    }

    // Generate health report
    const health = model.generateHealthReport ? model.generateHealthReport() : null;

    return {
      status: 'COMPLETED',
      classification,
      coverage,
      health,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    logger.error(`[five-layer-event-model] Error: ${err.message}`);
    return { status: 'FAILED', error: err.message };
  }
};
