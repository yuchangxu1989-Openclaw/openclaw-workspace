/**
 * 任务注册表
 * 支持：版本管理、依赖追踪、影响分析
 */

class TaskRegistry {
  constructor() {
    this.tasks = new Map();
    this.versions = new Map();
    this.dependencyGraph = new Map();
    this.indexByTrigger = new Map();
  }

  /**
   * 注册任务
   */
  register(task) {
    // 版本控制
    const currentVersion = this.versions.get(task.id) || 0;
    task.version = currentVersion + 1;
    this.versions.set(task.id, task.version);
    
    // 更新依赖图
    this.updateDependencyGraph(task);
    
    // 索引触发器
    this.indexTriggers(task);
    
    // 存储
    this.tasks.set(task.id, task);
    
    return task;
  }

  /**
   * 获取任务
   */
  get(id) {
    return this.tasks.get(id);
  }

  /**
   * 获取所有任务
   */
  getAll() {
    return Array.from(this.tasks.values());
  }

  /**
   * 更新依赖图
   */
  updateDependencyGraph(task) {
    // 清除旧依赖
    for (const [id, deps] of this.dependencyGraph) {
      if (deps.has(task.id)) {
        deps.delete(task.id);
      }
    }
    
    // 添加新依赖
    for (const node of task.workflow?.nodes || []) {
      for (const dep of node.dependsOn || []) {
        if (!this.dependencyGraph.has(dep)) {
          this.dependencyGraph.set(dep, new Set());
        }
        this.dependencyGraph.get(dep).add(task.id);
      }
    }
  }

  /**
   * 索引触发器
   */
  indexTriggers(task) {
    for (const trigger of task.triggers || []) {
      const key = `${trigger.type}:${trigger.source || '*'}`;
      
      if (!this.indexByTrigger.has(key)) {
        this.indexByTrigger.set(key, new Set());
      }
      
      this.indexByTrigger.get(key).add(task.id);
    }
  }

  /**
   * 获取受影响的任务
   */
  getImpactedTasks(taskId) {
    const impacted = [];
    const visited = new Set();
    
    const visit = (id) => {
      if (visited.has(id)) return;
      visited.add(id);
      
      const dependents = this.dependencyGraph.get(id);
      if (dependents) {
        for (const depId of dependents) {
          impacted.push(depId);
          visit(depId);
        }
      }
    };
    
    visit(taskId);
    
    return impacted;
  }

  /**
   * 通过触发器查找任务
   */
  findByTrigger(type, source) {
    const key = `${type}:${source || '*'}`;
    const taskIds = this.indexByTrigger.get(key);
    
    if (!taskIds) return [];
    
    return Array.from(taskIds).map(id => this.tasks.get(id)).filter(Boolean);
  }

  /**
   * 获取注册表大小
   */
  get size() {
    return this.tasks.size;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const stats = {
      total: this.tasks.size,
      byEngine: {},
      byTrigger: {}
    };
    
    for (const task of this.tasks.values()) {
      // 按引擎统计
      stats.byEngine[task.executionMode] = 
        (stats.byEngine[task.executionMode] || 0) + 1;
      
      // 按触发器统计
      for (const trigger of task.triggers || []) {
        stats.byTrigger[trigger.type] = 
          (stats.byTrigger[trigger.type] || 0) + 1;
      }
    }
    
    return stats;
  }
}

module.exports = TaskRegistry;
