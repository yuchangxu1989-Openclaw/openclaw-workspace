const path = require('path');
const runAeo = require('../../../skills/aeo');

module.exports = async function aeoEvaluationRequiredHandler(event, rule, context) {
  const payload = {
    ...(event?.payload || {}),
    sourceEvent: {
      id: event?.id,
      type: event?.type,
      source: event?.source
    },
    ruleId: rule?.id
  };

  return runAeo(payload, context || {});
};
