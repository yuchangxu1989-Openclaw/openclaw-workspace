/**
 * Token Monitor - Token使用监控
 * 实时监控Token用量，超限预警
 */

import { EventEmitter } from 'events';
import { TokenMonitorConfig } from '../types';

export interface TokenUsage {
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: number;
}

export interface TokenQuota {
  modelId: string;
  limit: number;        // Token限额
  window: number;       // 时间窗口（分钟）
  used: number;         // 已使用
  remaining: number;    // 剩余
  resetTime: number;    // 重置时间
}

export type TokenAlertLevel = 'warning' | 'critical';

export interface TokenAlert {
  modelId: string;
  level: TokenAlertLevel;
  usage: number;        // 0-1
  message: string;
  timestamp: number;
}

export class TokenMonitor extends EventEmitter {
  private config: TokenMonitorConfig;
  private usageHistory: Map<string, TokenUsage[]> = new Map();
  private quotas: Map<string, TokenQuota> = new Map();

  constructor(config: TokenMonitorConfig) {
    super();
    this.config = {
      windowSize: 60, // 默认60分钟
      ...config,
    };
  }

  /**
   * 设置模型Token配额
   */
  setQuota(modelId: string, limit: number, windowMinutes: number = 60): void {
    this.quotas.set(modelId, {
      modelId,
      limit,
      window: windowMinutes,
      used: 0,
      remaining: limit,
      resetTime: Date.now() + windowMinutes * 60 * 1000,
    });
  }

  /**
   * 记录Token使用
   */
  recordUsage(usage: TokenUsage): void {
    // 添加到历史
    if (!this.usageHistory.has(usage.modelId)) {
      this.usageHistory.set(usage.modelId, []);
    }
    
    const history = this.usageHistory.get(usage.modelId)!;
    history.push(usage);

    // 清理过期数据
    this.cleanupOldData(usage.modelId);

    // 更新配额使用
    this.updateQuotaUsage(usage.modelId, usage.totalTokens);

    // 检查阈值
    this.checkThresholds(usage.modelId);

    // 触发事件
    this.emit('usage:recorded', usage);
  }

  /**
   * 批量记录Token使用
   */
  recordBatch(usages: TokenUsage[]): void {
    usages.forEach(u => this.recordUsage(u));
  }

  /**
   * 获取指定时间窗口内的Token使用统计
   */
  getUsageStats(modelId: string, windowMinutes?: number): {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    requestCount: number;
    averagePerRequest: number;
  } {
    const history = this.getRecentHistory(modelId, windowMinutes);
    
    const stats = history.reduce(
      (acc, u) => ({
        totalTokens: acc.totalTokens + u.totalTokens,
        promptTokens: acc.promptTokens + u.promptTokens,
        completionTokens: acc.completionTokens + u.completionTokens,
        requestCount: acc.requestCount + 1,
      }),
      { totalTokens: 0, promptTokens: 0, completionTokens: 0, requestCount: 0 }
    );

    return {
      ...stats,
      averagePerRequest: stats.requestCount > 0 
        ? stats.totalTokens / stats.requestCount 
        : 0,
    };
  }

  /**
   * 获取使用率（0-1）
   */
  getUsageRate(modelId: string): number {
    const quota = this.quotas.get(modelId);
    if (!quota) return 0;

    // 检查是否需要重置
    if (Date.now() >= quota.resetTime) {
      this.resetQuota(modelId);
      return 0;
    }

    const windowMinutes = quota.window;
    const stats = this.getUsageStats(modelId, windowMinutes);
    
    return Math.min(stats.totalTokens / quota.limit, 1);
  }

  /**
   * 检查是否会超出限额
   */
  willExceedQuota(modelId: string, estimatedTokens: number): {
    willExceed: boolean;
    remaining: number;
  } {
    const quota = this.quotas.get(modelId);
    if (!quota) return { willExceed: false, remaining: Infinity };

    const rate = this.getUsageRate(modelId);
    const remaining = quota.limit * (1 - rate);
    
    return {
      willExceed: estimatedTokens > remaining,
      remaining,
    };
  }

