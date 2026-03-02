/**
 * MRRouter - 模型路由主入口
 * 
 * 功能：
 * - 整合 IntentClassifier + PreferenceMerger + SandboxValidator + LEPDelegate
 * - 提供简洁的routeAndExecute API
 * - 非阻塞架构，支持取消
 * - 零硬编码模型名称，使用{{MODEL_XXX}}占位符
 * - 100%复用LEP，零复刻韧性逻辑
 * 
 * @module infrastructure/mr
 * @version 2.0.0
 * @ISC N019/N020 compliant
 */

import { IntentClassifier, TaskIntent, ClassificationRequest } from './intent-classifier';
import { PreferenceMerger, AgentConfig, MergeResult } from './preference-merger';
import { SandboxValidator, SandboxValidationResult, SandboxConfig } from './sandbox-validator';
import { LEPDelegate, LEPExecuteRequest, LEPExecuteResult } from './lep-delegate';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * 路由请求
 */
export interface RouteRequest {
  /** 任务描述 */
  description: string;
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
  /** 子Agent配置 */
  agentConfig: AgentConfig;
  /** 执行选项 */
  options?: RouteOptions;
}

/**
 * 路由选项
 */
export interface RouteOptions {
  /** 超时时间ms */
  timeoutMs?: number;
  /** 最大token数 */
  maxTokens?: number;
  /** 温度参数 */
  temperature?: number;
  /** 是否流式输出 */
  stream?: boolean;
  /** 是否启用沙盒 */
  enableSandbox?: boolean;
  /** 是否强制Capability匹配 */
  enforceCapabilityMatch?: boolean;
  /** 回调函数 */
  callbacks?: RouteCallbacks;
}

/**
 * 路由回调
 */
export interface RouteCallbacks {
  /** 意图识别完成 */
  onIntentClassified?: (intent: TaskIntent) => void;
  /** 偏好融合完成 */
  onPreferencesMerged?: (result: MergeResult) => void;
  /** 沙盒验证完成 */
  onSandboxValidated?: (result: SandboxValidationResult) => void;
  /** 模型尝试 */
  onModelAttempt?: (model: string, attempt: number) => void;
  /** 模型成功 */
  onModelSuccess?: (model: string, durationMs: number) => void;
  /** 模型失败 */
  onModelFailure?: (model: string, error: Error) => void;
  /** 降级发生 */
  onDegraded?: (fromModel: string, toModel: string) => void;
  /** 进度更新 */
  onProgress?: (chunk: string) => void;
}

/**
 * 路由结果
 */
export interface RouteResult {
  /** 执行状态 */
  status: 'success' | 'failure' | 'cancelled';
  /** 输出内容 */
  content?: string;
  /** Token使用 */
  usage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** 使用的模型 */
  usedModel: string;
  /** 原始模型链 */
  modelChain: string[];
  /** 是否发生降级 */
  wasDegraded: boolean;
  /** 路由元数据 */
  metadata: RouteMetadata;
  /** 错误信息 */
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

/**
 * 路由元数据
 */
export interface RouteMetadata {
  /** 执行ID */
  executionId: string;
  /** 任务意图 */
  intent: TaskIntent;
  /** 总耗时ms */
  totalDurationMs: number;
  /** 各阶段耗时 */
  phaseDurations: {
    classification: number;
    merging: number;
    sandbox: number;
    execution: number;
  };
  /** 尝试的模型 */
  attemptedModels: string[];
  /** 重试次数 */
  retryCount: number;
  /** 时间戳 */
  timestamp: number;
}

/**
 * MR配置
 */
export interface MRConfig {
  /** CapabilityAnchor路径 */
  capabilityAnchorPath?: string;
  /** 意图模板路径 */
  intentTemplatesPath?: string;
  /** 沙盒配置 */
  sandboxConfig?: Partial<SandboxConfig>;
  /** 分类器配置 */
  classifierConfig?: {
    similarityThreshold?: number;
    contextWindowSize?: number;
  };
}

/**
 * MR健康状态
 */
export interface MRHealthStatus {
  /** 整体健康 */
  healthy: boolean;
  /** 各组件状态 */
  components: {
    classifier: boolean;
    merger: boolean;
    sandbox: boolean;
    lep: boolean;
  };
  /** LEP健康详情 */
  lepHealth?: any;
  /** 时间戳 */
  timestamp: number;
}

// ============================================================================
// MRRouter Implementation
// ============================================================================

export class MRRouter {
  private intentClassifier: IntentClassifier;
  private preferenceMerger: PreferenceMerger;
  private sandboxValidator: SandboxValidator;
  private lepDelegate: LEPDelegate;
  private config: MRConfig;
  private activeExecutions: Map<string, AbortController> = new Map();

