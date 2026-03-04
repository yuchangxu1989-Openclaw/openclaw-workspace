'use strict';

/**
 * Skill ISC Handler — Dispatcher反向调用ISC规则检查接口
 * 
 * 当规则匹配到ISC相关事件时，调用ISC event-bridge的checkRulesFromEvent
 * 事件类型: isc.rule.changed, isc.rule.created, isc.rule.updated, isc.rule.deleted
 */

const path = require('path');

let _iscEventBridge = null;

function getISCBridge() {
  if (!_iscEventBridge) {
    try {
      _iscEventBridge = require(path.join(
        __dirname, '..', '..', '..', 'skills', 'isc-core', 'event-bridge.js'
      ));
    } catch (err) {
      console.error('[skill-isc-handler] Failed to load ISC event-bridge:', err.message);
      return null;
    }
  }
  return _iscEventBridge;
}

/**
 * Handle ISC-related events by invoking ISC rule checking
 * @param {object} event - The event to process
 * @param {object} context - Dispatcher context
 * @returns {object} Handler result
 */
function handle(event, context) {
  const bridge = getISCBridge();
  if (!bridge) {
    return {
      status: 'error',
      handler: 'skill-isc-handler',
      error: 'ISC event-bridge not available',
    };
  }

  const eventType = event.type || event.eventType || '';

  // Rule changed / check request
  if (typeof bridge.checkRulesFromEvent === 'function') {
    try {
      const result = bridge.checkRulesFromEvent(event);
      return {
        ...result,
        handler: 'skill-isc-handler',
        action: 'checkRules',
        event_type: eventType,
      };
    } catch (err) {
      return {
        status: 'error',
        handler: 'skill-isc-handler',
        action: 'checkRules',
        error: err.message,
      };
    }
  }

  // Fallback: trigger full change detection
  if (typeof bridge.publishChangesWithSummary === 'function') {
    try {
      const result = bridge.publishChangesWithSummary();
      return {
        status: 'ok',
        handler: 'skill-isc-handler',
        action: 'publishChanges',
        result,
      };
    } catch (err) {
      return {
        status: 'error',
        handler: 'skill-isc-handler',
        action: 'publishChanges',
        error: err.message,
      };
    }
  }

  return {
    status: 'ok',
    handler: 'skill-isc-handler',
    action: 'noop',
    reason: 'No matching ISC action for: ' + eventType,
  };
}

module.exports = handle;
module.exports.handle = handle;