  /**
   * 预测到达限额的时间（分钟）
   */
  predictExhaustionTime(modelId: string): number | null {
    const quota = this.quotas.get(modelId);
    if (!quota) return null;

    const windowMinutes = 10; // 使用最近10分钟数据预测
    const stats = this.getUsageStats(modelId, windowMinutes);
    
    if (stats.requestCount === 0) return null;

    const rate = this.getUsageRate(modelId);
    const remaining = 1 - rate;
    
    // 基于当前速率预测
    const tokensPerMinute = stats.totalTokens / windowMinutes;
    if (tokensPerMinute === 0) return null;

    const remainingTokens = quota.limit * remaining;
    return remainingTokens / tokensPerMinute;
  }

  /**
   * 获取最近的历史记录
   */
  private getRecentHistory(modelId: string, windowMinutes?: number): TokenUsage[] {
    const history = this.usageHistory.get(modelId) || [];
    const window = windowMinutes || this.config.windowSize!;
    const cutoff = Date.now() - window * 60 * 1000;
    
    return history.filter(u => u.timestamp >= cutoff);
  }

  /**
   * 清理过期数据
   */
  private cleanupOldData(modelId: string): void {
    const history = this.usageHistory.get(modelId);
    if (!history) return;

    const maxWindow = Math.max(this.config.windowSize!, 60) * 2; // 保留2倍窗口
    const cutoff = Date.now() - maxWindow * 60 * 1000;
    
    const cleaned = history.filter(u => u.timestamp >= cutoff);
    this.usageHistory.set(modelId, cleaned);
  }

  /**
   * 更新配额使用
   */
  private updateQuotaUsage(modelId: string, tokens: number): void {
    const quota = this.quotas.get(modelId);
    if (!quota) return;

    // 检查重置
    if (Date.now() >= quota.resetTime) {
      this.resetQuota(modelId);
    }

    quota.used += tokens;
    quota.remaining = Math.max(0, quota.limit - quota.used);
  }

  /**
   * 重置配额
   */
  private resetQuota(modelId: string): void {
    const quota = this.quotas.get(modelId);
    if (!quota) return;

    quota.used = 0;
    quota.remaining = quota.limit;
    quota.resetTime = Date.now() + quota.window * 60 * 1000;
  }

  /**
   * 检查阈值并触发告警
   */
  private checkThresholds(modelId: string): void {
    const rate = this.getUsageRate(modelId);
    
    if (rate >= this.config.criticalThreshold) {
      const alert: TokenAlert = {
        modelId,
        level: 'critical',
        usage: rate,
        message: `Token usage critical: ${(rate * 100).toFixed(1)}%`,
        timestamp: Date.now(),
      };
      this.emit('alert:critical', alert);
      this.emit('alert', alert);
    } else if (rate >= this.config.warningThreshold) {
      const alert: TokenAlert = {
        modelId,
        level: 'warning',
        usage: rate,
        message: `Token usage high: ${(rate * 100).toFixed(1)}%`,
        timestamp: Date.now(),
      };
      this.emit('alert:warning', alert);
      this.emit('alert', alert);
    }
  }

  /**
   * 获取所有模型的Token使用摘要
   */
  getAllStats(): Array<{
    modelId: string;
    usageRate: number;
    stats: ReturnType<typeof this.getUsageStats>;
  }> {
    const results = [];
    for (const modelId of this.usageHistory.keys()) {
      results.push({
        modelId,
        usageRate: this.getUsageRate(modelId),
        stats: this.getUsageStats(modelId),
      });
    }
    return results;
  }

  /**
   * 清空历史数据
   */
  clear(): void {
    this.usageHistory.clear();
    for (const quota of this.quotas.values()) {
      quota.used = 0;
      quota.remaining = quota.limit;
    }
  }
}
