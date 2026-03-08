module.exports = async function globalEventEscalation({ event, rule, logger = console }) {
  const type = event?.type || event?.eventType || 'unknown';
  logger.log?.(`[global-event-escalation] received ${type}`);
  return { ok: true, escalated: false, noop: true, type, ruleId: rule?.id || null };
};
