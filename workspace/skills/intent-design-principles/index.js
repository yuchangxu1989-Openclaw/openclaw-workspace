/**
 * intent-design-principles skill
 *
 * 功能：
 * 1) 意图类型注册表管理（CRUD + 强制 MECE 检查）
 * 2) 收敛类型覆盖率检查（5种收敛类型）
 * 3) 意图反熵增检查（MECE + 长尾风险）
 * 4) 未知意图发现调度（向量聚类任务配置）
 * 5) 输出意图类型健康报告
 */

const REQUIRED_CONVERGENCE_TYPES = [
  'positive_emotion',
  'negative_emotion',
  'rule_intent',
  'complex_intent_5turn',
  'implicit_intent',
  'multi_intent_single_utterance',
];

class IntentRegistry {
  constructor(initial = []) {
    this.intents = Array.isArray(initial) ? [...initial] : [];
  }

  list() {
    return [...this.intents];
  }

  get(id) {
    return this.intents.find((x) => x.id === id) || null;
  }

  create(intent) {
    if (!intent || !intent.id) throw new Error('intent.id is required');
    if (this.get(intent.id)) throw new Error(`intent already exists: ${intent.id}`);
    const draft = this._normalize(intent);
    const mece = this.checkMECE(draft);
    if (!mece.ok) throw new Error(`MECE check failed: ${mece.issues.join('; ')}`);
    const antiEntropy = this.checkAntiEntropyForNewIntent(draft);
    if (!antiEntropy.ok) throw new Error(`anti-entropy failed: ${antiEntropy.issues.join('; ')}`);
    this.intents.push(draft);
    return draft;
  }

  update(id, patch) {
    const idx = this.intents.findIndex((x) => x.id === id);
    if (idx < 0) throw new Error(`intent not found: ${id}`);
    const merged = this._normalize({ ...this.intents[idx], ...patch, id });
    const others = this.intents.filter((x) => x.id !== id);
    const mece = this.checkMECE(merged, others);
    if (!mece.ok) throw new Error(`MECE check failed: ${mece.issues.join('; ')}`);
    const antiEntropy = this.checkAntiEntropyForNewIntent(merged, others);
    if (!antiEntropy.ok) throw new Error(`anti-entropy failed: ${antiEntropy.issues.join('; ')}`);
    this.intents[idx] = merged;
    return merged;
  }

  remove(id) {
    const idx = this.intents.findIndex((x) => x.id === id);
    if (idx < 0) return false;
    this.intents.splice(idx, 1);
    return true;
  }

  checkMECE(candidate, baseList = this.intents) {
    const issues = [];
    const list = [...baseList];

    for (const existing of list) {
      if (existing.id === candidate.id) continue;
      if (existing.name === candidate.name) {
        issues.push(`duplicate name with ${existing.id}`);
      }
      if (hasOverlap(existing.keywords, candidate.keywords)) {
        issues.push(`keyword overlap with ${existing.id}`);
      }
      if (existing.category === candidate.category && similarity(existing.definition, candidate.definition) > 0.78) {
        issues.push(`definition too similar with ${existing.id}`);
      }
    }

    if (!candidate.definition || candidate.definition.length < 8) {
      issues.push('definition too short');
    }
    if (!candidate.category) {
      issues.push('category is required');
    }

    return { ok: issues.length === 0, issues };
  }

  checkConvergenceCoverage(handlers = {}) {
    const uncovered = REQUIRED_CONVERGENCE_TYPES.filter((t) => !handlers[t]);
    const coverage = ((REQUIRED_CONVERGENCE_TYPES.length - uncovered.length) / REQUIRED_CONVERGENCE_TYPES.length) * 100;
    return {
      ok: uncovered.length === 0,
      coverage,
      required: [...REQUIRED_CONVERGENCE_TYPES],
      uncovered,
    };
  }

