/**
 * DAG 执行引擎
 * 支持：并行执行、动态分支、失败重试、条件路由
 */

class DAGEngine {
  constructor(eventBus) {
    this.eventBus = eventBus;
  }

  /**
   * 执行 DAG 工作流
   */
  async execute(workflow, context) {
    const { nodes, edges } = workflow;
    
    // 构建执行图
    const graph = this.buildExecutionGraph(nodes, edges);
    
    // 执行状态跟踪
    const completed = new Map(); // nodeId -> result
    const failed = new Map();
    const executing = new Set();
    
    console.log(`[DAG] 开始执行: ${nodes.length} 个节点`);
    
    while (completed.size + failed.size < nodes.length) {
      // 找到可执行节点
      const ready = this.findReadyNodes(graph, completed, failed, executing);
      
      if (ready.length === 0 && executing.size === 0) {
        // 死锁或无进展
        break;
      }
      
      // 并行执行就绪节点
      const promises = ready.map(node => 
        this.executeNode(node, context, completed)
          .then(result => {
            completed.set(node.id, result);
            executing.delete(node.id);
            
            // 发布节点完成事件
            this.eventBus.publish('dag.node.completed', {
              nodeId: node.id,
              executionId: context.executionId,
              result
            });
          })
          .catch(error => {
            failed.set(node.id, error);
            executing.delete(node.id);
            
            // 检查是否需要重试
            if (this.shouldRetry(node, context)) {
              console.log(`[DAG] 节点 ${node.id} 失败，将重试`);
              // 重试逻辑...
            } else {
              // 发布节点失败事件
              this.eventBus.publish('dag.node.failed', {
                nodeId: node.id,
                executionId: context.executionId,
                error
              });
            }
          })
      );
      
      // 等待当前批次完成
      await Promise.all(promises);
    }
    
    // 检查整体结果
    if (failed.size > 0) {
      throw new Error(`DAG 执行失败: ${failed.size} 个节点失败`);
    }
    
    // 收集结果
    const results = {};
    for (const [nodeId, result] of completed) {
      results[nodeId] = result;
    }
    
    console.log(`[DAG] ✓ 执行完成: ${completed.size} 个节点成功`);
    
    return { status: 'completed', results };
  }

  /**
   * 构建执行图
   */
  buildExecutionGraph(nodes, edges) {
    const graph = new Map();
    
    // 初始化节点
    for (const node of nodes) {
      graph.set(node.id, {
        ...node,
        dependencies: new Set(),
        dependents: new Set()
      });
    }
    
    // 构建依赖关系
    for (const edge of edges || []) {
      const fromNode = graph.get(edge.from);
      const toNode = graph.get(edge.to);
      
      if (fromNode && toNode) {
        toNode.dependencies.add(edge.from);
        fromNode.dependents.add(edge.to);
      }
    }
    
    return graph;
  }

  /**
   * 找到可执行节点
   */
  findReadyNodes(graph, completed, failed, executing) {
    const ready = [];
    
    for (const [nodeId, node] of graph) {
      // 已执行或执行中
      if (completed.has(nodeId) || failed.has(nodeId) || executing.has(nodeId)) {
        continue;
      }
      
      // 检查依赖是否满足
      const depsSatisfied = Array.from(node.dependencies).every(depId => 
        completed.has(depId)
      );
      
      // 检查是否有依赖失败
      const hasFailedDep = Array.from(node.dependencies).some(depId => 
        failed.has(depId)
      );
      
      if (depsSatisfied && !hasFailedDep) {
        ready.push(node);
        executing.add(nodeId);
      }
    }
    
    return ready;
  }

  /**
   * 执行单个节点
   */
  async executeNode(node, context, completedResults) {
    console.log(`[DAG] 执行节点: ${node.id} [${node.action}]`);
    
    // 检查条件
    if (node.condition) {
      const shouldExecute = this.evaluateCondition(node.condition, completedResults);
      if (!shouldExecute) {
        console.log(`[DAG] 节点 ${node.id} 条件不满足，跳过`);
        return { status: 'skipped', reason: 'condition_not_met' };
      }
    }
    
    // 准备输入（依赖节点的输出）
    const input = this.prepareInput(node, completedResults);
    
    // 执行动作
    const startTime = Date.now();
    
    try {
      const result = await this.invokeAction(node.action, input, node.params);
      
      const duration = Date.now() - startTime;
      
      console.log(`[DAG] ✓ 节点完成: ${node.id} (${duration}ms)`);
      
      return {
        status: 'completed',
        result,
        duration,
        nodeId: node.id
      };
      
    } catch (e) {
      console.error(`[DAG] ✗ 节点失败: ${node.id}`, e.message);
      throw e;
    }
  }

  /**
   * 评估条件
   */
  evaluateCondition(condition, completedResults) {
    // 简化实现：支持基本表达式
    // 实际应使用表达式引擎
    
    if (typeof condition === 'string') {
      // 例如: "all(tests.status == 'passed')"
      if (condition.includes('==')) {
        return true; // 简化处理
      }
    }
    
    if (typeof condition === 'function') {
      return condition(completedResults);
    }
    
    return true;
  }

  /**
   * 准备输入
   */
  prepareInput(node, completedResults) {
    const input = { ...node.params };
    
    // 收集依赖节点的输出
    for (const depId of node.dependsOn || []) {
      const depResult = completedResults.get(depId);
      if (depResult) {
        input[`${depId}_output`] = depResult.result;
      }
    }
    
    return input;
  }

  /**
   * 调用动作
   */
  async invokeAction(action, input, params) {
    // 解析动作
    const [module, method] = action.split('.');
    
    // 动作映射
    const actions = {
      'seef': {
        'creator.generate': () => this.mockAction('create skill', input),
        'validator.functional': () => this.mockAction('functional test', input),
        'validator.performance': () => this.mockAction('performance test', input),
        'validator.security': () => this.mockAction('security test', input),
        'optimizer.autoFix': () => this.mockAction('auto fix', input),
        'validator.full': () => this.mockAction('full validation', input)
      },
      'isc': {
        'registry.publish': () => this.mockAction('publish to registry', input)
      }
    };
    
    const handler = actions[module]?.[method];
    
    if (!handler) {
      throw new Error(`未知动作: ${action}`);
    }
    
    return handler();
  }

  /**
   * Mock 动作（实际应调用真实模块）
   */
  async mockAction(name, input) {
    await new Promise(r => setTimeout(r, 100)); // 模拟执行时间
    return { action: name, input, status: 'success' };
  }

  /**
   * 检查是否重试
   */
  shouldRetry(node, context) {
    const retryCount = context.retryCounts?.[node.id] || 0;
    const maxRetry = node.retry?.max || 0;
    return retryCount < maxRetry;
  }
}

module.exports = DAGEngine;
