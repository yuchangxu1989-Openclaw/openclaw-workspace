/**
 * SEEF Optimizer - 技能优化方案生成器
 * P1阶段实现：生成安全可逆的修复方案
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

/**
 * 生成优化方案
 * @param {Object} input - 输入参数
 * @param {string} input.skillId - 技能ID
 * @param {string} input.skillPath - 技能路径
 * @param {Array} input.issues - 问题清单（来自Evaluator或Discoverer）
 * @param {string} input.source - 来源 (evaluator/discoverer)
 * @returns {Promise<Object>} 优化方案
 */
async function optimize(input) {
  const { skillId, skillPath, issues, source } = input;
  
  console.log(`[SEEF Optimizer] 开始生成优化方案: ${skillId}`);
  console.log(`[SEEF Optimizer] 问题来源: ${source}`);
  console.log(`[SEEF Optimizer] 问题数量: ${issues?.length || 0}`);
  
  try {
    // 1. 过滤可修复问题
    const fixableIssues = filterFixableIssues(issues);
    
    if (fixableIssues.length === 0) {
      console.log(`[SEEF Optimizer] 无可修复问题，跳过优化`);
      return {
        success: true,
        skillId,
        fixableIssues: 0,
        plans: [],
        message: 'No fixable issues found'
      };
    }
    
    // 2. 为每个问题生成修复方案
    const plans = [];
    for (const issue of fixableIssues) {
      const plan = await generateFixPlan(issue, skillPath);
      plans.push(plan);
    }
    
    // 3. 风险评估
    const riskAssessment = assessRisks(plans);
    
    // 4. 集成ISC规则检查
    const iscCompliance = await checkISCCompliance(plans, skillPath);
    
    // 5. 生成回滚方案
    const rollbackPlans = generateRollbackPlans(plans, skillPath);
    
    // 6. 构建优化报告
    const report = {
      skillId,
      skillPath,
      timestamp: Date.now(),
      source,
      fixableIssues: fixableIssues.length,
      plans: plans.map((plan, idx) => ({
        ...plan,
        rollback: rollbackPlans[idx],
        iscCompliant: iscCompliance[idx]
      })),
      riskAssessment,
      overallRisk: riskAssessment.level,
      safeToApply: riskAssessment.level !== 'high' && iscCompliance.every(c => c.compliant),
      metadata: {
        optimizerVersion: '1.0.0',
        generationTime: Date.now()
      }
    };
    
    // 7. 保存优化方案
    await saveOptimizationPlan(report);
    
    console.log(`[SEEF Optimizer] 优化方案生成完成: ${plans.length}个方案, 风险=${riskAssessment.level}`);
    
    return report;
    
  } catch (error) {
    console.error(`[SEEF Optimizer] 优化失败:`, error.message);
    
    return {
      success: false,
      error: error.message,
      skillId,
      timestamp: Date.now()
    };
  }
}

/**
 * 过滤可修复问题
 */
function filterFixableIssues(issues) {
  if (!Array.isArray(issues)) {
    return [];
  }
  
  return issues.filter(issue => issue.fixable === true);
}

/**
 * 生成修复方案
 */
