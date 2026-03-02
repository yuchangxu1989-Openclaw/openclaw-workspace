/**
 * 使用示例
 * 展示如何使用 SubAgent Execution Manager
 */

import { SubAgentExecutionManager } from './core/SubAgentExecutionManager';
import { basicConfig } from './config/examples';
import { Task } from './types';

// 示例1: 基础使用
async function basicUsage() {
  // 创建执行管理器
  const manager = new SubAgentExecutionManager(basicConfig);
  
  // 启动
  manager.start();

  // 创建任务
  const task: Task = {
    id: 'task-001',
    type: 'code_review',
    priority: 'high',
    payload: {
      code: 'function add(a, b) { return a + b; }',
      language: 'javascript',
    },
    context: {
      requestId: 'req-001',
      userId: 'user-001',
    },
  };

  // 执行任务
  const result = await manager.execute(task);
  
  if (result.success) {
    console.log('执行成功:', result.data);
    console.log('元数据:', result.metadata);
  } else {
    console.error('执行失败:', result.error);
  }

  // 批量执行
  const tasks: Task[] = [
    { id: 't1', type: 'code_review', priority: 'medium', payload: {}, context: { requestId: 'r1' } },
    { id: 't2', type: 'quick_chat', priority: 'low', payload: {}, context: { requestId: 'r2' } },
  ];

  const results = await manager.executeBatch(tasks);
  console.log('批量执行结果:', results);

  // 停止
  await manager.stop();
}

// 示例2: 事件监听
async function eventMonitoring() {
  const manager = new SubAgentExecutionManager(basicConfig);

  // 监听任务事件
  manager.on('task:queued', (task) => {
    console.log(`任务 ${task.id} 已入队`);
  });

  manager.on('task:started', (task) => {
    console.log(`任务 ${task.id} 开始执行`);
  });

  manager.on('task:completed', (task, result) => {
    console.log(`任务 ${task.id} 执行完成，耗时: ${result.metadata.duration}ms`);
  });

  manager.on('task:failed', (task, result) => {
    console.error(`任务 ${task.id} 执行失败:`, result.error?.message);
  });

  // 监听模型事件
  manager.on('model:health_changed', ({ modelId, from, to }) => {
    console.log(`模型 ${modelId} 健康状态: ${from} -> ${to}`);
  });

  manager.on('model:unhealthy', (modelId, error) => {
    console.error(`模型 ${modelId} 变为不健康:`, error);
  });

  manager.on('model:recovered', (modelId) => {
    console.log(`模型 ${modelId} 已恢复`);
  });

  // 监听Token告警
  manager.on('token:alert', (alert) => {
    console.warn(`Token告警 [${alert.level}]: ${alert.message}`);
  });

  manager.start();

  // ... 执行任务

  await manager.stop();
}

// 示例3: 动态管理模型
async function dynamicModelManagement() {
  const manager = new SubAgentExecutionManager(basicConfig);
  manager.start();

  // 动态注册新模型
  manager.registerModel({
    id: 'deepseek',
    name: 'deepseek-chat',
    provider: 'deepseek',
    capabilities: ['coding', 'analysis', 'chat'],
    endpoints: [{ url: 'https://api.deepseek.com/v1' }],
    timeout: { short: 180, medium: 600, long: 1200 },
    rate_limits: { rpm: 50, tpm: 80000 },
    retry: { max_attempts: 3, backoff_base: 2, max_delay: 60 },
  });

  // 更新现有模型配置
  manager.updateModel('kimi', {
    timeout: { short: 120, medium: 300, long: 600 },  // 更新超时时间
  });

  // 查看模型状态
  console.log('所有模型状态:', manager.getAllModelStatus());
  console.log('Kimi状态:', manager.getModelStatus('kimi'));

  // 卸载模型
  manager.unregisterModel('glm5');

  await manager.stop();
}

// 示例4: 获取统计信息
async function monitoringAndStats() {
  const manager = new SubAgentExecutionManager(basicConfig);
  manager.start();

  // 执行一些任务后获取统计
  // ...

  // 执行统计
  const stats = manager.getStatistics();
  console.log('执行池统计:', stats.pool);
  console.log('模型统计:', stats.models);

  // Token使用统计
  const tokenStats = manager.getTokenStats();
  tokenStats.forEach((s) => {
    console.log(`模型 ${s.modelId}: 使用率 ${(s.usageRate * 100).toFixed(1)}%`);
    console.log(`  总Token: ${s.stats.totalTokens}`);
    console.log(`  平均每次: ${s.stats.averagePerRequest.toFixed(0)}`);
  });

  // 健康摘要
  const health = manager.getHealthSummary();
  console.log('健康状态:', health);

  // 手动触发健康检查
  const checkResult = await manager.healthCheck('kimi');
  console.log('健康检查结果:', checkResult);

  await manager.stop();
}

// 示例5: 自定义执行器（实际模型调用）
class MyExecutionManager extends SubAgentExecutionManager {
  /**
   * 实现模型调用逻辑
   * 根据 model.provider 分发到不同的API客户端
   */
  protected async callModel(model: any, task: Task, timeout: number): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

    try {
      let response;

      switch (model.provider) {
        case 'moonshot':
          response = await this.callMoonshotAPI(model, task, controller.signal);
          break;
        case 'zhipu':
          response = await this.callZhipuAPI(model, task, controller.signal);
          break;
        case 'openai':
          response = await this.callOpenAIAPI(model, task, controller.signal);
          break;
        default:
          throw new Error(`Unknown provider: ${model.provider}`);
      }

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async callMoonshotAPI(model: any, task: Task, signal: AbortSignal): Promise<any> {
    const apiKey = process.env.MOONSHOT_API_KEY;
    const endpoint = model.endpoints[0];

    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...endpoint.headers,
      },
      body: JSON.stringify({
        model: model.name,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: JSON.stringify(task.payload) },
        ],
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Moonshot API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content,
      usage: data.usage,
    };
  }

  private async callZhipuAPI(model: any, task: Task, signal: AbortSignal): Promise<any> {
    // 类似实现...
    throw new Error('Zhipu API not implemented');
  }

  private async callOpenAIAPI(model: any, task: Task, signal: AbortSignal): Promise<any> {
    // 类似实现...
    throw new Error('OpenAI API not implemented');
  }
}

// 示例6: 带优先级的任务调度
async function priorityScheduling() {
  const manager = new SubAgentExecutionManager(basicConfig);
  manager.start();

  // 提交不同优先级的任务
  const highPriorityTask: Task = {
    id: 'urgent-001',
    type: 'code_review',
    priority: 'high',
    payload: { code: 'urgent fix needed' },
    context: { requestId: 'urgent' },
  };

  const lowPriorityTask: Task = {
    id: 'batch-001',
    type: 'analysis',
    priority: 'low',
    payload: { data: 'large dataset' },
    context: { requestId: 'batch' },
  };

  // 高优先级任务会先执行
  const results = await manager.executeBatch([lowPriorityTask, highPriorityTask]);
  
  // 结果顺序取决于完成顺序，不是提交顺序
  console.log(results);

  await manager.stop();
}

// 导出示例
export {
  basicUsage,
  eventMonitoring,
  dynamicModelManagement,
  monitoringAndStats,
  MyExecutionManager,
  priorityScheduling,
};
