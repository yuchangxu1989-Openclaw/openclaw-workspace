#!/usr/bin/env node
'use strict';

/**
 * artifact-gate-check — 项目产物沉淀门禁处理器
 * 
 * 验证任务完成时是否有实际可交付产物，阻止空架子标记完成。
 * 挂接 EventBus 事件链路，与 PROJECT-TRACKER / task-queue 联动。
 * 
 * 事件输入: task.status.completed / task.status.done
 * 事件输出: task.artifact.verified / task.artifact.rejected
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..', '..', '..');
const TASKS_DIR = path.join(WORKSPACE, 'memory', 'tasks');
const TRACKER_PATH = path.join(WORKSPACE, 'PROJECT-TRACKER.md');
const REPORTS_DIR = path.join(WORKSPACE, 'reports', 'artifact-gate');
const LESSONS_DIR = path.join(WORKSPACE, 'skills', 'project-mgmt', 'lessons');
const METRICS_DIR = path.join(WORKSPACE, 'skills', 'project-mgmt', 'metrics');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * 检查任务是否有关联的实际产物
 */
function checkArtifactExists(task) {
  const artifacts = task.artifacts || task.deliverables || [];
  if (artifacts.length === 0) {
    // 推断产物位置：基于任务类型
    const kind = task.kind || 'implementation';
    const inferredPaths = inferArtifactPaths(task, kind);
    const found = inferredPaths.filter(p => {
      try {
        const stat = fs.statSync(p);
        return stat.size > 200; // 非空文件
      } catch (_) { return false; }
    });
    return { passed: found.length > 0, found, expected: inferredPaths };
  }
  
  const verified = [];
  const missing = [];
  for (const artifact of artifacts) {
    const fullPath = path.isAbsolute(artifact) ? artifact : path.join(WORKSPACE, artifact);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.size > 200) {
        verified.push(artifact);
      } else {
        missing.push({ path: artifact, reason: 'empty_or_skeleton' });
      }
    } catch (_) {
      missing.push({ path: artifact, reason: 'not_found' });
    }
  }
  return { passed: verified.length > 0, verified, missing };
}

/**
 * 推断产物路径
 */
function inferArtifactPaths(task, kind) {
  const paths = [];
  const title = task.title || '';
  
  switch (kind) {
    case 'implementation':
      // 代码/脚本/模块
      paths.push(path.join(WORKSPACE, 'skills', '**', '*.js'));
      break;
    case 'integration':
      // 集成测试/适配器
      paths.push(path.join(WORKSPACE, 'tests', '**', '*.test.js'));
      break;
    case 'validation':
      // 测试报告
      paths.push(path.join(WORKSPACE, 'reports', '**', '*.md'));
      break;
    case 'risk':
      // 风险报告/治理文档
      paths.push(path.join(WORKSPACE, 'reports', '**', '*risk*.md'));
      break;
    case 'reporting':
      // 汇报文档
      paths.push(path.join(WORKSPACE, 'reports', '**', '*report*.md'));
      break;
  }
  return paths;
}

/**
 * 检查验收标准是否有证据
 */
function checkAcceptanceCriteria(task) {
  const criteria = task.acceptance || [];
  if (criteria.length === 0) {
    return { passed: false, reason: 'no_acceptance_criteria_defined' };
  }
  
  const evidence = task.evidence || [];
  return {
    passed: evidence.length > 0 || task.status === 'done',
    criteria,
    evidence_count: evidence.length
  };
}

/**
 * 检查TRACKER是否已同步
 */
function checkTrackerSync(task) {
  if (!fs.existsSync(TRACKER_PATH)) {
    return { passed: false, reason: 'tracker_not_found' };
  }
  
  const tracker = fs.readFileSync(TRACKER_PATH, 'utf8');
  const title = task.title || '';
  const found = tracker.includes(title);
  return { passed: found, title, in_tracker: found };
}

/**
 * 执行完整门禁检查
 */
function runGate(taskData) {
  const results = {
    timestamp: new Date().toISOString(),
    task_id: taskData.id,
    task_title: taskData.title,
    checks: {}
  };
  
  // Check 1: Artifact exists
  results.checks.artifact_exists = checkArtifactExists(taskData);
  
  // Check 2: Acceptance criteria
  results.checks.acceptance_criteria = checkAcceptanceCriteria(taskData);
  
  // Check 3: Tracker sync
  results.checks.tracker_sync = checkTrackerSync(taskData);
  
  // Overall verdict
  const criticalChecks = [results.checks.artifact_exists];
  results.verdict = criticalChecks.every(c => c.passed) ? 'PASS' : 'BLOCK';
  results.warnings = [];
  
  if (!results.checks.acceptance_criteria.passed) {
    results.warnings.push('验收标准缺失或无证据');
  }
  if (!results.checks.tracker_sync.passed) {
    results.warnings.push('PROJECT-TRACKER未同步');
  }
  
  return results;
}

/**
 * 批量检查所有已完成任务
 */
