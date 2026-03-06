module.exports = async function(event, rule, context) {
  return {
    ok: false,
    blocked: true,
    handler: 'block-on-fail',
    eventType: event?.type || null,
    ruleId: rule?.id || null,
    note: 'block marker reached'
  };
};
