module.exports = async function(event, rule, context) {
  return {
    ok: true,
    handler: 'gate',
    skipped: true,
    eventType: event?.type || null,
    ruleId: rule?.id || null,
    note: 'generic gate placeholder; real gating is implemented by specific action.handler handlers'
  };
};
