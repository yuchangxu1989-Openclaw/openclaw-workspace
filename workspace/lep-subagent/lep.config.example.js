// LEP SubAgent Manager 配置文件示例
// 完全可配置，模型可以随意添加/删除/修改

module.exports = {
  // 模型配置 - 零硬编码，随意添加新模型
  models: {
    // Kimi模型
    kimi: {
      name: 'kimi-coding/k2p5',
      provider: 'kimi',
      timeout: {
        short: 180,    // 3分钟 - 简单任务
        medium: 600,   // 10分钟 - 中等任务
        long: 1200     // 20分钟 - 复杂任务
      },
      maxTokens: 262144,
      priority: 1,     // 优先级数字越小越高
      enabled: true,
      metadata: {
        description: 'Kimi K2.5编码模型',
        strengths: ['coding', 'chinese', 'long-context']
      }
    },

    // GLM-5模型
    glm5: {
      name: 'glm-5',
      provider: 'zhipu',
      timeout: {
        short: 180,
        medium: 600,
        long: 1200
      },
      maxTokens: 200000,
      priority: 2,
      enabled: true,
      metadata: {
        description: '智谱GLM-5深度思考模型',
        strengths: ['architecture', 'reasoning', 'analysis']
      }
    },

    // 可以随意添加更多模型，无需修改代码
    // 例如：
    // claude: {
    //   name: 'claude-3-5-sonnet',
    //   provider: 'anthropic',
    //   timeout: { short: 120, medium: 300, long: 600 },
    //   priority: 3,
    //   enabled: true
    // },
    //
    // gpt4: {
    //   name: 'gpt-4o',
    //   provider: 'openai',
    //   timeout: { short: 120, medium: 300, long: 600 },
    //   priority: 4,
    //   enabled: false  // 可以临时禁用
    // }
  },

  // 任务类型配置
  tasks: {
    // 默认配置
    default: {
      type: 'default',
      defaultModel: 'kimi',
      timeout: 'medium',
      priority: 'medium',
      routingStrategy: 'priority',
      retryPolicy: {
        maxRetries: 3,
        backoff: 'exponential',
        baseDelay: 1000,
        maxDelay: 30000,
        retryableErrors: [
          'timeout',
          'connection_error',
          'rate_limit',
          'service_unavailable',
          'gateway_timeout'
        ]
      }
    },

    // 编码任务 - 使用GLM-5，长超时
    coding: {
      type: 'coding',
      defaultModel: 'glm5',
      timeout: 'long',
      priority: 'high',
      routingStrategy: 'least_load'
    },

    // 架构设计任务
    architecture: {
      type: 'architecture',
      defaultModel: 'glm5',
      timeout: 'long',
      priority: 'high',
      routingStrategy: 'least_load'
    },

    // 聊天/简单任务
    chat: {
      type: 'chat',
      defaultModel: 'kimi',
      timeout: 'short',
      priority: 'low',
      routingStrategy: 'round_robin'
    },

    // 快速查询
    query: {
      type: 'query',
      defaultModel: 'kimi',
      timeout: 'short',
      priority: 'medium',
      routingStrategy: 'fastest_response'
    }
  },

  // 路由策略配置
  routing: {
    // 可选: priority, round_robin, least_load, fastest_response, random, weighted_random
    type: 'priority',
    
    // 加权随机时使用
    weights: {
      // kimi: 50,
      // glm5: 50
    }
  },

  // 执行池配置
  executionPool: {
    maxConcurrency: 5,      // 最大并发数
    queueSize: 100,         // 队列大小
    defaultPriority: 'medium'
  },

  // 健康检查配置
  healthCheck: {
    interval: 30000,        // 30秒检查一次
    timeout: 10000,         // 10秒超时
    failureThreshold: 3     // 连续3次失败标记为不健康
  },

  // Token监控配置
  tokenMonitor: {
    warningThreshold: 0.8,  // 80%警告
    alertThreshold: 0.95    // 95%告警
  }
};
