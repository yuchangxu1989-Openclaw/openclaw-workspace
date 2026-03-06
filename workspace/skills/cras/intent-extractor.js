#!/usr/bin/env node
'use strict';

/**
 * CRAS Intent Extractor — L3语义意图事件生产者
 *
 * Day2 模块E：从对话流/会话历史中增量扫描，用LLM语义理解提取意图，
 * emit L3意图事件到事件总线。
 *
 * 核心原则：
 *   意图识别 = LLM语义理解，绝对不是关键词/正则匹配
 *
 * 五种收敛意图类型（MECE）：
 *   1. RULEIFY   — 用户想把某个模式/经验规则化
 *   2. QUERY     — 用户在寻找信息/查询系统状态
 *   3. FEEDBACK  — 用户对系统行为给出反馈（正面/负面）
 *   4. DIRECTIVE — 用户给出直接指令/决策
 *   5. REFLECT   — 用户在反思/复盘/总结
 *
 * 触发方式：cron *​/5 * * * *（每5分钟）
 * 数据源：memory/YYYY-MM-DD.md（每日记忆文件）
 * 扫描策略：游标制，只处理上次扫描后的新增内容
 *
 * @module cras-intent-extractor
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { WORKSPACE, MEMORY_DIR } = require('../_shared/paths');

// ─── 事件总线 ───
const bus = require(path.join(WORKSPACE, 'infrastructure/event-bus/bus-adapter'));

// ─── LLM调用层 ───
const { callLLM } = require('./intent-extractor-llm');

// ─── 配置 ───
const CONFIG = loadConfig();

// ─── 常量 ───
const STATE_FILE = path.join(__dirname, '.intent-extractor-state.json');
const LOG_PREFIX = '[IntentExtractor]';

/**
 * 意图分类体系 — 事件类型映射
 */
const INTENT_TYPES = {
  RULEIFY:   'intent.ruleify',    // → 触发规则化流程
  QUERY:     'intent.query',      // → 触发信息检索
  FEEDBACK:  'intent.feedback',   // → 触发CRAS学习
  DIRECTIVE: 'intent.directive',  // → 触发DTO任务创建
  REFLECT:   'intent.reflect',    // → 触发知识沉淀
};

const VALID_INTENT_TYPES = new Set(Object.keys(INTENT_TYPES));

/**
 * LLM意图提取 System Prompt
 *
 * 设计要点：
 *   - 五种收敛类型严格MECE
 *   - 正负向情绪归入FEEDBACK
 *   - 复杂意图要求5轮上下文推理
 *   - 隐含意图要求证据链
 *   - 一句话多意图允许多条输出
 */
const SYSTEM_PROMPT = `你是一个高精度意图识别系统，专门从人机对话中提取用户的深层意图。

你的任务：分析对话片段，识别用户的语义意图。你必须理解语义和上下文，而不是做关键词匹配。

## 意图分类体系（五类，互斥穷尽）

1. **RULEIFY** — 规则化意图
   用户想把某个经验、模式、最佳实践变成可执行的规则或代码。
   信号：提到"以后都这样做"、"这应该成为规则"、"每次都要检查这个"、描述了反复出现的模式等。
   也包括：用户纠正AI行为并暗示这应该是常规做法。

2. **QUERY** — 查询意图
   用户在寻找信息、查询系统状态、请求解释。
   信号：提问、查看状态、要求解释、请求列举等。

3. **FEEDBACK** — 反馈意图（含正负向情绪）
   用户对系统行为、输出质量给出评价。
   正面：赞赏、满意、确认做得好。
   负面：批评、不满、纠正错误、指出问题。
   信号：明确的评价语句、情绪表达、对比期望与实际。

4. **DIRECTIVE** — 指令意图
   用户给出直接的操作指令或决策。
   信号：命令语气、具体的操作要求、决策声明。

5. **REFLECT** — 反思意图
   用户在反思、复盘、总结经验。
   信号：回顾过去、总结教训、审视流程、哲学思考。

## 识别规则

- **语义理解优先**：理解对话上下文和言外之意，不要做表面关键词匹配
- **复杂意图**：如果意图不明显，结合前后5轮对话上下文推理
- **隐含意图**：用户可能没有明说，但上下文暗示了意图（需要提供证据）
- **一句话多意图**：一句话可能同时包含多种意图（如"这个做得不错，以后都这样做" = FEEDBACK + RULEIFY）
- **confidence阈值**：只输出 confidence >= 0.6 的意图
- **日常闲聊不输出**：如果对话只是闲聊、寒暄，返回空数组
- **最多3个意图**：每个对话片段最多输出3个意图

## 输出格式（严格JSON）

\`\`\`json
{
  "intents": [
    {
      "type": "RULEIFY|QUERY|FEEDBACK|DIRECTIVE|REFLECT",
      "target": "意图的作用对象（如：规则名、技能名、系统模块、具体功能）",
      "summary": "一句话描述这个意图",
      "confidence": 0.6-1.0,
      "evidence": "原文中支持此判断的关键句（直接引用）",
      "sentiment": "positive|negative|neutral"
    }
  ]
}
\`\`\`

如果没有识别到任何意图，返回：{"intents": []}

【重要】你只能输出JSON，不要输出任何其他文字、解释或分析。直接以 { 开头。`;

