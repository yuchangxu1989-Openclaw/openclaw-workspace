#!/usr/bin/env node
/**
 * CRAS 慢通道：日级洞察聚合 → 系统自动升级 v2.0
 * 
 * 修复: 时区统一Asia/Shanghai, 时间过滤生效, 四维洞察+北极星差距分析
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';
const INTENT_LOG = path.join(WORKSPACE, 'infrastructure/logs/intent-extractor.log');
const INSIGHTS_DIR = path.join(WORKSPACE, 'skills/cras/insights');
const KNOWLEDGE_DIR = path.join(WORKSPACE, 'skills/cras/knowledge');
const INTENT_REGISTRY = path.join(WORKSPACE, 'infrastructure/intent-engine/intent-registry.json');
const EVENT_BUS = path.join(WORKSPACE, 'infrastructure/event-bus/events.jsonl');
const REPORT_DIR = path.join(WORKSPACE, 'reports/cras-daily');
const UPGRADE_LOG = path.join(WORKSPACE, 'infrastructure/logs/cras-daily-upgrade.log');

fs.mkdirSync(REPORT_DIR, { recursive: true });

/** 获取Asia/Shanghai当前日期字符串 YYYY-MM-DD */
function getShanghaiDateStr(date = new Date()) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

/** 获取Asia/Shanghai当天0点的UTC时间戳 */
function getShanghaiDayStartMs(dateStr) {
  // dateStr = 'YYYY-MM-DD', 当天0点 Asia/Shanghai = UTC-8h
  const d = new Date(dateStr + 'T00:00:00+08:00');
  return d.getTime();
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.mkdirSync(path.dirname(UPGRADE_LOG), { recursive: true });
  fs.appendFileSync(UPGRADE_LOG, line + '\n');
}

/**
 * 1. 聚合意图提取日志，分析趋势（仅最近24h）
 */
function aggregateIntentTrends() {
  if (!fs.existsSync(INTENT_LOG)) return { total_runs: 0, with_content: 0, no_content: 0, patterns: {} };
  
  const content = fs.readFileSync(INTENT_LOG, 'utf8');
  const lines = content.split('\n');
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  
  let totalRuns = 0, withContent = 0, noContent = 0;
  const patterns = {};
  const intentTypes = {};
  
  for (const line of lines) {
    // 提取时间戳过滤：日志格式 [ISO_TIMESTAMP] ...
    const tsMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]/);
    if (tsMatch) {
      const lineTs = Date.parse(tsMatch[1]);
      if (!isNaN(lineTs) && lineTs < last24h) continue; // 跳过24h前的
    }
    
    if (line.includes('开始增量扫描')) totalRuns++;
    if (line.includes('无新增内容')) noContent++;
    if (line.includes('提取到') || line.includes('发现')) {
      withContent++;
      const match = line.match(/提取到\s*(\d+)/);
      if (match) patterns['intent_extracted'] = (patterns['intent_extracted'] || 0) + parseInt(match[1]);
    }
    // 统计意图类型分布
    const intentMatch = line.match(/🎯\s*(intent\.\w+)\s*\[/);
    if (intentMatch) {
      intentTypes[intentMatch[1]] = (intentTypes[intentMatch[1]] || 0) + 1;
    }
  }
  
  return { total_runs: totalRuns, with_content: withContent, no_content: noContent, patterns, intent_type_distribution: intentTypes };
}

/**
 * 2. 聚合insights，识别可操作洞察（仅最近24h，修复时间比较）
 */
function aggregateInsights() {
  if (!fs.existsSync(INSIGHTS_DIR)) return [];
  
  const files = fs.readdirSync(INSIGHTS_DIR).filter(f => f.endsWith('.json'));
  const insights = [];
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(INSIGHTS_DIR, f), 'utf8'));
      // 修复: 确保timestamp是数字再比较
      const ts = typeof data.timestamp === 'string' ? Date.parse(data.timestamp) : Number(data.timestamp);
      if (!isNaN(ts) && ts > last24h) {
        insights.push({ ...data, _parsed_ts: ts });
      }
    } catch {}
  }
  
  return insights;
}

/**
 * 3. 四维洞察分析
 */
