const { genericCheck } = require('./batch3-misc-handlers');

module.exports = async (event, rule, context) =>
  genericCheck(event, rule, 'intent-type-convergence', (p) => {
    const allowed = ['emotion_polarity', 'rule_trigger', 'complex', 'implicit', 'multi_intent_single_sentence'];
    const requested = p.intentType || p.intent_type || '';
    const canonical = p.canonicalType || p.canonical_type || requested;
    const issues = [];
    if (!requested) issues.push('missing_intent_type');
    if (canonical && !allowed.includes(canonical)) issues.push(`unsupported_type:${canonical}`);
    return { issues, details: issues.length ? `意图类型未收敛: ${issues.join(',')}` : '意图类型收敛检查通过', allowed, requested, canonical };
  });
