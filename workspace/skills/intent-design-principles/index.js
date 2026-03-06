/**
 * intent-design-principles skill
 * 标准 handler 签名: module.exports = async function(event, rule, context)
 *
 * 功能：
 * 1) 意图类型注册表管理（CRUD + 强制 MECE 检查）
 * 2) 收敛类型覆盖率检查（5种收敛类型是否都有）
 * 3) 意图反熵增检查（MECE + 长尾风险，新增时前置拦截）
 * 4) 未知意图发现调度配置生成（聚类→分类→增量识别三段式）
 * 5) 意图类型健康报告输出（含 AEO 准出门禁状态）
 *
 * event.action 可选值:
 *   registry.list | registry.get | registry.create | registry.update | registry.remove
 *   convergence.check
 *   entropy.check
 *   discovery.schedule
 *   health.report
 */

'use strict';

// ─────────────────────────────────────────────
// 五种收敛类型（原则：必须全部覆盖才允许准出）
// ─────────────────────────────────────────────
const REQUIRED_CONVERGENCE_TYPES = [
  'positive_emotion',          // 正向情绪
  'negative_emotion',          // 负向情绪
  'rule_intent',               // 规则意图
  'complex_intent_5turn',      // 复杂意图（5轮上下文推理）
  'implicit_intent',           // 隐含意图（推理）
  'multi_intent_single_utterance', // 一句话多意图
];

// ─────────────────────────────────────────────
// MECE / 反熵增工具函数
// ─────────────────────────────────────────────

function tokenize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function jaccardSimilarity(s1 = '', s2 = '') {
  const a = new Set(tokenize(s1));
  const b = new Set(tokenize(s2));
  if (!a.size || !b.size) return 0;
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return inter / union;
}

function hasKeywordOverlap(a = [], b = []) {
  const setA = new Set(a.map((x) => String(x).toLowerCase()));
  return b.some((x) => setA.has(String(x).toLowerCase()));
}