function generateFourDimensionInsights(insights, corrections, intentTrends) {
  const dimensions = {};
  
  // 维度1: 学习洞察 - 从纠偏信号中提取
  dimensions.learning = {
    corrections_count: corrections.length,
    signals: corrections.slice(0, 5).map(c => c.content.slice(0, 200)),
    summary: corrections.length > 0 
      ? `今日${corrections.length}条纠偏信号，主要来自: ${corrections.map(c => c.source).filter((v,i,a) => a.indexOf(v) === i).join(', ')}`
      : '今日无纠偏信号'
  };
  
  // 维度2: 用户洞察 - 从意图分布看用户模式
  const intentDist = intentTrends.intent_type_distribution || {};
  const topIntents = Object.entries(intentDist).sort((a, b) => b[1] - a[1]).slice(0, 5);
  dimensions.user_patterns = {
    intent_distribution: intentDist,
    top_intents: topIntents.map(([k, v]) => `${k}(${v}次)`),
    high_frequency_topics: extractHighFreqTopics(insights),
    summary: topIntents.length > 0 
      ? `用户高频意图: ${topIntents.map(([k,v]) => k).join(', ')}` 
      : '暂无意图数据'
  };
  
  // 维度3: 知识治理 - 检查知识库健康度
  dimensions.knowledge_governance = assessKnowledgeHealth();
  
  // 维度4: 进化建议 - 基于前三维 + 北极星差距
  dimensions.evolution = generateEvolutionSuggestions(dimensions, insights);
  
  return dimensions;
}

/** 从insights中提取高频话题 */
function extractHighFreqTopics(insights) {
  const topics = {};
  for (const ins of insights) {
    const skill = ins.skill || ins.type || 'unknown';
    topics[skill] = (topics[skill] || 0) + 1;
  }
  return Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ topic: k, count: v }));
}

/** 评估知识库健康度 */
function assessKnowledgeHealth() {
  const health = { memory_updated: false, skills_count: 0, rules_count: 0, last_memory_update: null };
  
  // 检查MEMORY.md最后更新
  const memFile = path.join(WORKSPACE, 'MEMORY.md');
  if (fs.existsSync(memFile)) {
    const stat = fs.statSync(memFile);
    health.last_memory_update = stat.mtime.toISOString();
    health.memory_updated = (Date.now() - stat.mtimeMs) < 48 * 60 * 60 * 1000; // 48h内有更新
  }
  
  // 统计技能数
  const skillsDir = path.join(WORKSPACE, 'skills');
  if (fs.existsSync(skillsDir)) {
    health.skills_count = fs.readdirSync(skillsDir).filter(f => {
      const p = path.join(skillsDir, f);
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'SKILL.md'));
    }).length;
  }
  
  // 统计规则数
  const rulesDir = path.join(WORKSPACE, 'skills/isc-core/rules');
  if (fs.existsSync(rulesDir)) {
    health.rules_count = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json')).length;
  }
  
  // 检查今日memory文件
  const todayMem = path.join(WORKSPACE, `memory/${getShanghaiDateStr()}.md`);
  health.today_memory_exists = fs.existsSync(todayMem);
  
  health.summary = `技能${health.skills_count}个, 规则${health.rules_count}条, MEMORY.md ${health.memory_updated ? '活跃' : '陈旧'}, 今日记忆${health.today_memory_exists ? '有' : '无'}`;
  
  return health;
}

/** 北极星指标差距分析 */
function assessNorthStarGap(insights, corrections) {
  const northStars = {
    '言出法随': { score: 0, max: 5, evidence: [], desc: '指令执行完整度' },
    '自主闭环': { score: 0, max: 5, evidence: [], desc: '无需人工干预的闭环能力' },
    '代码覆盖': { score: 0, max: 5, evidence: [], desc: '用代码而非话语解决问题' },
    '独立QA': { score: 0, max: 5, evidence: [], desc: '自主验证和质量保障' },
    '根因分析': { score: 0, max: 5, evidence: [], desc: '问题归因到根因而非表面' }
  };
  
  // 基于今日数据评估各指标
  // 言出法随: 有纠偏说明执行不到位，纠偏越多分越低
  const corrCount = corrections.length;
  northStars['言出法随'].score = Math.max(1, 5 - corrCount);
  northStars['言出法随'].evidence.push(`今日${corrCount}条纠偏信号`);
  
  // 自主闭环: 检查是否有event-bus中的自动升级事件
  try {
    if (fs.existsSync(EVENT_BUS)) {
      const events = fs.readFileSync(EVENT_BUS, 'utf8').trim().split('\n');
      const last24h = Date.now() - 24 * 60 * 60 * 1000;
      const autoEvents = events.filter(l => {
        try {
          const e = JSON.parse(l);
          return e.type && e.type.includes('cras') && Date.parse(e.timestamp) > last24h;
        } catch { return false; }
      });
      northStars['自主闭环'].score = Math.min(5, 1 + autoEvents.length);
      northStars['自主闭环'].evidence.push(`${autoEvents.length}个自动化事件`);
    }
  } catch {}
  
  // 代码覆盖: 检查近期git提交
  try {
    const { execSync } = require('child_process');
    const commits = execSync('git -C /root/.openclaw/workspace log --oneline --since="24 hours ago" 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
    const commitCount = commits ? commits.split('\n').length : 0;
    northStars['代码覆盖'].score = Math.min(5, 1 + Math.floor(commitCount / 2));
    northStars['代码覆盖'].evidence.push(`24h内${commitCount}个commit`);
  } catch {}
  
  // 独立QA: 检查评测集是否有更新
  const evalDir = path.join(WORKSPACE, 'tests/benchmarks/intent');
  if (fs.existsSync(evalDir)) {
    const evalFiles = fs.readdirSync(evalDir).filter(f => f.endsWith('.json'));
    let totalCases = 0;
    evalFiles.forEach(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(evalDir, f), 'utf8'));
        totalCases += Array.isArray(data) ? data.length : (data.cases || []).length;
      } catch {}
    });
    northStars['独立QA'].score = Math.min(5, 1 + Math.floor(totalCases / 20));
    northStars['独立QA'].evidence.push(`评测用例${totalCases}条`);
  }
  
  // 根因分析: 检查insights中error_pattern类型
  const rootCauseInsights = insights.filter(i => i.type === 'error_pattern' || i.type === 'root_cause');
  northStars['根因分析'].score = Math.min(5, 1 + rootCauseInsights.length);
  northStars['根因分析'].evidence.push(`${rootCauseInsights.length}条根因洞察`);
  
  return northStars;
}

