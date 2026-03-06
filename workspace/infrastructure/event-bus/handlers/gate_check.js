module.exports = async function(event, rule, context) {
  return {
    ok: true,
    handler: 'gate-check',
    skipped: true,
    eventType: event?.type || null,
    ruleId: rule?.id || null,
    note: 'generic gate check placeholder; use specific gate-check-trigger or dedicated action.handler for real checks'
  };
};
