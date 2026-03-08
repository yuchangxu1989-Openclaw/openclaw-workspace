/**
 * 本地任务编排 - 决策引擎
 * 根据 ISC 标准决定是否执行任务
 */

class DecisionEngine {
  constructor(iscClient) {
    this.isc = iscClient;
    this.decisions = new Map();
  }

  /**
   * 评估任务是否可执行
   * @param {Object} task - 任务对象
   * @returns {Object} 决策结果
   */
  async evaluate(task) {
    console.log(`[本地任务编排-Decision] 评估任务: ${task.id}`);
    
    const results = {
      taskId: task.id,
      timestamp: new Date().toISOString(),
      constraints: [],
      overall: 'pending'
    };

    // 1. 检查所有约束条件
    for (const constraint of task.constraints) {
      const checkResult = await this.checkConstraint(constraint);
      results.constraints.push(checkResult);
    }

    // 2. 综合决策
    const errors = results.constraints.filter(c => c.status === 'error');
    const warnings = results.constraints.filter(c => c.status === 'warning');

    if (errors.length > 0) {
      results.overall = 'blocked';
      results.reason = `未通过约束: ${errors.map(e => e.standard).join(', ')}`;
    } else if (warnings.length > 0) {
      results.overall = 'approved_with_warning';
      results.warnings = warnings.map(w => w.message);
    } else {
      results.overall = 'approved';
    }

    // 3. 记录决策
    this.decisions.set(task.id, results);

    console.log(`[本地任务编排-Decision] 结果: ${results.overall}`);
    return results;
  }

  /**
   * 检查单个约束
   */
  async checkConstraint(constraint) {
    console.log(`  检查约束: ${constraint.standard}`);

    try {
      // 调用 ISC 检查点
      const checkResult = await this.isc.check(constraint.standard, {
        // 上下文信息
        taskContext: true,
        timestamp: new Date().toISOString()
      });

      // 根据检查结果和约束操作符判断
      let status = 'passed';
      let message = '检查通过';

      if (checkResult.status === 'error' || checkResult.status === 'failed') {
        if (constraint.severity === 'error') {
          status = 'error';
          message = `标准 ${constraint.standard} 未达标`;
        } else {
          status = 'warning';
          message = `标准 ${constraint.standard} 存在风险`;
        }
      }

      return {
        standard: constraint.standard,
        operator: constraint.operator,
        status,
        message,
        checkResult
      };

    } catch (e) {
      return {
        standard: constraint.standard,
        operator: constraint.operator,
        status: constraint.severity === 'error' ? 'error' : 'warning',
        message: `检查失败: ${e.message}`,
        error: e.message
      };
    }
  }

  /**
   * 获取决策历史
   */
  getDecisionHistory(taskId) {
    if (taskId) {
      return this.decisions.get(taskId);
    }
    return Array.from(this.decisions.entries());
  }

  /**
   * 批量评估
   */
  async evaluateBatch(tasks) {
    const results = [];
    for (const task of tasks) {
      const result = await this.evaluate(task);
      results.push(result);
    }
    return results;
  }
}

module.exports = DecisionEngine;