  constructor(config: MRConfig = {}) {
    this.config = config;

    // 初始化各组件
    this.intentClassifier = new IntentClassifier({
      intentTemplatesPath: config.intentTemplatesPath,
      ...config.classifierConfig
    });

    this.preferenceMerger = new PreferenceMerger(config.capabilityAnchorPath);

    this.sandboxValidator = new SandboxValidator(config.sandboxConfig);

    this.lepDelegate = new LEPDelegate();
  }

  /**
   * 主路由执行方法
   * 
   * 流程：
   * 1. 语义意图识别 (IntentClassifier)
   * 2. 偏好融合 (PreferenceMerger)
   * 3. 沙盒验证 (SandboxValidator)
   * 4. LEP执行 (LEPDelegate)
   * 
   * @param request 路由请求
   * @returns RouteResult 路由结果
   */
  async routeAndExecute(request: RouteRequest): Promise<RouteResult> {
    const startTime = Date.now();
    const executionId = this.generateExecutionId();
    
    // 创建取消控制器
    const abortController = new AbortController();
    this.activeExecutions.set(executionId, abortController);

    try {
      // ================================================================
      // Phase 1: 语义意图识别
      // ================================================================
      const phase1Start = Date.now();
      
      const classificationRequest: ClassificationRequest = {
        description: request.description,
        context: request.context?.map(c => ({
          role: c.role as 'user' | 'assistant',
          content: c.content,
          timestamp: Date.now()
        })),
        attachments: request.attachments?.map(a => ({
          type: a.type as 'image' | 'audio' | 'video' | 'file',
          mimeType: a.mimeType,
          content: a.content,
          url: a.url
        }))
      };

      const intent = await this.intentClassifier.classify(classificationRequest);
      
      const phase1Duration = Date.now() - phase1Start;
      request.options?.callbacks?.onIntentClassified?.(intent);

      // 检查取消
      if (abortController.signal.aborted) {
        return this.createCancelledResult(executionId, intent, startTime);
      }

      // ================================================================
      // Phase 2: 偏好融合
      // ================================================================
      const phase2Start = Date.now();

      const mergeResult = await this.preferenceMerger.merge(
        intent,
        request.agentConfig,
        {
          enforceCapabilityMatch: request.options?.enforceCapabilityMatch ?? true,
          maxChainLength: 5
        }
      );

      const phase2Duration = Date.now() - phase2Start;
      request.options?.callbacks?.onPreferencesMerged?.(mergeResult);

      // 检查取消
      if (abortController.signal.aborted) {
        return this.createCancelledResult(executionId, intent, startTime);
      }

      // ================================================================
      // Phase 3: 沙盒验证
      // ================================================================
      const phase3Start = Date.now();
      
      let validationResult: SandboxValidationResult;
      
      if (request.options?.enableSandbox !== false) {
        validationResult = await this.sandboxValidator.validate({
          modelChain: mergeResult.modelChain,
          intent,
          agentConfig: request.agentConfig,
          taskPreview: request.description.slice(0, 200)
        });
      } else {
        // 沙盒禁用，直接通过
        validationResult = {
          passed: true,
          layers: [],
          validatedChain: mergeResult.modelChain,
          metadata: {
            totalDurationMs: 0,
            modelsChecked: mergeResult.modelChain,
            modelsRejected: [],
            timestamp: Date.now()
          }
        };
      }

      const phase3Duration = Date.now() - phase3Start;
      request.options?.callbacks?.onSandboxValidated?.(validationResult);

      // 检查取消
      if (abortController.signal.aborted) {
        return this.createCancelledResult(executionId, intent, startTime);
      }

      // ================================================================
      // Phase 4: LEP执行
      // ================================================================
      const phase4Start = Date.now();

      const lepRequest: LEPExecuteRequest = {
        task: {
          prompt: request.description,
          systemMessage: request.systemMessage,
          context: request.context,
          attachments: request.attachments
        },
        modelChain: validationResult.validatedChain,
        intent,
        agentConfig: request.agentConfig,
        validationResult,
        options: {
          timeoutMs: request.options?.timeoutMs,
          maxTokens: request.options?.maxTokens,
          temperature: request.options?.temperature,
          stream: request.options?.stream,
          callbacks: {
            onModelAttempt: request.options?.callbacks?.onModelAttempt,
            onModelSuccess: request.options?.callbacks?.onModelSuccess,
            onModelFailure: request.options?.callbacks?.onModelFailure,
            onFallback: request.options?.callbacks?.onDegraded,
            onProgress: request.options?.callbacks?.onProgress
          }
        }
      };

      const lepResult = await this.lepDelegate.execute(lepRequest);

      const phase4Duration = Date.now() - phase4Start;
      const totalDuration = Date.now() - startTime;

      // 清理
      this.activeExecutions.delete(executionId);

      // 构建结果
      return this.buildRouteResult(
        lepResult,
        intent,
        mergeResult,
        executionId,
        totalDuration,
        {
          classification: phase1Duration,
          merging: phase2Duration,
          sandbox: phase3Duration,
          execution: phase4Duration
        }
      );

    } catch (error) {
      // 清理
      this.activeExecutions.delete(executionId);

      const totalDuration = Date.now() - startTime;

      return {
        status: 'failure',
        usedModel: '',
        modelChain: [],
        wasDegraded: false,
        error: {
          code: 'ROUTER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown router error',
          retryable: false
        },
        metadata: {
          executionId,
          intent: {
            taskCategory: 'general',
            complexity: 'medium',
            inputModality: 'text',
            outputModality: 'text',
            domain: 'unknown',
            confidence: 0
          },
          totalDurationMs: totalDuration,
          phaseDurations: { classification: 0, merging: 0, sandbox: 0, execution: 0 },
          attemptedModels: [],
          retryCount: 0,
          timestamp: Date.now()
        }
      };
    }
  }

