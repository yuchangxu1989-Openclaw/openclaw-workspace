'use strict';

/**
 * Router — 根据 requirements 选择最优 Provider+Model，自动 fallback
 * 
 * 路由策略：
 *   1. 过滤：排除不满足 capability / minContext 的
 *   2. 排除：健康检查失败的（连续3次错误 → 排除60秒）
 *   3. 排序：按 priority 策略排序
 *   4. 执行：尝试第一个，失败 → 自动重试下一个
 */

const PRIORITY_SORT = {
  speed:   (a, b) => a.speed - b.speed,
  quality: (a, b) => b.quality - a.quality,
  cost:    (a, b) => a.cost - b.cost,
};

class Router {
  constructor(registry) {
    this._registry = registry;
  }

  /**
   * 选择满足 requirements 的候选列表（已排序）
   * @param {object} requirements - { capability, minContext, priority, maxCost }
   * @returns {Array} 排序后的候选条目
   */
  select(requirements = {}) {
    const { capability = 'chat', minContext, priority = 'cost', maxCost } = requirements;

    let candidates = this._registry.filter({
      capability,
      minContext,
      excludeUnhealthy: true,
    });

    // 按 maxCost 过滤
    if (maxCost !== undefined) {
      candidates = candidates.filter(e => e.cost <= maxCost);
    }

    // 排序
    const sortFn = PRIORITY_SORT[priority] || PRIORITY_SORT.cost;
    candidates.sort(sortFn);

    return candidates;
  }

  /**
   * 执行 LLM 调用，带自动 fallback
   * @param {Function} callFn - async (entry) => result
   * @param {object} requirements
   * @returns {object} { result, entry, attempts }
   */
  async executeWithFallback(callFn, requirements = {}) {
    const candidates = this.select(requirements);

    if (candidates.length === 0) {
      throw new Error(
        `[llm-context/router] No provider available for requirements: ${JSON.stringify(requirements)}. ` +
        `All providers may be filtered out or unhealthy.`
      );
    }

    const errors = [];
    for (const entry of candidates) {
      try {
        const result = await callFn(entry);
        this._registry.health.recordSuccess(entry.providerName, entry.modelId);
        return { result, entry, attempts: errors.length + 1 };
      } catch (err) {
        this._registry.health.recordError(entry.providerName, entry.modelId, err);
        errors.push({ provider: entry.providerName, model: entry.modelId, error: err.message });
      }
    }

    const errMsg = errors.map(e => `  ${e.provider}/${e.model}: ${e.error}`).join('\n');
    throw new Error(
      `[llm-context/router] All ${errors.length} providers failed for requirements: ${JSON.stringify(requirements)}\n${errMsg}`
    );
  }
}

module.exports = { Router, PRIORITY_SORT };
