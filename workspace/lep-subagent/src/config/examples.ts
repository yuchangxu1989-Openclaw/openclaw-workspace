/**
 * 配置示例文件
 * 展示如何配置不同的模型和路由策略
 * 完全可配置，无硬编码模型
 */

import { SubAgentConfig } from '../types';

/**
 * 示例1: 基础配置（双模型）
 */
export const basicConfig: SubAgentConfig = {
  models: {
    // Kimi 模型配置
    kimi: {
      id: 'kimi',
      name: 'kimi-coding/k2p5',
      provider: 'moonshot',
      capabilities: ['coding', 'analysis', 'chat', 'long-context'],
      endpoints: [
        {
          url: 'https://api.moonshot.cn/v1/chat/completions',
          priority: 1,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ],
      timeout: {
        short: 180,   // 3分钟
        medium: 600,  // 10分钟
        long: 1200,   // 20分钟
      },
      rate_limits: {
        rpm: 60,      // 每分钟60请求
        tpm: 100000,  // 每分钟10万token
      },
      retry: {
        max_attempts: 3,
        backoff_base: 2,
        max_delay: 60,
        retryable_statuses: [429, 503, 504],
      },
    },

    // GLM-5 模型配置
    glm5: {
      id: 'glm5',
      name: 'glm-5',
      provider: 'zhipu',
      capabilities: ['coding', 'reasoning', 'chat', 'deep-thinking'],
      endpoints: [
        {
          url: 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions',
          priority: 1,
        },
      ],
      timeout: {
        short: 180,
        medium: 600,
        long: 1200,
      },
      rate_limits: {
        rpm: 30,
        tpm: 50000,
      },
      retry: {
        max_attempts: 3,
        backoff_base: 2,
        max_delay: 60,
        retryable_statuses: [429, 500, 503],
      },
    },
  },

  routing: [
    // 代码审查任务 - 优先使用 Kimi
    {
      taskType: 'code_review',
      models: ['kimi', 'glm5'],
      strategy: 'priority',
      timeoutTier: 'medium',
      fallbackModels: ['glm5'],
    },

    // 深度分析任务 - 优先使用 GLM-5（推理能力强）
    {
      taskType: 'deep_analysis',
      models: ['glm5', 'kimi'],
      strategy: 'round_robin',
      timeoutTier: 'long',
    },

    // 快速对话 - 使用 Kimi
    {
      taskType: 'quick_chat',
      models: ['kimi'],
      strategy: 'priority',
      timeoutTier: 'short',
    },

    // 长文本处理 - 需要 long-context 能力
    {
      taskType: 'long_document',
      models: ['kimi'],
      strategy: 'priority',
      timeoutTier: 'long',
      requiredCapabilities: ['long-context'],
    },
  ],

  defaultRouting: {
    models: ['kimi', 'glm5'],
    strategy: 'round_robin',
    timeoutTier: 'medium',
  },

  execution: {
    pool: {
      maxConcurrent: 10,
      maxQueueSize: 100,
      queueTimeout: 300,
    },
    priorities: {
      high: 10,
      medium: 5,
      low: 1,
    },
    retry: {
      maxAttempts: 3,
      backoffStrategy: 'exponential',
      baseDelay: 1,
      maxDelay: 60,
    },
    circuitBreaker: {
      failureThreshold: 5,
      recoveryTimeout: 60,
      halfOpenMaxCalls: 3,
    },
  },

  tokenMonitor: {
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
    windowSize: 60,
  },

  healthCheck: {
    interval: 30,
    timeout: 10,
    unhealthyThreshold: 3,
    healthyThreshold: 2,
  },
};

/**
 * 示例2: 多模型高可用配置
 */
export const highAvailabilityConfig: SubAgentConfig = {
  models: {
    kimi: {
      id: 'kimi',
      name: 'kimi-coding/k2p5',
      provider: 'moonshot',
      capabilities: ['coding', 'analysis', 'chat'],
      endpoints: [
        { url: 'https://api.moonshot.cn/v1', priority: 1 },
        { url: 'https://backup.moonshot.cn/v1', priority: 2 },
      ],
      timeout: { short: 180, medium: 600, long: 1200 },
      rate_limits: { rpm: 60, tpm: 100000 },
      retry: { max_attempts: 3, backoff_base: 2, max_delay: 60 },
    },
    glm5: {
      id: 'glm5',
      name: 'glm-5',
      provider: 'zhipu',
      capabilities: ['coding', 'reasoning', 'chat'],
      endpoints: [{ url: 'https://open.bigmodel.cn/api/coding/paas/v4' }],
      timeout: { short: 180, medium: 600, long: 1200 },
      rate_limits: { rpm: 30, tpm: 50000 },
      retry: { max_attempts: 3, backoff_base: 2, max_delay: 60 },
    },
    claude: {
      id: 'claude',
      name: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      capabilities: ['coding', 'analysis', 'chat', 'vision'],
      endpoints: [{ url: 'https://api.anthropic.com/v1' }],
      timeout: { short: 180, medium: 600, long: 1200 },
      rate_limits: { rpm: 50, tpm: 80000 },
      retry: { max_attempts: 3, backoff_base: 2, max_delay: 60 },
    },
    gpt4: {
      id: 'gpt4',
      name: 'gpt-4o',
      provider: 'openai',
      capabilities: ['coding', 'analysis', 'chat', 'vision'],
      endpoints: [{ url: 'https://api.openai.com/v1' }],
      timeout: { short: 120, medium: 300, long: 600 },
      rate_limits: { rpm: 100, tpm: 150000 },
      retry: { max_attempts: 3, backoff_base: 2, max_delay: 60 },
    },
  },

  routing: [
    {
      taskType: 'critical_analysis',
      models: ['claude', 'gpt4', 'glm5'],
      strategy: 'least_load',  // 负载均衡
      timeoutTier: 'medium',
      fallbackModels: ['kimi'],
    },
    {
      taskType: 'vision_analysis',
      models: ['claude', 'gpt4'],
      strategy: 'round_robin',
      timeoutTier: 'medium',
      requiredCapabilities: ['vision'],
    },
  ],

  defaultRouting: {
    models: ['kimi', 'glm5', 'claude', 'gpt4'],
    strategy: 'least_load',
    timeoutTier: 'medium',
  },

  execution: {
    pool: {
      maxConcurrent: 20,
      maxQueueSize: 200,
      queueTimeout: 600,
    },
    priorities: {
      high: 10,
      medium: 5,
      low: 1,
    },
    retry: {
      maxAttempts: 5,
      backoffStrategy: 'exponential',
      baseDelay: 1,
      maxDelay: 120,
    },
    circuitBreaker: {
      failureThreshold: 3,
      recoveryTimeout: 30,
      halfOpenMaxCalls: 2,
    },
  },

  tokenMonitor: {
    warningThreshold: 0.75,
    criticalThreshold: 0.9,
    windowSize: 60,
  },

  healthCheck: {
    interval: 15,
    timeout: 5,
    unhealthyThreshold: 2,
    healthyThreshold: 2,
  },
};

/**
 * 示例3: 本地模型配置（Ollama等）
 */
export const localModelConfig: SubAgentConfig = {
  models: {
    local_llama: {
      id: 'local_llama',
      name: 'llama3.1:70b',
      provider: 'ollama',
      capabilities: ['chat', 'coding'],
      endpoints: [
        { url: 'http://localhost:11434/api/generate' },
      ],
      timeout: {
        short: 60,
        medium: 300,
        long: 600,
      },
      rate_limits: {
        rpm: 1000,  // 本地模型限制较宽松
        tpm: 1000000,
      },
      retry: {
        max_attempts: 2,
        backoff_base: 1,
        max_delay: 10,
      },
    },
  },

  routing: [
    {
      taskType: 'local_chat',
      models: ['local_llama'],
      strategy: 'priority',
      timeoutTier: 'medium',
    },
  ],

  defaultRouting: {
    models: ['local_llama'],
    strategy: 'priority',
    timeoutTier: 'medium',
  },

  execution: {
    pool: {
      maxConcurrent: 5,  // 本地资源有限
      maxQueueSize: 50,
      queueTimeout: 600,
    },
    priorities: {
      high: 10,
      medium: 5,
      low: 1,
    },
    retry: {
      maxAttempts: 2,
      backoffStrategy: 'fixed',
      baseDelay: 1,
      maxDelay: 5,
    },
    circuitBreaker: {
      failureThreshold: 10,
      recoveryTimeout: 120,
    },
  },

  tokenMonitor: {
    warningThreshold: 0.9,
    criticalThreshold: 0.99,
  },

  healthCheck: {
    interval: 60,
    timeout: 10,
    unhealthyThreshold: 5,
    healthyThreshold: 2,
  },
};

/**
 * 示例4: 动态添加模型示例
 */
export function createDynamicModelConfig(): SubAgentConfig {
  return {
    models: {},  // 初始为空，动态添加
    routing: [],
    execution: {
      pool: {
        maxConcurrent: 10,
        maxQueueSize: 100,
        queueTimeout: 300,
      },
      priorities: {
        high: 10,
        medium: 5,
        low: 1,
      },
      retry: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        baseDelay: 1,
        maxDelay: 60,
      },
    },
  };
}

// 动态添加模型的示例
export const exampleNewModel = {
  id: 'qwen',
  name: 'qwen2.5-72b',
  provider: 'aliyun',
  capabilities: ['coding', 'analysis', 'chat', 'chinese'],
  endpoints: [{ url: 'https://dashscope.aliyuncs.com/api/v1' }],
  timeout: { short: 180, medium: 600, long: 1200 },
  rate_limits: { rpm: 60, tpm: 100000 },
  retry: { max_attempts: 3, backoff_base: 2, max_delay: 60 },
};
