/**
 * IntentScanner - L3意图识别扫描器
 * 
 * CRAS快通道核心组件：5分钟增量扫描对话，识别意图并emit事件。
 * 
 * 纯LLM语义理解。不允许关键词/正则fallback。
 * LLM不可用时返回空结果，不猜。
 * 
 * @module infrastructure/intent-engine
 * @version 2.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const EventBus = require('../event-bus/bus-adapter');
const { log: decisionLog } = require('../decision-log/decision-logger');

let _metrics = null;
try { _metrics = require('../observability/metrics'); } catch (_) {}

const REGISTRY_PATH = path.join(__dirname, 'intent-registry.json');
const LOG_DIR = path.join(__dirname, 'logs');
const FEATURE_FLAG = (process.env.INTENT_SCANNER_ENABLED || 'true').toLowerCase();

class IntentScanner extends EventEmitter {
  constructor(options = {}) {
    super();
    this._registry = null;
    this._registryPath = options.registryPath || REGISTRY_PATH;
    this._logDir = options.logDir || LOG_DIR;
    this._timeout = options.timeout || 30000;
  }

  /**
   * 主入口：扫描对话切片，识别意图（纯LLM）
   */
  async scan(conversationSlice) {
    if (FEATURE_FLAG === 'false') {
      return { intents: [], decision_logs: [], skipped: true, reason: 'INTENT_SCANNER_ENABLED=false' };
    }

    if (!Array.isArray(conversationSlice) || conversationSlice.length === 0) {
      return { intents: [], decision_logs: [], skipped: true, reason: 'empty_input' };
    }

    if (_metrics) _metrics.inc('intent_requests_total');
    const timer = _metrics ? _metrics.startTimer('intent') : null;

    const registry = this._loadRegistry();

    try {
      const result = await this._scanWithLLM(conversationSlice, registry);
      this._persistLogs(result.decision_logs);
      this._emitIntentEvents(result.intents);
      this._trackIntentMetrics(result.intents, timer);
      return result;
    } catch (err) {
      // LLM失败 → 返回空结果，不降级到关键词
      const failLog = {
        what: 'llm_failure',
        decision: 'LLM调用失败，返回空结果（无关键词降级）',
        why: `LLM调用失败: ${err.message}`,
        confidence: 0,
        alternatives_considered: [],
        method: 'llm',
        timestamp: new Date().toISOString()
      };

      this._persistLogs([failLog]);

      try {
        decisionLog({
          phase: 'sensing',
          component: 'IntentScanner',
          decision: 'LLM失败，返回空（禁止关键词降级）',
          what: 'llm_failure_no_fallback',
          why: `LLM调用失败: ${err.message}，按规定不降级到关键词/正则`,
          confidence: 0,
          decision_method: 'llm',
        });
      } catch (_) {}

      this.emit('system.capability.unavailable', {
        component: 'IntentScanner',
        method: 'llm',
        error: err.message,
        timestamp: new Date().toISOString(),
        fallback: 'none'
      });

      this._trackIntentMetrics([], timer);
      return { intents: [], decision_logs: [failLog], skipped: false, method: 'llm', error: err.message };
    }
  }

  _trackIntentMetrics(intents, timer) {
    if (!_metrics) return;
    if (timer) timer.stop();
    if (!intents || intents.length === 0) {
      _metrics.inc('intent_no_match_total');
    } else {
      for (const intent of intents) {
        const category = intent.category || intent.intent_id || 'unknown';
        _metrics.incCategory('intent_hits_by_category', category);
      }
    }
  }

  // --------------------------------------------------------------------------
  // LLM Path (唯一路径)
  // --------------------------------------------------------------------------

  async _scanWithLLM(conversationSlice, registry) {
    const systemPrompt = this._buildSystemPrompt(registry);
    const userContent = this._buildUserContent(conversationSlice);

    const response = await this._callZhipuWithRetry(systemPrompt, userContent);
    const parsed = this._parseLLMResponse(response);

    const decision_logs = parsed.map(intent => {
      const altList = (intent.alternatives || []).join(', ');
      const whyParts = [`LLM confidence ${intent.confidence}`];
      if (altList) whyParts.push(`排除: ${altList}`);
      if (intent.evidence) whyParts.push(`证据: ${intent.evidence}`);

      return {
        what: intent.intent_id,
        decision: `选择意图 ${intent.intent_id}`,
        why: whyParts.join('; '),
        confidence: intent.confidence,
        alternatives: intent.alternatives || [],
        alternatives_considered: (intent.alternatives || []).map(a => ({
          id: a, reason: 'LLM排序较低'
        })),
        method: 'llm',
        timestamp: new Date().toISOString()
      };
    });

    return { intents: parsed, decision_logs, skipped: false, method: 'llm' };
  }

  _buildSystemPrompt(registry) {
    let intentDefs = '';

    if (registry.intents && Array.isArray(registry.intents)) {
      const catMap = registry.categories || {};
      const grouped = {};
      for (const intent of registry.intents) {
        const catId = intent.category || 'unknown';
        if (!grouped[catId]) grouped[catId] = [];
        grouped[catId].push(intent);
      }

      const sections = [];
      for (const [catId, catInfo] of Object.entries(catMap)) {
        const intents = grouped[catId] || [];
        if (intents.length === 0) continue;

        const intentLines = intents.map(i => {
          let line = `- **${i.id}** (${i.name}): ${i.description}`;
          if (i.examples && i.examples.length > 0) {
            line += `\n  示例: ${i.examples.map(e => `"${e}"`).join(' | ')}`;
          }
          if (i.anti_examples && i.anti_examples.length > 0) {
            line += `\n  反例(不要匹配): ${i.anti_examples.map(e => `"${e}"`).join(' | ')}`;
          }
          return line;
        }).join('\n');

        sections.push(`## ${catId} ${catInfo.name} — ${catInfo.description}\n${intentLines}`);
      }
      intentDefs = sections.join('\n\n');
    } else if (Array.isArray(registry.categories)) {
      intentDefs = registry.categories.map(c =>
        `## ${c.id} (${c.name}): ${c.description}\n  示例: ${(c.examples || []).slice(0, 3).join('; ')}`
      ).join('\n\n');
    }

    return `你是一个精确的意图分类引擎。分析用户对话文本，将其分类到下面定义的意图中。

# 意图定义

${intentDefs}

# 分类规则

1. **MECE原则**：每条文本归入最匹配的一个意图。IC5（复合意图）优先于单一意图——如果文本同时包含反馈和方向调整，归入IC5而非IC1。
2. **隐含 vs 显式**：明确表达的情绪归IC1，只有通过语气/简短回复暗示的才归IC4。例如"太差了"是IC1，"好吧"是IC4。
3. **反例很重要**：仔细检查反例，避免过度匹配。
4. **空输入或无关闲聊**：返回空数组 []。
5. **对抗样本**：查看配置≠修改配置（不触发配置保护），修bug≠架构重构（不触发架构评审）。

# 输出格式

严格JSON数组，每个元素：
{"intent_id":"具体意图ID","category":"IC1-IC5","confidence":0.0-1.0,"evidence":"引用原文","alternatives":["其他考虑过的意图ID"]}

没有匹配返回 []。只输出JSON，无需解释。`;
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
  // LLM via llm-context
  // --------------------------------------------------------------------------

  async _callZhipuWithRetry(systemPrompt, userContent, maxRetries = 2) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this._callZhipu(systemPrompt, userContent);
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise(r => setTimeout(r, backoff));
        }
      }
    }
    throw lastError;
  }

  async _callZhipu(systemPrompt, userContent) {
    const llmContext = require('../llm-context');
    const result = await llmContext.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      { capability: 'chat', priority: 'cost', timeout: this._timeout }
    );
    const content = result.content;
    if (!content) throw new Error('LLM returned empty content');
    return content;
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

      try {
        EventBus.emit('intent.detected', eventPayload, 'IntentScanner');
      } catch (err) {
        try {
          decisionLog({
            phase: 'sensing',
            component: 'IntentScanner',
            what: `EventBus emit failed for intent ${intent.intent_id}`,
            why: err.message,
            confidence: intent.confidence,
            decision_method: 'llm',
          });
        } catch (_) {}
      }

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
    try {
      if (!fs.existsSync(this._logDir)) {
        fs.mkdirSync(this._logDir, { recursive: true });
      }
      const date = new Date().toISOString().slice(0, 10);
      const logFile = path.join(this._logDir, `scan-${date}.jsonl`);
      const lines = logs.map(l => JSON.stringify(l)).join('\n') + '\n';
      fs.appendFileSync(logFile, lines, 'utf8');
    } catch (e) {}

    for (const log of logs) {
      try {
        decisionLog({
          phase: 'sensing',
          component: 'IntentScanner',
          decision: log.decision || `意图识别: ${log.what || 'unknown'}`,
          what: log.what || 'intent scan result',
          why: log.why || '',
          confidence: typeof log.confidence === 'number' ? log.confidence : null,
          alternatives: log.alternatives || [],
          alternatives_considered: log.alternatives_considered || [],
          decision_method: 'llm',
          input_summary: `method=${log.method}`,
        });
      } catch (_) {}
    }
  }
}

module.exports = { IntentScanner };
