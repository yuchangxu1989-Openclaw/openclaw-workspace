module.exports = async function(event, rule, context) {
  return {
    ok: true,
    handler: 'route',
    skipped: true,
    eventType: event?.type || null,
    ruleId: rule?.id || null,
    note: 'routing meta action placeholder'
  };
};
