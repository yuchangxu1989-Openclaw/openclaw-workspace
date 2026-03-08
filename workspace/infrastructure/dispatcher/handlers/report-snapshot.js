module.exports = async function reportSnapshot({ event, rule, logger = console }) {
  const type = event?.type || event?.eventType || 'unknown';
  logger.log?.(`[report-snapshot] snapshot skipped/noop for ${type}`);
  return { ok: true, snapshot: false, noop: true, type, ruleId: rule?.id || null };
};