  /**
   * 取消执行
   */
  cancel(executionId: string): boolean {
    const controller = this.activeExecutions.get(executionId);
    if (controller) {
      controller.abort();
      this.activeExecutions.delete(executionId);
      return true;
    }
    return false;
  }

  /**
   * 取消所有执行
   */
  cancelAll(): number {
    let count = 0;
    for (const [id, controller] of this.activeExecutions) {
      controller.abort();
      this.activeExecutions.delete(id);
      count++;
    }
    return count;
  }

  /**
   * 快速路由（跳过部分验证，低延迟）
   */
  async quickRoute(
    description: string,
    agentConfig: AgentConfig,
    timeoutMs?: number
  ): Promise<RouteResult> {
    return this.routeAndExecute({
      description,
      agentConfig,
      options: {
        timeoutMs,
        enableSandbox: false,
        enforceCapabilityMatch: false
      }
    });
  }

  /**
   * 健康检查
   */
  async health(): Promise<MRHealthStatus> {
    const lepHealth = await this.lepDelegate.health();

    return {
      healthy: lepHealth.healthy,
      components: {
        classifier: this.intentClassifier.getLoadedTemplates().length > 0,
        merger: this.preferenceMerger.getAvailableModels().length > 0,
        sandbox: true,
        lep: this.lepDelegate.isLEPAvailable()
      },
      lepHealth,
      timestamp: Date.now()
    };
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    activeExecutions: number;
    sandboxStats: any;
    lepStats: any;
  } {
    return {
      activeExecutions: this.activeExecutions.size,
      sandboxStats: this.sandboxValidator.getStats(),
      lepStats: this.lepDelegate.getStats()
    };
  }

