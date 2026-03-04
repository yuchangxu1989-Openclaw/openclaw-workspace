'use strict';

/**
 * Skill DTO Handler — Dispatcher反向调用DTO任务创建接口
 * 
 * 当规则匹配到DTO相关事件时，调用DTO event-bridge的createTaskFromEvent
 * 事件类型: dto.task.completed, dto.task.created, dto.sync.*
 */

const path = require('path');

let _dtoEventBridge = null;

function getDTOBridge() {
  if (!_dtoEventBridge) {
    try {
      _dtoEventBridge = require(path.join(
        __dirname, '..', '..', '..', 'skills', 'dto-core', 'event-bridge.js'
      ));
    } catch (err) {
      console.error('[skill-dto-handler] Failed to load DTO event-bridge:', err.message);
      return null;
    }
  }
  return _dtoEventBridge;
}

/**
 * Handle DTO-related events by invoking DTO task creation or processing
 * @param {object} event - The event to process
 * @param {object} context - Dispatcher context
 * @returns {object} Handler result
 */
function handle(event, context) {
  const bridge = getDTOBridge();
  if (!bridge) {
    return {
      status: 'error',
      handler: 'skill-dto-handler',
      error: 'DTO event-bridge not available',
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
          handler: 'skill-dto-handler',
          action: 'createTask',
          error: err.message,
        };
      }
    }
  }

  // Task completed — process downstream events
  if (eventType.includes('task.completed')) {
    try {
      // Let the DTO bridge process events to trigger downstream reactions
      const result = bridge.processEvents();
      if (result && typeof result.then === 'function') {
        // Async — fire and forget with logging
        result.then(r => {
          console.log(`[skill-dto-handler] processEvents completed: ${JSON.stringify(r)}`);
        }).catch(err => {
          console.error(`[skill-dto-handler] processEvents error: ${err.message}`);
        });
        return {
          status: 'ok',
          handler: 'skill-dto-handler',
          action: 'processEvents',
          async: true,
        };
      }
      return {
        status: 'ok',
        handler: 'skill-dto-handler',
        action: 'processEvents',
        result,
      };
    } catch (err) {
      return {
        status: 'error',
        handler: 'skill-dto-handler',
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
        handler: 'skill-dto-handler',
        action: 'createTask',
        error: err.message,
      };
    }
  }

  return {
    status: 'ok',
    handler: 'skill-dto-handler',
    action: 'noop',
    reason: 'No matching DTO action for: ' + eventType,
  };
}

module.exports = handle;
module.exports.handle = handle;