async function generateFixPlan(issue, skillPath) {
  const plan = {
    issueType: issue.type,
    issueSeverity: issue.severity,
    issueDescription: issue.description,
    fixSteps: [],
    estimatedTime: 0,
    risk: 'low',
    reversible: true
  };
  
  // 根据问题类型生成具体修复步骤
  switch (issue.type) {
    case 'missing_skill_md':
      plan.fixSteps = [
        {
          action: 'create_file',
          target: 'SKILL.md',
          content: generateSkillMdTemplate(skillPath),
          description: '创建SKILL.md模板'
        }
      ];
      plan.estimatedTime = 5;
      plan.risk = 'low';
      break;
      
    case 'missing_entry_point':
      plan.fixSteps = [
        {
          action: 'create_file',
          target: 'index.js',
          content: generateIndexJsTemplate(),
          description: '创建入口文件index.js'
        }
      ];
      plan.estimatedTime = 3;
      plan.risk = 'low';
      break;
      
    case 'poor_documentation':
      plan.fixSteps = [
        {
          action: 'enhance_file',
          target: 'SKILL.md',
          enhancements: [
            'add_usage_section',
            'add_examples_section',
            'add_api_documentation'
          ],
          description: '增强SKILL.md文档质量'
        }
      ];
      plan.estimatedTime = 10;
      plan.risk = 'low';
      break;
      
    case 'poor_structure':
      plan.fixSteps = [
        {
          action: 'refactor_structure',
          changes: [
            'create_src_directory',
            'move_code_to_src',
            'update_package_json_main'
          ],
          description: '重构项目结构'
        }
      ];
      plan.estimatedTime = 15;
      plan.risk = 'medium';
      break;
      
    case 'missing_package_json':
      plan.fixSteps = [
        {
          action: 'create_file',
          target: 'package.json',
          content: generatePackageJsonTemplate(skillPath),
          description: '创建package.json'
        }
      ];
      plan.estimatedTime = 3;
      plan.risk = 'low';
      break;
      
    default:
      // 通用修复方案
      plan.fixSteps = [
        {
          action: 'manual_review',
          description: `需要人工审查: ${issue.description}`,
          suggestedFix: issue.suggestedFix || 'unknown'
        }
      ];
      plan.estimatedTime = 30;
      plan.risk = 'medium';
      plan.reversible = false;
  }
  
  return plan;
}

/**
 * 风险评估
 */
function assessRisks(plans) {
  const risks = {
    low: 0,
    medium: 0,
    high: 0
  };
  
  plans.forEach(plan => {
    risks[plan.risk]++;
  });
  
  // 确定整体风险等级
  let level = 'low';
  if (risks.high > 0) {
    level = 'high';
  } else if (risks.medium > 2) {
    level = 'medium';
  } else if (risks.medium > 0) {
    level = 'low-medium';
  }
  
  return {
    level,
    breakdown: risks,
    totalPlans: plans.length,
    reversiblePlans: plans.filter(p => p.reversible).length,
    warnings: generateRiskWarnings(plans)
  };
}

/**
 * 生成风险警告
 */
function generateRiskWarnings(plans) {
  const warnings = [];
  
  const highRiskPlans = plans.filter(p => p.risk === 'high');
  if (highRiskPlans.length > 0) {
    warnings.push(`${highRiskPlans.length}个高风险修复方案需要人工审核`);
  }
  
  const irreversiblePlans = plans.filter(p => !p.reversible);
  if (irreversiblePlans.length > 0) {
    warnings.push(`${irreversiblePlans.length}个不可逆修复方案，建议备份`);
  }
  
  const longTimePlans = plans.filter(p => p.estimatedTime > 20);
  if (longTimePlans.length > 0) {
    warnings.push(`${longTimePlans.length}个修复方案预计耗时较长`);
  }
  
  return warnings;
}

/**
 * ISC规则合规性检查
 */
async function checkISCCompliance(plans, skillPath) {
  const compliance = [];
  
  for (const plan of plans) {
    const check = {
      compliant: true,
      violations: [],
      warnings: []
    };
    
    // 检查文件命名规范
    for (const step of plan.fixSteps) {
      if (step.action === 'create_file') {
        if (!isValidFileName(step.target)) {
          check.compliant = false;
          check.violations.push(`文件名不符合ISC命名规范: ${step.target}`);
        }
      }
      
      // 检查结构变更
      if (step.action === 'refactor_structure') {
        check.warnings.push('结构重构需要验证ISC结构规范');
      }
    }
    
    compliance.push(check);
  }
  
  return compliance;
}

/**
 * 验证文件名
 */
function isValidFileName(filename) {
  // ISC命名规范：kebab-case或camelCase
  const kebabCase = /^[a-z0-9]+(-[a-z0-9]+)*\.(js|md|json)$/;
  const camelCase = /^[a-z][a-zA-Z0-9]*\.(js|md|json)$/;
  
  return kebabCase.test(filename) || camelCase.test(filename);
}