  /**
   * 加载Agent配置
   */
  loadAgentConfig(configPath: string): AgentConfig {
    return this.preferenceMerger.loadAgentConfig(configPath);
  }

  /**
   * 创建取消结果
   */
  private createCancelledResult(
    executionId: string,
    intent: TaskIntent,
    startTime: number
  ): RouteResult {
    return {
      status: 'cancelled',
      usedModel: '',
      modelChain: [],
      wasDegraded: false,
      metadata: {
        executionId,
        intent,
        totalDurationMs: Date.now() - startTime,
        phaseDurations: { classification: 0, merging: 0, sandbox: 0, execution: 0 },
        attemptedModels: [],
        retryCount: 0,
        timestamp: Date.now()
      }
    };
  }

  /**
   * 构建路由结果
   */
  private buildRouteResult(
    lepResult: LEPExecuteResult,
    intent: TaskIntent,
    mergeResult: MergeResult,
    executionId: string,
    totalDuration: number,
    phaseDurations: RouteMetadata['phaseDurations']
  ): RouteResult {
    if (lepResult.status === 'success') {
      return {
        status: 'success',
        content: lepResult.result?.content,
        usage: lepResult.result?.usage,
        usedModel: lepResult.result?.model || mergeResult.modelChain[0],
        modelChain: mergeResult.modelChain,
        wasDegraded: lepResult.metadata.wasDegraded,
        metadata: {
          executionId,
          intent,
          totalDurationMs: totalDuration,
          phaseDurations,
          attemptedModels: lepResult.metadata.attemptedModels,
          retryCount: lepResult.metadata.retryCount,
          timestamp: Date.now()
        }
      };
    } else {
      return {
        status: 'failure',
        usedModel: lepResult.metadata.usedModel,
        modelChain: mergeResult.modelChain,
        wasDegraded: false,
        error: lepResult.error,
        metadata: {
          executionId,
          intent,
          totalDurationMs: totalDuration,
          phaseDurations,
          attemptedModels: lepResult.metadata.attemptedModels,
          retryCount: lepResult.metadata.retryCount,
          timestamp: Date.now()
        }
      };
    }
  }

  /**
   * 生成执行ID
   */
  private generateExecutionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 6);
    return `mr_${timestamp}_${random}`;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<MRConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.classifierConfig) {
      this.intentClassifier.updateConfig(config.classifierConfig);
    }

    if (config.sandboxConfig) {
      this.sandboxValidator.updateConfig(config.sandboxConfig);
    }
  }

  /**
   * 获取子Agent配置
   */
  getAgentConfig(agentId: string): AgentConfig | undefined {
    return this.preferenceMerger.getAgentConfig(agentId);
  }

  /**
   * 获取可用模型列表
   */
  getAvailableModels(): string[] {
    return this.preferenceMerger.getAvailableModels();
  }

  /**
   * 获取模型能力详情
   */
  getModelCapability(modelPlaceholder: string) {
    return this.preferenceMerger.getModelCapability(modelPlaceholder);
  }
}

// ============================================================================
// Export Convenience Functions
// ============================================================================

let defaultRouter: MRRouter | null = null;

/**
 * 获取默认路由器实例
 */
export function getRouter(config?: MRConfig): MRRouter {
  if (!defaultRouter) {
    defaultRouter = new MRRouter(config);
  }
  return defaultRouter;
}

/**
 * 快速执行
 */
export async function routeAndExecute(
  request: RouteRequest
): Promise<RouteResult> {
  return getRouter().routeAndExecute(request);
}

/**
 * 检查健康状态
 */
export async function health(): Promise<MRHealthStatus> {
  return getRouter().health();
}

export default MRRouter;

// Re-export all types
export * from './intent-classifier';
export * from './preference-merger';
export * from './sandbox-validator';
export * from './lep-delegate';
