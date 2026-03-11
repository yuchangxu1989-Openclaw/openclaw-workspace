#!/usr/bin/env node
/**
 * v4-field-filler.js
 * 批量补齐 golden test cases 的 V4 字段：
 *   scoring_rubric, north_star_indicator, gate_relevance, process_indicators, layer
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'tests', 'benchmarks', 'intent', 'c2-golden');

// ─── 映射表 ───

// category → layer 映射
const CATEGORY_LAYER_MAP = {
  '纠偏类':       '意图',
  '认知错误类':   '意图',
  '自主性缺失类': '规划',
  '全局未对齐类': '规划',
  '交付质量类':   '执行',
  '头痛医头类':   '验真',
  '反复未果类':   '验真',
  '连锁跷跷板类': '事件',
};

// north_star_indicator → process_indicators 映射
const NORTH_STAR_PROCESS_MAP = {
  '自主闭环率': [
    '任务自动创建率',
    '子Agent委派率',
    '用户催促次数',
    '端到端无人工干预完成率',
  ],
  '根因分析覆盖率': [
    '四层根因分析完整率',
    '根因→修复→防护闭环率',
    '同类问题复发率',
    'Badcase记录率',
  ],
  '言出法随达成率': [
    '承诺→交付匹配率',
    '交付时效达标率',
    '遗漏任务数',
    '用户满意确认率',
  ],
  '认知层真实代码覆盖率': [
    'ISC规则全链路完整率',
    '规则→代码映射覆盖率',
    '空壳规则检出率',
    '规则实际触发率',
  ],
  '独立QA覆盖率': [
    '质量门禁通过率',
    '独立验证执行率',
    '回归测试覆盖率',
    'commit→验真闭环率',
  ],
};

// gate → gate_relevance 映射
const GATE_RELEVANCE_MAP = {
  'Gate-A': {
    gate_id: 'Gate-A',
    gate_name: '意图-规划门禁',
    description: '验证意图理解正确性和规划合理性，确保任务分解与用户真实需求对齐',
    checkpoints: ['意图分类准确', '任务分解完整', '优先级排序合理', '委派对象正确'],
  },
  'Gate-B': {
    gate_id: 'Gate-B',
    gate_name: '执行-验真门禁',
    description: '验证执行质量和结果真实性，确保交付物符合预期且经过独立验证',
    checkpoints: ['代码实际生效', '测试通过', '无回归', '独立QA确认'],
  },
};

// category → scoring_dimensions 模板
const SCORING_DIMS_BY_CATEGORY = {
  '纠偏类': [
    { dimension: '意图理解', weight: 0.3, pass: '准确识别用户纠偏意图，理解"为什么"背后的根因分析需求', partial: '识别了纠偏但未深入理解根因需求', fail: '误解为普通指令，未识别纠偏信号' },
    { dimension: '行为修正', weight: 0.3, pass: '立即修正行为+建立防护规则+记录Badcase', partial: '修正了行为但未建防护', fail: '口头承认但行为未变' },
    { dimension: '长效固化', weight: 0.2, pass: 'ISC规则+MEMORY规则+cron守卫三重固化', partial: '部分固化', fail: '无任何固化措施' },
    { dimension: '自主闭环', weight: 0.2, pass: '全程自动完成无需用户催促', partial: '部分步骤需催促', fail: '多步等待用户推动' },
  ],
  '认知错误类': [
    { dimension: '错误识别', weight: 0.3, pass: '精确定位认知偏差类型和来源', partial: '识别了错误但归因不准', fail: '未识别认知错误' },
    { dimension: '根因分析', weight: 0.3, pass: '四层根因分析完整（代码/规则/认知/架构）', partial: '有分析但不完整', fail: '跳过根因' },
    { dimension: '修复验证', weight: 0.2, pass: '修复+防护+验真三步闭环', partial: '修复了但未验证', fail: '只改症状' },
    { dimension: '知识更新', weight: 0.2, pass: '更新认知模型+记录经验', partial: '部分更新', fail: '无知识沉淀' },
  ],
  '自主性缺失类': [
    { dimension: '自主决策', weight: 0.3, pass: '无需用户催促，主动发现问题并创建任务', partial: '发现问题但等待用户确认', fail: '完全被动等待指令' },
    { dimension: '任务委派', weight: 0.3, pass: '正确委派给子Agent，自己只做调度', partial: '委派了但自己也动手', fail: '全部自己做' },
    { dimension: '闭环跟踪', weight: 0.2, pass: '自动跟踪任务状态直到完成', partial: '跟踪但有遗漏', fail: '派出后不管' },
    { dimension: '主动汇报', weight: 0.2, pass: '关键节点主动汇报进展', partial: '被问才汇报', fail: '不汇报' },
  ],
  '全局未对齐类': [
    { dimension: '全局视角', weight: 0.3, pass: '从系统全局角度分析问题，识别跨模块影响', partial: '局部分析正确但缺全局视角', fail: '只看局部' },
    { dimension: '对齐检查', weight: 0.3, pass: '检查所有相关组件的一致性', partial: '部分检查', fail: '未做对齐检查' },
    { dimension: '协调修复', weight: 0.2, pass: '协调多个子Agent同步修复', partial: '串行修复有遗漏', fail: '只修一处' },
    { dimension: '回归验证', weight: 0.2, pass: '修复后全链路回归测试', partial: '部分回归', fail: '无回归测试' },
  ],
  '交付质量类': [
    { dimension: '交付完整性', weight: 0.3, pass: '所有承诺项全部交付且可验证', partial: '大部分交付但有遗漏', fail: '关键项缺失' },
    { dimension: '质量验证', weight: 0.3, pass: '独立QA验证通过+端到端测试', partial: '有验证但不充分', fail: '未验证就报完成' },
    { dimension: '代码质量', weight: 0.2, pass: '代码实际生效+无回归+有测试', partial: '代码写了但未充分测试', fail: '空壳代码或未生效' },
    { dimension: '文档同步', weight: 0.2, pass: '文档与代码同步更新', partial: '部分同步', fail: '文档过时' },
  ],
  '头痛医头类': [
    { dimension: '根因定位', weight: 0.35, pass: '四层根因分析完整，精确到文件+行号+原因', partial: '有根因分析但不精确', fail: '跳过根因直接改症状' },
    { dimension: '修复有效性', weight: 0.3, pass: '针对根因修复+建防护措施+验真通过', partial: '修复了根因但未建防护', fail: '只改症状未触及根因' },
    { dimension: '防复发', weight: 0.2, pass: '建立自动化防护（ISC/cron/hook）', partial: '有防护但不自动化', fail: '无防护措施' },
    { dimension: '经验沉淀', weight: 0.15, pass: '记录Badcase+更新规则库', partial: '部分记录', fail: '无记录' },
  ],
  '反复未果类': [
    { dimension: '历史追溯', weight: 0.3, pass: '追溯所有历史尝试，分析每次失败原因', partial: '部分追溯', fail: '不看历史重复尝试' },
    { dimension: '策略升级', weight: 0.3, pass: '采用全新策略而非重复旧方法', partial: '有调整但本质相同', fail: '完全重复旧方法' },
    { dimension: '根治方案', weight: 0.25, pass: '从架构层面根治+自动化防护', partial: '修复了但未根治', fail: '又是临时补丁' },
    { dimension: '验证闭环', weight: 0.15, pass: '验证新方案确实解决了历史问题', partial: '部分验证', fail: '未验证' },
  ],
  '连锁跷跷板类': [
    { dimension: '影响分析', weight: 0.3, pass: '修复前分析所有可能的连锁影响', partial: '分析了部分影响', fail: '未做影响分析' },
    { dimension: '原子修复', weight: 0.3, pass: '修复方案不引入新问题，原子性操作', partial: '修复了但有轻微副作用', fail: '修A坏B' },
    { dimension: '全链路测试', weight: 0.25, pass: '修复后全链路回归测试通过', partial: '部分测试', fail: '未测试' },
    { dimension: '监控建立', weight: 0.15, pass: '建立连锁影响监控告警', partial: '部分监控', fail: '无监控' },
  ],
};

// ─── 核心逻辑 ───

function buildScoringRubric(c) {
  const sr = c.scoring_rubric;
  // 已经是正常V4对象
  if (sr && typeof sr === 'object' && sr.version === 'V4' && sr.primary_metrics) {
    return sr;
  }

  // 提取原始文本（用于pass_criteria）
  let rawText = '';
  if (typeof sr === 'string') {
    rawText = sr;
  } else if (sr && typeof sr === 'object' && !sr.version) {
    // bad object (numeric keys = spread string, or {0:pass,1:partial,2:fail})
    const keys = Object.keys(sr);
    if (keys.length <= 5) {
      rawText = Object.values(sr).join('\n');
    } else {
      rawText = keys.map(k => sr[k]).join('');
    }
  }

  const cat = c.category || '交付质量类';
  const dims = SCORING_DIMS_BY_CATEGORY[cat] || SCORING_DIMS_BY_CATEGORY['交付质量类'];
  const ns = c.north_star_indicator || '自主闭环率';

  return {
    version: 'V4',
    primary_metrics: [ns, ...getPrimaryMetrics(cat, ns)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3),
    pass_criteria: rawText
      ? rawText.replace(/^系统应执行:\s*/, '').slice(0, 200)
      : c.expected_output || c.expected_behavior || '完整执行链自动完成，expected_behavior全部满足',
    partial_criteria: '执行链部分完成，核心行为正确但有遗漏',
    fail_criteria: c.actual_behavior
      ? `出现类似问题: ${c.actual_behavior.slice(0, 100)}`
      : 'actual_behavior中描述的问题未解决或复现',
    scoring_dimensions: dims,
  };
}

