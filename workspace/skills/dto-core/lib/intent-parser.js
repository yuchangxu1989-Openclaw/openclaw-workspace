/**
 * DTO - Controllable Task Orchestrator
 * 可控任务调度中心 - 意图解析器
 * 
 * 将 YAML/JSON 任务意图解析为可执行对象
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class IntentParser {
  constructor() {
    this.schema = {
      required: ['id', 'intent', 'triggers', 'actions'],
      optional: ['constraints', 'metadata']
    };
  }

  /**
   * 解析任务意图文件
   * @param {string} filePath - YAML/JSON 文件路径
   * @returns {Object} 解析后的任务对象
   */
  parseFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath);
    
    let raw;
    if (ext === '.yaml' || ext === '.yml') {
      raw = yaml.load(content);
    } else if (ext === '.json') {
      raw = JSON.parse(content);
    } else {
      throw new Error(`不支持的文件格式: ${ext}`);
    }
    
    return this.validateAndTransform(raw);
  }

  /**
   * 解析任务意图对象
   * @param {Object} raw - 原始意图对象
   * @returns {Object} 验证并转换后的任务对象
   */
  parseObject(raw) {
    return this.validateAndTransform(raw);
  }

  /**
   * 验证并转换
   */
  validateAndTransform(raw) {
    // 验证必填字段
    for (const field of this.schema.required) {
      if (!raw[field]) {
        throw new Error(`缺少必填字段: ${field}`);
      }
    }

    // 转换为标准任务对象
    return {
      id: raw.id,
      intent: raw.intent,
      version: raw.version || '1.0.0',
      status: 'pending',
      
      // 触发器解析
      triggers: raw.triggers.map(t => this.parseTrigger(t)),
      
      // 约束条件解析（ISC 标准检查）
      constraints: (raw.constraints || []).map(c => this.parseConstraint(c)),
      
      // 动作序列解析
      actions: raw.actions.map(a => this.parseAction(a)),
      
      // 元数据
      metadata: {
        created: new Date().toISOString(),
        author: raw.metadata?.author || 'system',
        priority: raw.metadata?.priority || 'normal',
        ...raw.metadata
      }
    };
  }

  /**
   * 解析触发器
   */
  parseTrigger(trigger) {
    const types = {
      'cron': () => ({
        type: 'cron',
        spec: trigger.spec,
        nextRun: null // 由调度器计算
      }),
      'event': () => ({
        type: 'event',
        source: trigger.source,
        condition: trigger.condition // 表达式
      }),
      'webhook': () => ({
        type: 'webhook',
        endpoint: trigger.endpoint,
        method: trigger.method || 'POST'
      }),
      'manual': () => ({
        type: 'manual',
        authorized: trigger.authorized || ['admin']
      })
    };

    const parser = types[trigger.type];
    if (!parser) {
      throw new Error(`未知的触发器类型: ${trigger.type}`);
    }

    return parser();
  }

  /**
   * 解析约束条件（ISC 标准）
   */
  parseConstraint(constraint) {
    return {
      standard: constraint.standard, // 如: quality.md.length
      operator: constraint.operator || 'required', // required, min, max, equals
      value: constraint.value,
      severity: constraint.severity || 'error' // error, warning
    };
  }

  /**
   * 解析动作
   */
  parseAction(action) {
    const types = {
      'module': () => ({
        type: 'module',
        module: action.module, // cras, isc, seef, etc.
        skill: action.skill,
        action: action.action,
        params: action.params || {}
      }),
      'custom': () => ({
        type: 'custom',
        script: action.script,
        interpreter: action.interpreter || 'node',
        params: action.params || {}
      }),
      'notify': () => ({
        type: 'notify',
        channel: action.channel, // feishu, email, etc.
        message: action.message
      })
    };

    const parser = types[action.type];
    if (!parser) {
      throw new Error(`未知的动作类型: ${action.type}`);
    }

    return parser();
  }

  /**
   * 批量解析任务目录
   */
  parseDirectory(dirPath) {
    const tasks = [];
    
    if (!fs.existsSync(dirPath)) {
      return tasks;
    }

    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isFile() && (file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.json'))) {
        try {
          const task = this.parseFile(filePath);
          tasks.push(task);
        } catch (e) {
          console.error(`[DTO] 解析任务失败: ${file}`, e.message);
        }
      }
    }

    return tasks;
  }
}

module.exports = IntentParser;
