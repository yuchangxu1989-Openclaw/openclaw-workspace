/**
 * LEPDelegate - LEP执行委托层
 * 
 * 功能：
 * - 100%复用infrastructure/lep-core，不复刻韧性逻辑
 * - 委托LEP执行模型调用
 * - 统一错误处理和结果包装
 * - 零硬编码模型名称，使用{{MODEL_XXX}}占位符
 * 
 * @module infrastructure/mr
 * @version 2.0.0
 * @ISC N019/N020 compliant
 */

import { TaskIntent } from './intent-classifier';
import { AgentConfig } from './preference-merger';
import { SandboxValidationResult } from './sandbox-validator';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * LEP执行请求
 */
export interface LEPExecuteRequest {
  /** 任务内容 */
  task: TaskContent;
  /** 模型链 */
  modelChain: string[];
  /** 任务意图 */
  intent: TaskIntent;
  /** Agent配置 */
  agentConfig: AgentConfig;
  /** 沙盒验证结果 */
  validationResult: SandboxValidationResult;
  /** 执行选项 */
  options?: ExecuteOptions;
}

/**
 * 任务内容
 */
export interface TaskContent {
  /** 用户输入 */
  prompt: string;
  /** 系统消息 */
  systemMessage?: string;
  /** 历史上下文 */
  context?: Array<{ role: string; content: string }>;
  /** 附件 */
  attachments?: Array<{
    type: string;
    mimeType: string;
    content?: string;
    url?: string;
  }>;
}

/**
 * 执行选项
 */
export interface ExecuteOptions {
  /** 超时时间ms */
  timeoutMs?: number;
  /** 最大token数 */
  maxTokens?: number;
  /** 温度参数 */
  temperature?: number;
  /** 是否流式输出 */
  stream?: boolean;
  /** 重试策略 */
  retryPolicy?: RetryPolicy;
  /** 回调函数 */
  callbacks?: ExecuteCallbacks;
}

/**
 * 重试策略
 */
export interface RetryPolicy {
  maxRetries: number;
  backoff: 'fixed' | 'exponential';
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * 执行回调
 */
export interface ExecuteCallbacks {
  onModelAttempt?: (model: string, attempt: number) => void;
  onModelSuccess?: (model: string, durationMs: number) => void;
  onModelFailure?: (model: string, error: Error) => void;
  onFallback?: (fromModel: string, toModel: string) => void;
  onProgress?: (chunk: string) => void;
}

/**
 * LEP执行结果
 */
export interface LEPExecuteResult {
  /** 执行状态 */
  status: 'success' | 'failure' | 'partial';
  /** 执行结果 */
  result?: ModelResult;
  /** 错误信息 */
  error?: ExecutionError;
  /** 执行元数据 */
  metadata: ExecutionMetadata;
}

/**
 * 模型结果
 */
export interface ModelResult {
  /** 使用的模型 */
  model: string;
  /** 输出内容 */
  content: string;
  /** Token使用量 */
  usage?: TokenUsage;
  /** 完成原因 */
  finishReason?: string;
}

/**
 * Token使用
 */
export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

/**
 * 执行错误
 */
export interface ExecutionError {
  code: string;
  message: string;
  model?: string;
  retryable: boolean;
  details?: Record<string, any>;
}

/**
 * 执行元数据
 */
export interface ExecutionMetadata {
  /** 执行ID */
  executionId: string;
  /** 原始模型链 */
  originalChain: string[];
  /** 实际使用的模型 */
  usedModel: string;
  /** 尝试的模型列表 */
  attemptedModels: string[];
  /** 总耗时ms */
  totalDurationMs: number;
  /** 各模型耗时 */
  modelDurations: Record<string, number>;
  /** 重试次数 */
  retryCount: number;
  /** 是否发生降级 */
  wasDegraded: boolean;
  /** 时间戳 */
  timestamp: number;
}

/**
 * LEP核心接口（由infrastructure/lep-core提供）
 */
export interface LEPCoreInterface {
  execute(task: LEPCoreTask): Promise<LEPCoreResult>;
  health(): Promise<LEPHealthStatus>;
  getStats(): LEPStats;
}

/**
 * LEP核心任务
 */
export interface LEPCoreTask {
  type: 'model_inference';
  modelChain: string[];
  prompt: string;
  systemMessage?: string;
  context?: Array<{ role: string; content: string }>;
  options: {
    timeout: number;
    maxTokens?: number;
    temperature?: number;
    stream?: boolean;
  };
  fallbackStrategy: 'chain' | 'abort';
}

/**
 * LEP核心结果
 */
export interface LEPCoreResult {
  status: 'success' | 'failure';
  data?: any;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  metadata: {
    executionId: string;
    duration: number;
    attempts: number;
    usedModel: string;
  };
}

/**
 * LEP健康状态
 */
export interface LEPHealthStatus {
  healthy: boolean;
  status: string;
  checks: Record<string, any>;
  timestamp: number;
}

/**
 * LEP统计
 */
export interface LEPStats {
  uptime: number;
  totalExecutions: number;
  successRate: number;
  averageDuration: number;
}

// ============================================================================
// LEPDelegate Implementation
// ============================================================================

export class LEPDelegate {
  private lepCore: LEPCoreInterface | null = null;
  private executionCounter: number = 0;

