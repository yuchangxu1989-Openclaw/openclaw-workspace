/**
 * 本地任务编排 v2.0 - 响应式调度器 (P1)
 * 预定义白名单 + LLM 动态组合
 */

class AdaptiveScheduler {
  constructor(options = {}) {
    this.llmClient = options.llmClient;
    this.eventBus = options.eventBus;
    
    // 安全白名单 - 允许的动作类型
    this.actionWhitelist = new Map([
      ['module.cras', { 
        allowed: true, 
        skills: ['active-learning-engine', 'insight-analyzer', 'knowledge-governance'],
        maxParams: 5 
      }],
      ['module.isc', { 
        allowed: true, 
        actions: ['check', 'getCheckpoints', 'triggerAlignment'],
        readonly: false
      }],
      ['module.seef', { 
        allowed: true, 
        skills: ['evaluator', 'discoverer', 'optimizer', 'creator', 'aligner', 'validator'],
        requireConfirmation: ['creator']
      }],
      ['custom.script', { 
        allowed: true, 
        requireSignature: true,
        allowedInterpreters: ['node', 'python3']
      }],
      ['notify', { 
        allowed: true, 
        channels: ['feishu', 'log']
      }]
    ]);
    
    // 高风险操作需要确认
    this.highRiskActions = [
      'delete', 'override', 'rollback', 'deploy'
    ];
  }

  /**
   * 执行响应式任务
   * @param {Object} context - 上下文（洞察、用户请求等）
   * @param {string} mode - 'llm' | 'template' | 'hybrid'
   */
  async executeAdaptive(context, mode = 'hybrid') {
    console.log(`[AdaptiveScheduler] 执行响应式调度: ${mode}`);
    
    let taskPlan;
    
    switch (mode) {
      case 'llm':
        taskPlan = await this.generateWithLLM(context);
        break;
      case 'template':
        taskPlan = await this.selectTemplate(context);
        break;
      case 'hybrid':
      default:
        taskPlan = await this.generateHybrid(context);
    }
    
    // 验证动作序列
    const validation = this.validateTaskPlan(taskPlan);
    
    if (!validation.valid) {
      throw new Error(`任务计划验证失败: ${validation.errors.join(', ')}`);
    }
    
    // 检查是否需要确认
    if (validation.requiresConfirmation) {
      this.eventBus.publish('adaptive.confirmation_required', {
        plan: taskPlan,
        risks: validation.risks,
        timestamp: new Date().toISOString()
      });
      
      return {
        status: 'pending_confirmation',
        plan: taskPlan,
        message: '高风险操作，等待确认'
      };
    }
    
    // 执行
    return this.executePlan(taskPlan);
  }

  /**
   * 混合生成：模板 + LLM 优化
   */
  async generateHybrid(context) {
    // 1. 选择基础模板
    const baseTemplate = this.selectBaseTemplate(context);
    
    // 2. LLM 优化填充
    const optimized = await this.llmOptimize(baseTemplate, context);
    
    return {
      id: `adaptive-${Date.now()}`,
      source: 'hybrid',
      baseTemplate: baseTemplate.id,
      ...optimized
    };
  }

  /**
   * 选择基础模板
   */
  selectBaseTemplate(context) {
    const templates = {
      'skill_evolution': {
        id: 'skill_evolution',
        defaultChain: ['evaluator', 'discoverer', 'optimizer'],
        constraints: ['quality.md.length', 'naming.skill.dir']
      },
      'quality_audit': {
        id: 'quality_audit',
        defaultChain: ['evaluator', 'validator'],
        constraints: ['quality.md.length', 'quality.readme.length']
      },
      'standard_alignment': {
        id: 'standard_alignment',
        defaultChain: ['aligner', 'validator'],
        constraints: ['naming.skill.dir', 'naming.skill.display']
      },
      'default': {
        id: 'default',
        defaultChain: ['evaluator'],
        constraints: []
      }
    };
    
    // 根据上下文选择
    if (context.type?.includes('skill')) return templates['skill_evolution'];
    if (context.type?.includes('quality')) return templates['quality_audit'];
    if (context.type?.includes('standard')) return templates['standard_alignment'];
    
    return templates['default'];
  }

  /**
   * LLM 优化
   */
  async llmOptimize(template, context) {
    // 构建提示
    const prompt = this.buildPrompt(template, context);
    
    // 调用 LLM（实际应调用配置的模型API）
    console.log('[AdaptiveScheduler] LLM 优化中...');
    
    // 模拟 LLM 返回
    return {
      intent: context.description || '自适应任务',
      triggers: [{ type: 'immediate', source: 'adaptive_scheduler' }],
      constraints: template.constraints.map(c => ({
        standard: c,
        operator: 'required',
        severity: 'error'
      })),
      actions: template.defaultChain.map(skill => ({
        type: 'module',
        module: 'seef',
        skill,
        params: { adaptive: true, context: context.id }
      })),
      metadata: {
        adaptive: true,
        template: template.id,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * 构建 LLM 提示
   */
  buildPrompt(template, context) {
    return `
基于以下模板和上下文，生成优化后的任务计划：

模板: ${template.id}
默认动作链: ${template.defaultChain.join(' -> ')}
约束: ${template.constraints.join(', ')}

上下文:
- 类型: ${context.type || 'unknown'}
- 描述: ${context.description || 'N/A'}
- 置信度: ${context.confidence || 'N/A'}
- 影响: ${context.impact || 'N/A'}

要求:
1. 动作必须在白名单内
2. 可以增删改动作，但需说明理由
3. 高风险操作需标记

返回 JSON 格式的任务计划。
`;
  }

  /**
   * 验证任务计划
   */
  validateTaskPlan(plan) {
    const errors = [];
    const risks = [];
    let requiresConfirmation = false;
    
    for (const action of plan.actions || []) {
      // 检查动作类型白名单
      const whitelistKey = `${action.type}.${action.module || action.script ? 'script' : 'notify'}`;
      const whitelist = this.actionWhitelist.get(whitelistKey);
      
      if (!whitelist || !whitelist.allowed) {
        errors.push(`动作类型不在白名单: ${action.type}`);
        continue;
      }
      
      // 检查高风险操作
      if (this.highRiskActions.some(r => 
        JSON.stringify(action).toLowerCase().includes(r))) {
        risks.push(`检测到高风险操作: ${action.type}`);
        requiresConfirmation = true;
      }
      
      // 检查模块特定约束
      if (action.module === 'seef' && whitelist.requireConfirmation?.includes(action.skill)) {
        risks.push(`SEEF ${action.skill} 需要确认`);
        requiresConfirmation = true;
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      risks,
      requiresConfirmation
    };
  }

  /**
   * 执行任务计划
   */
  async executePlan(plan) {
    this.eventBus.publish('adaptive.execution.started', {
      planId: plan.id,
      timestamp: new Date().toISOString()
    });
    
    // 返回计划供 本地任务编排 主类执行
    return {
      status: 'ready',
      plan,
      executable: true
    };
  }

  /**
   * 添加白名单条目
   */
  addToWhitelist(key, config) {
    this.actionWhitelist.set(key, config);
  }

  /**
   * 获取白名单
   */
  getWhitelist() {
    return Array.from(this.actionWhitelist.entries());
  }
}

module.exports = AdaptiveScheduler;