function getPrimaryMetrics(category, northStar) {
  const map = {
    '纠偏类': ['根因分析覆盖率'],
    '认知错误类': ['认知层真实代码覆盖率'],
    '自主性缺失类': ['自主闭环率'],
    '全局未对齐类': ['认知层真实代码覆盖率'],
    '交付质量类': ['独立QA覆盖率'],
    '头痛医头类': ['根因分析覆盖率'],
    '反复未果类': ['根因分析覆盖率'],
    '连锁跷跷板类': ['独立QA覆盖率'],
  };
  return map[category] || ['自主闭环率'];
}

function inferLayer(c) {
  if (c.layer) return c.layer;
  // 优先用category映射
  if (c.category && CATEGORY_LAYER_MAP[c.category]) {
    return CATEGORY_LAYER_MAP[c.category];
  }
  // fallback: 从context/input关键词推断
  const text = `${c.input || ''} ${c.context || ''} ${c.expected_output || ''}`;
  if (/意图|理解|识别|分类|纠偏/.test(text)) return '意图';
  if (/事件|触发|信号|hook|cron/.test(text)) return '事件';
  if (/规划|分解|调度|委派|dispatch/.test(text)) return '规划';
  if (/执行|代码|修复|实现|写/.test(text)) return '执行';
  if (/验证|验真|测试|QA|审计/.test(text)) return '验真';
  return '执行'; // 默认
}