// ═══════════════════════════════════════════════════════════
// 核心逻辑
// ═══════════════════════════════════════════════════════════

/**
 * 加载配置 — 从openclaw.json读取，不硬编码
 */
function loadConfig() {
  const defaults = {
    chunkSize: 2000,
    minConfidence: 0.6,
    memoryDays: 2,
    maxChunksPerRun: 5,     // 每次最多处理5个chunk（适配5分钟cron周期）
    llmTimeout: 60000,      // 60秒LLM调用超时（GLM-5等reasoning模型较慢）
    maxRunTimeMs: 240000,   // 4分钟总运行时间上限
  };

  try {
    const openclawConfig = JSON.parse(
      fs.readFileSync(path.join(process.env.OPENCLAW_HOME || '/root/.openclaw', 'openclaw.json'), 'utf8')
    );
    const intentConfig = openclawConfig?.cras?.intent || {};
    return { ...defaults, ...intentConfig };
  } catch (_) {
    return defaults;
  }
}

/**
 * 加载/保存扫描状态（游标）
 */
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (_) {
    return { cursors: {}, lastRun: 0, totalIntents: 0, runs: 0 };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * 获取最近N天的记忆文件
 * @param {number} days
 * @returns {string[]} 文件绝对路径列表
 */
function getRecentMemoryFiles(days) {
  const files = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
    const filePath = path.join(MEMORY_DIR, `${dateStr}.md`);
    if (fs.existsSync(filePath)) {
      files.push(filePath);
    }
  }

  return files;
}

/**
 * 将文本分割为chunk
 *
 * 分割策略：按段落边界分割，每chunk不超过maxLen字符。
 * 保留上下文：每个chunk与前一个chunk有2行重叠。
 *
 * @param {string} text
 * @param {number} maxLen
 * @returns {string[]}
 */
