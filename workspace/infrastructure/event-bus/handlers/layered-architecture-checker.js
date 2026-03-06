'use strict';

/**
 * 自主执行器：分层解耦架构检查
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 设计产出 → 检查三层归属（感知/认知/执行） → 检查事件总线解耦 → 不清晰则打回
 */

const fs = require('fs');
const path = require('path');

const THREE_LAYERS = {
  perception: {
    name: '感知层',
    question: '谁在观察？用什么探针？',
    keywords: ['trigger', 'detect', 'monitor', 'observe', 'watch', 'scan', 'listen',
               '触发', '检测', '监控', '观察', '扫描', '探针', 'sensor', 'probe'],
  },
  cognition: {
    name: '认知层',
    question: '谁在判断？用什么引擎？',
    keywords: ['condition', 'judge', 'evaluate', 'decide', 'classify', 'analyze', 'check',
               '条件', '判断', '评估', '决策', '分类', '分析', '引擎', 'engine'],
  },
  execution: {
    name: '执行层',
    question: '谁在行动？调用什么技能？',
    keywords: ['action', 'execute', 'handler', 'skill', 'invoke', 'run', 'perform',
               '执行', '行动', 'handler', '技能', '调用', '运行'],
  },
};

function checkLayerAttribution(content) {
  const results = {};
  for (const [layer, config] of Object.entries(THREE_LAYERS)) {
    const found = config.keywords.some(kw =>
      content.toLowerCase().includes(kw.toLowerCase())
    );
    results[layer] = {
      name: config.name,
      found,
      question: config.question,
    };
  }
  return results;
}

function checkDecoupling(content) {
  const decouplingIndicators = [
    /event[-_]?bus/i,
    /事件总线/,
    /emit\s*\(/,
    /publish.*subscribe/i,
    /发布.*订阅/,
    /解耦/,
    /decouple/i,
    /message[-_]?queue/i,
  ];

  const couplingAntiPatterns = [
    /require\s*\(['"]\.\.\/.*handler/i,  // 直接引用handler
    /直接调用/,
    /direct.*call/i,
  ];

  const hasDecoupling = decouplingIndicators.some(p => p.test(content));
  const hasCoupling = couplingAntiPatterns.some(p => p.test(content));

  return { hasDecoupling, hasCoupling };
}

module.exports = async function(event, rule, context) {
  const payload = event.payload || event.data || {};
  const filePath = payload.file_path || payload.path || '';
  let content = payload.content || '';

  // 如果有文件路径，尝试读取内容
  if (filePath && !content) {
    const WORKSPACE = '/root/.openclaw/workspace';
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(WORKSPACE, filePath);
    if (fs.existsSync(fullPath)) {
      try { content = fs.readFileSync(fullPath, 'utf8'); } catch { /* skip */ }
    }
  }

  if (!content) {
    return { status: 'skip', reason: '无内容可检查' };
  }

  // 检查三层归属
  const layerResults = checkLayerAttribution(content);
  const missingLayers = Object.entries(layerResults)
    .filter(([, v]) => !v.found)
    .map(([k, v]) => ({ layer: k, ...v }));

  // 检查解耦
  const decoupling = checkDecoupling(content);

  const issues = [];
  for (const missing of missingLayers) {
    issues.push(`❌ ${missing.name}归属不清晰 — ${missing.question}`);
  }
  if (decoupling.hasCoupling) {
    issues.push('❌ 检测到直接耦合模式，三层应通过事件总线解耦');
  }
  if (!decoupling.hasDecoupling && missingLayers.length === 0) {
    issues.push('⚠️ 未检测到明确的解耦机制（事件总线/发布订阅）');
  }

  if (issues.length > 0 && missingLayers.length > 0) {
    const msg = [
      `🏗️ **分层解耦架构检查**`,
      `文件: \`${filePath || '(inline)'}\``,
      '',
      ...issues,
      '',
      '请补充缺失层归属后重新提交',
    ].join('\n');
    if (context?.notify) context.notify('feishu', msg, { severity: 'high' });

    return {
      status: 'blocked',
      missing_layers: missingLayers.map(l => l.layer),
      issues,
      message: '分层归属不完整，打回补充',
    };
  }

  return {
    status: 'pass',
    layers: layerResults,
    decoupling: decoupling.hasDecoupling,
    message: '三层归属完整，解耦检查通过',
  };
};
