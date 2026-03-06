'use strict';

/**
 * EventBus Handler: day.completed → day-transition
 */

const { transition } = require('../../task-flow/day-transition');

module.exports = async function(event, rule, context) {
  const dayNum = event.payload?.day || event.payload?.dayNum;

  if (!dayNum || typeof dayNum !== 'number') {
    console.error('[day-transition-handler] Invalid event: missing or non-numeric day number');
    return { success: false, error: 'Missing day number' };
  }

  console.log(`[day-transition-handler] Day ${dayNum} completed, initiating transition to Day ${dayNum + 1}`);

  const result = transition(dayNum);

  if (result.success) {
    console.log(`[day-transition-handler] ✅ Transition ${dayNum} → ${result.nextDay} complete`);
  } else {
    console.error(`[day-transition-handler] ❌ Transition failed: ${result.error}`);
  }

  return result;
};
