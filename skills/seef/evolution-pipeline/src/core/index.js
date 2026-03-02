/**
 * @fileoverview EvoMap进化流水线 - 核心模块统一导出
 * @description 导出PipelineEngine、StateManager、Watcher、ISCValidator四个核心组件
 * @module @seef/evolution-pipeline/core
 * @version 1.0.0
 */

// PipelineEngine - 流水线引擎
export { 
  PipelineEngine, 
  createPipelineEngine,
  PIPELINE_STATES 
} from './pipeline-engine.js';

// StateManager - 状态管理器
export { 
  StateManager, 
  createStateManager,
  PIPELINE_STATES as STATES,
  STATE_TRANSITIONS,
  STATE_TIMEOUTS
} from './state-manager.js';

// Watcher - 文件监控
export { 
  Watcher, 
  createWatcher,
  ChangeType
} from './watcher.js';

// ISCValidator - ISC校验器
export { 
  ISCValidator, 
  createISCValidator,
  Dimension,
  DIMENSION_WEIGHTS,
  REQUIRED_FIELDS
} from './isc-validator.js';

// 默认导出核心类
export { PipelineEngine as default } from './pipeline-engine.js';
