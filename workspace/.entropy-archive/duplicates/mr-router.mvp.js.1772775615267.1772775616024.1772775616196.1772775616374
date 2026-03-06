/**
 * MR MVP - Model Router (50行精简版)
 * @version 1.0.0-mvp
 */
const fs = require('fs');
const path = require('path');

const INTENT_KEYWORDS = {
  reasoning: ['分析','推理','架构','设计','代码','算法','优化'],
  multimodal: ['图','图片','视觉','视频','音频','识别']
};

function classifyIntent(desc) {
  const t = desc.toLowerCase();
  for (const [cat, kws] of Object.entries(INTENT_KEYWORDS)) {
    if (kws.some(k => t.includes(k))) return cat;
  }
  return 'general';
}

function loadConfig(agentId) {
  try {
    const p = path.join(__dirname, 'config', `${agentId}.json`);
    const c = JSON.parse(fs.readFileSync(p));
    return {
      primary: c.model_preferences?.primary || '{{MODEL_GENERAL}}',
      fallbacks: c.model_preferences?.fallbacks || ['{{MODEL_GENERAL}}']
    };
  } catch { 
    return { primary: '{{MODEL_GENERAL}}', fallbacks: [] };
  }
}

function getLEP() {
  try { const m = require('../lep-core'); return m.getLEP ? m.getLEP() : m; }
  catch { return { execute: async (t) => ({ status: 'success', data: { content: `[MVP] ${t.prompt.slice(0,30)}...` }, metadata: { usedModel: t.modelChain[0] } }) }; }
}

async function routeAndExecute(req) {
  const intent = classifyIntent(req.description);
  const cfg = loadConfig(req.agentId || 'default');
  const chain = [...new Set([cfg.primary, ...cfg.fallbacks])];
  
  const result = await getLEP().execute({
    type: 'model_inference',
    modelChain: chain,
    prompt: req.description,
    systemMessage: req.systemMessage,
    options: { timeout: req.timeout || 60000 }
  });
  
  return {
    status: result.status,
    content: result.data?.content,
    usedModel: result.metadata?.usedModel || chain[0],
    intent,
    modelChain: chain
  };
}

module.exports = { routeAndExecute, classifyIntent };
