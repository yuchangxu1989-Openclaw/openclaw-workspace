'use strict';

/**
 * Skill CRAS Handler — Dispatcher反向调用CRAS分析接口
 * 
 * 当规则匹配到CRAS相关事件时，调用CRAS event-bridge的analyzeRequest
 * 事件类型: cras.knowledge.learned, cras.insight.*
 */

const path = require('path');

let _crasEventBridge = null;

function getCRASBridge() {
  if (!_crasEventBridge) {
    try {
      _crasEventBridge = require(path.join(
        __dirname, '..', '..', '..', 'skills', 'cras', 'event-bridge.js'
      ));
    } catch (err) {
      console.error('[skill-cras-handler] Failed to load CRAS event-bridge:', err.message);
      return null;
    }
  }
  return _crasEventBridge;
}

/**
 * Handle CRAS-related events by invoking CRAS analysis
 * @param {object} event - The event to process
 * @param {object} context - Dispatcher context
 * @returns {object} Handler result
 */
function handle(event, context) {
  const bridge = getCRASBridge();
  if (!bridge) {
    return {
      status: 'error',
      handler: 'skill-cras-handler',
      error: 'CRAS event-bridge not available',
    };
  }

  // Route based on event type
  const eventType = event.type || event.eventType || '';

  if (eventType.startsWith('cras.knowledge')) {
    // Knowledge learned — trigger CRAS processAssessments to analyze
    try {
      const result = bridge.processAssessments();
      return {
        status: 'ok',
        handler: 'skill-cras-handler',
        action: 'processAssessments',
        result,
      };
    } catch (err) {
      return {
        status: 'error',
        handler: 'skill-cras-handler',
        action: 'processAssessments',
        error: err.message,
      };
    }
  }

  // Default: analysis request
  if (typeof bridge.analyzeRequest === 'function') {
    try {
      return bridge.analyzeRequest(event);
    } catch (err) {
      return {
        status: 'error',
        handler: 'skill-cras-handler',
        action: 'analyzeRequest',
        error: err.message,
      };
    }
  }

  return {
    status: 'ok',
    handler: 'skill-cras-handler',
    action: 'noop',
    reason: 'No matching CRAS action for event type: ' + eventType,
  };
}

module.exports = handle;
module.exports.handle = handle;
