#!/usr/bin/env node
/**
 * eval-gate-track.js — V4 Gate Track（串行短路门禁）
 * 
 * Pre-Gate → Gate-A → Gate-B
 * 任一Gate失败则短路终止
 * 
 * 用法: node eval-gate-track.js <case_file>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

const caseFile = process.argv[2];
if (!caseFile) {
  console.error('用法: node eval-gate-track.js <case_file>');
  process.exit(1);
}

// 加载配置
let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.error(`无法加载config: ${e.message}`);
  process.exit(1);
}

// 加载评测集
let cases;
try {
  const raw = JSON.parse(fs.readFileSync(caseFile, 'utf8'));
  cases = Array.isArray(raw) ? raw : (raw.samples || []);
} catch (e) {
  console.error(`无法加载评测集: ${e.message}`);
  process.exit(1);
}

// 加载eval标准版本
let evalStandard = { version: 'UNKNOWN' };
try {
  evalStandard = require(path.join(WORKSPACE, 'skills', 'isc-core', 'config', 'read-eval-version.js')).getEvalStandard();
} catch {}

// ====== Pre-Gate: 基础完整性门禁 ======
function runPreGate(cases) {
  const result = {
    gate: 'pre-gate',
    passed: true,
    checks: {}
  };

  // 检查1: 所有case的id非空且唯一
  const ids = cases.map(c => c.id).filter(Boolean);
  const uniqueIds = new Set(ids);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  result.checks.case_id_valid = {
    passed: ids.length === cases.length && uniqueIds.size === ids.length,
    detail: ids.length < cases.length
      ? `${cases.length - ids.length}条case缺少id`
      : duplicates.length > 0
        ? `重复id: ${[...new Set(duplicates)].join(', ')}`
        : `${ids.length}条case id均唯一`
  };

  // 检查2: required_fields完整性
  const requiredFields = ['id', 'input', 'expected_output', 'category', 'difficulty', 'source'];
  const missingReport = [];
  for (const c of cases) {
    const missing = requiredFields.filter(f => !c[f] && c[f] !== false && c[f] !== 0);
    if (missing.length > 0) {
      missingReport.push({ id: c.id || '?', missing });
    }
  }
  result.checks.required_fields = {
    passed: missingReport.length === 0,
    detail: missingReport.length === 0
      ? '所有case必填字段完整'
      : `${missingReport.length}条case缺少必填字段`,
    failures: missingReport.slice(0, 5) // 最多报5条
  };

  // 检查3: category合法性（支持标准8分类 + 北极星Track专用分类）
  const validCategories = [
    // 标准8分类
    '纠偏类', '认知错误类', '全局未对齐类', '头痛医头类',
    '反复未果类', '连锁跷跷板类', '自主性缺失类', '交付质量类',
    // 北极星Track专用分类
    'yanchu-fasu', 'autonomous-loop', 'code-coverage',
    'independent-qa', 'rca-coverage',
    // Gate Track专用分类
    'Pre-Gate基础完整性', 'Gate-A工具可信门', 'Gate-B标准脚本绑定'
  ];
  const invalidCats = cases.filter(c => c.category && !validCategories.includes(c.category));
  result.checks.category_valid = {
    passed: invalidCats.length === 0,
    detail: invalidCats.length === 0
      ? '所有category均为合法值'
      : `${invalidCats.length}条case使用未注册category: ${[...new Set(invalidCats.map(c => c.category))].join(', ')}`
  };

  // 检查4: difficulty枚举合法性
  const validDifficulties = ['C1', 'C2'];
  const invalidDiff = cases.filter(c => c.difficulty && !validDifficulties.includes(c.difficulty));
  result.checks.difficulty_valid = {
    passed: invalidDiff.length === 0,
    detail: invalidDiff.length === 0
      ? '所有difficulty均为合法值'
      : `${invalidDiff.length}条case使用非法difficulty`
  };

  // 汇总
  const checks = Object.values(result.checks);
  result.passed = checks.every(c => c.passed);
  if (!result.passed) {
    result.failed_at = Object.entries(result.checks).find(([_, v]) => !v.passed)?.[0];
  }

  return result;
}

// ====== Gate-A: 审计工具可信门 ======
function runGateA() {
  const result = {
    gate: 'gate-a',
    passed: true,
    checks: {}
  };

  // 检查1: 评测脚本存在且可加载
  const evalScript = path.join(__dirname, 'eval-single-case.js');
  result.checks.script_exists = {
    passed: fs.existsSync(evalScript),
    detail: fs.existsSync(evalScript) ? '评测脚本存在' : '评测脚本不存在!'
  };

  // 检查2: 角色分离
  result.checks.role_separation = {
    passed: config.executor_agent !== config.evaluator_agent,
    executor: config.executor_agent,
    evaluator: config.evaluator_agent,
    detail: config.executor_agent !== config.evaluator_agent
      ? `executor=${config.executor_agent}, evaluator=${config.evaluator_agent}`
      : '角色未分离!'
  };

  // 检查3: 评测标准版本可读
  result.checks.eval_standard_readable = {
    passed: evalStandard.version !== 'UNKNOWN',
    version: evalStandard.version,
    detail: evalStandard.version !== 'UNKNOWN'
      ? `评测标准版本: ${evalStandard.version}`
      : '无法读取评测标准版本'
  };

  // 检查4: config版本一致性
  result.checks.config_version = {
    passed: config.version === '2.0.0',
    current: config.version,
    detail: config.version === '2.0.0'
      ? 'config版本为V4兼容的2.0.0'
      : `config版本 ${config.version} 可能不兼容V4`
  };

  // 汇总
  const checks = Object.values(result.checks);
  result.passed = checks.every(c => c.passed);
  if (!result.passed) {
    result.failed_at = Object.entries(result.checks).find(([_, v]) => !v.passed)?.[0];
  }

  return result;
}

// ====== Gate-B: 标准-脚本绑定门 ======
function runGateB() {
  const result = {
    gate: 'gate-b',
    passed: true,
    checks: {}
  };

  // 检查1: schema文件存在
  const schemaPath = path.join(WORKSPACE, config.eval_standard_schema || '');
  result.checks.schema_exists = {
    passed: fs.existsSync(schemaPath),
    detail: fs.existsSync(schemaPath) ? 'eval-standard-schema.json 存在' : 'schema文件不存在!'
  };

  // 检查2: 评测维度与schema同步
  let schemaDimensions = [];
  try {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    schemaDimensions = (schema.scoring_dimensions || []).map(d => d.id);
  } catch {}

  const configDimensions = config.tracks?.legacy?.dimensions || [];
  const missing = schemaDimensions.filter(d => !configDimensions.includes(d));
  const extra = configDimensions.filter(d => !schemaDimensions.includes(d));
  result.checks.dimensions_sync = {
    passed: missing.length === 0 && extra.length === 0,
    schema_dims: schemaDimensions,
    config_dims: configDimensions,
    missing,
    extra,
    detail: (missing.length === 0 && extra.length === 0)
      ? '评测维度与schema完全同步'
      : `缺少: ${missing.join(',') || '无'}, 多余: ${extra.join(',') || '无'}`
  };

  // 检查3: 北极星指标配置完整
  const nsConfig = config.northstar_thresholds || {};
  const expectedNS = ['ns1_rule_effectiveness', 'ns2_autonomous_closure', 'ns3_cognitive_code_coverage', 'ns4_independent_qa', 'ns5_root_cause_analysis'];
  const missingNS = expectedNS.filter(ns => !nsConfig[ns]);
  result.checks.northstar_config = {
    passed: missingNS.length === 0,
    detail: missingNS.length === 0
      ? '5项北极星指标配置完整'
      : `缺少北极星配置: ${missingNS.join(', ')}`
  };

  // 检查4: 评级体系完整
  const rating = config.rating || {};
  const expectedRatings = ['S', 'A', 'B', 'C', 'F'];
  const missingRatings = expectedRatings.filter(r => !rating[r]);
  result.checks.rating_config = {
    passed: missingRatings.length === 0,
    detail: missingRatings.length === 0
      ? 'S/A/B/C/F评级体系完整'
      : `缺少评级: ${missingRatings.join(', ')}`
  };

  // 汇总
  const checks = Object.values(result.checks);
  result.passed = checks.every(c => c.passed);
  if (!result.passed) {
    result.failed_at = Object.entries(result.checks).find(([_, v]) => !v.passed)?.[0];
  }

  return result;
}

// ====== 主流程：串行短路 ======
function runGateTrack() {
  const result = {
    track: 'gate',
    timestamp: new Date().toISOString(),
    eval_standard: evalStandard.version,
    all_passed: false,
    terminated_at: null,
    gates: {}
  };

  // Pre-Gate
  const preGate = runPreGate(cases);
  result.gates.pre_gate = preGate;
  if (!preGate.passed) {
    result.terminated_at = 'pre-gate';
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Gate-A
  const gateA = runGateA();
  result.gates.gate_a = gateA;
  if (!gateA.passed) {
    result.terminated_at = 'gate-a';
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Gate-B
  const gateB = runGateB();
  result.gates.gate_b = gateB;
  if (!gateB.passed) {
    result.terminated_at = 'gate-b';
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // 全部通过
  result.all_passed = true;
  console.log(JSON.stringify(result, null, 2));
}

runGateTrack();
