const fs = require('fs');
const path = require('path');
const { exists, readText, readJson, walk, hasAny } = require('./_p0_utils');

/**
 * Intent Boundary Handler (IC4/IC5判定)
 * 
 * 规则意图：IC4/IC5意图边界判定（单核心意图 vs 多独立任务）
 * 感知：intent.classification.requested / intent.boundary.check
 * 执行：分析用户输入，拆分独立任务，count>=2→IC5，count==1→IC4
 */
module.exports = async function(event, rule, context) {
  const logger = context.logger || console;
  const bus = context.bus;
  const workspace = context.workspace || process.cwd();

  logger.info(`[intent-boundary] Triggered by ${event.type}`, { eventId: event.id });

  try {
    const payload = event.payload || {};
    const userInput = payload.text || payload.input || payload.message || payload.content || '';
    const requestId = payload.request_id || payload.requestId || event.id;

    if (!userInput) {
      logger.warn('[intent-boundary] No user input text in payload');
      return {
        status: 'ERROR',
        reason: 'No user input text provided',
        timestamp: new Date().toISOString()
      };
    }

    logger.info(`[intent-boundary] Analyzing input (${userInput.length} chars)`);

    // === 执行：任务拆分分析 ===
    const tasks = splitIntoTasks(userInput);

    logger.info(`[intent-boundary] Identified ${tasks.length} task(s)`, {
      tasks: tasks.map(t => t.summary)
    });

    // === 判断：IC4 vs IC5 ===
    const classification = tasks.length >= 2 ? 'IC5' : 'IC4';
    const confidence = calculateConfidence(tasks, userInput);

    const result = {
      status: 'RESOLVED',
      classification,
      taskCount: tasks.length,
      confidence,
      tasks: tasks.map((t, i) => ({
        index: i + 1,
        summary: t.summary,
        type: t.type,
        keywords: t.keywords,
        independent: t.independent
      })),
      reasoning: generateReasoning(classification, tasks),
      requestId,
      timestamp: new Date().toISOString()
    };

    logger.info(`[intent-boundary] Classification: ${classification} (confidence: ${confidence})`, {
      taskCount: tasks.length
    });

    // === 闭环：emit结果 ===
    if (bus) {
      await bus.emit('intent.boundary.resolved', {
        source: 'intent-boundary',
        ...result,
        trigger: event.type
      });
    }

    return result;
  } catch (err) {
    logger.error('[intent-boundary] Unexpected error', err);
    throw err;
  }
};

/**
 * 将用户输入拆分为独立任务
 */
function splitIntoTasks(input) {
  const tasks = [];

  // 策略1：显式分隔符拆分（"然后"、"另外"、"同时"、"以及"、数字编号）
  const explicitSplitters = /(?:然后|另外|同时|此外|以及|并且|接着|还要|还需要|第[一二三四五六七八九十\d]+[、,，.]|[\d]+[、.)\]]\s*|;\s*|；\s*)/g;
  
  const parts = input.split(explicitSplitters).map(s => s.trim()).filter(s => s.length > 3);

  if (parts.length >= 2) {
    // 显式拆分成功
    for (const part of parts) {
      tasks.push(analyzeTask(part));
    }
  } else {
    // 策略2：句子级别分析
    const sentences = input
      .split(/[。.!！?？\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 3);

    if (sentences.length >= 2) {
      // 检查句子间是否有语义独立性
      const taskCandidates = [];
      let currentTask = sentences[0];

      for (let i = 1; i < sentences.length; i++) {
        const prev = analyzeTask(currentTask);
        const curr = analyzeTask(sentences[i]);

        if (areIndependent(prev, curr)) {
          taskCandidates.push(prev);
          currentTask = sentences[i];
        } else {
          currentTask += '。' + sentences[i];
        }
      }
      taskCandidates.push(analyzeTask(currentTask));

      if (taskCandidates.length >= 2) {
        return taskCandidates;
      }
    }

    // 策略3：单一任务
    tasks.push(analyzeTask(input));
  }

  return tasks;
}

/**
 * 分析单个任务的类型和关键词
 */
function analyzeTask(text) {
  const keywords = [];
  const typeIndicators = {
    'query': ['查', '搜索', '找', '查询', 'search', 'find', 'look up', '是什么', '怎么'],
    'action': ['创建', '删除', '修改', '更新', '部署', '执行', 'create', 'delete', 'update', 'deploy', 'run'],
    'analysis': ['分析', '评估', '比较', '统计', 'analyze', 'evaluate', 'compare'],
    'generation': ['生成', '写', '创作', '设计', 'generate', 'write', 'design'],
    'communication': ['发送', '通知', '告诉', '邮件', 'send', 'notify', 'email']
  };

  let type = 'general';
  let maxScore = 0;

  for (const [t, indicators] of Object.entries(typeIndicators)) {
    const score = indicators.filter(ind => text.includes(ind)).length;
    if (score > maxScore) {
      maxScore = score;
      type = t;
    }
  }

  // 提取关键词（名词性短语）
  const words = text.split(/[\s,，。.!！?？]+/).filter(w => w.length > 1);
  const stopWords = new Set(['的', '了', '和', '是', '在', '把', '被', '让', '给', '从', '到', 'the', 'a', 'an', 'is', 'are', 'and', 'or', 'to', 'for']);
  for (const w of words) {
    if (!stopWords.has(w) && keywords.length < 5) {
      keywords.push(w);
    }
  }

  return {
    summary: text.substring(0, 100),
    type,
    keywords,
    independent: true,
    raw: text
  };
}

/**
 * 判断两个任务是否语义独立
 */
function areIndependent(task1, task2) {
  // 不同类型的任务更可能独立
  if (task1.type !== task2.type) return true;

  // 关键词重叠度低则可能独立
  const overlap = task1.keywords.filter(k => task2.keywords.includes(k));
  const overlapRatio = overlap.length / Math.max(task1.keywords.length, task2.keywords.length, 1);

  return overlapRatio < 0.3;
}

/**
 * 计算分类置信度
 */
function calculateConfidence(tasks, input) {
  if (tasks.length === 0) return 0;
  if (tasks.length === 1) return 0.9; // 单任务高置信

  // 多任务时检查独立性
  let independentPairs = 0;
  let totalPairs = 0;
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      totalPairs++;
      if (areIndependent(tasks[i], tasks[j])) {
        independentPairs++;
      }
    }
  }

  const independenceRatio = totalPairs > 0 ? independentPairs / totalPairs : 0;

  // 有显式分隔符提高置信度
  const hasExplicitSplitters = /然后|另外|同时|此外|以及|第[一二三]/.test(input);

  let confidence = 0.5 + (independenceRatio * 0.3);
  if (hasExplicitSplitters) confidence += 0.15;
  if (tasks.length >= 3) confidence += 0.05;

  return Math.min(Math.round(confidence * 100) / 100, 0.99);
}

/**
 * 生成分类推理说明
 */
function generateReasoning(classification, tasks) {
  if (classification === 'IC4') {
    return `单核心意图(IC4)：识别到1个核心任务 "${tasks[0]?.summary || ''}"，无需拆分。`;
  } else {
    const taskSummaries = tasks.map((t, i) => `(${i + 1}) ${t.summary}`).join('；');
    return `多独立任务(IC5)：识别到${tasks.length}个独立任务：${taskSummaries}。各任务间语义独立，建议分别处理。`;
  }
}
