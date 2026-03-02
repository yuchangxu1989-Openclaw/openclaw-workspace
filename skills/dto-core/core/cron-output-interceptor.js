#!/usr/bin/env node
/**
 * Cron 输出拦截器
 * 强制所有cron输出转换为飞书卡片格式
 */

const ReportFormatter = require('./report-formatter');

class CronOutputInterceptor {
  constructor() {
    this.formatter = new ReportFormatter();
  }

  /**
   * 拦截并转换输出
   */
  intercept(taskName, rawOutput) {
    // 检查是否已经是飞书卡片格式
    if (this.isFeishuCard(rawOutput)) {
      return rawOutput;
    }
    
    // 转换为飞书卡片
    const templateName = this.inferTemplate(taskName);
    const data = this.parseRawOutput(rawOutput);
    
    return this.formatter.format(taskName, data, templateName);
  }

  /**
   * 检查是否已是飞书卡片
   */
  isFeishuCard(output) {
    try {
      const parsed = typeof output === 'string' ? JSON.parse(output) : output;
      return parsed.config && parsed.header && parsed.elements;
    } catch {
      return false;
    }
  }

  /**
   * 推断模板
   */
  inferTemplate(taskName) {
    const mappings = {
      'CRAS-B': 'cras_b_insight',
      'CRAS-A': 'cras_a_learning',
      'CRAS-C': 'cras_c_governance',
      'CRAS-D': 'cras_d_research',
      'CRAS-E': 'cras_e_evolution',
      'CARS': 'cars_dashboard',
      'EvoMap': 'evolver',
      'Evolver': 'evolver'
    };
    
    for (const [key, template] of Object.entries(mappings)) {
      if (taskName.includes(key)) {
        return template;
      }
    }
    
    return 'default';
  }

  /**
   * 解析原始输出
   */
  parseRawOutput(output) {
    // 尝试从文本中提取结构化数据
    const data = {
      raw: output,
      executionTime: new Date().toLocaleString('zh-CN'),
      findings: this.extractFindings(output),
      status: this.extractStatus(output)
    };
    
    return data;
  }

  /**
   * 提取发现
   */
  extractFindings(output) {
    // 简单提取
    const lines = output.split('\n');
    const findings = [];
    
    for (const line of lines) {
      if (line.includes('发现') || line.includes(' insight') || line.includes('完成')) {
        findings.push(line.trim());
      }
    }
    
    return findings.join('\n') || '执行完成';
  }

  /**
   * 提取状态
   */
  extractStatus(output) {
    if (output.includes('✅') || output.includes('完成') || output.includes('success')) {
      return 'completed';
    }
    if (output.includes('❌') || output.includes('失败') || output.includes('error')) {
      return 'failed';
    }
    return 'unknown';
  }
}

module.exports = CronOutputInterceptor;
