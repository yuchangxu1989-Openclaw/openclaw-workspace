/**
 * CRON Model Selector - CRON任务模型选择器
 * @version 1.0.0
 * @description 根据ISC规则自动为CRON任务选择模型
 */

const fs = require('fs');
const path = require('path');

const RULE_PATH = path.join(__dirname, '../isc-core/rules/rule.cron-task-model-selection-002.json');

class CronModelSelector {
  constructor() {
    this.rule = this._loadRule();
  }

  _loadRule() {
    if (fs.existsSync(RULE_PATH)) {
      return JSON.parse(fs.readFileSync(RULE_PATH, 'utf8'));
    }
    throw new Error('ISC规则未找到: rule.cron-task-model-selection-002');
  }

  /**
   * 根据任务消息选择模型
   */
  selectModel(message) {
    const msg = message.toLowerCase();
    
    // 按优先级匹配规则
    for (const rule of this.rule.standard.selectionRules) {
      if (this._evaluateCondition(rule.condition, msg)) {
        return {
          model: rule.model,
          reason: rule.reason,
          priority: rule.priority
        };
      }
    }
    
    // 默认
    return {
      model: process.env.OPENCLAW_DEFAULT_MODEL || 'default',
      reason: '默认模型',
      priority: 99
    };
  }

  /**
   * 评估条件
   */
  _evaluateCondition(condition, message) {
    if (condition === 'default') return true;
    
    try {
      // 简单条件解析
      const parts = condition.split('||');
      for (const part of parts) {
        const match = part.match(/message\.includes\(['"](.+?)['"]\)/);
        if (match && message.includes(match[1].toLowerCase())) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * 批量更新CRON任务
   */
  async upgradeCronJobs(cronListFn) {
    const jobs = await cronListFn();
    const upgrades = [];
    
    for (const job of jobs) {
      if (job.payload?.kind === 'agentTurn' && job.payload?.message) {
        const selection = this.selectModel(job.payload.message);
        
        // 检查是否需要更新
        if (job.payload.model !== selection.model) {
          upgrades.push({
            id: job.id,
            name: job.name,
            oldModel: job.payload.model,
            newModel: selection.model,
            reason: selection.reason
          });
        }
      }
    }
    
    return upgrades;
  }

  /**
   * 生成模型选择报告
   */
  generateReport(upgrades) {
    const byModel = {};
    
    for (const u of upgrades) {
      if (!byModel[u.newModel]) {
        byModel[u.newModel] = [];
      }
      byModel[u.newModel].push(u);
    }
    
    return {
      total: upgrades.length,
      byModel,
      summary: Object.entries(byModel).map(([model, jobs]) => ({
        model,
        count: jobs.length,
        jobs: jobs.map(j => j.name)
      }))
    };
  }
}

module.exports = { CronModelSelector };

// CLI
if (require.main === module) {
  const selector = new CronModelSelector();
  
  // 测试几个任务
  const testMessages = [
    "执行代码生成任务",
    "分析系统架构",
    "备份数据",
    "生成论文摘要"
  ];
  
  console.log('模型选择测试:');
  testMessages.forEach(msg => {
    const result = selector.selectModel(msg);
    console.log(`  "${msg}" -> ${result.model} (${result.reason})`);
  });
}
