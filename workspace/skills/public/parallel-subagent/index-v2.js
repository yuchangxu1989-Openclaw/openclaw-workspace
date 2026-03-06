#!/usr/bin/env node
/**
 * 并行子代理执行器 v1.1 - 使用sessions_spawn工具
 */

const { sessions_spawn } = require('openclaw'); // 假设有SDK

class ParallelSubagentSpawner {
  constructor(options = {}) {
    this.label = options.label || `subagent_${Date.now()}`;
    this.model = options.model || process.env.OPENCLAW_DEFAULT_MODEL || 'default';
    this.timeout = options.timeout || 300;
  }

  /**
   * 批量派生子代理 - 使用sessions_spawn工具
   */
  async spawnBatch(tasks) {
    console.log(`[并行子代理] 批量派发 ${tasks.length} 个任务...`);
    
    // 并行启动所有子代理
    const spawnPromises = tasks.map((task, index) => {
      const label = `${this.label}_${index}`;
      console.log(`  [子代理 ${index}] 启动: ${task.name}`);
      
      // 使用sessions_spawn工具
      return sessions_spawn({
        task: task.prompt,
        label: label,
        model: this.model,
        timeoutSeconds: this.timeout,
        cleanup: 'delete'
      });
    });
    
    const results = await Promise.allSettled(spawnPromises);
    
    return results.map((result, index) => ({
      task: tasks[index].name,
      status: result.status,
      value: result.value,
      reason: result.reason
    }));
  }
}

module.exports = ParallelSubagentSpawner;
