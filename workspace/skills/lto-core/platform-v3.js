/**
 * 本地任务编排 v3.0 - 可扩展任务调度平台
 * 基建期设计目标：支持未来800个任务，而非当前8个
 */

class DTOPlatform {
  constructor(options = {}) {
    // 核心抽象：任务定义（与执行方式解耦）
    this.taskRegistry = new TaskRegistry();
    
    // 核心抽象：执行引擎（可插拔）
    this.executionEngines = new Map([
      ['linear', new LinearEngine()],
      ['dag', new DAGEngine()],
      ['adaptive', new AdaptiveEngine()]
    ]);
    
    // 核心抽象：触发器（可扩展）
    this.triggerRegistry = new TriggerRegistry();
    
    // 核心抽象：资源调度
    this.resourceScheduler = new ResourceScheduler();
    
    // 当前激活的执行引擎（根据任务类型自动选择）
    this.defaultEngine = 'dag'; // 默认DAG，支持最复杂场景
  }

  /**
   * 注册任务（与执行细节解耦）
   */
  registerTask(definition) {
    // 任务定义只描述"做什么"和"依赖关系"
    // 不指定"怎么执行"
    const task = {
      id: definition.id,
      intent: definition.intent,
      
      // 依赖图（DAG结构）
      dependencies: definition.dependencies || [],
      
      // 执行模式（自动推断或显式指定）
      executionMode: definition.executionMode || this.inferExecutionMode(definition),
      
      // 触发条件
      triggers: definition.triggers,
      
      // 资源需求
      resources: definition.resources || {},
      
      // 约束条件
      constraints: definition.constraints || []
    };
    
    this.taskRegistry.register(task);
    return task;
  }

  /**
   * 推断执行模式
   */
  inferExecutionMode(definition) {
    // 有并行分支 → DAG
    if (this.hasParallelBranches(definition)) {
      return 'dag';
    }
    
    // 需要LLM动态决策 → Adaptive
    if (definition.requiresLLM) {
      return 'adaptive';
    }
    
    // 简单顺序 → Linear
    return 'linear';
  }

  /**
   * 执行任务
   */
  async execute(taskId, context = {}) {
    const task = this.taskRegistry.get(taskId);
    const engine = this.executionEngines.get(task.executionMode);
    
    // 资源调度
    const resources = await this.resourceScheduler.allocate(task.resources);
    
    try {
      // 执行
      const result = await engine.execute(task, context, resources);
      
      // 释放资源
      await this.resourceScheduler.release(resources);
      
      return result;
      
    } catch (e) {
      await this.resourceScheduler.release(resources);
      throw e;
    }
  }
}

/**
 * DAG执行引擎
 * 支持：并行分支、动态路由、失败重试
 */
class DAGEngine {
  async execute(dag, context, resources) {
    const graph = this.buildExecutionGraph(dag);
    const completed = new Set();
    const results = new Map();
    
    while (completed.size < graph.nodes.length) {
      // 找到可执行节点
      const ready = graph.nodes.filter(n => 
        !completed.has(n.id) &&
        n.dependencies.every(d => completed.has(d))
      );
      
      // 并行执行
      const batchResults = await Promise.all(
        ready.map(n => this.executeNode(n, context, resources))
      );
      
      // 记录结果
      for (const result of batchResults) {
        completed.add(result.nodeId);
        results.set(result.nodeId, result);
        
        // 动态路由：根据结果选择下一跳
        if (result.nextNodes) {
          graph.activateNodes(result.nextNodes);
        }
      }
    }
    
    return { status: 'success', results };
  }
}

/**
 * 任务注册表
 * 支持：版本管理、依赖追踪、影响分析
 */
class TaskRegistry {
  constructor() {
    this.tasks = new Map();
    this.versions = new Map();
    this.dependencyGraph = new DependencyGraph();
  }
  
  register(task) {
    // 版本控制
    const version = this.versions.get(task.id) || 0;
    task.version = version + 1;
    this.versions.set(task.id, task.version);
    
    // 注册
    this.tasks.set(task.id, task);
    
    // 更新依赖图
    this.dependencyGraph.addNode(task);
    
    // 影响分析
    const impacted = this.dependencyGraph.getImpactedTasks(task.id);
    if (impacted.length > 0) {
      console.log(`[Registry] 任务 ${task.id} 变更影响: ${impacted.join(', ')}`);
    }
  }
}

/**
 * 触发器注册表
 * 支持：cron、event、webhook、manual
 */
class TriggerRegistry {
  constructor() {
    this.triggers = new Map();
  }
  
  register(type, handler) {
    this.triggers.set(type, handler);
  }
  
  async trigger(type, payload) {
    const handler = this.triggers.get(type);
    if (!handler) {
      throw new Error(`未知触发器类型: ${type}`);
    }
    return handler(payload);
  }
}
