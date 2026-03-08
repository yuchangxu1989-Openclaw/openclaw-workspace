/**
 * 本地任务编排 v2.0 - CRAS 适配器
 * 实现洞察订阅、自动触发、闭环反馈
 */

class CRASAdapter {
  constructor(crasClient, ctoEventBus) {
    this.cras = crasClient;
    this.eventBus = ctoEventBus;
    this.insightQueue = [];
    this.processing = false;
    
    // 默认触发阈值
    this.thresholds = {
      confidence: 0.85,
      impact: 'critical',
      frequency: 3
    };
  }

  /**
   * 初始化订阅
   */
  async initialize() {
    console.log('[CRAS-Adapter] 初始化洞察订阅');
    
    // 订阅 CRAS 洞察报告
    this.eventBus.subscribe('cras.insight.report', async (report) => {
      await this.handleInsight(report);
    });
    
    // 订阅关键洞察事件
    this.eventBus.subscribe('insight.critical', async (data) => {
      await this.handleCriticalInsight(data);
    });
    
    console.log('[CRAS-Adapter] 订阅完成');
  }

  /**
   * 处理洞察报告
   */
  async handleInsight(report) {
    console.log(`[CRAS-Adapter] 收到洞察: ${report.type || 'general'}`);
    
    // 评估是否触发任务
    const shouldTrigger = this.evaluateTrigger(report);
    
    if (shouldTrigger) {
      console.log(`  ✓ 满足触发条件，加入队列`);
      this.insightQueue.push({
        ...report,
        queuedAt: Date.now()
      });
      
      // 异步处理队列
      this.processQueue();
    } else {
      console.log(`  ✗ 不满足触发条件`);
    }
  }

  /**
   * 处理关键洞察
   */
  async handleCriticalInsight(data) {
    console.log('[CRAS-Adapter] 收到关键洞察，立即处理');
    
    // 关键洞察直接触发，不经过队列
    const taskPlan = await this.generateTaskPlan(data);
    
    // 发布任务生成事件
    this.eventBus.publish('cras.task.generated', {
      source: 'critical_insight',
      plan: taskPlan,
      insight: data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 评估是否触发任务
   */
  evaluateTrigger(report) {
    // 置信度检查
    if (report.confidence < this.thresholds.confidence) {
      return false;
    }
    
    // 影响级别检查
    if (report.impact !== this.thresholds.impact && 
        report.impact !== 'high') {
      return false;
    }
    
    // 频率检查（如果是重复问题）
    if (report.frequency && report.frequency < this.thresholds.frequency) {
      return false;
    }
    
    return true;
  }

  /**
   * 处理队列
   */
  async processQueue() {
    if (this.processing || this.insightQueue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    while (this.insightQueue.length > 0) {
      const insight = this.insightQueue.shift();
      
      try {
        const taskPlan = await this.generateTaskPlan(insight);
        
        this.eventBus.publish('cras.task.generated', {
          source: 'insight_queue',
          plan: taskPlan,
          insight,
          timestamp: new Date().toISOString()
        });
        
      } catch (e) {
        console.error('[CRAS-Adapter] 生成任务计划失败:', e.message);
      }
    }
    
    this.processing = false;
  }

  /**
   * 生成任务计划
   */
  async generateTaskPlan(insight) {
    console.log('[CRAS-Adapter] 生成任务计划');
    
    // 基于洞察类型选择默认动作链
    const defaultChains = {
      'skill_gap': ['discoverer', 'creator'],
      'quality_issue': ['evaluator', 'optimizer'],
      'standard_violation': ['aligner', 'validator'],
      'performance_bottleneck': ['evaluator', 'optimizer', 'validator'],
      'default': ['evaluator']
    };
    
    const chain = defaultChains[insight.type] || defaultChains['default'];
    
    return {
      id: `adaptive-${Date.now()}`,
      source: 'cras_insight',
      insightId: insight.id,
      triggers: [{
        type: 'immediate',
        source: 'cras_adapter'
      }],
      constraints: insight.recommendedConstraints || [],
      actions: chain.map(skill => ({
        type: 'module',
        module: 'seef',
        skill,
        params: { insight: insight.id }
      })),
      metadata: {
        adaptive: true,
        generatedFrom: 'cras_insight',
        confidence: insight.confidence,
        impact: insight.impact
      }
    };
  }

  /**
   * 设置触发阈值
   */
  setThresholds(thresholds) {
    this.thresholds = { ...this.thresholds, ...thresholds };
    console.log('[CRAS-Adapter] 阈值已更新:', this.thresholds);
  }

  /**
   * 获取队列状态
   */
  getQueueStatus() {
    return {
      pending: this.insightQueue.length,
      processing: this.processing,
      thresholds: this.thresholds
    };
  }
}

module.exports = CRASAdapter;
