/**
 * 系统可观测性仪表盘
 * 
 * 聚合以下数据源：
 * 1. 事件总线统计
 * 2. 管道状态追踪
 * 3. CRAS 洞察/报告
 * 4. AEO 评测趋势
 * 5. 反馈队列
 * 6. Cron 任务状态
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.join(process.env.OPENCLAW_HOME || '/root/.openclaw', 'workspace');

function getEventBusStats() {
  try {
    const bus = require(path.join(WORKSPACE, 'infrastructure', 'event-bus', 'bus.js'));
    return bus.stats();
  } catch(e) { return { error: e.message }; }
}

function getPipelineRuns() {
  try {
    const tracker = require(path.join(WORKSPACE, 'infrastructure', 'state-tracker', 'tracker.js'));
    const runs = tracker.listRuns ? tracker.listRuns() : [];
    const recent = runs.slice(-10);
    return {
      total: runs.length,
      recent: recent.map(r => ({
        id: r.id, type: r.type, status: r.status, created_at: r.created_at
      }))
    };
  } catch(e) { return { error: e.message }; }
}

function getCRASInsights() {
  try {
    const dir = path.join(WORKSPACE, 'skills', 'cras', 'insights');
    if (!fs.existsSync(dir)) return { count: 0 };
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const bySeverity = { error: 0, warning: 0, info: 0 };
    files.forEach(f => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;
      } catch(e) {}
    });
    return { count: files.length, by_severity: bySeverity };
  } catch(e) { return { error: e.message }; }
}

function getAEOAssessments() {
  try {
    const store = require(path.join(WORKSPACE, 'skills', 'aeo', 'assessment-store.js'));
    const all = store.query({});
    const passed = all.filter(a => a.passed).length;
    return {
      total: all.length, passed, failed: all.length - passed,
      pass_rate: all.length > 0 ? (passed / all.length * 100).toFixed(1) + '%' : 'N/A',
      recent: all.slice(-5)
    };
  } catch(e) { return { error: e.message }; }
}

function getFeedbackQueue() {
  try {
    const indexFile = path.join(WORKSPACE, 'infrastructure', 'feedback', 'index.json');
    if (!fs.existsSync(indexFile)) return { count: 0 };
    const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    return { count: index.items?.length || 0, stats: index.stats };
  } catch(e) { return { error: e.message }; }
}

function getSkillHealth() {
  const skillsDir = path.join(WORKSPACE, 'skills');
  if (!fs.existsSync(skillsDir)) return { error: 'skills dir not found' };
  const skills = fs.readdirSync(skillsDir).filter(d => {
    const p = path.join(skillsDir, d);
    return fs.statSync(p).isDirectory() && !d.startsWith('_');
  });
  const withSkillMd = skills.filter(s => fs.existsSync(path.join(skillsDir, s, 'SKILL.md')));
  const withEventBridge = skills.filter(s => fs.existsSync(path.join(skillsDir, s, 'event-bridge.js')));
  return {
    total: skills.length, with_skill_md: withSkillMd.length,
    with_event_bridge: withEventBridge.length, event_connected: withEventBridge.map(s => s)
  };
}

function getRuleSuggestions() {
  try {
    const dir = path.join(WORKSPACE, 'skills', 'cras', 'rule-suggestions');
    if (!fs.existsSync(dir)) return { count: 0, pending: 0 };
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    let pending = 0;
    files.forEach(f => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (d.status === 'pending_review') pending++;
      } catch(e) {}
    });
    return { count: files.length, pending };
  } catch(e) { return { error: e.message }; }
}

function generate() {
  return {
    generated_at: new Date().toISOString(),
    event_bus: getEventBusStats(),
    pipeline: getPipelineRuns(),
    cras_insights: getCRASInsights(),
    aeo_assessments: getAEOAssessments(),
    feedback: getFeedbackQueue(),
    skills: getSkillHealth(),
    rule_suggestions: getRuleSuggestions()
  };
}

function summary() {
  const d = generate();
  const lines = [];
  lines.push('🔭 系统可观测性仪表盘');
  lines.push(`⏰ ${d.generated_at}`);
  lines.push('');
  lines.push('📨 事件总线');
  if (d.event_bus.error) lines.push(`  ❌ ${d.event_bus.error}`);
  else lines.push(`  总事件: ${d.event_bus.total || 'N/A'} | 待消费: ${d.event_bus.pending || 0}`);
  lines.push('');
  lines.push('🔄 管道运行');
  if (d.pipeline.error) lines.push(`  ❌ ${d.pipeline.error}`);
  else lines.push(`  总运行: ${d.pipeline.total} | 最近: ${d.pipeline.recent?.length || 0} 条`);
  lines.push('');
  lines.push('🧠 CRAS 洞察');
  lines.push(`  总计: ${d.cras_insights.count} | 错误: ${d.cras_insights.by_severity?.error || 0} | 警告: ${d.cras_insights.by_severity?.warning || 0}`);
  lines.push('');
  lines.push('📊 AEO 评测');
  lines.push(`  总计: ${d.aeo_assessments.total} | 通过率: ${d.aeo_assessments.pass_rate}`);
  lines.push('');
  lines.push('📝 反馈队列');
  lines.push(`  总计: ${d.feedback.count} 条`);
  lines.push('');
  lines.push('🛠️ 技能健康');
  lines.push(`  总计: ${d.skills.total} | 有SKILL.md: ${d.skills.with_skill_md} | 接入事件: ${d.skills.with_event_bridge}`);
  lines.push(`  已接入: ${d.skills.event_connected?.join(', ') || '无'}`);
  lines.push('');
  lines.push('💡 规则建议');
  lines.push(`  总计: ${d.rule_suggestions.count} | 待审核: ${d.rule_suggestions.pending}`);
  return lines.join('\n');
}

if (require.main === module) {
  const mode = process.argv[2];
  if (mode === '--json') {
    console.log(JSON.stringify(generate(), null, 2));
  } else {
    console.log(summary());
  }
}

module.exports = { generate, summary };
