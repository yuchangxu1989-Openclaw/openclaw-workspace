module.exports = async function(event, rule, context) {
  return {
    ok: true,
    handler: 'log',
    eventType: event?.type || null,
    ruleId: rule?.id || null,
    note: 'noop log action placeholder'
  };
};
