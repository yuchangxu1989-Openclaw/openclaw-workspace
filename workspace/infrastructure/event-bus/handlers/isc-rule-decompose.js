const fs = require('fs');
const path = require('path');
const { exists, readText, readJson } = require('./_p0_utils');

/**
 * 规则创建后自动拆解
 * 感知：isc.rule.created
 * 执行：拆解事件绑定、DTO关联、三层归属验证，输出对齐矩阵
 */
module.exports = async function(event, rule, context) {
  const workspace = (context && context.workspace) || '/root/.openclaw/workspace';
  const logger = context.logger;
  const bus = context.bus;

  logger.info('[isc-rule-decompose] 启动规则拆解分析');

  try {
    // 获取新创建的规则路径
    const rulePath = event.rulePath || event.payload?.rulePath || event.path;
    if (!rulePath || !exists(rulePath)) {
      logger.warn('[isc-rule-decompose] 规则文件不存在:', rulePath);
      return { status: 'skipped', reason: 'rule_file_not_found' };
    }

    const ruleData = readJson(rulePath);
    const ruleName = path.basename(rulePath);
    let modified = false;
    const issues = [];
    const fixes = [];

    logger.info(`[isc-rule-decompose] 拆解规则: ${ruleName}`);

    // 1. 检查trigger.events是否存在
    if (!ruleData.trigger) {
      ruleData.trigger = {};
      issues.push('缺少trigger配置');
    }
    if (!ruleData.trigger.events || !Array.isArray(ruleData.trigger.events) || ruleData.trigger.events.length === 0) {
      // 尝试从domain推断事件
      const domain = ruleData.domain || 'general';
      const name = ruleData.name || 'unknown';
      ruleData.trigger.events = [`${domain}.${name}.triggered`];
      issues.push('缺少trigger.events');
      fixes.push(`自动补全trigger.events: ["${domain}.${name}.triggered"]`);
      modified = true;
    }

    // 2. 检查action是否存在
    if (!ruleData.action) {
      ruleData.action = {};
      issues.push('缺少action配置');
    }
    if (!ruleData.action.handler) {
      const handlerName = ruleName.replace('rule.', '').replace('.json', '') + '.js';
      ruleData.action.handler = handlerName;
      issues.push('缺少action.handler');
      fixes.push(`自动补全action.handler: ${handlerName}`);
      modified = true;
    }
    if (!ruleData.action.type) {
      ruleData.action.type = 'handler';
      fixes.push('自动补全action.type: handler');
      modified = true;
    }

    // 3. 三层归属验证（感知/认知/执行）
    if (!ruleData.layers) {
      ruleData.layers = {};
      issues.push('缺少layers（三层归属）配置');
    }

    const layerDefaults = {
      perception: {
        description: '事件感知层',
        events: ruleData.trigger?.events || [],
        source: 'event-bus'
      },
      cognition: {
        description: '规则认知层',
        evaluation: ruleData.type || 'enforcement',
        conditions: ruleData.conditions || []
      },
      execution: {
        description: '动作执行层',
        handler: ruleData.action?.handler || 'unknown',
        output_events: []
      }
    };

    for (const [layer, defaults] of Object.entries(layerDefaults)) {
      if (!ruleData.layers[layer]) {
        ruleData.layers[layer] = defaults;
        issues.push(`缺少layers.${layer}`);
        fixes.push(`自动补全layers.${layer}`);
        modified = true;
      }
    }

    // 写回修复后的规则
    if (modified) {
      fs.writeFileSync(rulePath, JSON.stringify(ruleData, null, 2), 'utf-8');
      logger.info(`[isc-rule-decompose] 已修复规则: ${rulePath}`, fixes);
    }

    // 4. 生成对齐矩阵
    const matrix = {
      timestamp: new Date().toISOString(),
      rule: ruleName,
      ruleId: ruleData.id || ruleName,
      decomposition: {
        perception: {
          events: ruleData.trigger?.events || [],
          status: (ruleData.trigger?.events?.length > 0) ? '✅' : '❌'
        },
        cognition: {
          type: ruleData.type || 'unknown',
          conditions: ruleData.conditions ? '✅' : '⚠️ 无显式条件',
          governance: ruleData.governance ? '✅' : '❌'
        },
        execution: {
          handler: ruleData.action?.handler || 'unknown',
          handlerExists: '待验证',
          outputEvents: ruleData.layers?.execution?.output_events || []
        }
      },
      issues,
      fixes,
      completeness: issues.length === 0 ? '100%' : `${Math.round(((7 - issues.length) / 7) * 100)}%`
    };

    // 验证handler文件是否存在
    const handlerPath = path.join(path.dirname(__filename || __dirname), ruleData.action?.handler || '');
    if (ruleData.action?.handler && exists(handlerPath)) {
      matrix.decomposition.execution.handlerExists = '✅';
    } else {
      matrix.decomposition.execution.handlerExists = '❌ 不存在';
    }

    // 写入对齐矩阵报告
    const reportsDir = path.join(workspace, 'infrastructure', 'event-bus', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const matrixPath = path.join(reportsDir, `rule-decompose-${ruleName.replace('.json', '')}-${Date.now()}.json`);
    fs.writeFileSync(matrixPath, JSON.stringify(matrix, null, 2), 'utf-8');
    logger.info(`[isc-rule-decompose] 对齐矩阵已写入: ${matrixPath}`);

    bus.emit('isc.rule.decomposed', {
      rulePath,
      ruleName,
      matrixPath,
      issues: issues.length,
      fixes: fixes.length,
      completeness: matrix.completeness
    });

    return {
      status: 'completed',
      ruleName,
      matrixPath,
      issues: issues.length,
      fixes: fixes.length,
      completeness: matrix.completeness,
      matrix
    };
  } catch (err) {
    logger.error('[isc-rule-decompose] 执行失败:', err.message);
    bus.emit('isc.rule.decompose.failed', { error: err.message });
    throw err;
  }
};