/**
 * 生成回滚方案
 */
function generateRollbackPlans(plans, skillPath) {
  return plans.map(plan => {
    const rollback = {
      steps: [],
      automated: true,
      backupRequired: false
    };
    
    plan.fixSteps.forEach(step => {
      switch (step.action) {
        case 'create_file':
          rollback.steps.push({
            action: 'delete_file',
            target: step.target,
            description: `删除创建的文件: ${step.target}`
          });
          break;
          
        case 'enhance_file':
          rollback.steps.push({
            action: 'restore_from_backup',
            target: step.target,
            description: `从备份恢复: ${step.target}`
          });
          rollback.backupRequired = true;
          break;
          
        case 'refactor_structure':
          rollback.steps.push({
            action: 'restore_from_git',
            description: '从Git恢复原始结构'
          });
          rollback.automated = false;
          break;
          
        default:
          rollback.steps.push({
            action: 'manual_rollback',
            description: `需要人工回滚: ${step.description}`
          });
          rollback.automated = false;
      }
    });
    
    return rollback;
  });
}

/**
 * 生成SKILL.md模板
 */
function generateSkillMdTemplate(skillPath) {
  const skillName = path.basename(skillPath);
  
  return `---
name: ${skillName}
description: [技能描述]
version: "1.0.0"
status: active
layer: [core/infrastructure/application]
abbreviation: [缩写]
full_name: [完整名称]
chinese_name: [中文名称]
author: OpenClaw
created_at: ${new Date().toISOString().split('T')[0]}
tags: []
---

# ${skillName}

## 功能概述

[描述技能的核心功能]

## 使用方法

\`\`\`javascript
// 示例代码
\`\`\`

## API文档

### 主要函数

- \`functionName(params)\` - 函数描述

## 配置

[配置说明]

## 依赖

[依赖列表]

## 版本历史

| 版本 | 时间 | 变更 |
|:-----|:-----|:-----|
| 1.0.0 | ${new Date().toISOString().split('T')[0]} | 初始版本 |
`;
}

/**
 * 生成index.js模板
 */
function generateIndexJsTemplate() {
  return `/**
 * Skill Entry Point
 * @version 1.0.0
 */

async function execute(input) {
  // TODO: 实现技能逻辑
  console.log('Skill executed with input:', input);
  
  return {
    success: true,
    result: 'Implementation needed'
  };
}

module.exports = {
  execute
};
`;
}

/**
 * 生成package.json模板
 */
function generatePackageJsonTemplate(skillPath) {
  const skillName = path.basename(skillPath);
  
  return JSON.stringify({
    name: skillName,
    version: "1.0.0",
    description: "Skill description",
    main: "index.js",
    scripts: {
      test: "echo \"Error: no test specified\" && exit 1"
    },
    keywords: [],
    author: "OpenClaw",
    license: "MIT"
  }, null, 2);
}

/**
 * 保存优化方案
 */
async function saveOptimizationPlan(report) {
  const plansDir = path.join('/root/.openclaw/workspace/reports/seef-optimization-plans');
  
  if (!fs.existsSync(plansDir)) {
    fs.mkdirSync(plansDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${report.skillId}-${timestamp}.json`;
  const filepath = path.join(plansDir, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  
  console.log(`[SEEF Optimizer] 优化方案已保存: ${filepath}`);
}

// CLI支持
if (require.main === module) {
  const args = process.argv.slice(2);
  const inputJson = args[0];
  
  if (!inputJson) {
    console.error('Usage: node index.js <input-json>');
    console.error('Example: node index.js \'{"skillId":"test-skill","skillPath":"skills/test-skill","issues":[...],"source":"evaluator"}\'');
    process.exit(1);
  }
  
  const input = JSON.parse(inputJson);
  
  optimize(input)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Optimization failed:', error);
      process.exit(1);
    });
}

module.exports = {
  optimize
};
