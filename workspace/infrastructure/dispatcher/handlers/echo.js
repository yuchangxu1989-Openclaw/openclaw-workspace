'use strict';

/**
 * Sample echo handler for testing.
 * Simply returns the event it received.
 */
module.exports = function echoHandler(event, context) {
  return {
    echoed: true,
    eventType: event.type || event.eventType || 'unknown',
    handlerName: context.handlerName,
    matchedPattern: context.matchedPattern,
    receivedAt: new Date().toISOString(),
  };
};
