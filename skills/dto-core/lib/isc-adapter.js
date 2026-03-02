/**
 * DTO v2.0 - ISC 适配器
 * 实现标准订阅、阶段化检查点、动态响应
 */

class ISCAdapter {
  constructor(iscClient) {
    this.isc = iscClient;
    this.subscriptions = new Map();
    this.checkpointCache = new Map();
    this.lastUpdate = null;
  }

  /**
   * 订阅 ISC 标准变更
   * @param {string} event - 'standard.updated' | 'standard.created' | 'standard.deprecated'
   * @param {Function} handler - 回调函数
   */
  async subscribe(event, handler) {
    console.log(`[ISC-Adapter] 订阅事件: ${event}`);
    
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, []);
    }
    
    this.subscriptions.get(event).push(handler);
    
    // 启动轮询监听（如果尚未启动）
    if (!this.pollingInterval) {
      this.startPolling();
    }
    
    return true;
  }

  /**
   * 启动轮询监听
   */
  startPolling() {
    console.log('[ISC-Adapter] 启动标准变更监听 (60s 间隔)');
    
    this.pollingInterval = setInterval(async () => {
      try {
        await this.checkForUpdates();
      } catch (e) {
        console.error('[ISC-Adapter] 轮询错误:', e.message);
      }
    }, 60000);
  }

  /**
   * 检查标准更新
   */
  async checkForUpdates() {
    // 获取当前标准注册表时间戳
    const currentStatus = await this.isc.getRegistryStatus?.() || { lastUpdate: Date.now() };
    
    if (this.lastUpdate && currentStatus.lastUpdate > this.lastUpdate) {
      console.log('[ISC-Adapter] 检测到标准变更');
      
      // 触发订阅回调
      const handlers = this.subscriptions.get('standard.updated') || [];
      for (const handler of handlers) {
        await handler({
          type: 'standard.updated',
          timestamp: currentStatus.lastUpdate,
          changes: currentStatus.changes || []
        });
      }
    }
    
    this.lastUpdate = currentStatus.lastUpdate || Date.now();
  }

  /**
   * 获取阶段检查点（核心咬合接口）
   * @param {string} phase - 'verify' | 'deploy' | 'rollback'
   * @returns {Array} 检查点列表
   */
  async getCheckpoints(phase) {
    console.log(`[ISC-Adapter] 获取阶段检查点: ${phase}`);
    
    // 优先从缓存获取
    const cacheKey = `checkpoints:${phase}`;
    const cached = this.checkpointCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < 300000) { // 5分钟缓存
      console.log(`  ✓ 使用缓存 (${cached.data.length} 个检查点)`);
      return cached.data;
    }
    
    // 从 ISC 获取
    const checkpoints = await this.isc.getCheckpointsForPhase(phase);
    
    // 缓存结果
    this.checkpointCache.set(cacheKey, {
      data: checkpoints,
      timestamp: Date.now()
    });
    
    console.log(`  ✓ 从 ISC 获取 (${checkpoints.length} 个检查点)`);
    return checkpoints;
  }

  /**
   * 执行阶段检查
   * @param {string} phase - 阶段名称
   * @param {Object} target - 检查目标
   */
  async executePhaseCheck(phase, target) {
    const checkpoints = await this.getCheckpoints(phase);
    const results = [];
    
    for (const cp of checkpoints) {
      console.log(`  检查: ${cp.id}`);
      const result = await this.isc.check(cp.id, target);
      results.push({
        checkpoint: cp.id,
        ...result
      });
    }
    
    // 综合结果
    const errors = results.filter(r => r.status === 'error');
    const warnings = results.filter(r => r.status === 'warning');
    
    return {
      phase,
      total: results.length,
      passed: results.length - errors.length - warnings.length,
      warnings: warnings.length,
      errors: errors.length,
      details: results,
      overall: errors.length > 0 ? 'blocked' : 
               warnings.length > 0 ? 'approved_with_warning' : 'approved'
    };
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.checkpointCache.clear();
    console.log('[ISC-Adapter] 缓存已清除');
  }

  /**
   * 停止监听
   */
  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('[ISC-Adapter] 监听已停止');
    }
  }
}

module.exports = ISCAdapter;