function auditAllCompleted() {
  ensureDir(REPORTS_DIR);
  
  if (!fs.existsSync(TASKS_DIR)) {
    return { ok: true, audited: 0, results: [] };
  }
  
  const taskFiles = fs.readdirSync(TASKS_DIR).filter(f => f.endsWith('.json'));
  const results = [];
  
  for (const file of taskFiles) {
    const task = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, file), 'utf8'));
    if (task.status === 'done' || task.status === 'completed') {
      const result = runGate(task);
      results.push(result);
    }
  }
  
  const report = {
    timestamp: new Date().toISOString(),
    total_audited: results.length,
    passed: results.filter(r => r.verdict === 'PASS').length,
    blocked: results.filter(r => r.verdict === 'BLOCK').length,
    results
  };
  
  const reportFile = path.join(REPORTS_DIR, `audit-${Date.now()}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
  
  return report;
}

/**
 * Sprint收工验收 — 四重门禁
 */
function sprintClosureGate(sprintName) {
  ensureDir(REPORTS_DIR);
  
  const gates = {
    artifact_audit: { passed: false, detail: null },
    metrics_collected: { passed: false, detail: null },
    lessons_captured: { passed: false, detail: null },
    tribunal_verdict: { passed: false, detail: null }
  };
  
  // Gate 1: 产物核查 — 所有done任务通过artifact gate
  const audit = auditAllCompleted();
  gates.artifact_audit.passed = audit.blocked === 0;
  gates.artifact_audit.detail = {
    total: audit.total_audited,
    passed: audit.passed,
    blocked: audit.blocked
  };
  
  // Gate 2: 指标采集
  ensureDir(METRICS_DIR);
  const now = new Date();
  const metricsFile = path.join(METRICS_DIR, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.json`);
  if (fs.existsSync(metricsFile)) {
    try {
      const metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
      const requiredFields = ['planned_days', 'actual_days', 'tasks_total', 'tasks_completed'];
      const hasAll = requiredFields.every(f => metrics[f] !== undefined);
      gates.metrics_collected.passed = hasAll;
      gates.metrics_collected.detail = { file: metricsFile, fields_present: Object.keys(metrics) };
    } catch (_) {
      gates.metrics_collected.detail = { error: 'metrics file parse error' };
    }
  } else {
    gates.metrics_collected.detail = { missing: metricsFile };
  }
  
  // Gate 3: 经验沉淀
  ensureDir(LESSONS_DIR);
  const lessonFiles = fs.existsSync(LESSONS_DIR) 
    ? fs.readdirSync(LESSONS_DIR).filter(f => f.endsWith('.md') && f !== 'anti-patterns.md')
    : [];
  
  if (lessonFiles.length > 0) {
    const latestLesson = lessonFiles.sort().pop();
    const content = fs.readFileSync(path.join(LESSONS_DIR, latestLesson), 'utf8');
    const requiredSections = ['目标', '做对', '做错', '改进'];
    const hasRequired = requiredSections.some(s => content.includes(s));
    gates.lessons_captured.passed = hasRequired;
    gates.lessons_captured.detail = { file: latestLesson, has_required_sections: hasRequired };
  } else {
    gates.lessons_captured.detail = { error: 'no lesson files found' };
  }
  
  // Gate 4: 凌霄阁裁决 — 检查最近的裁决记录
  const tribunalDir = path.join(WORKSPACE, 'reports');
  const tribunalFiles = fs.existsSync(tribunalDir)
    ? fs.readdirSync(tribunalDir).filter(f => f.includes('tribunal') || f.includes('lingxiaoge') || f.includes('裁决'))
    : [];
  gates.tribunal_verdict.passed = tribunalFiles.length > 0;
  gates.tribunal_verdict.detail = { files_found: tribunalFiles.length };
  
  // Overall
  const allPassed = Object.values(gates).every(g => g.passed);
  const result = {
    timestamp: new Date().toISOString(),
    sprint: sprintName || 'current',
    verdict: allPassed ? 'APPROVED' : 'BLOCKED',
    gates,
    missing_gates: Object.entries(gates).filter(([_, g]) => !g.passed).map(([k]) => k)
  };
  
  const reportFile = path.join(REPORTS_DIR, `sprint-closure-${Date.now()}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(result, null, 2), 'utf8');
  
  return result;
}

// ─── CLI / 模块双用 ───
async function run(input, context) {
  const mode = input?.mode || 'audit';
  
  switch (mode) {
    case 'gate':
      return runGate(input.task);
    case 'audit':
      return auditAllCompleted();
    case 'sprint-closure':
      return sprintClosureGate(input.sprint);
    default:
      return auditAllCompleted();
  }
}

module.exports = run;
module.exports.run = run;
module.exports.runGate = runGate;
module.exports.auditAllCompleted = auditAllCompleted;
module.exports.sprintClosureGate = sprintClosureGate;

if (require.main === module) {
  const mode = process.argv[2] || 'audit';
  const result = mode === 'sprint-closure' 
    ? sprintClosureGate(process.argv[3])
    : auditAllCompleted();
  console.log(JSON.stringify(result, null, 2));
}
