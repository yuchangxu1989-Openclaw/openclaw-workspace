'use strict';

/**
 * Skill 本地任务编排 Handler — Dispatcher反向调用DTO任务创建接口
 * 
 * 当规则匹配到DTO相关事件时，调用DTO event-bridge的createTaskFromEvent
 * 事件类型: lto.task.completed, lto.task.created, lto.sync.*
 */

const path = require('path');

let _dtoEventBridge = null;

function getDTOBridge() {
  if (!_dtoEventBridge) {
    try {
      _dtoEventBridge = require(path.join(
        __dirname, '..', '..', '..', 'skills', 'lto-core', 'event-bridge.js'
      ));
    } catch (err) {
      console.error('[skill-lto-handler] Failed to load 本地任务编排 event-bridge:', err.message);
      return null;
    }
  }
  return _dtoEventBridge;
}

/**
 * Handle 本地任务编排-related events by invoking 本地任务编排 task creation or processing
 * @param {object} event - The event to process
 * @param {object} context - Dispatcher context
 * @returns {object} Handler result
 */
function handle(event, context) {
  const bridge = getDTOBridge();
  if (!bridge) {
    return {
      status: 'error',
      handler: 'skill-lto-handler',
      error: '本地任务编排 event-bridge not available',
    };
  }

  const eventType = event.type || event.eventType || '';

  // Task creation request
  if (eventType.includes('task.create') || eventType.includes('task.request')) {
    if (typeof bridge.createTaskFromEvent === 'function') {
      try {
        return bridge.createTaskFromEvent(event);
      } catch (err) {
        return {
          status: 'error',
          handler: 'skill-lto-handler',
          action: 'createTask',
          error: err.message,
        };
      }
    }
  }

  // Task completed — process downstream events
  if (eventType.includes('task.completed')) {
    try {
      // Let the 本地任务编排 bridge process events to trigger downstream reactions
      const result = bridge.processEvents();
      if (result && typeof result.then === 'function') {
        // Async — fire and forget with logging
        result.then(r => {
          console.log(`[skill-lto-handler] processEvents completed: ${JSON.stringify(r)}`);
        }).catch(err => {
          console.error(`[skill-lto-handler] processEvents error: ${err.message}`);
        });
        return {
          status: 'ok',
          handler: 'skill-lto-handler',
          action: 'processEvents',
          async: true,
        };
      }
      return {
        status: 'ok',
        handler: 'skill-lto-handler',
        action: 'processEvents',
        result,
      };
    } catch (err) {
      return {
        status: 'error',
        handler: 'skill-lto-handler',
        action: 'processEvents',
        error: err.message,
      };
    }
  }

  // Default: create task from event
  if (typeof bridge.createTaskFromEvent === 'function') {
    try {
      return bridge.createTaskFromEvent(event);
    } catch (err) {
      return {
        status: 'error',
        handler: 'skill-lto-handler',
        action: 'createTask',
        error: err.message,
      };
    }
  }

  return {
    status: 'ok',
    handler: 'skill-lto-handler',
    action: 'noop',
    reason: 'No matching 本地任务编排 action for: ' + eventType,
  };
}

module.exports = handle;
module.exports.handle = handle;