/** 生成进化建议 */
function generateEvolutionSuggestions(dimensions, insights) {
  const suggestions = [];
  
  if (dimensions.learning.corrections_count > 3) {
    suggestions.push('纠偏信号过多，建议将高频纠偏固化为ISC规则');
  }
  if (!dimensions.knowledge_governance.memory_updated) {
    suggestions.push('MEMORY.md超过48h未更新，建议在heartbeat中触发记忆整理');
  }
  if (!dimensions.knowledge_governance.today_memory_exists) {
    suggestions.push('今日无记忆文件，重要决策可能丢失');
  }
  if (dimensions.knowledge_governance.rules_count < 10) {
    suggestions.push(`规则数仅${dimensions.knowledge_governance.rules_count}条，建议从纠偏中持续提炼`);
  }
  if (insights.length === 0) {
    suggestions.push('24h内无洞察产出，检查intent-extractor是否正常运行');
  }
  
  return { suggestions, count: suggestions.length };
}

/**
 * 4. 扫描系统状态，发现可自动升级的点
 */
function scanUpgradeOpportunities() {
  const opportunities = [];
  
  // 检查意图注册表覆盖率
  try {
    const registry = JSON.parse(fs.readFileSync(INTENT_REGISTRY, 'utf8'));
    const intents = registry.intents || [];
    const byCategory = {};
    intents.forEach(i => { byCategory[i.category] = (byCategory[i.category] || 0) + 1; });
    
    if ((byCategory['IC4'] || 0) < 5) {
      opportunities.push({ type: 'intent_coverage_gap', category: 'IC4', current: byCategory['IC4'] || 0, target: 5, action: '从真实对话中提取更多IC4隐含意图样本' });
    }
    if ((byCategory['IC5'] || 0) < 3) {
      opportunities.push({ type: 'intent_coverage_gap', category: 'IC5', current: byCategory['IC5'] || 0, target: 3, action: '从真实对话中提取更多IC5多意图样本' });
    }
  } catch {}
  
  // 检查评测集覆盖率
  const evalDir = path.join(WORKSPACE, 'tests/benchmarks/intent');
  if (fs.existsSync(evalDir)) {
    const evalFiles = fs.readdirSync(evalDir).filter(f => f.endsWith('.json'));
    let totalCases = 0;
    evalFiles.forEach(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(evalDir, f), 'utf8'));
        if (Array.isArray(data)) totalCases += data.length;
        else if (data.cases) totalCases += data.cases.length;
      } catch {}
    });
    if (totalCases < 100) {
      opportunities.push({ type: 'evalset_coverage_low', current: totalCases, target: 100, action: '从真实对话和badcase中扩充评测集' });
    }
  }
  
  // 检查规则全链路完整率
  const rulesDir = path.join(WORKSPACE, 'skills/isc-core/rules');
  if (fs.existsSync(rulesDir)) {
    const rules = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));
    let withTrigger = 0;
    rules.forEach(f => {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(rulesDir, f), 'utf8'));
        if (r.trigger && (r.trigger.event || r.trigger.condition)) withTrigger++;
      } catch {}
    });
    const rate = rules.length > 0 ? withTrigger / rules.length : 1;
    if (rate < 0.3) {
      opportunities.push({ type: 'rule_fullchain_low', completion_rate: (rate * 100).toFixed(1) + '%', total: rules.length, with_trigger: withTrigger, action: '批量补齐规则的trigger/event定义' });
    }
  }
  
  return opportunities;
}

/**
 * 自动执行升级
 */
