/**
 * DTO v2.0 - 依赖管理器 (P2简化版)
 * 线性执行 + 简单依赖标记
 */

class DependencyManager {
  constructor() {
    this.tasks = new Map();
    this.executionOrder = [];
  }

  /**
   * 注册任务
   * @param {Object} task - 任务定义
   */
  register(task) {
    this.tasks.set(task.id, {
      ...task,
      status: 'pending',
      dependencies: task.dependencies || [],
      dependents: []
    });
  }

  /**
   * 构建执行顺序
   */
  buildOrder() {
    console.log('[DependencyManager] 构建执行顺序');
    
    // 构建依赖关系
    for (const [id, task] of this.tasks) {
      for (const depId of task.dependencies) {
        const dep = this.tasks.get(depId);
        if (dep) {
          dep.dependents.push(id);
        }
      }
    }
    
    // 拓扑排序（简化版）
    const visited = new Set();
    const visiting = new Set();
    const order = [];
    
    const visit = (id) => {
      if (visiting.has(id)) {
        throw new Error(`循环依赖 detected: ${id}`);
      }
      
      if (visited.has(id)) {
        return;
      }
      
      visiting.add(id);
      const task = this.tasks.get(id);
      
      for (const depId of task.dependencies) {
        visit(depId);
      }
      
      visiting.delete(id);
      visited.add(id);
      order.push(id);
    };
    
    for (const id of this.tasks.keys()) {
      visit(id);
    }
    
    this.executionOrder = order;
    
    console.log(`[DependencyManager] 执行顺序: ${order.join(' -> ')}`);
    
    return order;
  }

  /**
   * 检查任务是否可执行
   */
  canExecute(taskId, completedTasks) {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    
    return task.dependencies.every(depId => completedTasks.has(depId));
  }

  /**
   * 获取可执行任务
   */
  getExecutableTasks(completedTasks) {
    const executable = [];
    
    for (const [id, task] of this.tasks) {
      if (task.status === 'pending' && this.canExecute(id, completedTasks)) {
        executable.push(id);
      }
    }
    
    return executable;
  }

  /**
   * 标记任务完成
   */
  markComplete(taskId) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'completed';
      task.completedAt = Date.now();
    }
  }

  /**
   * 标记任务失败
   */
  markFailed(taskId, error) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'failed';
      task.error = error;
      task.failedAt = Date.now();
    }
  }

  /**
   * 检测循环依赖
   */
  detectCycles() {
    const cycles = [];
    
    for (const id of this.tasks.keys()) {
      const path = this.findCycle(id, new Set());
      if (path) {
        cycles.push(path);
      }
    }
    
    return cycles;
  }

  /**
   * 查找循环
   */
  findCycle(startId, visited) {
    if (visited.has(startId)) {
      return [startId];
    }
    
    visited.add(startId);
    const task = this.tasks.get(startId);
    
    for (const depId of task.dependencies) {
      const cycle = this.findCycle(depId, new Set(visited));
      if (cycle) {
        return [startId, ...cycle];
      }
    }
    
    return null;
  }

  /**
   * 获取依赖图
   */
  getDependencyGraph() {
    const graph = {};
    
    for (const [id, task] of this.tasks) {
      graph[id] = {
        dependencies: task.dependencies,
        dependents: task.dependents,
        status: task.status
      };
    }
    
    return graph;
  }
}

module.exports = DependencyManager;
