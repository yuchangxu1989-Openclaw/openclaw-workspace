'use strict';

/**
 * User Message Router v3.0
 *
 * Design Debt Fix: Router regex patterns are now driven by intent-registry.json.
 *   - Old (v2.0): 11 hardcoded patterns with wrong IC semantics (IC4=content, IC5=financial)
 *   - New (v3.0): patterns generated from registry keywords/examples at load time
 *   - Adding a new intent: only edit intent-registry.json, no router code change needed.
 *
 * Flow:
 *   1. Load intent-registry.json at startup -> build regex patterns dynamically
 *   2. Classify intent (registry-driven regex, fast path <10ms)
 *   3. If IC0/unknown, call LLM (slow path)
 *   4. Look up handler from ISC routing rules or default mapping
 *   5. Require and execute target handler
 *
 * CommonJS, pure Node.js.
 */

const fs = require('fs');
const path = require('path');

// --- Decision Logger ---

let _decisionLogger = null;
try {
  _decisionLogger = require('../../decision-log/decision-logger');
} catch (_) {}

function logDecision(entry) {
  if (_decisionLogger && typeof _decisionLogger.log === 'function') {
    try {
      _decisionLogger.log({
        phase: 'execution',
        component: 'UserMessageRouter',
        what: entry.what || 'intent-based routing',
        why: entry.why || 'user message classification',
        confidence: entry.confidence || 0.8,
        decision_method: 'intent_classification',
        input_summary: JSON.stringify(entry).slice(0, 500),
      });
    } catch (_) {}
  }
}

// --- Registry-Driven Intent Pattern Builder ---

const INTENT_REGISTRY_PATH = process.env.INTENT_REGISTRY_PATH
  || path.resolve(__dirname, '../../intent-engine/intent-registry.json');

/**
 * Get keywords for an intent.
 * Priority: intent.keywords (curated) > auto-extracted from examples.
 */
function getIntentKeywords(intent) {
  if (intent.keywords && intent.keywords.length > 0) {
    return intent.keywords;
  }
  const antiText = (intent.anti_examples || []).join(' ');
  const tokenRe = /[\u4e00-\u9fff]{2,6}|[A-Za-z0-9_\-]{3,}/g;
  const candidates = new Set();
  for (const ex of (intent.examples || [])) {
    let m;
    while ((m = tokenRe.exec(ex)) !== null) candidates.add(m[0]);
    tokenRe.lastIndex = 0;
  }
  return [...candidates].filter(t => !antiText.includes(t));
}

function buildRegex(keywords) {
  if (!keywords || keywords.length === 0) return null;
  const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(escaped.join('|'), 'i');
}

/**
 * Load intent-registry.json and build INTENT_PATTERNS.
 *
 * Evaluation order (first-match wins):
 *   IC5 (composite) > IC2 (rule-trigger) > IC3 (complex) > IC1 (emotion) > IC4 (implicit)
 *
 * IC5 checked first because composite intents contain keywords that also appear in IC1/IC4.
 */
function loadIntentPatterns() {
  let registry;
  try {
    const raw = fs.readFileSync(INTENT_REGISTRY_PATH, 'utf8');
    registry = JSON.parse(raw);
  } catch (err) {
    console.error('[UserMessageRouter] Failed to load intent-registry.json:', err.message);
    return { patterns: [], registryVersion: 'unknown', intentCount: 0 };
  }

  const patterns = [];
  const intents = registry.intents || [];

  for (const intent of intents) {
    if (intent.status !== 'active') continue;
    const keywords = getIntentKeywords(intent);
    const regex = buildRegex(keywords);
    if (!regex) continue;
    patterns.push({
      pattern: regex,
      category: intent.category,
      intentId: intent.id,
      name: intent.name,
      confidence_threshold: intent.confidence_threshold || 0.7,
    });
  }

  const categoryOrder = { IC5: 0, IC2: 1, IC3: 2, IC1: 3, IC4: 4 };
  patterns.sort((a, b) => (categoryOrder[a.category] !== undefined ? categoryOrder[a.category] : 5) - (categoryOrder[b.category] !== undefined ? categoryOrder[b.category] : 5));

  console.log(
    '[UserMessageRouter] Loaded ' + patterns.length + ' patterns from intent-registry' +
    ' (v' + (registry.version || '?') + ', ' + intents.length + ' intents)'
  );

  return {
    patterns,
    registryVersion: registry.version || 'unknown',
    intentCount: intents.length,
  };
}

const loaded = loadIntentPatterns();
const INTENT_PATTERNS = loaded.patterns;
const REGISTRY_VERSION = loaded.registryVersion;
const REGISTRY_INTENT_COUNT = loaded.intentCount;

