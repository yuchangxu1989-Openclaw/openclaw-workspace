/**
 * planning-time-granularity handler - N037 时间粒度检查
 * 
 * 触发规则: N037 (AI计划时间粒度标准)
 * 职责: 检查计划文档中是否存在禁止的粗粒度时间单位
 */
const fs = require('fs');
const path = require('path');

const PROHIBITED = ['按周计划', '按月计划', '下周开始', '下个月完成', '下一个sprint'];

module.exports = {
  name: 'planning-time-granularity',
  
  async execute(context = {}) {
    const { content = '', file_path = '' } = context;
    const text = content || (file_path && fs.existsSync(file_path) ? fs.readFileSync(file_path, 'utf8') : '');
    
    const violations = [];
    for (const pattern of PROHIBITED) {
      if (text.includes(pattern)) {
        violations.push({ pattern, severity: 'error' });
      }
    }
    
    // Check for vague week/month references
    const weekMonthRe = /(?:下|下个|下一个|未来)\s*(?:周|月|季度)/g;
    let match;
    while ((match = weekMonthRe.exec(text)) !== null) {
      violations.push({ pattern: match[0], severity: 'warning', position: match.index });
    }
    
    return {
      passed: violations.length === 0,
      violations,
      recommendation: violations.length > 0 ? '请使用分钟/小时/天为单位制定计划' : null
    };
  }
};