function splitIntoChunks(text, maxLen) {
  if (!text || text.length === 0) return [];
  if (text.length <= maxLen) return [text];

  const chunks = [];
  const paragraphs = text.split(/\n{2,}/);
  let current = '';
  let prevTail = ''; // 上一个chunk的最后2行，用于上下文重叠

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > maxLen && current.length > 0) {
      chunks.push(current.trim());
      // 保留尾部2行作为下一chunk的上下文
      const lines = current.split('\n');
      prevTail = lines.slice(-2).join('\n');
      current = prevTail + '\n\n' + para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * 验证LLM输出的意图结构
 * @param {object} intent
 * @returns {boolean}
 */
function validateIntent(intent) {
  if (!intent || typeof intent !== 'object') return false;
  if (!VALID_INTENT_TYPES.has(intent.type)) return false;
  if (typeof intent.confidence !== 'number' || intent.confidence < 0 || intent.confidence > 1) return false;
  if (!intent.summary || typeof intent.summary !== 'string') return false;
  return true;
}

/**
 * 解析LLM响应为意图列表
 * 健壮解析：处理markdown代码块包裹、多余文本等
 *
 * @param {string} response
 * @returns {Array}
 */
function parseLLMResponse(response) {
  if (!response) return [];

  // 尝试提取JSON块
  let jsonStr = response;

  // 去除markdown代码块包裹
  const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
  }

  // 尝试找到 { 开头的JSON
  const jsonStart = jsonStr.indexOf('{');
  const jsonEnd = jsonStr.lastIndexOf('}');
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && Array.isArray(parsed.intents)) {
      return parsed.intents.filter(validateIntent);
    }
    return [];
  } catch (_) {
    console.error(`${LOG_PREFIX} JSON解析失败，原始响应: ${response.slice(0, 200)}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════════════════

/**
 * 增量扫描 + 意图提取
 *
 * @returns {Promise<{processed_chunks: number, intents_detected: number, events_emitted: string[], errors: number}>}
 */
async function extractIntents() {
  const state = loadState();
  const startTime = Date.now();

  console.log(`${LOG_PREFIX} 开始增量扫描 (run #${(state.runs || 0) + 1})`);

  // 1. 读取最近N天的记忆文件，找出新增内容
  const memoryFiles = getRecentMemoryFiles(CONFIG.memoryDays);
  const newChunks = [];

  for (const file of memoryFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const cursor = state.cursors?.[file] || 0;

      if (content.length > cursor) {
        const newContent = content.slice(cursor);
        const chunks = splitIntoChunks(newContent, CONFIG.chunkSize);
        for (const chunk of chunks) {
          // 跳过太短的chunk（可能只是空行或标题）
          if (chunk.trim().length < 50) continue;
          newChunks.push({ file, chunk });
        }
        // 更新游标
        state.cursors = state.cursors || {};
        state.cursors[file] = content.length;
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} 读取 ${file} 失败: ${err.message}`);
    }
  }

  if (newChunks.length === 0) {
    console.log(`${LOG_PREFIX} 无新增内容，跳过`);
    state.lastRun = Date.now();
    state.runs = (state.runs || 0) + 1;
    saveState(state);
    return { processed_chunks: 0, intents_detected: 0, events_emitted: [], errors: 0 };
  }

  console.log(`${LOG_PREFIX} 发现 ${newChunks.length} 个新chunk`);

  // 限制每次运行处理的chunk数
  const chunksToProcess = newChunks.slice(0, CONFIG.maxChunksPerRun);
  if (newChunks.length > CONFIG.maxChunksPerRun) {
    console.log(`${LOG_PREFIX} 截断至 ${CONFIG.maxChunksPerRun} 个chunk（剩余下次处理）`);
    // 不更新被截断chunk的文件游标
    // 回退游标：只保留已处理chunk的文件游标
    const processedFiles = new Set(chunksToProcess.map(c => c.file));
    for (const file of memoryFiles) {
      if (!processedFiles.has(file)) {
        // 文件的chunk全被截断了 → 不更新游标
        if (state.cursors[file] > (loadState().cursors?.[file] || 0)) {
          // 回退到原始游标
          const origState = loadState();
          state.cursors[file] = origState.cursors?.[file] || 0;
        }
      }
    }
  }

  // 2. LLM提取意图
  const allIntents = [];
  const emittedEvents = [];
  let errorCount = 0;

  for (const { file, chunk } of chunksToProcess) {
    // 总运行时间防护
    if (Date.now() - startTime > (CONFIG.maxRunTimeMs || 240000)) {
      console.log(`${LOG_PREFIX} 运行时间超限，停止处理（已处理 ${emittedEvents.length} intents）`);
      break;
    }

    try {
      const userPrompt = `分析以下对话片段：\n\n${chunk}`;
      const response = await callLLM(SYSTEM_PROMPT, userPrompt, {
        timeout: CONFIG.llmTimeout,
      });

      const intents = parseLLMResponse(response);

      for (const intent of intents) {
        // 应用confidence阈值
        if (intent.confidence < CONFIG.minConfidence) continue;

        const eventType = INTENT_TYPES[intent.type];
        if (!eventType) continue;

        // emit到事件总线
        const emitResult = bus.emit(eventType, {
          intent_type: intent.type,
          target: intent.target || 'unknown',
          summary: intent.summary,
          confidence: intent.confidence,
          evidence: intent.evidence || '',
          sentiment: intent.sentiment || 'neutral',
          source_file: path.basename(file),
          extracted_at: Date.now(),
          extractor_version: '1.0.0',
        }, 'cras-intent-extractor', {
          layer: 'l3',
          trace_id: `intent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          chain_depth: 0,
        });

        if (emitResult && !emitResult.suppressed) {
          emittedEvents.push(eventType);
          allIntents.push(intent);
          console.log(`${LOG_PREFIX} 🎯 ${eventType} [${intent.confidence}]: ${intent.summary}`);
        }
      }
    } catch (err) {
      errorCount++;
      console.error(`${LOG_PREFIX} chunk处理失败: ${err.message}`);
      // 不中断处理，继续下一个chunk
    }
  }

  // 3. 更新状态
  state.lastRun = Date.now();
  state.totalIntents = (state.totalIntents || 0) + allIntents.length;
  state.runs = (state.runs || 0) + 1;
  state.lastRunDuration = Date.now() - startTime;
  state.lastRunResults = {
    chunks: chunksToProcess.length,
    intents: allIntents.length,
    events: emittedEvents.length,
    errors: errorCount,
  };
  saveState(state);

  const duration = Date.now() - startTime;
  console.log(`${LOG_PREFIX} 完成: ${chunksToProcess.length} chunks → ${allIntents.length} intents → ${emittedEvents.length} events (${duration}ms, ${errorCount} errors)`);

  return {
    processed_chunks: chunksToProcess.length,
    intents_detected: allIntents.length,
    events_emitted: emittedEvents,
    errors: errorCount,
  };
}

