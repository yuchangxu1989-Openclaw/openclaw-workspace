/**
 * 本地任务编排 主动响应控制器
 * 监听Evolver/CRAS等信号，触发自动响应管道
 */

class DTOAutoResponseController {
  constructor(ctoPlatform) {
    this.dto = ctoPlatform;
    this.eventBus = ctoPlatform.eventBus;
    this.activeResponses = new Map();
    
    // 响应配置
    this.config = {
      enabled: true,
      maxConcurrent: 5,
      cooldownPeriod: 60000, // 1分钟冷却
      escalationThreshold: 0.8
    };
  }

  /**
   * 初始化监听
   */
  async initialize() {
    console.log('[本地任务编排-AutoResponse] 初始化主动响应控制器');
    
    // 监听Evolver信号
    this.eventBus.subscribe('evolver.insight.detected', (data) => {
      this.handleEvolverSignal(data);
    });
    
    // 监听CRAS关键洞察
    this.eventBus.subscribe('cras.insight.critical', (data) => {
      this.handleCRASSignal(data);
    });
    
    // 监听系统指标告警
    this.eventBus.subscribe('system.metric.threshold_exceeded', (data) => {
      this.handleSystemAlert(data);
    });
    
    console.log('[本地任务编排-AutoResponse] 监听已启动');
  }

  /**
   * 处理Evolver信号
   */
  async handleEvolverSignal(data) {
    console.log('[本地任务编排-AutoResponse] 收到Evolver信号:', data.type);
    
    // 分类检查
    if (this.isSecurityIssue(data)) {
      await this.triggerResponse('security', data);
    } else if (this.isQualityIssue(data)) {
      await this.triggerResponse('quality', data);
    } else {
      console.log('[本地任务编排-AutoResponse] 信号类型不匹配自动响应规则');
    }
  }

  /**
   * 处理CRAS信号
   */
  async handleCRASSignal(data) {
    console.log('[本地任务编排-AutoResponse] 收到CRAS关键洞察');
    
    if (data.impact >= this.config.escalationThreshold) {
      await this.triggerResponse('critical_insight', data);
    }
  }

  /**
   * 处理系统告警
   */
  async handleSystemAlert(data) {
    console.log('[本地任务编排-AutoResponse] 收到系统告警:', data.metric);
    await this.triggerResponse('system_alert', data);
  }

  /**
   * 判断是否为安全问题
   */
  isSecurityIssue(data) {
    const securityKeywords = [
      'vulnerability', 'exploit', 'malware', 'injection',
      'oauth', 'permission', 'security', 'cve'
    ];
    
    const text = JSON.stringify(data).toLowerCase();
    return securityKeywords.some(kw => text.includes(kw));
  }

  /**
   * 判断是否为质量问题
   */
  isQualityIssue(data) {
    const qualityKeywords = [
      'performance', 'reliability', 'coverage', 'test_failure',
      'quality', 'degradation', 'bottleneck'
    ];
    
    const text = JSON.stringify(data).toLowerCase();
    return qualityKeywords.some(kw => text.includes(kw));
  }

  /**
   * 触发响应管道
   */
  async triggerResponse(type, data) {
    // 检查并发限制
    if (this.activeResponses.size >= this.config.maxConcurrent) {
      console.log('[本地任务编排-AutoResponse] 并发限制，排队等待');
      // 可以加入队列
      return;
    }
    
    const responseId = `resp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[本地任务编排-AutoResponse] 触发响应: ${responseId} [${type}]`);
    
    this.activeResponses.set(responseId, {
      id: responseId,
      type,
      data,
      startedAt: Date.now(),
      status: 'running'
    });
    
    try {
      // 执行自动响应管道
      const result = await this.dto.execute('auto-response-pipeline', {
        trigger: type,
        input: data
      });
      
      this.activeResponses.set(responseId, {
        ...this.activeResponses.get(responseId),
        status: 'completed',
        result,
        completedAt: Date.now()
      });
      
      console.log(`[本地任务编排-AutoResponse] ✓ 响应完成: ${responseId}`);
      
    } catch (e) {
      this.activeResponses.set(responseId, {
        ...this.activeResponses.get(responseId),
        status: 'failed',
        error: e.message,
        failedAt: Date.now()
      });
      
      console.error(`[本地任务编排-AutoResponse] ✗ 响应失败: ${responseId}`, e.message);
    }
  }

  /**
   * 获取活跃响应
   */
  getActiveResponses() {
    return Array.from(this.activeResponses.values());
  }

  /**
   * 获取统计
   */
  getStats() {
    const responses = Array.from(this.activeResponses.values());
    
    return {
      active: responses.filter(r => r.status === 'running').length,
      completed: responses.filter(r => r.status === 'completed').length,
      failed: responses.filter(r => r.status === 'failed').length,
      total: responses.length
    };
  }
}

module.exports = DTOAutoResponseController;