  checkAntiEntropyForNewIntent(candidate, baseList = this.intents) {
    const issues = [];
    const mece = this.checkMECE(candidate, baseList);
    if (!mece.ok) issues.push(...mece.issues.map((x) => `non-MECE: ${x}`));

    // 长尾风险：关键词过少且历史触发占比过低
    const k = (candidate.keywords || []).length;
    const triggerRate = Number(candidate.triggerRate || 0);
    if (k <= 1 && triggerRate > 0 && triggerRate < 0.003) {
      issues.push('long-tail risk: too sparse keyword + tiny triggerRate');
    }

    // 名称与定义抽象度过低（过于局部）
    if (/[0-9]{4,}|专项|临时|一次性/.test(candidate.name + ' ' + candidate.definition)) {
      issues.push('long-tail risk: overly localized / one-off semantics');
    }

    return { ok: issues.length === 0, issues };
  }

  scheduleUnknownIntentDiscovery(opts = {}) {
    const now = new Date();
    const cadenceDays = Number(opts.cadenceDays || 7);
    const minClusterSize = Number(opts.minClusterSize || 30);

    return {
      pipeline: [
        {
          step: 'vector_clustering',
          cron: `0 3 */${cadenceDays} * *`,
          params: {
            embeddingModel: opts.embeddingModel || 'text-embedding-3-large',
            algorithm: opts.algorithm || 'hdbscan',
            minClusterSize,
            lookbackDays: Number(opts.lookbackDays || 14),
          },
        },
        {
          step: 'llm_classification',
          dependsOn: 'vector_clustering',
          params: {
            model: opts.classifierModel || 'gpt-4.1',
            confidenceThreshold: Number(opts.confidenceThreshold || 0.72),
            labelsSource: 'intent_registry',
          },
        },
        {
          step: 'mece_incremental_identification',
          dependsOn: 'llm_classification',
          params: {
            policy: 'MECE-first',
            requireHumanReview: opts.requireHumanReview !== false,
            unresolvedBacktrace: true,
          },
        },
      ],
      generatedAt: now.toISOString(),
    };
  }

  buildHealthReport({ handlers = {}, unknownDiscovery = null } = {}) {
    const convergence = this.checkConvergenceCoverage(handlers);
    const antiEntropyFindings = this.intents.map((i) => ({ id: i.id, ...this.checkAntiEntropyForNewIntent(i, this.intents.filter((x) => x.id !== i.id)) }));

    const risky = antiEntropyFindings.filter((x) => !x.ok);
    const score = Math.max(
      0,
      100 - (convergence.uncovered.length * 12 + risky.length * 8)
    );

    return {
      summary: {
        intentCount: this.intents.length,
        convergenceCoverage: convergence.coverage,
        riskyIntentCount: risky.length,
        healthScore: score,
      },
      convergence,
      antiEntropyFindings,
      unknownIntentDiscovery: unknownDiscovery || this.scheduleUnknownIntentDiscovery(),
      gate: {
        aeoReady: convergence.ok && risky.length === 0,
        reason: convergence.ok && risky.length === 0 ? 'PASS' : 'BLOCKED_BY_COVERAGE_OR_ENTROPY',
      },
    };
  }

  _normalize(intent) {
    return {
      id: String(intent.id),
      name: String(intent.name || intent.id),
      category: String(intent.category || ''),
      definition: String(intent.definition || ''),
      keywords: Array.isArray(intent.keywords) ? intent.keywords.map(String) : [],
      triggerRate: intent.triggerRate == null ? 0 : Number(intent.triggerRate),
      metadata: intent.metadata || {},
    };
  }
}

function hasOverlap(a = [], b = []) {
  const set = new Set(a.map((x) => x.toLowerCase()));
  return b.some((x) => set.has(String(x).toLowerCase()));
}

function similarity(s1 = '', s2 = '') {
  const a = new Set(tokenize(s1));
  const b = new Set(tokenize(s2));
  if (!a.size || !b.size) return 0;
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return inter / union;
}

function tokenize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

module.exports = {
  IntentRegistry,
  REQUIRED_CONVERGENCE_TYPES,
};
