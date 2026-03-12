#!/usr/bin/env node
/**
 * DTO本地并行编排器 v3.0
 * 云端LLM生成本地工作流 → DTO解析调度 → 子Agent并行执行
 */

const ParallelSubagentSpawner = require('../parallel-subagent/index.js');

class DeclarativeParallelOrchestrator {
  constructor() {
    this.spawner = new ParallelSubagentSpawner({
      label: 'dto_parallel',
      model: process.env.OPENCLAW_DEFAULT_MODEL || 'default',
      timeout: 300
    });
  }

  /**
   * 云端LLM调用入口：解析本地工作流并执行
   * @param {string} declarativeWorkflow - 自然语言描述的工作流
   * @example
   * orchestrator.execute(`
   *   阶段1(并行):
   *     - AgentA: 分析需求
   *     - AgentB: 调研背景
   *   阶段2(顺序，依赖阶段1):
   *     - AgentC: 综合报告
   * `);
   */
  async execute(declarativeWorkflow) {
    console.log('[DTO并行编排] 解析本地工作流...');
    
    // 解析自然语言为结构化工作流
    const workflow = this.parseWorkflow(declarativeWorkflow);
    
    console.log(`  解析完成: ${workflow.stages.length} 个阶段`);
    
    // 执行工作流
    return await this.spawner.executeWorkflow(workflow);
  }

  /**
   * 解析本地工作流
   * 支持格式：
   * 阶段1(并行): AgentA:任务, AgentB:任务
   * 阶段2(顺序,依赖阶段1): AgentC:任务
   */
  parseWorkflow(text) {
    const stages = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    
    let currentStage = null;
    
    for (const line of lines) {
      // 匹配阶段定义: "阶段1(并行):" 或 "阶段1(顺序,依赖阶段1):"
      const stageMatch = line.match(/阶段(\d+)\(([^)]+)\):/);
      if (stageMatch) {
        if (currentStage) stages.push(currentStage);
        
        const [, stageNum, config] = stageMatch;
        const isParallel = config.includes('并行');
        const dependsOn = config.match(/依赖阶段(\d+)/)?.[1];
        
        currentStage = {
          name: `stage${stageNum}`,
          type: isParallel ? 'parallel' : 'sequential',
          dependsOn: dependsOn ? `stage${dependsOn}` : null,
          agents: []
        };
        continue;
      }
      
      // 匹配Agent定义: "- AgentA: 任务描述"
      const agentMatch = line.match(/-\s*(\w+):\s*(.+)/);
      if (agentMatch && currentStage) {
        const [, role, task] = agentMatch;
        currentStage.agents.push({
          role: role,
          task: task,
          timeout: 120
        });
      }
    }
    
    if (currentStage) stages.push(currentStage);
    
    return { name: 'declarative_workflow', stages };
  }

  /**
   * 云端LLM工具调用格式
   * 供云端大模型直接调用
   */
  static getToolSchema() {
    return {
      name: 'parallel_orchestrate',
      description: '并行编排多个子Agent执行复杂任务',
      parameters: {
        type: 'object',
        properties: {
          workflow: {
            type: 'string',
            description: '本地工作流描述，例如："阶段1(并行): - analyzer:分析需求 - researcher:调研背景 阶段2(顺序): - writer:撰写报告"'
          }
        },
        required: ['workflow']
      }
    };
  }
}

module.exports = DeclarativeParallelOrchestrator;

// 测试
if (require.main === module) {
  const orchestrator = new DeclarativeParallelOrchestrator();
  
  orchestrator.execute(`
阶段1(并行):
  - analyzer: 分析当前系统架构问题
  - researcher: 调研最佳实践方案
阶段2(顺序,依赖阶段1):
  - synthesizer: 综合分析和调研结果，给出优化建议
  `).then(result => {
    console.log('\n执行结果:', JSON.stringify(result, null, 2));
  });
}
