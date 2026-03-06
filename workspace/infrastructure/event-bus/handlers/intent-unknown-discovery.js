const { genericCheck } = require('./batch3-misc-handlers');

module.exports = async (event, rule, context) =>
  genericCheck(event, rule, 'intent-unknown-discovery', (p) => {
    const text = (p.text || p.query || '').trim();
    const confidence = Number(p.intentConfidence ?? p.confidence ?? 0);
    const unknown = !p.intent || confidence < 0.55;
    const discovered = unknown ? { unknownIntent: true, hint: text.slice(0, 120), confidence } : { unknownIntent: false };
    return { result: 'pass', details: unknown ? '发现未知意图并标注候选' : '未发现未知意图', discovered };
  });
