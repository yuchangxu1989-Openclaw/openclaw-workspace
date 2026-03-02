/**
 * Model Router (MR) - Phase 2 Core Modules
 * 
 * 模型路由自动切换机制核心模块
 * 
 * @module infrastructure/mr
 * @version 2.0.0
 * @ISC N019/N020/N022 compliant
 * 
 * Architecture:
 * - IntentClassifier: 语义意图识别引擎
 * - PreferenceMerger: 子Agent偏好融合器
 * - SandboxValidator: 三层沙盒验证
 * - LEPDelegate: LEP执行委托层
 * - MRRouter: 主入口
 */

// Core Router
export { 
  MRRouter, 
  getRouter, 
  routeAndExecute, 
  health,
  RouteRequest,
  RouteResult,
  RouteOptions,
  RouteCallbacks,
  RouteMetadata,
  MRConfig,
  MRHealthStatus
} from './mr-router';

// Intent Classifier
export {
  IntentClassifier,
  TaskIntent,
  TaskIntent as Intent,
  ClassificationRequest,
  TaskContext,
  Attachment,
  IntentFeatures,
  IntentClassifierConfig
} from './intent-classifier';

// Preference Merger
export {
  PreferenceMerger,
  AgentConfig,
  ModelPreference,
  IntentOverride,
  SandboxSettings,
  ModelCapability,
  MergeResult,
  MergeMetadata,
  CapabilityMatch,
  MergeOptions
} from './preference-merger';

// Sandbox Validator
export {
  SandboxValidator,
  SandboxValidationResult,
  LayerValidationResult,
  SandboxMetadata,
  ShadowTestResult,
  HealthCheckResult,
  ValidationRequest,
  SandboxConfig
} from './sandbox-validator';

// LEP Delegate
export {
  LEPDelegate,
  LEPExecuteRequest,
  LEPExecuteResult,
  TaskContent,
  ExecuteOptions,
  RetryPolicy,
  ExecuteCallbacks,
  ModelResult,
  TokenUsage,
  ExecutionError,
  ExecutionMetadata,
  LEPCoreInterface,
  LEPCoreTask,
  LEPCoreResult,
  LEPHealthStatus,
  LEPStats
} from './lep-delegate';