function buildGateRelevance(c) {
  if (c.gate_relevance) return c.gate_relevance;
  const gate = c.gate || 'Gate-A';
  return GATE_RELEVANCE_MAP[gate] || GATE_RELEVANCE_MAP['Gate-A'];
}

function buildProcessIndicators(c) {
  if (c.process_indicators && Array.isArray(c.process_indicators) && c.process_indicators.length > 0) {
    return c.process_indicators;
  }
  const ns = c.north_star_indicator || '自主闭环率';
  return NORTH_STAR_PROCESS_MAP[ns] || NORTH_STAR_PROCESS_MAP['自主闭环率'];
}

// ─── 主流程 ───

function main() {
  const files = fs.readdirSync(DIR).filter(f => f.startsWith('mined-') && f.endsWith('.json'));
  let totalCases = 0, modified = 0, filesModified = 0;
  const stats = { scoring_rubric: 0, gate_relevance: 0, process_indicators: 0, layer: 0 };

  for (const fname of files) {
    const fpath = path.join(DIR, fname);
    const raw = fs.readFileSync(fpath, 'utf8');
    let data;
    try { data = JSON.parse(raw); } catch (e) { console.error(`SKIP parse error: ${fname}`); continue; }

    const cases = Array.isArray(data) ? data : [data];
    let fileChanged = false;

    for (const c of cases) {
      totalCases++;
      let changed = false;

      // 1. scoring_rubric — 修复非V4格式
      const oldRubric = c.scoring_rubric;
      const isProperV4 = oldRubric && typeof oldRubric === 'object' && oldRubric.version === 'V4' && oldRubric.primary_metrics;
      if (!isProperV4) {
        c.scoring_rubric = buildScoringRubric(c);
        stats.scoring_rubric++;
        changed = true;
      }

      // 2. gate_relevance
      if (!c.gate_relevance) {
        c.gate_relevance = buildGateRelevance(c);
        stats.gate_relevance++;
        changed = true;
      }

      // 3. process_indicators
      if (!c.process_indicators || !Array.isArray(c.process_indicators) || c.process_indicators.length === 0) {
        c.process_indicators = buildProcessIndicators(c);
        stats.process_indicators++;
        changed = true;
      }

      // 4. layer
      if (!c.layer) {
        c.layer = inferLayer(c);
        stats.layer++;
        changed = true;
      }

      // 5. north_star_indicator — 已100%覆盖，但确保存在
      if (!c.north_star_indicator) {
        c.north_star_indicator = '自主闭环率';
        changed = true;
      }

      if (changed) { modified++; fileChanged = true; }
    }

    if (fileChanged) {
      const output = Array.isArray(data) ? data : data;
      fs.writeFileSync(fpath, JSON.stringify(output, null, 2) + '\n', 'utf8');
      filesModified++;
    }
  }

  console.log('=== V4字段补齐完成 ===');
  console.log(`文件: ${files.length} 个, 修改: ${filesModified} 个`);
  console.log(`Case: ${totalCases} 个, 补齐: ${modified} 个`);
  console.log(`字段补齐统计:`);
  console.log(`  scoring_rubric (修复): ${stats.scoring_rubric}`);
  console.log(`  gate_relevance (新增): ${stats.gate_relevance}`);
  console.log(`  process_indicators (新增): ${stats.process_indicators}`);
  console.log(`  layer (新增): ${stats.layer}`);
}

main();
