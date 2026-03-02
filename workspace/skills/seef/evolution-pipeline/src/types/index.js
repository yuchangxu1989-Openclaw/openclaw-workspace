/**
 * @file types/index.js
 * @description EvoMap进化流水线类型定义
 * @module EvolutionPipeline/Types
 * @version 1.0.0
 * @license ISC
 * @copyright (c) 2026 SEEF (技能生态进化工厂)
 */

/**
 * 流水线状态枚举
 * @readonly
 * @enum {string}
 */
export const PipelineState = {
  IDLE: 'idle',
  INITIALIZING: 'initializing',
  ANALYZING: 'analyzing',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PAUSED: 'paused',
  RECOVERING: 'recovering'
};

/**
 * 任务优先级枚举
 * @readonly
 * @enum {number}
 */
export const TaskPriority = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
  BACKGROUND: 4
};

/**
 * 任务状态枚举
 * @readonly
 * @enum {string}
 */
export const TaskStatus = {
  PENDING: 'pending',
  SCHEDULED: 'scheduled',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout',
  RETRYING: 'retrying'
};

/**
 * 通知类型枚举
 * @readonly
 * @enum {string}
 */
export const NotificationType = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
  PROGRESS: 'progress'
};

/**
 * 通知渠道枚举
 * @readonly
 * @enum {string}
 */
export const NotificationChannel = {
  CONSOLE: 'console',
  FILE: 'file',
  WEBHOOK: 'webhook',
  EMAIL: 'email',
  SLACK: 'slack',
  FEISHU: 'feishu',
  EVENT: 'event'
};

/**
 * 技能生命周期状态（与架构文档对齐）
 * @readonly
 * @enum {string}
 */
export const SkillLifecycleState = {
  DEVELOP: 'develop',
  TEST: 'test',
  REVIEW: 'review',
  RELEASE: 'release',
  SYNC: 'sync',
  ONLINE: 'online',
  FAILED: 'failed'
};

/**
 * PDCA状态枚举
 * @readonly
 * @enum {string}
 */
export const PDCAState = {
  PLAN: 'plan',
  DO: 'do',
  CHECK: 'check',
  ACT: 'act',
  COMPLETED: 'completed'
};

/**
 * 事件类型枚举
 * @readonly
 * @enum {string}
 */
export const EventType = {
  // 状态事件
  STATE_CHANGED: 'state:changed',
  STATE_TRANSITION: 'state:transition',
  
  // 任务事件
  TASK_CREATED: 'task:created',
  TASK_STARTED: 'task:started',
  TASK_COMPLETED: 'task:completed',
  TASK_FAILED: 'task:failed',
  TASK_CANCELLED: 'task:cancelled',
  
  // 调度事件
  SCHEDULE_TRIGGERED: 'schedule:triggered',
  SCHEDULE_MISSED: 'schedule:missed',
  
  // 错误事件
  ERROR_OCCURRED: 'error:occurred',
  ERROR_RECOVERED: 'error:recovered',
  RETRY_EXHAUSTED: 'retry:exhausted',
  
  // 通知事件
  NOTIFICATION_SENT: 'notification:sent',
  NOTIFICATION_FAILED: 'notification:failed',
  
  // EvoMap事件
  EVOMAP_UPLOAD_STARTED: 'evomap:upload:started',
  EVOMAP_UPLOAD_COMPLETED: 'evomap:upload:completed',
  EVOMAP_UPLOAD_FAILED: 'evomap:upload:failed',
  
  // ISC事件
  ISC_VALIDATION_STARTED: 'isc:validation:started',
  ISC_VALIDATION_COMPLETED: 'isc:validation:completed',
  ISC_VALIDATION_FAILED: 'isc:validation:failed'
};

export default {
  PipelineState,
  TaskPriority,
  TaskStatus,
  NotificationType,
  NotificationChannel,
  SkillLifecycleState,
  PDCAState,
  EventType
};
