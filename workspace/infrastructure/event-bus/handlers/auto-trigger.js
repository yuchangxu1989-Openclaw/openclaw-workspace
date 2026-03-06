module.exports = async function(event, rule, context) {
  return {
    ok: true,
    skipped: true,
    handler: 'auto-trigger',
    reason: 'meta action placeholder executed',
    eventType: event?.type || null,
    ruleId: rule?.id || null
  };
};
