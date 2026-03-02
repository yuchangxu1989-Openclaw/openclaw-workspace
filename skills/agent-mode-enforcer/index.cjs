#!/usr/bin/env node
/**
 * Agent Mode Enforcer - 强制Agent模式决策器
 * 防止主Agent违规使用单Agent处理复杂任务
 * @version 1.0.0
 * @since 2026-02-27
 * @priority CRITICAL
 */

const fs = require('fs');
const path = require('path');

// 强制多Agent触发条件（来自SOUL.md规则M001）
const MULTI_AGENT_TRIGGERS = {
  // 代码相关
  code: {
    patterns: [
      /编写|开发|实现|创建|修正|修复|重构|优化.*代码/i,
      /生成.*脚本|脚本.*生成/i,
      /代码.*审查|审查.*代码/i,
      /\.js$|\.ts$|\.py$|\.sh$|\.cjs$/i
    ],
    weight: 1.0
  },
  // 架构相关
  architecture: {
    patterns: [
      /架构.*设计|设计.*架构/i,
      /系统.*设计|设计.*系统/i,
      /标准.*制定|制定.*标准/i,
      /流程.*设计|设计.*流程/i
    ],
    weight: 1.0
  },
  // 标准相关
  standards: {
    patterns: [
      /ISC.*规则|规则.*ISC/i,
      /安全.*标准|标准.*安全/i,
      /准出.*标准|准入.*标准/i,
      /规范.*制定/i
    ],
    weight: 1.0
  },
  // 复杂分析
  analysis: {
    patterns: [
      /复杂.*分析|多维度.*评估/i,
      /评测|评估.*报告/i,
      /调研.*报告|报告.*调研/i
    ],
    weight: 0.8
  }
};

// 豁免声明（单Agent允许）
const SINGLE_AGENT_EXEMPTIONS = {
  // 纯对话场景
  conversation: {
    patterns: [
      /^在\.等待指令$/i,
      /^收到$/i,
      /^了解$/i,
      /^确认$/i,
      /^有什么需要处理的吗[?？]$/i,
      /^HEARTBEAT_OK$/i
    ]
  },
  // 用户明确豁免
  explicit: {
    patterns: [
      /【豁免.*单Agent】/i,
      /【对话.*场景】/i,
      /明确.*单Agent|单Agent.*明确/i
    ]
  }
};

/**
 * 分析任务是否需要多Agent
 */
function analyzeTask(taskDescription) {
  let multiAgentScore = 0;
  let matchedTriggers = [];

  // 检查多Agent触发条件
  for (const [category, config] of Object.entries(MULTI_AGENT_TRIGGERS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(taskDescription)) {
        multiAgentScore += config.weight;
        matchedTriggers.push(category);
        break;
      }
    }
  }

  // 检查豁免条件
  for (const [category, config] of Object.entries(SINGLE_AGENT_EXEMPTIONS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(taskDescription)) {
        return {
          mode: 'single',
          reason: `豁免: ${category}`,
          confidence: 1.0
        };
      }
    }
  }

  // 决策
  if (multiAgentScore >= 0.8) {
    return {
      mode: 'multi',
      reason: `触发多Agent条件: ${[...new Set(matchedTriggers)].join(', ')}`,
      confidence: Math.min(multiAgentScore, 1.0),
      requiredAgents: Math.max(3, Math.ceil(multiAgentScore * 3))
    };
  }

  return {
    mode: 'single',
    reason: '未触发多Agent条件',
    confidence: 1 - multiAgentScore
  };
}

/**
 * 强制检查点 - 必须在每次任务前调用
 */
function enforceCheck(taskDescription, context = {}) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔒 Agent Mode Enforcer - 强制检查');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const decision = analyzeTask(taskDescription);
  
  console.log(`任务: ${taskDescription.substring(0, 100)}...`);
  console.log(`决策: ${decision.mode === 'multi' ? '🔴 强制多Agent' : '🟢 允许单Agent'}`);
  console.log(`原因: ${decision.reason}`);
  console.log(`置信度: ${(decision.confidence * 100).toFixed(1)}%`);
  
  if (decision.mode === 'multi') {
    console.log(`需要Agent数: ${decision.requiredAgents}+`);
    console.log('');
    console.log('❌ 禁止单Agent执行！');
    console.log('✅ 必须spawn子Agent（GLM-5）处理后台任务');
    console.log('✅ 主Agent（Kimi）保持飞书通道响应');
    console.log('');
    console.log('违规后果：触发Council of Seven审议');
    
    // 记录违规日志
    logViolation(taskDescription, context);
    
    return {
      allowed: false,
      mode: 'multi',
      mustSpawn: true,
      error: '此任务必须使用多Agent模式！请使用 sessions_spawn 调用子Agent。'
    };
  }
  
  console.log('');
  console.log('✅ 检查通过');
  
  return {
    allowed: true,
    mode: 'single'
  };
}

/**
 * 记录违规日志
 */
function logViolation(taskDescription, context) {
  const logDir = '/root/.openclaw/workspace/logs/agent-enforcer';
  fs.mkdirSync(logDir, { recursive: true });
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    task: taskDescription.substring(0, 200),
    context,
    violation: 'Attempted single-agent execution for multi-agent task'
  };
  
  const logFile = path.join(logDir, `violations-${new Date().toISOString().split('T')[0]}.jsonl`);
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
}

/**
 * 生成豁免声明
 */
function generateExemption(taskType) {
  return `【豁免声明】本任务为${taskType}，使用单Agent kimi-coding`;
}

// 主入口
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Agent Mode Enforcer - 强制Agent模式决策器

用法:
  node agent-mode-enforcer.js "任务描述"

选项:
  --help, -h      显示帮助信息
  --exemption     生成豁免声明

示例:
  node agent-mode-enforcer.js "编写ISC安全规则"
  node agent-mode-enforcer.js --exemption "对话场景"

退出码:
  0 - 允许单Agent
  1 - 强制多Agent（违规）
`);
    process.exit(0);
  }
  
  if (args.includes('--exemption')) {
    const type = args[args.indexOf('--exemption') + 1] || '对话';
    console.log(generateExemption(type));
    process.exit(0);
  }
  
  const taskDescription = args.join(' ');
  if (!taskDescription) {
    console.error('❌ 请提供任务描述');
    process.exit(1);
  }
  
  const result = enforceCheck(taskDescription);
  process.exit(result.allowed ? 0 : 1);
}

module.exports = { analyzeTask, enforceCheck, generateExemption };