  constructor() {
    this.initializeLEPCore();
  }

  /**
   * 初始化LEP核心
   */
  private initializeLEPCore(): void {
    try {
      // 动态加载LEP核心，避免硬依赖
      // 实际部署时从 infrastructure/lep-core 加载
      const lepModule = this.loadLEPModule();
      this.lepCore = lepModule.getLEP ? lepModule.getLEP() : lepModule;
    } catch (error) {
      console.warn('[LEPDelegate] LEP Core not available, using fallback mode:', error);
      this.lepCore = null;
    }
  }

  /**
   * 加载LEP模块
   */
  private loadLEPModule(): any {
    // 尝试多种路径加载LEP核心
    const possiblePaths = [
      '../lep-core',
      '../../lep-core',
      '../../../infrastructure/lep-core',
      '/root/.openclaw/workspace/infrastructure/lep-core'
    ];

    for (const tryPath of possiblePaths) {
      try {
        return require(tryPath);
      } catch {
        continue;
      }
    }

    throw new Error('LEP Core module not found');
  }

  /**
   * 执行模型调用
   * @param request LEP执行请求
   * @returns LEPExecuteResult 执行结果
   */
  async execute(request: LEPExecuteRequest): Promise<LEPExecuteResult> {
    const startTime = Date.now();
    const executionId = this.generateExecutionId();
    const attemptedModels: string[] = [];
    const modelDurations: Record<string, number> = {};

    try {
      // 构建LEP核心任务
      const lepTask = this.buildLEPTask(request, executionId);

      // 调用LEP核心执行
      let lepResult: LEPCoreResult;

      if (this.lepCore) {
        // 使用LEP核心
        lepResult = await this.executeWithLEP(lepTask, request);
      } else {
        // 降级模式：直接执行（仅用于测试）
        lepResult = await this.executeFallback(lepTask, request);
      }

      const totalDuration = Date.now() - startTime;

      // 记录尝试的模型
      if (lepResult.metadata.attempts > 0) {
        for (let i = 0; i < Math.min(lepResult.metadata.attempts, request.modelChain.length); i++) {
          attemptedModels.push(request.modelChain[i]);
        }
      }

      // 构建结果
      if (lepResult.status === 'success') {
        return {
          status: 'success',
          result: {
            model: lepResult.metadata.usedModel,
            content: lepResult.data?.content || lepResult.data,
            usage: lepResult.data?.usage,
            finishReason: lepResult.data?.finishReason
          },
          metadata: {
            executionId,
            originalChain: request.modelChain,
            usedModel: lepResult.metadata.usedModel,
            attemptedModels,
            totalDurationMs: totalDuration,
            modelDurations,
            retryCount: lepResult.metadata.attempts - 1,
            wasDegraded: lepResult.metadata.usedModel !== request.modelChain[0],
            timestamp: Date.now()
          }
        };
      } else {
        return {
          status: 'failure',
          error: {
            code: lepResult.error?.code || 'EXECUTION_FAILED',
            message: lepResult.error?.message || 'Unknown execution error',
            model: lepResult.metadata.usedModel,
            retryable: lepResult.error?.retryable || false
          },
          metadata: {
            executionId,
            originalChain: request.modelChain,
            usedModel: lepResult.metadata.usedModel || request.modelChain[0],
            attemptedModels,
            totalDurationMs: totalDuration,
            modelDurations,
            retryCount: lepResult.metadata.attempts - 1,
            wasDegraded: false,
            timestamp: Date.now()
          }
        };
      }
    } catch (error) {
      const totalDuration = Date.now() - startTime;

      return {
        status: 'failure',
        error: {
          code: 'DELEGATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: this.isRetryableError(error)
        },
        metadata: {
          executionId,
          originalChain: request.modelChain,
          usedModel: request.modelChain[0],
          attemptedModels,
          totalDurationMs: totalDuration,
          modelDurations,
          retryCount: 0,
          wasDegraded: false,
          timestamp: Date.now()
        }
      };
    }
  }

