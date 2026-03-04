/**
 * IntentScanner - L3意图识别扫描器
 * 
 * CRAS快通道核心组件：5分钟增量扫描对话，识别意图并emit事件。
 * 
 * 功能：
 * 1. scan(conversationSlice) - LLM意图识别主入口
 * 2. 正则降级路径 - LLM不可用时的兜底
 * 3. Decision Log - 每次识别的完整记录
 * 4. Feature Flag - 环境变量开关
 * 
 * @module infrastructure/intent-engine
 * @version 1.0.0
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const EventBus = require('../event-bus/event-bus');
const { log: decisionLog } = require('../decision-log/decision-logger');

// ============================================================================
// Constants
// ============================================================================

const SECRETS_FILE = '/root/.openclaw/.secrets/zhipu-keys.env';
const ZHIPU_KEY = _loadZhipuKey();
const ZHIPU_URL = 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions';
const ZHIPU_MODEL = 'glm-5';
const REGISTRY_PATH = path.join(__dirname, 'intent-registry.json');
const LOG_DIR = path.join(__dirname, 'logs');
const FEATURE_FLAG = (process.env.INTENT_SCANNER_ENABLED || 'true').toLowerCase();

/**
 * Load Zhipu API key: env var → secrets file → null (graceful degradation)
 */
