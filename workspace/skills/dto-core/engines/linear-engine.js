class LinearEngine {
  constructor(eventBus) {
    this.eventBus = eventBus;
  }

  async execute(workflow, context) {
    console.log('[Linear] 顺序执行');
    
    const results = {};
    
    for (const node of workflow.nodes) {
      console.log(`[Linear] 执行: ${node.id}`);
      
      // 简化实现
      results[node.id] = { status: 'completed', nodeId: node.id };
      
      await new Promise(r => setTimeout(r, 50));
    }
    
    return { status: 'completed', results };
  }
}

module.exports = LinearEngine;