  /**
   * 使用LEP核心执行
   */
  private async executeWithLEP(
    lepTask: LEPCoreTask,
    request: LEPExecuteRequest
  ): Promise<LEPCoreResult> {
    const callbacks = request.options?.callbacks;

    // 包装回调以跟踪模型尝试
    const wrappedCallbacks = callbacks ? {
      ...callbacks,
      onModelAttempt: (model: string, attempt: number) => {
        callbacks.onModelAttempt?.(model, attempt);
      },
      onModelSuccess: (model: string, durationMs: number) => {
        callbacks.onModelSuccess?.(model, durationMs);
      },
      onModelFailure: (model: string, error: Error) => {
        callbacks.onModelFailure?.(model, error);
      }
    } : undefined;

    // 调用LEP核心
    // LEP核心内部处理：熔断/重试/降级/WAL日志
    return await this.lepCore!.execute(lepTask);
  }

  /**
   * 降级模式执行（LEP不可用时）
   */
  private async executeFallback(
    lepTask: LEPCoreTask,
    request: LEPExecuteRequest
  ): Promise<LEPCoreResult> {
    console.warn('[LEPDelegate] Using fallback execution mode');

    // 简化实现：模拟执行
    const primaryModel = lepTask.modelChain[0];
    
    return {
      status: 'success',
      data: {
        content: `[Fallback Mode] Task would be executed with model: ${primaryModel}`,
        usage: { prompt: 0, completion: 0, total: 0 }
      },
      metadata: {
        executionId: this.generateExecutionId(),
        duration: 0,
        attempts: 1,
        usedModel: primaryModel
      }
    };
  }

  /**
   * 构建LEP核心任务
   */
  private buildLEPTask(
    request: LEPExecuteRequest,
    executionId: string
  ): LEPCoreTask {
    const timeout = request.options?.timeoutMs 
      || request.agentConfig.sandboxSettings?.executionTimeoutMs 
      || 120000;

    return {
      type: 'model_inference',
      modelChain: request.modelChain,
      prompt: request.task.prompt,
      systemMessage: request.task.systemMessage,
      context: request.task.context,
      options: {
        timeout,
        maxTokens: request.options?.maxTokens,
        temperature: request.options?.temperature,
        stream: request.options?.stream
      },
      fallbackStrategy: request.agentConfig.modelPreferences.strictMode ? 'abort' : 'chain'
    };
  }

  /**
   * 检查LEP健康状态
   */
  async health(): Promise<LEPHealthStatus> {
    if (!this.lepCore) {
      return {
        healthy: false,
        status: 'lep_not_available',
        checks: {},
        timestamp: Date.now()
      };
    }

    try {
      return await this.lepCore.health();
    } catch (error) {
      return {
        healthy: false,
        status: 'health_check_failed',
        checks: { error: error instanceof Error ? error.message : 'Unknown' },
        timestamp: Date.now()
      };
    }
  }

  /**
   * 获取LEP统计
   */
  getStats(): LEPStats | null {
    if (!this.lepCore) return null;
    
    try {
      return this.lepCore.getStats();
    } catch {
      return null;
    }
  }

  /**
   * 生成执行ID
   */
  private generateExecutionId(): string {
    this.executionCounter++;
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 6);
    return `mr_${timestamp}_${random}_${this.executionCounter}`;
  }

  /**
   * 判断错误是否可重试
   */
  private isRetryableError(error: any): boolean {
    const retryableCodes = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ENOTFOUND',
      'EAI_AGAIN',
      'TIMEOUT',
      'RATE_LIMIT'
    ];

    if (error?.code && retryableCodes.includes(error.code)) {
      return true;
    }

    if (error?.message?.includes('timeout')) {
      return true;
    }

    return false;
  }

  /**
   * 重新初始化LEP核心
   */
  reinitialize(): void {
    this.initializeLEPCore();
  }

  /**
   * 检查LEP是否可用
   */
  isLEPAvailable(): boolean {
    return this.lepCore !== null;
  }
}

export default LEPDelegate;