function normalizeIntent(intent) {
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

// ─────────────────────────────────────────────
// IntentRegistry — 注册表核心逻辑
// ─────────────────────────────────────────────

class IntentRegistry {
  constructor(initial = []) {
    this.intents = Array.isArray(initial) ? initial.map(normalizeIntent) : [];
  }

  list() {
    return [...this.intents];
  }

  get(id) {
    return this.intents.find((x) => x.id === id) || null;
  }

  /**
   * 新增意图：MECE 检查 → 反熵增检查 → 写入
   */
  create(intent) {
    if (!intent || !intent.id) throw new Error('intent.id is required');
    if (this.get(intent.id)) throw new Error(`intent already exists: ${intent.id}`);

    const draft = normalizeIntent(intent);
    this._enforceCreate(draft, this.intents);
    this.intents.push(draft);
    return draft;
  }

  /**
   * 更新意图：同样需要通过 MECE + 反熵增检查
   */
  update(id, patch) {
    const idx = this.intents.findIndex((x) => x.id === id);
    if (idx < 0) throw new Error(`intent not found: ${id}`);
    const merged = normalizeIntent({ ...this.intents[idx], ...patch, id });
    const others = this.intents.filter((x) => x.id !== id);
    this._enforceCreate(merged, others);
    this.intents[idx] = merged;
    return merged;
  }

  /**
   * 删除意图
   */
  remove(id) {
    const idx = this.intents.findIndex((x) => x.id === id);
    if (idx < 0) return false;
    this.intents.splice(idx, 1);
    return true;
  }

  _enforceCreate(candidate, baseList) {
    const mece = this.checkMECE(candidate, baseList);
    if (!mece.ok) throw new Error(`MECE check failed: ${mece.issues.join('; ')}`);
    const entropy = this.checkAntiEntropy(candidate, baseList);
    if (!entropy.ok) throw new Error(`anti-entropy check failed: ${entropy.issues.join('; ')}`);
  }

  // ── 1. MECE 检查 ──────────────────────────────
  checkMECE(candidate, baseList = this.intents) {
    const issues = [];

    for (const existing of baseList) {
      if (existing.id === candidate.id) continue;

      if (existing.name === candidate.name) {
        issues.push(`duplicate name with '${existing.id}'`);
      }
      if (hasKeywordOverlap(existing.keywords, candidate.keywords)) {
        issues.push(`keyword overlap with '${existing.id}'`);
      }
      if (
        existing.category === candidate.category &&
        jaccardSimilarity(existing.definition, candidate.definition) > 0.78
      ) {
        issues.push(`definition too similar with '${existing.id}' (jaccard > 0.78)`);
      }
    }

    if (!candidate.definition || candidate.definition.length < 8) {
      issues.push('definition too short (min 8 chars)');
    }
    if (!candidate.category) {
      issues.push('category is required');
    }

    return { ok: issues.length === 0, issues };
  }

  // ── 2. 收敛类型覆盖率检查 ─────────────────────
  checkConvergenceCoverage(handlers = {}) {
    const uncovered = REQUIRED_CONVERGENCE_TYPES.filter((t) => !handlers[t]);
    const total = REQUIRED_CONVERGENCE_TYPES.length;
    const coverage = ((total - uncovered.length) / total) * 100;
    return {
      ok: uncovered.length === 0,
      coverage: Math.round(coverage * 10) / 10,
      required: [...REQUIRED_CONVERGENCE_TYPES],
      uncovered,
    };
  }

  // ── 3. 反熵增检查 ─────────────────────────────
  checkAntiEntropy(candidate, baseList = this.intents) {
    const issues = [];

    // 继承 MECE 问题
    const mece = this.checkMECE(candidate, baseList);
    if (!mece.ok) {
      issues.push(...mece.issues.map((x) => `non-MECE: ${x}`));
    }

    // 长尾风险：关键词过少 + 触发率极低
    const k = (candidate.keywords || []).length;
    const triggerRate = Number(candidate.triggerRate || 0);
    if (k <= 1 && triggerRate > 0 && triggerRate < 0.003) {
      issues.push('long-tail risk: too sparse keywords combined with tiny triggerRate < 0.3%');
    }

    // 过度本地化：一次性/专项/临时语义会导致熵增爆炸
    const nameAndDef = (candidate.name || '') + ' ' + (candidate.definition || '');
    if (/[0-9]{4,}|专项|临时|一次性|特例/.test(nameAndDef)) {
      issues.push('long-tail risk: overly localized or one-off semantics detected');
    }

    return { ok: issues.length === 0, issues };
  }

  // ── 4. 未知意图发现调度配置生成 ──────────────
  scheduleUnknownIntentDiscovery(opts = {}) {
    const cadenceDays = Number(opts.cadenceDays || 7);
    const minClusterSize = Number(opts.minClusterSize || 30);

    return {
      description: '未知意图发现三段式调度配置（向量聚类 → LLM分类 → MECE增量识别）',
      pipeline: [
        {
          step: 1,
          name: 'vector_clustering',
          description: '向量聚类：对未分类/低置信语料进行密度聚类，产出候选意图族群',
          cron: `0 3 */${cadenceDays} * *`,
          params: {
            embeddingModel: opts.embeddingModel || 'text-embedding-3-large',
            algorithm: opts.algorithm || 'hdbscan',
            minClusterSize,
            lookbackDays: Number(opts.lookbackDays || 14),
          },
        },
        {
          step: 2,
          name: 'llm_classification',
          description: 'LLM分类：对聚类结果调用大模型进行意图标注与置信度评分',
          dependsOn: 'vector_clustering',
          params: {
            model: opts.classifierModel || 'gpt-4.1',
            confidenceThreshold: Number(opts.confidenceThreshold || 0.72),
            labelsSource: 'intent_registry',
          },
        },
        {
          step: 3,
          name: 'mece_incremental_identification',
          description: 'MECE增量识别：基于现有注册表进行互斥穷举校验，识别真正新增意图',
          dependsOn: 'llm_classification',
          params: {
            policy: 'MECE-first',
            requireHumanReview: opts.requireHumanReview !== false,
            unresolvedBacktrace: true, // 对未解决问题进行主动溯源
          },
        },
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  // ── 5. 健康报告输出 ───────────────────────────
  buildHealthReport({ handlers = {}, discoveryOpts = {} } = {}) {
    const convergence = this.checkConvergenceCoverage(handlers);

    const antiEntropyFindings = this.intents.map((intent) => {
      const others = this.intents.filter((x) => x.id !== intent.id);
      const result = this.checkAntiEntropy(intent, others);
      return { id: intent.id, name: intent.name, ...result };
    });

    const riskyIntents = antiEntropyFindings.filter((x) => !x.ok);

    // 健康分：每个未覆盖收敛类型 -12 分，每个熵增风险意图 -8 分
    const healthScore = Math.max(
      0,
      100 - convergence.uncovered.length * 12 - riskyIntents.length * 8
    );

    // AEO 准出门禁：收敛全覆盖 + 无熵增风险 → PASS
    const aeoGatePassed = convergence.ok && riskyIntents.length === 0;

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        intentCount: this.intents.length,
        convergenceCoverage: `${convergence.coverage}%`,
        riskyIntentCount: riskyIntents.length,
        healthScore,
        aeoGate: aeoGatePassed ? 'PASS ✅' : 'BLOCKED 🚫',
      },
      convergenceCheck: convergence,
      antiEntropyFindings,
      unknownIntentDiscoverySchedule: this.scheduleUnknownIntentDiscovery(discoveryOpts),
      recommendation: aeoGatePassed
        ? '意图体系符合 AEO 准出要求，可进入生产闭环。'
        : `请修复以下问题后重新评审：收敛缺口 [${convergence.uncovered.join(', ')}]，熵增风险 [${riskyIntents.map((x) => x.id).join(', ')}]。`,
    };
  }
}

// ─────────────────────────────────────────────
// 标准 handler 入口
// ─────────────────────────────────────────────

module.exports = async function handler(event, rule, context) {
  const action = (event && event.action) || 'health.report';
  const payload = (event && event.payload) || {};

  // 从 context 获取持久注册表（若有），否则从 payload.intents 初始化
  const registryData = (context && context.state && context.state.intents) || payload.intents || [];
  const registry = new IntentRegistry(registryData);

  let result;

  switch (action) {
    // ── 注册表 CRUD ──────────────────────────
    case 'registry.list':
      result = { intents: registry.list() };
      break;

    case 'registry.get':
      result = { intent: registry.get(payload.id) };
      break;

    case 'registry.create': {
      const created = registry.create(payload.intent);
      result = { created };
      break;
    }

    case 'registry.update': {
      const updated = registry.update(payload.id, payload.patch);
      result = { updated };
      break;
    }

    case 'registry.remove': {
      const removed = registry.remove(payload.id);
      result = { removed };
      break;
    }

    // ── 收敛覆盖率检查 ───────────────────────
    case 'convergence.check':
      result = registry.checkConvergenceCoverage(payload.handlers || {});
      break;

    // ── 反熵增检查 ───────────────────────────
    case 'entropy.check': {
      const target = payload.intent
        ? registry.checkAntiEntropy(payload.intent, registry.list())
        : {
            findings: registry.list().map((i) => ({
              id: i.id,
              ...registry.checkAntiEntropy(i, registry.list().filter((x) => x.id !== i.id)),
            })),
          };
      result = target;
      break;
    }

    // ── 未知意图发现调度 ─────────────────────
    case 'discovery.schedule':
      result = registry.scheduleUnknownIntentDiscovery(payload.opts || {});
      break;

    // ── 健康报告 ─────────────────────────────
    case 'health.report':
    default:
      result = registry.buildHealthReport({
        handlers: payload.handlers || {},
        discoveryOpts: payload.discoveryOpts || {},
      });
      break;
  }

  // 将变更后的注册表写回 context.state（供宿主持久化）
  if (context && context.state != null) {
    context.state.intents = registry.list();
  }

  return { action, result };
};

// 导出工具类供单元测试直接使用
module.exports.IntentRegistry = IntentRegistry;
module.exports.REQUIRED_CONVERGENCE_TYPES = REQUIRED_CONVERGENCE_TYPES;