// --- Intent Classification (regex fast path) ---

function classifyIntentByRegex(text) {
  if (!text) return { category: 'IC0', intentId: 'unknown', name: 'unknown', confidence: 0.1 };

  for (var i = 0; i < INTENT_PATTERNS.length; i++) {
    var p = INTENT_PATTERNS[i];
    if (p.pattern.test(text)) {
      return {
        category: p.category,
        intentId: p.intentId,
        name: p.name,
        confidence: Math.min(p.confidence_threshold * 0.9, 0.85),
      };
    }
  }
  return { category: 'IC0', intentId: 'unknown', name: 'unknown', confidence: 0.1 };
}

// --- LLM Fallback ---
// v3.1: Switched from Anthropic SDK (penguinsaichat, all keys 401) to ZhipuAI GLM-4-Flash
// ZhipuAI keys loaded from /root/.openclaw/.secrets/zhipu-keys.env (all 3 verified valid 2026-03-05)

const https = require('https');
const LLM_MODEL = 'glm-4-flash';
const LLM_TIMEOUT_MS = 10000;

// Load ZhipuAI key: prefer env ZHIPU_API_KEY, then read from secrets file
const ZHIPU_API_KEY = (function() {
  if (process.env.ZHIPU_API_KEY) return process.env.ZHIPU_API_KEY;
  try {
    var secretsFile = fs.readFileSync('/root/.openclaw/.secrets/zhipu-keys.env', 'utf8');
    var match = secretsFile.match(/^ZHIPU_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
    // fallback to KEY_2
    match = secretsFile.match(/^ZHIPU_API_KEY_2=(.+)$/m);
    if (match) return match[1].trim();
  } catch (_) {}
  return null;
})();

function buildLLMSystemPrompt() {
  var categoriesSection = '';
  try {
    var raw = fs.readFileSync(INTENT_REGISTRY_PATH, 'utf8');
    var registry = JSON.parse(raw);
    var cats = registry.categories || {};
    categoriesSection = Object.entries(cats)
      .map(function(e) { return '- **' + e[0] + '** (' + e[1].name + '): ' + e[1].description; })
      .join('\n');
  } catch (_) {
    categoriesSection = '- IC1~IC5 (see registry)';
  }

  return '你是一个用户意图分类器，负责将用户消息分类到以下意图类别（IC0-IC5）。\n\n## 意图类别定义\n\n- **IC0** (unknown): 无法识别的意图\n' + categoriesSection + '\n\n## 输出格式（严格JSON）\n\n{\n  "intents": [{"category": "IC1", "name": "emotion_feedback", "confidence": 0.9, "reasoning": "..."}],\n  "primary": "IC1",\n  "is_composite": false\n}\n\n- 只输出JSON，不要其他文字';
}

const LLM_INTENT_SYSTEM_PROMPT = buildLLMSystemPrompt();

/**
 * Call ZhipuAI OpenAI-compatible API using native https (no SDK dependency).
 */
function zhipuRequest(messages, systemPrompt) {
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: 'system', content: systemPrompt }].concat(messages),
      max_tokens: 512,
    });
    var options = {
      hostname: 'open.bigmodel.cn',
      path: '/api/paas/v4/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ZHIPU_API_KEY,
        'Content-Length': Buffer.byteLength(body),
      },
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          var parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error('ZhipuAI response parse error: ' + data.slice(0, 100)));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(LLM_TIMEOUT_MS, function() {
      req.destroy(new Error('ZhipuAI request timeout'));
    });
    req.write(body);
    req.end();
  });
}

async function classifyIntentByLLM(text) {
  if (!ZHIPU_API_KEY) {
    console.error('[UserMessageRouter] No ZhipuAI API key available');
    return { category: 'IC0', name: 'unknown', confidence: 0.1, source: 'llm_init_failed' };
  }

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('LLM timeout')), LLM_TIMEOUT_MS)
  );

  const llmPromise = (async () => {
    const response = await zhipuRequest(
      [{ role: 'user', content: '请分类以下用户消息的意图：\n\n"' + text + '"' }],
      LLM_INTENT_SYSTEM_PROMPT
    );
    const rawContent = (response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content) || '';
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM response');
    const parsed = JSON.parse(jsonMatch[0]);
    const primaryIntent = parsed.intents && parsed.intents[0];
    if (!primaryIntent) throw new Error('No intent in LLM response');
    return {
      category: primaryIntent.category || 'IC0',
      name: primaryIntent.name || 'unknown',
      confidence: primaryIntent.confidence || 0.5,
      reasoning: primaryIntent.reasoning || '',
      source: 'llm',
      llm_provider: 'zhipu_glm4flash',
      is_composite: parsed.is_composite || false,
      all_intents: parsed.intents || [],
    };
  })();

  try {
    return await Promise.race([llmPromise, timeoutPromise]);
  } catch (err) {
    const isTimeout = err.message === 'LLM timeout';
    console.error('[UserMessageRouter] LLM ' + (isTimeout ? 'timed out' : 'error') + ':', err.message);
    return {
      category: 'IC0', name: 'unknown', confidence: 0.1,
      source: isTimeout ? 'llm_timeout_fallback' : 'llm_error_fallback',
      error: err.message,
    };
  }
}

