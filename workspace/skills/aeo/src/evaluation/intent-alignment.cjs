'use strict';

/**
 * Intent evaluation alignment helpers
 *
 * Standard:
 *   - LLM intent recognition is the primary judgment chain.
 *   - Keyword / regex checks are auxiliary cross-check signals only.
 *   - Sandbox/test mode must not affect production eventing.
 */

const ARCHITECTURE_VERSION = '2026-03-07.llm-primary-intent-gate';

function normalizeExpectedIntents(expected) {
  if (!Array.isArray(expected)) return [];
  return expected
    .filter(item => item && typeof item === 'object' && typeof item.type === 'string')
    .map(item => ({
      type: String(item.type).trim().toUpperCase(),
      target: typeof item.target === 'string' ? item.target.trim() : ''
    }));
}

function normalizePredictedIntents(predicted) {
  if (!Array.isArray(predicted)) return [];
  return predicted
    .filter(item => item && typeof item === 'object' && typeof item.type === 'string')
    .map(item => ({
      type: String(item.type).trim().toUpperCase(),
      target: typeof item.target === 'string' ? item.target.trim() : '',
      confidence: typeof item.confidence === 'number' ? item.confidence : null,
      summary: typeof item.summary === 'string' ? item.summary : ''
    }));
}

function scoreTargetAlignment(expectedTarget, predictedTarget) {
  const exp = String(expectedTarget || '').trim().toLowerCase();
  const act = String(predictedTarget || '').trim().toLowerCase();
  if (!exp) return 1;
  if (!act) return 0;
  if (exp === act) return 1;
  if (act.includes(exp) || exp.includes(act)) return 1;

  const expTokens = exp.split(/[\s,，。；;:/\\|_-]+/).filter(Boolean);
  const actTokens = act.split(/[\s,，。；;:/\\|_-]+/).filter(Boolean);
  if (!expTokens.length || !actTokens.length) return 0;
  const intersection = expTokens.filter(token => actTokens.includes(token));
  return intersection.length > 0 ? 0.5 : 0;
}

function buildAuxiliarySignals(text, expectedIntents) {
  const source = String(text || '');
  const signals = [];
  const lower = source.toLowerCase();

  const rules = {
    RULEIFY: [
      /以后(都)?这样做/,
      /成为规则/,
      /自动(化)?检查/,
      /should become (a )?rule/i,
      /every time/i
    ],
    QUERY: [
      /多少/,
      /在哪里/,
      /怎么样/,
      /请问/,
      /where/i,
      /what/i,
      /how/i,
      /\?/
    ],
    FEEDBACK: [
      /做得很好/,
      /不对/,
      /有问题/,
      /优化一下/,
      /good job/i,
      /wrong/i,
      /issue/i
    ],
    DIRECTIVE: [
      /把.+(调成|改成|重启|执行)/,
      /现在.*执行/,
      /请.*处理/,
      /do this/i,
      /restart/i
    ],
    REFLECT: [
      /回顾/,
      /复盘/,
      /我发现/,
      /最大的问题/,
      /in retrospect/i,
      /lesson/i
    ]
  };

  for (const intent of expectedIntents) {
    const patterns = rules[intent.type] || [];
    const matchedPatterns = patterns.filter(pattern => pattern.test(source) || pattern.test(lower));
    signals.push({
      type: intent.type,
      matched: matchedPatterns.length > 0,
      matches: matchedPatterns.map(pattern => String(pattern))
    });
  }

  return signals;
}

function evaluateIntentCase({ chunk, expected, predicted, requireTargetAlignment = false }) {
  const expectedIntents = normalizeExpectedIntents(expected);
  const predictedIntents = normalizePredictedIntents(predicted);

  const predictedByType = new Map();
  for (const item of predictedIntents) {
    if (!predictedByType.has(item.type)) predictedByType.set(item.type, []);
    predictedByType.get(item.type).push(item);
  }

  let truePositives = 0;
  let falseNegatives = 0;
  let falsePositives = 0;
  const matchedExpected = [];
  const missingExpected = [];
  const unexpectedPredicted = [];

  const consumed = new Set();

  expectedIntents.forEach((exp, index) => {
    const candidates = predictedByType.get(exp.type) || [];
    let bestIdx = -1;
    let bestScore = -1;

    candidates.forEach((candidate, candidateIndex) => {
      const key = `${exp.type}:${candidateIndex}`;
      if (consumed.has(key)) return;
      const targetScore = scoreTargetAlignment(exp.target, candidate.target);
      const score = requireTargetAlignment ? targetScore : (targetScore > 0 ? 1 : 1);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = candidateIndex;
      }
    });

    const matched = bestIdx >= 0 && (!requireTargetAlignment || bestScore > 0);
    if (matched) {
      consumed.add(`${exp.type}:${bestIdx}`);
      truePositives++;
      matchedExpected.push({ expected: exp, predicted: candidates[bestIdx], targetScore: scoreTargetAlignment(exp.target, candidates[bestIdx].target) });
    } else {
      falseNegatives++;
      missingExpected.push(exp);
    }
  });

  predictedIntents.forEach((pred, index) => {
    const key = `${pred.type}:${(predictedByType.get(pred.type) || []).indexOf(pred)}`;
    if (!consumed.has(key)) {
      falsePositives++;
      unexpectedPredicted.push(pred);
    }
  });

  const exactSetMatch = missingExpected.length === 0 && unexpectedPredicted.length === 0;
  const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : (expectedIntents.length === 0 ? 1 : 0);
  const recall = truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const auxiliarySignals = buildAuxiliarySignals(chunk, expectedIntents);

  return {
    passed: exactSetMatch,
    score: exactSetMatch ? 1 : f1,
    llmPrimary: {
      truePositives,
      falsePositives,
      falseNegatives,
      precision,
      recall,
      f1,
      exactSetMatch,
      matchedExpected,
      missingExpected,
      unexpectedPredicted
    },
    auxiliaryCrossCheck: {
      usedForFinalDecision: false,
      signals: auxiliarySignals,
      note: 'Keyword/regex signals are auxiliary only and never override the LLM primary judgment.'
    },
    architecture: {
      policy: 'llm_primary_keyword_regex_auxiliary',
      version: ARCHITECTURE_VERSION
    }
  };
}

module.exports = {
  ARCHITECTURE_VERSION,
  normalizeExpectedIntents,
  normalizePredictedIntents,
  evaluateIntentCase,
  buildAuxiliarySignals,
  scoreTargetAlignment
};