// ═══════════════════════════════════════════════════════════
// AEO 评测接口（预留）
// ═══════════════════════════════════════════════════════════

/**
 * AEO评测接口：意图识别准确率评测
 *
 * 输入：标注好的测试集（对话片段 + 预期意图）
 * 输出：准确率、召回率、F1分数
 *
 * @param {Array<{chunk: string, expected: Array<{type: string, target?: string}>}>} testSet
 * @returns {Promise<{accuracy: number, precision: number, recall: number, f1: number, details: Array}>}
 */
async function evaluateAccuracy(testSet) {
  if (!testSet || testSet.length === 0) {
    return { accuracy: 0, precision: 0, recall: 0, f1: 0, details: [] };
  }

  const details = [];
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const testCase of testSet) {
    try {
      const userPrompt = `分析以下对话片段：\n\n${testCase.chunk}`;
      const response = await callLLM(SYSTEM_PROMPT, userPrompt, {
        timeout: CONFIG.llmTimeout,
      });

      const predicted = parseLLMResponse(response)
        .filter(i => i.confidence >= CONFIG.minConfidence);
      const expected = testCase.expected || [];

      // 计算匹配
      const predictedTypes = new Set(predicted.map(p => p.type));
      const expectedTypes = new Set(expected.map(e => e.type));

      for (const pType of predictedTypes) {
        if (expectedTypes.has(pType)) {
          truePositives++;
        } else {
          falsePositives++;
        }
      }

      for (const eType of expectedTypes) {
        if (!predictedTypes.has(eType)) {
          falseNegatives++;
        }
      }

      details.push({
        chunk: testCase.chunk.slice(0, 100) + '...',
        expected: Array.from(expectedTypes),
        predicted: Array.from(predictedTypes),
        match: expectedTypes.size === predictedTypes.size &&
          [...expectedTypes].every(t => predictedTypes.has(t)),
      });
    } catch (err) {
      details.push({
        chunk: testCase.chunk.slice(0, 100) + '...',
        expected: (testCase.expected || []).map(e => e.type),
        predicted: [],
        match: false,
        error: err.message,
      });
      falseNegatives += (testCase.expected || []).length;
    }
  }

  const precision = truePositives + falsePositives > 0
    ? truePositives / (truePositives + falsePositives) : 0;
  const recall = truePositives + falseNegatives > 0
    ? truePositives / (truePositives + falseNegatives) : 0;
  const f1 = precision + recall > 0
    ? 2 * (precision * recall) / (precision + recall) : 0;
  const accuracy = details.length > 0
    ? details.filter(d => d.match).length / details.length : 0;

  return {
    accuracy: Math.round(accuracy * 1000) / 1000,
    precision: Math.round(precision * 1000) / 1000,
    recall: Math.round(recall * 1000) / 1000,
    f1: Math.round(f1 * 1000) / 1000,
    total_cases: testSet.length,
    details,
  };
}

