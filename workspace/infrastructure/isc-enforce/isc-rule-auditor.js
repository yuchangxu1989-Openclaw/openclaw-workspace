#!/usr/bin/env node
/**
 * ISC规则五层展开 + V4审计器 v2.1
 * 
 * 审计维度A - IEPEV五层展开：
 *   1. Intent（意图）  2. Event（事件）  3. Planning（规划）
 *   4. Execution（执行）  5. Verification（验真）
 *
 * 审计维度B - V4五字段：
 *   1. scoring_rubric — Pass/Partial/Badcase三级判定
 *   2. north_star_indicator — 映射北极星指标
 *   3. gate_relevance — 关联Gate门禁
 *   4. process_indicators — 映射过程指标子项
 *   5. layer — 声明层/行为层
 */

const fs = require('fs');
const path = require('path');

const RULES_DIR = path.resolve(__dirname, '../../skills/isc-core/rules');
const HOOKS_DIR = path.resolve(__dirname, '../../scripts/isc-hooks');
const HANDLERS_DIR = path.resolve(__dirname, '../../skills/isc-core/handlers');
const REPORT_DIR = path.resolve(__dirname, '../../reports');
const WORKSPACE = path.resolve(__dirname, '../..');

const IEPEV = ['intent', 'event', 'planning', 'execution', 'verification'];
const IEPEV_LABELS = {
  intent: 'I-意图', event: 'E-事件', planning: 'P-规划',
  execution: 'X-执行', verification: 'V-验真'
};

const V4_FIELDS = ['scoring_rubric', 'north_star_indicator', 'gate_relevance', 'process_indicators', 'layer'];
const V4_LABELS = {
  scoring_rubric: 'SR-判定标准', north_star_indicator: 'NS-北极星',
  gate_relevance: 'GR-Gate门禁', process_indicators: 'PI-过程指标', layer: 'LY-层级'
};

const VALID_NORTH_STARS = ['言出法随', '自主闭环', '认知代码覆盖', '独立QA', '根因分析'];
const VALID_GATES = ['Pre-Gate', 'Gate-A', 'Gate-B', '无', 'none'];
const VALID_LAYERS = ['声明层', '行为层', 'declaration', 'behavior'];

class ISCRuleAuditor {
  constructor() {
    this.rules = [];
    this.stats = {
      total: 0,
      // IEPEV stats
      iepev_full: 0, iepev_partial: 0, iepev_shell: 0,
      iepev_coverage: { intent: 0, event: 0, planning: 0, execution: 0, verification: 0 },
      chainBroken: 0,
      // V4 stats
      v4_full: 0, v4_partial: 0, v4_missing: 0,
      v4_coverage: { scoring_rubric: 0, north_star_indicator: 0, gate_relevance: 0, process_indicators: 0, layer: 0 },
      // Combined
      fully_compliant: 0  // IEPEV 5/5 + V4 5/5
    };
  }

  resolveHandler(ref) {
    if (!ref) return null;
    return [
      path.resolve(WORKSPACE, ref),
      path.resolve(HOOKS_DIR, path.basename(ref)),
      path.resolve(HANDLERS_DIR, path.basename(ref)),
    ].find(p => fs.existsSync(p)) || null;
  }

  auditIEPEV(rule) {
    const r = {};
    // Intent
    r.intent = { present: !!(rule.iepev?.intent || (rule.description && (rule.type || rule.domain))) };
    // Event
    r.event = { present: !!(rule.iepev?.event || rule.trigger?.event || rule.trigger?.events) };
    // Planning
    r.planning = { present: !!(rule.iepev?.planning || rule.constraint?.criteria || rule.action?.checks) };
    // Execution
    const href = rule.handler || rule.action?.script;
    r.execution = { present: !!this.resolveHandler(href) };
    // Verification
    r.verification = { present: !!(rule.iepev?.verification || rule.verification || rule.action?.on_failure) };
    return r;
  }

  auditV4(rule) {
    const r = {};
    const v4 = rule.v4 || {};

    // scoring_rubric: 需要有pass/partial/badcase
    const sr = v4.scoring_rubric || rule.scoring_rubric;
    r.scoring_rubric = { present: !!(sr && (sr.pass || sr.Pass)), valid: !!(sr && sr.pass && sr.partial && sr.badcase) };

    // north_star_indicator: 必须是5个之一
    const ns = v4.north_star_indicator || rule.north_star_indicator;
    const nsVal = Array.isArray(ns) ? ns : (ns ? [ns] : []);
    r.north_star_indicator = { present: nsVal.length > 0, valid: nsVal.every(n => VALID_NORTH_STARS.includes(n)), value: nsVal };

    // gate_relevance
    const gr = v4.gate_relevance || rule.gate_relevance;
    r.gate_relevance = { present: !!gr, valid: VALID_GATES.includes(gr), value: gr };

    // process_indicators
    const pi = v4.process_indicators || rule.process_indicators;
    r.process_indicators = { present: !!(pi && (Array.isArray(pi) ? pi.length > 0 : Object.keys(pi).length > 0)) };

    // layer
    const ly = v4.layer || rule.layer;
    r.layer = { present: !!ly, valid: VALID_LAYERS.includes(ly), value: ly };

    return r;
  }

