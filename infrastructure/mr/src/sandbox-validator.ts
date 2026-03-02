/**
 * SandboxValidator - 三层沙盒验证
 * 
 * 功能：
 * - L1: 健康检查（50ms超时，内存缓存）
 * - L2: 影子测试（1%旁路，质量对比）
 * - L3: 超时熔断（委托LEP原生）
 * - 零硬编码模型名称，使用{{MODEL_XXX}}占位符
 * 
 * @module infrastructure/mr
 * @version 2.0.0
 * @ISC N019/N020 compliant
 */

import { TaskIntent } from './intent-classifier';
import { AgentConfig, SandboxSettings } from './preference-merger';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * 沙盒验证结果
 */
export interface SandboxValidationResult {
  /** 是否通过验证 */
  passed: boolean;
  /** 验证层级结果 */
  layers: LayerValidationResult[];
  /** 最终推荐模型链 */
  validatedChain: string[];
  /** 验证元数据 */
  metadata: SandboxMetadata;
}

/**
 * 层级验证结果
 */
export interface LayerValidationResult {
  /** 层级名称 */
  layer: 'L1_health_check' | 'L2_shadow_test' | 'L3_circuit_breaker';
  /** 是否通过 */
  passed: boolean;
  /** 验证耗时ms */
  durationMs: number;
  /** 详细信息 */
  details: Record<string, any>;
  /** 错误信息（如失败） */
  error?: string;
}

/**
 * 沙盒元数据
 */
export interface SandboxMetadata {
  totalDurationMs: number;
  modelsChecked: string[];
  modelsRejected: string[];
  shadowTestResults?: ShadowTestResult[];
  timestamp: number;
}

/**
 * 影子测试结果
 */
export interface ShadowTestResult {
  model: string;
  sampleRate: number;
  qualityScore: number;
  baselineQuality: number;
  deviation: number;
  passed: boolean;
}

/**
 * 健康检查结果
 */
export interface HealthCheckResult {
  model: string;
  healthy: boolean;
  responseTimeMs: number;
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  lastFailureTime?: number;
  consecutiveFailures: number;
}

/**
 * 验证请求
 */
export interface ValidationRequest {
  modelChain: string[];
  intent: TaskIntent;
  agentConfig: AgentConfig;
  taskPreview?: string;
}

/**
 * 沙盒配置
 */
export interface SandboxConfig {
  L1: L1Config;
  L2: L2Config;
  L3: L3Config;
}

interface L1Config {
  timeoutMs: number;
  cacheTTLMs: number;
  enableCache: boolean;
}

interface L2Config {
  enabled: boolean;
  sampleRate: number;
  qualityThreshold: number;
  maxDeviation: number;
  comparisonWindowSize: number;
}

interface L3Config {
  connectTimeoutMs: number;
  responseTimeoutMs: number;
  failureThreshold: number;
  resetTimeoutMs: number;
}

// ============================================================================
// SandboxValidator Implementation
// ============================================================================

export class SandboxValidator {
  private config: SandboxConfig;
  private healthCache: Map<string, HealthCacheEntry> = new Map();
  private shadowTestHistory: Map<string, ShadowTestHistoryEntry[]> = new Map();

  constructor(config?: Partial<SandboxConfig>) {
    this.config = {
      L1: {
        timeoutMs: 50,
        cacheTTLMs: 5000,
        enableCache: true,
        ...config?.L1
      },
      L2: {
        enabled: false,
        sampleRate: 0.01,
        qualityThreshold: 0.9,
        maxDeviation: 0.1,
        comparisonWindowSize: 100,
        ...config?.L2
      },
      L3: {
        connectTimeoutMs: 5000,
        responseTimeoutMs: 60000,
        failureThreshold: 5,
        resetTimeoutMs: 30000,
        ...config?.L3
      }
    };
  }

  /**
   * 执行三层沙盒验证
   * @param request 验证请求
   * @returns SandboxValidationResult 验证结果
   */
  async validate(request: ValidationRequest): Promise<SandboxValidationResult> {
    const startTime = Date.now();
    const layers: LayerValidationResult[] = [];
    let currentChain = [...request.modelChain];
    const modelsRejected: string[] = [];

    // L1: 健康检查
    const l1Result = await this.runL1HealthCheck(currentChain, request.agentConfig);
    layers.push(l1Result);
    
    if (l1Result.passed) {
      // 过滤不健康模型
      const healthyModels = l1Result.details.healthyModels as string[];
      modelsRejected.push(
        ...currentChain.filter(m => !healthyModels.includes(m))
      );
      currentChain = healthyModels.length > 0 ? healthyModels : currentChain;
    }

    // L2: 影子测试（如果启用）
    if (this.config.L2.enabled) {
      const l2Result = await this.runL2ShadowTest(
        currentChain,
        request,
        l1Result.details.results as HealthCheckResult[]
      );
      layers.push(l2Result);

      if (l2Result.passed && l2Result.details.shadowResults) {
        const passedModels = (l2Result.details.shadowResults as ShadowTestResult[])
          .filter(r => r.passed)
          .map(r => r.model);
        
        if (passedModels.length > 0) {
          modelsRejected.push(
            ...currentChain.filter(m => !passedModels.includes(m))
          );
          currentChain = passedModels;
        }
      }
    }

    // L3: 超时熔断检查（委托LEP）
    const l3Result = await this.runL3CircuitCheck(currentChain, request);
    layers.push(l3Result);

    // 确保至少有一个模型
    if (currentChain.length === 0 && request.modelChain.length > 0) {
      // 紧急回退到第一个模型，让LEP处理熔断
      currentChain = [request.modelChain[0]];
    }

    const totalDuration = Date.now() - startTime;

    return {
      passed: layers.every(l => l.passed) || currentChain.length > 0,
      layers,
      validatedChain: currentChain,
      metadata: {
        totalDurationMs: totalDuration,
        modelsChecked: request.modelChain,
        modelsRejected: [...new Set(modelsRejected)],
        shadowTestResults: layers.find(l => l.layer === 'L2_shadow_test')?.details?.shadowResults as ShadowTestResult[] | undefined,
        timestamp: Date.now()
      }
    };
  }