// --- Main classifyIntent ---

async function classifyIntent(text) {
  if (!text) return { category: 'IC0', name: 'unknown', confidence: 0.1, source: 'empty_input' };

  const regexResult = classifyIntentByRegex(text);
  if (regexResult.category !== 'IC0') {
    return Object.assign({}, regexResult, { source: 'registry_regex' });
  }

  console.log('[UserMessageRouter] Regex IC0, invoking LLM fallback...');
  return await classifyIntentByLLM(text);
}

// --- Handler Mapping ---

const DEFAULT_HANDLER_MAP = {
  IC1: 'cras-feedback-handler',
  IC2: 'dev-task-handler',
  IC3: 'cras-knowledge-handler',
  IC4: 'dev-task-handler',
  IC5: 'analysis-handler',
};

function resolveHandlerName(intentCategory, iscRule) {
  if (iscRule && iscRule.routing_rules && iscRule.routing_rules.routes) {
    for (var i = 0; i < iscRule.routing_rules.routes.length; i++) {
      var route = iscRule.routing_rules.routes[i];
      if (route.intent_category === intentCategory) return route.handler;
    }
  }
  return DEFAULT_HANDLER_MAP[intentCategory] || 'cras-knowledge-handler';
}

// --- Handler Executor ---

const HANDLERS_DIR = __dirname;
const _handlerCache = new Map();

function loadHandler(handlerName) {
  if (_handlerCache.has(handlerName)) return _handlerCache.get(handlerName);
  const handlerPath = path.join(HANDLERS_DIR, handlerName + '.js');
  if (!fs.existsSync(handlerPath)) return null;
  try {
    var mod = require(handlerPath);
    if (typeof mod === 'function') { _handlerCache.set(handlerName, mod); return mod; }
    if (mod && typeof mod.handle === 'function') { _handlerCache.set(handlerName, mod.handle); return mod.handle; }
  } catch (err) {
    logDecision({ what: 'Failed to load handler: ' + handlerName, why: err.message, confidence: 0 });
  }
  return null;
}

// --- Main Handler ---

async function handle(event, context) {
  const text = (event.payload && event.payload.text) || '';
  const intent = await classifyIntent(text);

  const iscRule = (context.rule && context.rule._iscRule)
    || (context.rule && context.rule.rule)
    || null;

  const targetHandlerName = resolveHandlerName(intent.category, iscRule);

  logDecision({
    what: 'Routing ' + intent.category + '(' + intent.name + ') -> ' + targetHandlerName,
    why: 'Intent: ' + intent.category + ', confidence: ' + intent.confidence + ', source: ' + (intent.source || 'registry_regex'),
    confidence: intent.confidence,
  });

  const handlerFn = loadHandler(targetHandlerName);

  if (!handlerFn) {
    return {
      status: 'routed',
      handler: targetHandlerName,
      intent,
      message: 'Routed to ' + targetHandlerName + ' (handler pending implementation)',
      event_type: event.type || 'user.message',
      text_preview: text.slice(0, 100),
      timestamp: new Date().toISOString(),
    };
  }

  const handlerContext = Object.assign({}, context, { intent, parentHandler: 'user-message-router', targetHandlerName });
  const result = await handlerFn(event, handlerContext);
  if (result && typeof result === 'object') result.handler = targetHandlerName;
  return result;
}

// --- Exports ---

module.exports = handle;
module.exports.handle = handle;
module.exports.classifyIntent = classifyIntent;
module.exports.classifyIntentByRegex = classifyIntentByRegex;
module.exports.classifyIntentByLLM = classifyIntentByLLM;
module.exports.resolveHandlerName = resolveHandlerName;
module.exports._registryVersion = REGISTRY_VERSION;
module.exports._registryIntentCount = REGISTRY_INTENT_COUNT;
module.exports._intentPatterns = INTENT_PATTERNS;
