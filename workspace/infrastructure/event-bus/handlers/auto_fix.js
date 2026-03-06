module.exports = async function(event, rule, context) {
  return {
    ok: true,
    handler: 'auto-fix',
    skipped: true,
    eventType: event?.type || null,
    ruleId: rule?.id || null,
    note: 'generic autofix meta action placeholder'
  };
};