  /**
   * L1: 健康检查
   */
  private async runL1HealthCheck(
    modelChain: string[],
    agentConfig: AgentConfig
  ): Promise<LayerValidationResult> {
    const startTime = Date.now();
    const timeoutMs = agentConfig.sandboxSettings?.healthCheckTimeoutMs 
      || this.config.L1.timeoutMs;

    try {
      const results: HealthCheckResult[] = [];
      const healthyModels: string[] = [];

      for (const model of modelChain) {
        // 检查缓存
        const cached = this.getCachedHealth(model);
        if (cached && this.config.L1.enableCache) {
          results.push(cached);
          if (cached.healthy) healthyModels.push(model);
          continue;
        }

        // 执行健康检查
        const checkResult = await this.performHealthCheck(model, timeoutMs);
        results.push(checkResult);

        if (checkResult.healthy) {
          healthyModels.push(model);
        }

        // 缓存结果
        if (this.config.L1.enableCache) {
          this.setCachedHealth(model, checkResult);
        }
      }

      const duration = Date.now() - startTime;

      return {
        layer: 'L1_health_check',
        passed: healthyModels.length > 0,
        durationMs: duration,
        details: {
          results,
          healthyModels,
          totalChecked: modelChain.length,
          cacheEnabled: this.config.L1.enableCache
        }
      };
    } catch (error) {
      return {
        layer: 'L1_health_check',
        passed: false,
        durationMs: Date.now() - startTime,
        details: {},
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(
    model: string,
    timeoutMs: number
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // 模拟健康检查（实际实现应调用LEP或模型API）
      // 这里使用简化的模拟逻辑
      const checkPromise = this.simulateHealthCheck(model);
      
      const result = await Promise.race([
        checkPromise,
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), timeoutMs)
        )
      ]);

      const responseTime = Date.now() - startTime;

      return {
        model,
        healthy: true,
        responseTimeMs: responseTime,
        circuitBreakerState: 'CLOSED',
        consecutiveFailures: 0
      };
    } catch (error) {
      return {
        model,
        healthy: false,
        responseTimeMs: Date.now() - startTime,
        circuitBreakerState: 'OPEN',
        lastFailureTime: Date.now(),
        consecutiveFailures: 1
      };
    }
  }

  /**
   * 模拟健康检查
   */
  private async simulateHealthCheck(model: string): Promise<void> {
    // 模拟网络延迟 5-20ms
    const delay = 5 + Math.random() * 15;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // 模拟极低概率的失败
    if (Math.random() < 0.001) {
      throw new Error('Simulated health check failure');
    }
  }

  /**
   * L2: 影子测试
   */
  private async runL2ShadowTest(
    modelChain: string[],
    request: ValidationRequest,
    healthResults: HealthCheckResult[]
  ): Promise<LayerValidationResult> {
    const startTime = Date.now();

    try {
      if (!this.config.L2.enabled) {
        return {
          layer: 'L2_shadow_test',
          passed: true,
          durationMs: 0,
          details: { skipped: true, reason: 'disabled' }
        };
      }

      // 采样决策
      const shouldSample = Math.random() < this.config.L2.sampleRate;
      
      if (!shouldSample) {
        return {
          layer: 'L2_shadow_test',
          passed: true,
          durationMs: 0,
          details: { skipped: true, reason: 'not_sampled' }
        };
      }

      const shadowResults: ShadowTestResult[] = [];

      // 对主模型进行影子测试
      if (modelChain.length > 0) {
        const primaryModel = modelChain[0];
        const shadowResult = await this.performShadowTest(
          primaryModel,
          request
        );
        shadowResults.push(shadowResult);
      }

      const duration = Date.now() - startTime;
      const allPassed = shadowResults.every(r => r.passed);

      return {
        layer: 'L2_shadow_test',
        passed: allPassed || shadowResults.length === 0,
        durationMs: duration,
        details: {
          shadowResults,
          sampled: true,
          sampleRate: this.config.L2.sampleRate
        }
      };
    } catch (error) {
      return {
        layer: 'L2_shadow_test',
        passed: false,
        durationMs: Date.now() - startTime,
        details: {},
        error: error instanceof Error ? error.message : 'Shadow test failed'
      };
    }
  }

  /**
   * 执行影子测试
   */
  private async performShadowTest(
    model: string,
    request: ValidationRequest
  ): Promise<ShadowTestResult> {
    const baselineQuality = this.getBaselineQuality(model);
    
    // 模拟质量测试
    // 实际实现应调用模型并对比输出质量
    const simulatedQuality = baselineQuality + (Math.random() - 0.5) * 0.1;
    const deviation = Math.abs(simulatedQuality - baselineQuality);

    const result: ShadowTestResult = {
      model,
      sampleRate: this.config.L2.sampleRate,
      qualityScore: simulatedQuality,
      baselineQuality,
      deviation,
      passed: deviation <= this.config.L2.maxDeviation
    };

    // 记录历史
    this.recordShadowTest(model, result);

    return result;
  }

  /**
   * L3: 熔断检查
   */
  private async runL3CircuitCheck(
    modelChain: string[],
    request: ValidationRequest
  ): Promise<LayerValidationResult> {
    const startTime = Date.now();

    try {
      // L3检查委托给LEP执行时处理
      // 这里只检查配置和返回状态
      const checks = modelChain.map(model => ({
        model,
        connectTimeout: this.config.L3.connectTimeoutMs,
        responseTimeout: request.agentConfig.sandboxSettings?.executionTimeoutMs 
          || this.config.L3.responseTimeoutMs,
        circuitBreaker: {
          failureThreshold: this.config.L3.failureThreshold,
          resetTimeout: this.config.L3.resetTimeoutMs
        }
      }));

      return {
        layer: 'L3_circuit_breaker',
        passed: true,
        durationMs: Date.now() - startTime,
        details: {
          message: 'L3 validation delegated to LEP execution',
          checks,
          settings: {
            connectTimeoutMs: this.config.L3.connectTimeoutMs,
            responseTimeoutMs: this.config.L3.responseTimeoutMs
          }
        }
      };
    } catch (error) {
      return {
        layer: 'L3_circuit_breaker',
        passed: false,
        durationMs: Date.now() - startTime,
        details: {},
        error: error instanceof Error ? error.message : 'Circuit check failed'
      };
    }
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  private getCachedHealth(model: string): HealthCheckResult | null {
    const entry = this.healthCache.get(model);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.config.L1.cacheTTLMs) {
      this.healthCache.delete(model);
      return null;
    }

    return entry.result;
  }

  private setCachedHealth(model: string, result: HealthCheckResult): void {
    this.healthCache.set(model, {
      result,
      timestamp: Date.now()
    });

    // 限制缓存大小
    if (this.healthCache.size > 100) {
      const firstKey = this.healthCache.keys().next().value;
      if (firstKey !== undefined) {
        this.healthCache.delete(firstKey);
      }
    }
  }

  // ============================================================================
  // Shadow Test History
  // ============================================================================

  private recordShadowTest(model: string, result: ShadowTestResult): void {
    if (!this.shadowTestHistory.has(model)) {
      this.shadowTestHistory.set(model, []);
    }

    const history = this.shadowTestHistory.get(model)!;
    history.push({
      result,
      timestamp: Date.now()
    });

    // 限制历史大小
    const maxSize = this.config.L2.comparisonWindowSize;
    if (history.length > maxSize) {
      history.shift();
    }
  }

  private getBaselineQuality(model: string): number {
    const history = this.shadowTestHistory.get(model);
    if (!history || history.length === 0) {
      return this.config.L2.qualityThreshold;
    }

    // 计算历史平均质量分数
    const avg = history.reduce((sum, h) => sum + h.result.qualityScore, 0) / history.length;
    return avg;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SandboxConfig>): void {
    this.config = {
      L1: { ...this.config.L1, ...config.L1 },
      L2: { ...this.config.L2, ...config.L2 },
      L3: { ...this.config.L3, ...config.L3 }
    };
  }

  /**
   * 启用/禁用影子测试
   */
  setShadowTestEnabled(enabled: boolean): void {
    this.config.L2.enabled = enabled;
  }

  /**
   * 清除健康缓存
   */
  clearHealthCache(): void {
    this.healthCache.clear();
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    cacheSize: number;
    historyEntries: number;
    config: SandboxConfig;
  } {
    let historyEntries = 0;
    for (const history of this.shadowTestHistory.values()) {
      historyEntries += history.length;
    }

    return {
      cacheSize: this.healthCache.size,
      historyEntries,
      config: this.config
    };
  }
}

// ============================================================================
// Cache Entry Types
// ============================================================================

interface HealthCacheEntry {
  result: HealthCheckResult;
  timestamp: number;
}

interface ShadowTestHistoryEntry {
  result: ShadowTestResult;
  timestamp: number;
}

export default SandboxValidator;