  checkChain(layers) {
    const present = IEPEV.map(l => layers[l].present);
    const first = present.indexOf(true), last = present.lastIndexOf(true);
    if (first === -1) return { continuous: false, breaks: [...IEPEV] };
    const breaks = [];
    for (let i = first; i <= last; i++) if (!present[i]) breaks.push(IEPEV[i]);
    return { continuous: breaks.length === 0, breaks };
  }

  run() {
    const files = fs.readdirSync(RULES_DIR).filter(f => f.startsWith('rule.') && f.endsWith('.json'));

    for (const file of files) {
      let rule;
      try { rule = JSON.parse(fs.readFileSync(path.join(RULES_DIR, file), 'utf8')); }
      catch (e) { this.rules.push({ file, error: e.message }); continue; }

      this.stats.total++;
      const ruleId = rule.id || file;
      const iepev = this.auditIEPEV(rule);
      const v4 = this.auditV4(rule);
      const chain = this.checkChain(iepev);

      const iepevCount = IEPEV.filter(l => iepev[l].present).length;
      const v4Count = V4_FIELDS.filter(f => v4[f].present).length;

      // IEPEV stats
      for (const l of IEPEV) if (iepev[l].present) this.stats.iepev_coverage[l]++;
      if (iepevCount === 5) this.stats.iepev_full++;
      else if (iepevCount <= 1) this.stats.iepev_shell++;
      else this.stats.iepev_partial++;
      if (!chain.continuous) this.stats.chainBroken++;

      // V4 stats
      for (const f of V4_FIELDS) if (v4[f].present) this.stats.v4_coverage[f]++;
      if (v4Count === 5) this.stats.v4_full++;
      else if (v4Count === 0) this.stats.v4_missing++;
      else this.stats.v4_partial++;

      if (iepevCount === 5 && v4Count === 5) this.stats.fully_compliant++;

      const iepevGrade = iepevCount === 5 ? '✅' : iepevCount >= 3 ? '⚠️' : iepevCount >= 1 ? '🟡' : '🔴';
      const v4Grade = v4Count === 5 ? '✅' : v4Count >= 3 ? '⚠️' : v4Count >= 1 ? '🟡' : '🔴';

      this.rules.push({ file, ruleId, iepev, v4, chain, iepevCount, v4Count, iepevGrade, v4Grade });
    }

    const report = this.generateReport();
    if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORT_DIR, 'isc-full-pce-expand-report.md'), report);
    fs.writeFileSync(path.join(REPORT_DIR, 'isc-five-layer-audit.json'), JSON.stringify({
      timestamp: new Date().toISOString(), stats: this.stats, rules: this.rules
    }, null, 2));

    const s = this.stats;
    console.log(`审计完成: ${s.total}条规则`);
    console.log(`  IEPEV: 完整=${s.iepev_full} 部分=${s.iepev_partial} 空壳=${s.iepev_shell} 断链=${s.chainBroken}`);
    console.log(`  V4:    完整=${s.v4_full} 部分=${s.v4_partial} 全缺=${s.v4_missing}`);
    console.log(`  全合规(IEPEV5+V45): ${s.fully_compliant}`);
    return { stats: this.stats, rules: this.rules };
  }

  generateReport() {
    const s = this.stats;
    let md = `# ISC规则五层展开 + V4审计报告\n\n`;
    md += `**审计时间**: ${new Date().toISOString()}\n`;
    md += `**审计器**: isc-rule-auditor.js v2.1\n`;
    md += `**模型**: IEPEV五层 + V4五字段\n\n`;

    // === 总览 ===
    md += `## 总览\n\n`;
    md += `| 指标 | 数量 | 占比 |\n|------|------|------|\n`;
    md += `| 规则总数 | ${s.total} | 100% |\n`;
    md += `| ✅ **全合规** (IEPEV 5/5 + V4 5/5) | ${s.fully_compliant} | ${pct(s.fully_compliant,s.total)} |\n`;
    md += `| IEPEV五层完整 | ${s.iepev_full} | ${pct(s.iepev_full,s.total)} |\n`;
    md += `| V4五字段完整 | ${s.v4_full} | ${pct(s.v4_full,s.total)} |\n`;
    md += `| 🔗 IEPEV链路断裂 | ${s.chainBroken} | ${pct(s.chainBroken,s.total)} |\n\n`;

    // === IEPEV覆盖率 ===
    md += `## IEPEV五层覆盖率\n\n`;
    md += `| 层 | 覆盖数 | 覆盖率 |\n|---|--------|--------|\n`;
    for (const l of IEPEV) md += `| ${IEPEV_LABELS[l]} | ${s.iepev_coverage[l]} | ${pct(s.iepev_coverage[l],s.total)} |\n`;

    // === V4覆盖率 ===
    md += `\n## V4五字段覆盖率\n\n`;
    md += `| 字段 | 覆盖数 | 覆盖率 |\n|------|--------|--------|\n`;
    for (const f of V4_FIELDS) md += `| ${V4_LABELS[f]} | ${s.v4_coverage[f]} | ${pct(s.v4_coverage[f],s.total)} |\n`;

    // === 逐条审计表 ===
    md += `\n## 逐条审计\n\n`;
    md += `| 规则ID | I | E | P | X | V | IEPEV | SR | NS | GR | PI | LY | V4 |\n`;
    md += `|--------|---|---|---|---|---|-------|----|----|----|----|----|---------|\n`;
    for (const r of this.rules) {
      if (r.error) { md += `| ${r.file} | ❌ 解析失败 |||||||||||||\n`; continue; }
      const ie = IEPEV.map(l => r.iepev[l].present ? '✅' : '❌');
      const v4 = V4_FIELDS.map(f => r.v4[f].present ? '✅' : '❌');
      md += `| ${r.ruleId} | ${ie.join(' | ')} | ${r.iepevGrade}${r.iepevCount}/5 | ${v4.join(' | ')} | ${r.v4Grade}${r.v4Count}/5 |\n`;
    }

    // === 标杆示例 ===
    md += `\n## 📌 标杆示例：mandatory-parallel-dispatch 完整展开(IEPEV+V4)\n\n`;
    md += `\`\`\`json\n${JSON.stringify({
      "id": "rule.mandatory-parallel-dispatch-001",
      "iepev": {
        "intent": {
          "description": "独立任务强制并行派发",
          "actor": "system_dispatcher",
          "goal": "多个无依赖任务必须拆分为独立子Agent并行执行",
          "anti_goal": "独立问题塞给一个子Agent串行处理"
        },
        "event": {
          "primary_trigger": "task.dispatch.requested",
          "event_chain": ["task.dispatch.requested → dependency_analysis", "dependency_analysis → split_decision", "split_decision → subagent.spawn.batch"],
          "condition": "任务含≥2独立子问题 AND Agent池有slot"
        },
        "planning": {
          "preconditions": { "multi_task": "≥2可拆分独立子任务", "pool_available": "有空闲slot", "no_dependency": "子任务无I/O依赖" },
          "decision_tree": { "独立+slot充足": "MUST_SPLIT并行", "独立+slot不足": "BEST_EFFORT分批", "有依赖": "ALLOW_SERIAL" },
          "steps": ["解析输入识别子任务", "依赖性分析", "检查Agent池slot", "决策：并行/串行/分批"]
        },
        "execution": {
          "handler": "scripts/isc-hooks/rule.mandatory-parallel-dispatch-001.sh",
          "mode": "pre_dispatch_gate",
          "rollback": "回退单Agent模式+记badcase",
          "timeout_ms": 10000
        },
        "verification": {
          "success_criteria": "所有独立子任务均已spawn为独立子Agent",
          "metrics": { "parallelism_ratio": "≥1.0", "no_bundling": "无独立任务被打包" },
          "failure_action": "记录badcase+告警主Agent",
          "intent_match": "验证每个独立问题都有专属子Agent"
        }
      },
      "v4": {
        "scoring_rubric": {
          "pass": "所有独立任务均已并行派发，无打包现象",
          "partial": "大部分并行但有1-2个任务被合并",
          "badcase": "Agent池充足时仍将独立任务打包给单个子Agent"
        },
        "north_star_indicator": ["自主闭环", "言出法随"],
        "gate_relevance": "Pre-Gate",
        "process_indicators": { "category": "调度效率", "sub_items": ["并行派发率", "任务拆分准确率", "Agent池利用率"] },
        "layer": "行为层"
      }
    }, null, 2)}\n\`\`\`\n\n`;

    md += `## 整改优先级\n\n`;
    md += `| 优先级 | 动作 | 影响 |\n|--------|------|------|\n`;
    md += `| P0 | 为所有规则补全V4五字段 | ${s.total - s.v4_full}条 |\n`;
    md += `| P0 | 补全IEPEV五层展开 | ${s.total - s.iepev_full}条 |\n`;
    md += `| P1 | 修复IEPEV链路断裂 | ${s.chainBroken}条 |\n`;
    md += `| P2 | 验证V4字段值的有效性(北极星/Gate枚举) | 全量 |\n`;

    return md;
  }
}

function pct(n, t) { return t ? Math.round(n/t*100)+'%' : '0%'; }

if (require.main === module) { new ISCRuleAuditor().run(); }
module.exports = ISCRuleAuditor;