function executeAutoUpgrades(opportunities) {
  const executed = [];
  fs.mkdirSync(path.dirname(EVENT_BUS), { recursive: true });
  
  for (const opp of opportunities) {
    const event = {
      type: `cras.upgrade.${opp.type}`,
      source: 'cras-daily-aggregator',
      timestamp: new Date().toISOString(),
      data: opp
    };
    fs.appendFileSync(EVENT_BUS, JSON.stringify(event) + '\n');
    executed.push({ ...opp, status: 'event_emitted' });
  }
  
  return executed;
}

/**
 * 收割今日纠偏信号（复用intent-insight的逻辑）
 */
function harvestTodayCorrections() {
  const dateStr = getShanghaiDateStr();
  const memFile = path.join(WORKSPACE, `memory/${dateStr}.md`);
  if (!fs.existsSync(memFile)) return [];
  
  const content = fs.readFileSync(memFile, 'utf8');
  const corrections = [];
  const sections = content.split(/\n##\s+/);
  for (const section of sections) {
    if (/Badcase|根因|纠偏|用户要求|用户纠偏|铁律|错误|修复/.test(section)) {
      corrections.push({
        type: 'correction_signal',
        content: section.trim().slice(0, 500),
        source: `memory/${dateStr}.md`,
        timestamp: new Date().toISOString()
      });
    }
  }
  return corrections;
}

/**
 * 主流程
 */
function main() {
  const dateStr = getShanghaiDateStr();
  const reportFile = path.join(REPORT_DIR, `cras-daily-${dateStr}.json`);
  
  log(`=== CRAS 日级洞察聚合+系统升级 ${dateStr} (Asia/Shanghai) ===`);
  
  // 1. 意图趋势
  const intentTrends = aggregateIntentTrends();
  log(`意图提取: ${intentTrends.total_runs}次运行, ${intentTrends.with_content}次有内容`);
  
  // 2. 洞察聚合
  const insights = aggregateInsights();
  log(`近24h洞察: ${insights.length}条`);
  
  // 3. 纠偏信号收割
  const corrections = harvestTodayCorrections();
  log(`今日纠偏信号: ${corrections.length}条`);
  
  // 4. 四维洞察
  const fourDimensions = generateFourDimensionInsights(insights, corrections, intentTrends);
  log(`四维洞察: 学习${fourDimensions.learning.corrections_count}, 用户模式${fourDimensions.user_patterns.top_intents.length}种, 知识治理[${fourDimensions.knowledge_governance.summary}], 进化建议${fourDimensions.evolution.count}条`);
  
  // 5. 北极星差距分析
  const northStarGap = assessNorthStarGap(insights, corrections);
  const avgScore = Object.values(northStarGap).reduce((s, v) => s + v.score, 0) / 5;
  log(`北极星综合评分: ${avgScore.toFixed(1)}/5`);
  for (const [name, data] of Object.entries(northStarGap)) {
    log(`  ${name}: ${data.score}/${data.max} - ${data.evidence.join(', ')}`);
  }
  
  // 6. 升级机会扫描
  const opportunities = scanUpgradeOpportunities();
  log(`发现 ${opportunities.length} 个升级机会`);
  
  // 7. 自动执行
  const upgrades = executeAutoUpgrades(opportunities);
  log(`执行 ${upgrades.length} 个升级动作`);
  
  // 写入报告
  const report = {
    date: dateStr,
    timezone: 'Asia/Shanghai',
    generated_at: new Date().toISOString(),
    intent_trends: intentTrends,
    insights_count: insights.length,
    insights_sample: insights.slice(0, 10).map(i => ({ type: i.type, skill: i.skill, finding: i.finding })),
    four_dimensions: fourDimensions,
    north_star_gap: northStarGap,
    north_star_avg_score: avgScore,
    upgrade_opportunities: opportunities,
    upgrades_executed: upgrades,
    summary: {
      intent_extraction_active: intentTrends.total_runs > 0,
      insights_flowing: insights.length > 0,
      corrections_today: corrections.length,
      system_upgrades: upgrades.length,
      north_star_score: `${avgScore.toFixed(1)}/5`,
      evolution_suggestions: fourDimensions.evolution.suggestions
    }
  };
  
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  log(`报告已写入: ${reportFile}`);
  
  // emit聚合事件
  if (opportunities.length > 0 || insights.length > 0) {
    const summaryEvent = {
      type: 'cras.daily.aggregation_complete',
      source: 'cras-daily-aggregator',
      timestamp: new Date().toISOString(),
      data: {
        date: dateStr,
        insights_count: insights.length,
        north_star_avg: avgScore,
        opportunities_count: opportunities.length,
        upgrades_executed: upgrades.length,
        report_path: reportFile
      }
    };
    fs.appendFileSync(EVENT_BUS, JSON.stringify(summaryEvent) + '\n');
  }
  
  return report;
}

if (require.main === module) {
  main();
}

module.exports = { main };
