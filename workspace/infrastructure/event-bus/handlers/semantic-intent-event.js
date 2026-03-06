const { genericCheck } = require('./batch3-misc-handlers');

module.exports = async (event, rule, context) =>
  genericCheck(event, rule, 'semantic-intent-event', (p) => {
    const hasIntent = !!(p.intent || p.semanticIntent);
    const hasEvent = !!(p.sourceEvent || p.eventRef || event.type);
    const issues = [];
    if (!hasIntent) issues.push('missing_semantic_intent');
    if (!hasEvent) issues.push('missing_source_event');
    return { issues, details: issues.length ? '语义意图事件结构不完整' : '语义意图事件结构完整' };
  });