// ═══════════════════════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════════════════════

module.exports = {
  extractIntents,
  evaluateAccuracy,
  // 测试辅助
  _splitIntoChunks: splitIntoChunks,
  _parseLLMResponse: parseLLMResponse,
  _validateIntent: validateIntent,
  _INTENT_TYPES: INTENT_TYPES,
  _SYSTEM_PROMPT: SYSTEM_PROMPT,
  _loadConfig: loadConfig,
};

// ═══════════════════════════════════════════════════════════
// CLI入口（cron调用）
// ═══════════════════════════════════════════════════════════

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--evaluate')) {
    // AEO评测模式
    const testSetPath = args[args.indexOf('--evaluate') + 1];
    if (!testSetPath || !fs.existsSync(testSetPath)) {
      console.error('Usage: node intent-extractor.js --evaluate <test-set.json>');
      process.exit(1);
    }
    const testSet = JSON.parse(fs.readFileSync(testSetPath, 'utf8'));
    // Support both array format and {test_cases: [...]} format
    const cases = Array.isArray(testSet) ? testSet : (testSet.test_cases || []);
    evaluateAccuracy(cases).then(result => {
      console.log('\n📊 AEO评测结果:');
      console.log(`   Accuracy:  ${(result.accuracy * 100).toFixed(1)}%`);
      console.log(`   Precision: ${(result.precision * 100).toFixed(1)}%`);
      console.log(`   Recall:    ${(result.recall * 100).toFixed(1)}%`);
      console.log(`   F1:        ${(result.f1 * 100).toFixed(1)}%`);
      console.log(JSON.stringify(result, null, 2));
    }).catch(err => {
      console.error(`评测失败: ${err.message}`);
      process.exit(1);
    });
  } else if (args.includes('--status')) {
    // 状态查看
    const state = loadState();
    console.log(`\n📊 Intent Extractor 状态:`);
    console.log(`   总运行次数: ${state.runs || 0}`);
    console.log(`   总检测意图: ${state.totalIntents || 0}`);
    console.log(`   上次运行: ${state.lastRun ? new Date(state.lastRun).toISOString() : 'never'}`);
    console.log(`   上次耗时: ${state.lastRunDuration || 0}ms`);
    if (state.lastRunResults) {
      console.log(`   上次结果: ${state.lastRunResults.chunks} chunks → ${state.lastRunResults.intents} intents → ${state.lastRunResults.events} events (${state.lastRunResults.errors} errors)`);
    }
    if (state.cursors) {
      console.log(`   游标:`);
      for (const [file, pos] of Object.entries(state.cursors)) {
        console.log(`     ${path.basename(file)}: ${pos} chars`);
      }
    }
  } else {
    // 正常运行模式（cron调用）
    extractIntents()
      .then(result => {
        if (result.intents_detected > 0 || result.errors > 0) {
          console.log(`${LOG_PREFIX} Run summary: ${JSON.stringify(result)}`);
        }
      })
      .catch(err => {
        console.error(`${LOG_PREFIX} Fatal error: ${err.message}`);
        process.exit(1);
      });
  }
}