function _loadZhipuKey() {
  // 1. Environment variable (highest priority)
  if (process.env.ZHIPU_API_KEY) {
    return process.env.ZHIPU_API_KEY;
  }
  // 2. Secrets file fallback
  try {
    const content = fs.readFileSync(SECRETS_FILE, 'utf8');
    const match = content.match(/^ZHIPU_API_KEY=(.+)$/m);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch (_) {
    // File not found or unreadable — continue to degradation
  }
  // 3. No key available — will degrade to regex path
  return null;
}

// ============================================================================
// Regex patterns for IC1/IC2 fallback (hardcoded for resilience)
// ============================================================================

const FALLBACK_REGEX = {
  IC1: [
    /烦|烦死|崩溃|头大|搞不定|受不了|无语|气死|太差|垃圾|不行|重做|放弃|累了/gi,
    /不错|很好|太棒|牛|厉害|赞|完美|优秀|搞定|好了/gi,
    /担心|焦虑|紧张|害怕|慌|着急/gi,
    /开心|兴奋|爽|舒服|满意|期待/gi
  ],
  IC2: [
    /规则|规范|标准|流程|ISC|约束|准则/gi,
    /新增规则|修改规则|删除规则|更新规则/gi,
    /合规|不合规|违反|违规|纠偏/gi,
    /架构评审|安全扫描|配置保护|发布/gi
  ]
};

// ============================================================================
// IntentScanner
// ============================================================================

class IntentScanner extends EventEmitter {
  constructor(options = {}) {
    super();
    this._registry = null;
    this._registryPath = options.registryPath || REGISTRY_PATH;
    this._logDir = options.logDir || LOG_DIR;
    this._zhipuKey = options.zhipuKey || ZHIPU_KEY;
    this._zhipuUrl = options.zhipuUrl || ZHIPU_URL;
    this._zhipuModel = options.zhipuModel || ZHIPU_MODEL;
    this._timeout = options.timeout || 30000;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * 主入口：扫描对话切片，识别意图
   * @param {Array<{role: string, content: string, timestamp?: string}>} conversationSlice
   * @returns {Promise<{intents: Array, decision_logs: Array, skipped: boolean}>}
   */
  async scan(conversationSlice) {
    // Feature flag check
    if (FEATURE_FLAG === 'false') {
      return { intents: [], decision_logs: [], skipped: true, reason: 'INTENT_SCANNER_ENABLED=false' };
    }

    if (!Array.isArray(conversationSlice) || conversationSlice.length === 0) {
      return { intents: [], decision_logs: [], skipped: true, reason: 'empty_input' };
    }

    const registry = this._loadRegistry();

    // No API key → skip LLM entirely, degrade to regex
    if (!this._zhipuKey) {
      this.emit('system.capability.degraded', {
        component: 'IntentScanner',
        method: 'llm',
        error: 'No ZHIPU_API_KEY configured (env or secrets file)',
        timestamp: new Date().toISOString(),
        fallback: 'regex'
      });
      const fallbackResult = this._scanWithRegex(conversationSlice, registry);
      this._persistLogs(fallbackResult.decision_logs);
      this._emitIntentEvents(fallbackResult.intents);
      return fallbackResult;
    }

    // Try LLM first
    try {
      const result = await this._scanWithLLM(conversationSlice, registry);
      this._persistLogs(result.decision_logs);
      this._emitIntentEvents(result.intents);
      return result;
    } catch (err) {
      // LLM failed → regex fallback
      this.emit('system.capability.degraded', {
        component: 'IntentScanner',
        method: 'llm',
        error: err.message,
        timestamp: new Date().toISOString(),
        fallback: 'regex'
      });

      const fallbackResult = this._scanWithRegex(conversationSlice, registry);
      this._persistLogs(fallbackResult.decision_logs);
      this._emitIntentEvents(fallbackResult.intents);
      return fallbackResult;
    }
  }

  // --------------------------------------------------------------------------
  // LLM Path
  // --------------------------------------------------------------------------

  async _scanWithLLM(conversationSlice, registry) {
    const systemPrompt = this._buildSystemPrompt(registry);
    const userContent = this._buildUserContent(conversationSlice);

    const response = await this._callZhipu(systemPrompt, userContent);
    const parsed = this._parseLLMResponse(response);

    const decision_logs = parsed.map(intent => ({
      what: intent.intent_id,
      why: intent.evidence,
      confidence: intent.confidence,
      alternatives: intent.alternatives || [],
      method: 'llm',
      timestamp: new Date().toISOString()
    }));

    return {
      intents: parsed,
      decision_logs,
      skipped: false,
      method: 'llm'
    };
  }

  /**
   * Build system prompt from registry.
   * Supports both formats:
   *   - v4 schema: { categories: {IC1: {...}, ...}, intents: [...] }
   *   - legacy array: { categories: [{id, name, ...}, ...] }
   */
  _buildSystemPrompt(registry) {
    let categoryLines = '';

    if (registry.intents && Array.isArray(registry.intents)) {
      // v4 schema: categories is a map, intents is array with category refs
      const catMap = registry.categories || {};
      const grouped = {};
      for (const intent of registry.intents) {
        const catId = intent.category || 'unknown';
        if (!grouped[catId]) grouped[catId] = [];
        grouped[catId].push(intent);
      }
      const lines = [];
      for (const [catId, catInfo] of Object.entries(catMap)) {
        const intents = grouped[catId] || [];
        const exampleStr = intents.slice(0, 2).map(i => (i.examples || [])[0] || i.name).join('; ');
        lines.push(`- ${catId} (${catInfo.name}): ${catInfo.description}\n  意图: ${intents.map(i => i.id).join(', ')}\n  示例: ${exampleStr}`);
      }
      categoryLines = lines.join('\n');
    } else if (Array.isArray(registry.categories)) {
      // Legacy array format
      categoryLines = registry.categories.map(c =>
        `- ${c.id} (${c.name}): ${c.description}\n  示例: ${(c.examples || []).slice(0, 2).join('; ')}`
      ).join('\n');
    }

    return `你是一个意图识别引擎。分析用户对话，识别其中包含的意图。

可识别的意图类别：
${categoryLines}

输出要求：严格JSON数组格式，每个元素包含：
- intent_id: 意图ID（如 user.emotion.positive, rule.trigger.self_correction 等）
- confidence: 置信度（0.0-1.0）
- evidence: 识别依据（引用原文）
- alternatives: 考虑过的其他意图ID数组

如果没有识别到任何意图，返回空数组 []。
只返回JSON，不要添加任何额外说明。不要用markdown代码块包裹。`;
  }

  _buildUserContent(conversationSlice) {
    return conversationSlice.map((msg, i) => {
      const ts = msg.timestamp ? `[${msg.timestamp}] ` : '';
      const role = msg.role || 'unknown';
      return `${ts}${role}: ${msg.content}`;
    }).join('\n');
  }

  _parseLLMResponse(raw) {
    if (!raw || typeof raw !== 'string') return [];

    // Strip markdown code fences if present
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    cleaned = cleaned.trim();

    try {
      const arr = JSON.parse(cleaned);
      if (!Array.isArray(arr)) return [];
      return arr.filter(item =>
        item && typeof item.intent_id === 'string' &&
        typeof item.confidence === 'number'
      ).map(item => ({
        intent_id: item.intent_id,
        confidence: Math.max(0, Math.min(1, item.confidence)),
        evidence: item.evidence || '',
        alternatives: Array.isArray(item.alternatives) ? item.alternatives : []
      }));
    } catch (e) {
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // Regex Fallback Path
  // --------------------------------------------------------------------------

  _scanWithRegex(conversationSlice, registry) {
    const fullText = conversationSlice.map(m => m.content || '').join('\n');
    const intents = [];
    const decision_logs = [];

    // Get category IDs from registry (supports both formats)
    const categoryIds = this._getCategoryIds(registry);

    for (const catId of categoryIds) {
      const regexPatterns = FALLBACK_REGEX[catId];
      if (regexPatterns && regexPatterns.length > 0) {
        // IC1, IC2: regex match
        const matches = [];
        for (const re of regexPatterns) {
          // Reset lastIndex for global regex
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(fullText)) !== null) {
            matches.push(m[0]);
          }
        }

        if (matches.length > 0) {
          const uniqueMatches = [...new Set(matches)];
          const confidence = Math.min(0.6, 0.3 + uniqueMatches.length * 0.1);
          intents.push({
            intent_id: catId,
            confidence,
            evidence: `regex matched: [${uniqueMatches.slice(0, 5).join(', ')}]`,
            alternatives: []
          });
          decision_logs.push({
            what: catId,
            why: `Regex fallback matched ${uniqueMatches.length} keyword(s): ${uniqueMatches.slice(0, 5).join(', ')}`,
            confidence,
            alternatives: [],
            method: 'regex_fallback',
            timestamp: new Date().toISOString()
          });
        }
      } else {
        // IC3-IC5: unresolved in regex mode — don't guess
        decision_logs.push({
          what: catId,
          why: 'LLM unavailable, regex not applicable for this category',
          confidence: 0,
          alternatives: [],
          method: 'regex_fallback',
          status: 'unresolved',
          timestamp: new Date().toISOString()
        });
      }
    }

    return {
      intents,
      decision_logs,
      skipped: false,
      method: 'regex_fallback'
    };
  }

  /**
   * Extract category IDs from registry (supports both v4 map and legacy array)
   */
  _getCategoryIds(registry) {
    if (!registry) return ['IC1', 'IC2', 'IC3', 'IC4', 'IC5'];
    if (registry.categories && typeof registry.categories === 'object' && !Array.isArray(registry.categories)) {
      return Object.keys(registry.categories);
    }
    if (Array.isArray(registry.categories)) {
      return registry.categories.map(c => c.id);
    }
    return ['IC1', 'IC2', 'IC3', 'IC4', 'IC5'];
  }

  // --------------------------------------------------------------------------
  // Zhipu API
  // --------------------------------------------------------------------------

  _callZhipu(systemPrompt, userContent) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: this._zhipuModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        temperature: 0.1,
        max_tokens: 2048
      });

      const urlObj = new URL(this._zhipuUrl);
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._zhipuKey}`,
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: this._timeout
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            return reject(new Error(`Zhipu API error ${res.statusCode}: ${data.slice(0, 500)}`));
          }
          try {
            const json = JSON.parse(data);
            const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
            if (!content) {
              return reject(new Error('Zhipu API returned empty content'));
            }
            resolve(content);
          } catch (e) {
            reject(new Error(`Zhipu API parse error: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Zhipu API request timed out'));
      });

      req.write(body);
      req.end();
    });
  }

  // --------------------------------------------------------------------------
  // Event Emission
  // --------------------------------------------------------------------------

  _emitIntentEvents(intents) {
    for (const intent of intents) {
      const eventPayload = {
        intent_id: intent.intent_id,
        confidence: intent.confidence,
        evidence: intent.evidence,
        timestamp: new Date().toISOString()
      };

      // Primary output: emit to EventBus (file-based, cross-module)
      try {
        EventBus.emit('intent.detected', eventPayload, 'IntentScanner');
      } catch (err) {
        // EventBus failure is non-fatal; log and continue
        try {
          decisionLog({
            phase: 'sensing',
            component: 'IntentScanner',
            what: `EventBus emit failed for intent ${intent.intent_id}`,
            why: err.message,
            confidence: intent.confidence,
            decision_method: 'llm',
          });
        } catch (_) { /* best effort */ }
      }

      // Local hook: EventEmitter for in-process listeners (backward compat)
      this.emit('intent.detected', eventPayload);
    }
  }

  // --------------------------------------------------------------------------
  // Registry & Logging
  // --------------------------------------------------------------------------

  _loadRegistry() {
    if (this._registry) return this._registry;
    try {
      const raw = fs.readFileSync(this._registryPath, 'utf8');
      this._registry = JSON.parse(raw);
      return this._registry;
    } catch (e) {
      // Inline minimal fallback registry (v4 format)
      this._registry = {
        version: '0.0.0-fallback',
        categories: {
          IC1: { name: '情绪表达', description: '情绪' },
          IC2: { name: '规则与规范', description: '规则' }
        },
        intents: []
      };
      return this._registry;
    }
  }

  _persistLogs(logs) {
    // 1. Write to local scan log (module-level detail)
    try {
      if (!fs.existsSync(this._logDir)) {
        fs.mkdirSync(this._logDir, { recursive: true });
      }
      const date = new Date().toISOString().slice(0, 10);
      const logFile = path.join(this._logDir, `scan-${date}.jsonl`);
      const lines = logs.map(l => JSON.stringify(l)).join('\n') + '\n';
      fs.appendFileSync(logFile, lines, 'utf8');
    } catch (e) {
      // Logging failure is non-fatal
    }

    // 2. Write to unified DecisionLogger (cross-module audit trail)
    for (const log of logs) {
      try {
        decisionLog({
          phase: 'sensing',
          component: 'IntentScanner',
          what: log.what || 'intent scan result',
          why: log.why || '',
          confidence: typeof log.confidence === 'number' ? log.confidence : null,
          alternatives: log.alternatives || [],
          decision_method: log.method === 'llm' ? 'llm' : 'regex',
          input_summary: `method=${log.method}`,
        });
      } catch (_) {
        // DecisionLogger failure is non-fatal
      }
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = { IntentScanner };
