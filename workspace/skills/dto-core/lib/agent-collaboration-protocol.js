/**
 * Agent 间协作协议 - Agent Collaboration Protocol (ACP)
 * 定义 CRAS、SEEF 等 Agent 之间的通信标准
 */

class AgentCollaborationProtocol {
  constructor() {
    this.agents = new Map();
    this.messageQueue = [];
  }

  /**
   * 注册 Agent
   */
  registerAgent(agentId, agentConfig) {
    this.agents.set(agentId, {
      id: agentId,
      config: agentConfig,
      status: 'active',
      lastHeartbeat: Date.now()
    });
    console.log(`[ACP] Agent 注册: ${agentId}`);
  }

  /**
   * 发送信号（异步）
   */
  async emitSignal(fromAgent, toAgent, signalType, payload) {
    const signal = {
      id: `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      from: fromAgent,
      to: toAgent,
      type: signalType,
      payload: payload,
      timestamp: new Date().toISOString(),
      priority: payload.priority || 'normal'
    };

    console.log(`[ACP] 信号: ${fromAgent} → ${toAgent} | ${signalType}`);
    
    // 写入共享消息队列
    this.messageQueue.push(signal);
    
    // 触发接收 Agent
    await this.deliverSignal(signal);
    
    return signal.id;
  }

  /**
   * 投递信号
   */
  async deliverSignal(signal) {
    const agent = this.agents.get(signal.to);
    if (!agent) {
      console.error(`[ACP] Agent 不存在: ${signal.to}`);
      return;
    }

    // 根据信号类型路由到对应处理器
    switch (signal.type) {
      case 'insight.detected':
        await this.handleInsightSignal(signal);
        break;
      case 'skill.discovered':
        await this.handleSkillSignal(signal);
        break;
      case 'standard.proposed':
        await this.handleStandardSignal(signal);
        break;
      case 'task.completed':
        await this.handleTaskCompletion(signal);
        break;
      case 'quality.report':
        await this.handleQualityReport(signal);
        break;
      default:
        console.log(`[ACP] 未知信号类型: ${signal.type}`);
    }
  }

  /**
   * 处理洞察信号（CRAS → DTO → SEEF）
   */
  async handleInsightSignal(signal) {
    console.log(`[ACP] 处理洞察: ${signal.payload.title}`);
    
    // 1. DTO 编排任务
    if (signal.payload.type === 'architecture') {
      // 架构洞察触发 SEEF 评估
      await this.emitSignal('DTO', 'SEEF', 'skill.evaluation.requested', {
        reason: 'architecture_change',
        context: signal.payload
      });
    }
  }

  /**
   * 处理技能信号（SEEF → DTO → CRAS）
   */
  async handleSkillSignal(signal) {
    console.log(`[ACP] 处理技能: ${signal.payload.skillId}`);
    
    // SEEF 发现技能问题，通知 CRAS 学习
    await this.emitSignal('DTO', 'CRAS', 'learning.opportunity', {
      type: 'skill_pattern',
      data: signal.payload
    });
  }

  /**
   * 处理标准信号
   */
  async handleStandardSignal(signal) {
    console.log(`[ACP] 处理标准提案: ${signal.payload.standardId}`);
    
    // 转发到 ISC
    await this.emitSignal('DTO', 'ISC', 'standard.review.requested', {
      proposal: signal.payload
    });
  }

  /**
   * 处理任务完成
   */
  async handleTaskCompletion(signal) {
    console.log(`[ACP] 任务完成: ${signal.payload.taskId}`);
    
    // 通知 AEO 评估
    await this.emitSignal('DTO', 'AEO', 'effectiveness.evaluation', {
      task: signal.payload
    });
  }

  /**
   * 处理质量报告
   */
  async handleQualityReport(signal) {
    console.log(`[ACP] 质量报告: ${signal.payload.metric}`);
    
    // 反馈给相关 Agent
    const targetAgent = signal.payload.targetAgent;
    if (targetAgent) {
      await this.emitSignal('AEO', targetAgent, 'feedback.received', {
        metrics: signal.payload.metrics,
        suggestions: signal.payload.suggestions
      });
    }
  }

  /**
   * 广播消息（所有 Agent）
   */
  async broadcast(fromAgent, messageType, payload) {
    console.log(`[ACP] 广播: ${fromAgent} → all | ${messageType}`);
    
    for (const [agentId, agent] of this.agents) {
      if (agentId !== fromAgent) {
        await this.emitSignal(fromAgent, agentId, messageType, payload);
      }
    }
  }

  /**
   * 获取 Agent 状态
   */
  getAgentStatus(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    
    return {
      id: agent.id,
      status: agent.status,
      lastHeartbeat: agent.lastHeartbeat,
      uptime: Date.now() - agent.lastHeartbeat
    };
  }

  /**
   * 心跳检测
   */
  checkHeartbeats() {
    const now = Date.now();
    const timeout = 600000; // 10分钟超时（原为5分钟），适应长时间运行的向量化任务
    
    for (const [agentId, agent] of this.agents) {
      if (now - agent.lastHeartbeat > timeout) {
        console.warn(`[ACP] Agent 心跳超时: ${agentId}`);
        agent.status = 'inactive';
      }
    }
  }
}

// 创建全局实例
const acp = new AgentCollaborationProtocol();

// 注册 CRAS
acp.registerAgent('CRAS', {
  name: 'Cognitive Reflection & Autonomous System',
  type: 'cognitive_agent',
  capabilities: ['learning', 'reflection', 'evolution']
});

// 注册 SEEF
acp.registerAgent('SEEF', {
  name: 'Skill Ecosystem Evolution Foundry',
  type: 'skill_agent',
  capabilities: ['discovery', 'evaluation', 'optimization', 'creation']
});

// 注册 ISC
acp.registerAgent('ISC', {
  name: 'Intelligent Standards Center',
  type: 'infrastructure_agent',
  capabilities: ['standard_management', 'compliance_check']
});

// 注册 DTO
acp.registerAgent('DTO', {
  name: 'Declarative Task Orchestration',
  type: 'orchestration_agent',
  capabilities: ['task_scheduling', 'workflow_management']
});

// 注册 AEO
acp.registerAgent('AEO', {
  name: 'Agent Effectiveness Operations',
  type: 'operations_agent',
  capabilities: ['ci_cd', 'quality_assurance', 'monitoring']
});

module.exports = { AgentCollaborationProtocol, acp };
