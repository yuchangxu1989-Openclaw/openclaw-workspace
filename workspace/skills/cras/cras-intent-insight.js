#!/usr/bin/env node
/**
 * CRAS 快通道：意图洞察 → 自动沉淀 → 系统升级 v2.0
 * 
 * 修复: 时区统一Asia/Shanghai, 四维洞察产出, 学术洞察→PDCA反馈闭环
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';
const INTENT_REGISTRY = path.join(WORKSPACE, 'infrastructure/intent-engine/intent-registry.json');
const UNKNOWN_CANDIDATES = path.join(WORKSPACE, 'infrastructure/intent-engine/unknown-candidates.jsonl');
const EVENT_BUS = path.join(WORKSPACE, 'infrastructure/event-bus/events.jsonl');
const EVALSET_DIR = path.join(WORKSPACE, 'tests/benchmarks/intent');
const LOG_PATH = path.join(WORKSPACE, 'infrastructure/logs/cras-intent-insight.log');
const PDCA_SUGGESTIONS = path.join(WORKSPACE, 'skills/aeo/pdca/improvement-suggestions.jsonl');
const RESEARCH_DIR = path.join(WORKSPACE, 'skills/cras/insights');
const PATTERNS_JSONL = path.join(WORKSPACE, 'reports/intent/patterns.jsonl');

/** Asia/Shanghai日期 */
function getShanghaiDateStr(date = new Date()) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  // Note: cron handles file writing via >> redirect; no appendFileSync needed
}

/**
 * 扫描未知意图候选
 */
function scanUnknownCandidates() {
  if (!fs.existsSync(UNKNOWN_CANDIDATES)) {
    fs.mkdirSync(path.dirname(UNKNOWN_CANDIDATES), { recursive: true });
    fs.writeFileSync(UNKNOWN_CANDIDATES, '');
    return [];
  }
  const lines = fs.readFileSync(UNKNOWN_CANDIDATES, 'utf8').trim().split('\n').filter(l => l);
  return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/**
 * 从对话记忆中提取今日纠偏/教学信号
 */
function harvestTodayCorrections() {
  const dateStr = getShanghaiDateStr();
  const memFile = path.join(WORKSPACE, `memory/${dateStr}.md`);
  if (!fs.existsSync(memFile)) return [];
  
  const content = fs.readFileSync(memFile, 'utf8');
  const corrections = [];
  const sections = content.split(/\n##\s+/);
  for (const section of sections) {
    if (/Badcase|根因|纠偏|用户要求|用户纠偏|铁律|错误|修复|教训/.test(section)) {
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
 * 自动将纠偏转化为评测用例
 */
function generateEvalCases(corrections) {
  if (corrections.length === 0) return 0;
  
  const autoEvalFile = path.join(EVALSET_DIR, 'auto-generated-from-corrections.json');
  let existing = [];
  if (fs.existsSync(autoEvalFile)) {
    try { existing = JSON.parse(fs.readFileSync(autoEvalFile, 'utf8')); } catch { existing = []; }
  }
  
  let added = 0;
  for (const c of corrections) {
    const contentHash = c.content.slice(0, 100);
    if (existing.some(e => e.content_hash === contentHash)) continue;
    existing.push({
      id: `auto-eval-${Date.now()}-${added}`,
      level: 'C2',
      category: 'auto-harvested-correction',
      content_hash: contentHash,
      source: c.source,
      created_at: c.timestamp,
      data_source: 'real_conversation',
      signal: c.content.slice(0, 300)
    });
    added++;
  }
  
  if (added > 0) {
    fs.mkdirSync(path.dirname(autoEvalFile), { recursive: true });
    fs.writeFileSync(autoEvalFile, JSON.stringify(existing, null, 2));
  }
  return added;
}

/**
 * 战略行研 → PDCA反馈闭环
 * 
 * 扫描insights中的研究类洞察，识别与PDCA度量改进相关的内容，
 * 自动输出建议到pdca-engine/improvement-suggestions.jsonl
 */
function researchToPdcaFeedback() {
  // 相关关键词族
  const PDCA_RELEVANCE_KEYWORDS = [
    // Agent自主性
    'autonomy', 'autonomous', 'self-directed', 'agency', '自主', '自治', 'agentic',
    // PDCA度量
    'metric', 'measure', 'kpi', 'okr', 'benchmark', '度量', '指标', '评估', 'evaluation',
    // 多Agent协同
    'multi-agent', 'collaboration', 'orchestration', 'swarm', '多智能体', '协同', 'coordination',
    // 自我进化
    'self-improvement', 'self-evolving', 'meta-learning', 'continual learning', '自我进化', '持续学习',
    // 方法论
    'framework', 'methodology', 'approach', 'paradigm', '方法论', '范式'
  ];
  
  // PDCA度量文件映射：建议可以改进哪些文件
  const PDCA_TARGET_FILES = [
    'skills/aeo/pdca/SKILL.md',
    'skills/aeo/pdca/pdca-metrics.json',
    'skills/aeo/pdca/pdca-cycle-runner.js',
    'infrastructure/intent-engine/intent-registry.json'
  ];
  
  if (!fs.existsSync(RESEARCH_DIR)) return 0;
  
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(RESEARCH_DIR).filter(f => f.endsWith('.json'));
  let suggestionsEmitted = 0;
  
  // 加载已有建议去重
  const existingHashes = new Set();
  if (fs.existsSync(PDCA_SUGGESTIONS)) {
    const lines = fs.readFileSync(PDCA_SUGGESTIONS, 'utf8').trim().split('\n').filter(l => l);
    for (const l of lines) {
      try {
        const s = JSON.parse(l);
        if (s._hash) existingHashes.add(s._hash);
      } catch {}
    }
  }
  
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(RESEARCH_DIR, f), 'utf8'));
      const ts = typeof data.timestamp === 'string' ? Date.parse(data.timestamp) : Number(data.timestamp);
      if (isNaN(ts) || ts < last24h) continue;
      
      // 检查是否与PDCA相关
      const text = JSON.stringify(data).toLowerCase();
      const matchedKeywords = PDCA_RELEVANCE_KEYWORDS.filter(kw => text.includes(kw.toLowerCase()));
      if (matchedKeywords.length < 2) continue; // 至少匹配2个关键词才认为相关
      
      // 确定建议改进的目标文件
      let targetFile = PDCA_TARGET_FILES[0]; // 默认
      if (matchedKeywords.some(k => /metric|measure|度量|指标|kpi/.test(k))) {
        targetFile = PDCA_TARGET_FILES[1]; // pdca-metrics.json
      } else if (matchedKeywords.some(k => /framework|methodology|方法论|paradigm/.test(k))) {
        targetFile = PDCA_TARGET_FILES[2]; // pdca-cycle-runner.js
      }
      
      const finding = data.finding || data.content || data.signal || JSON.stringify(data).slice(0, 300);
      const hash = Buffer.from(finding.slice(0, 100)).toString('base64').slice(0, 20);
      
      if (existingHashes.has(hash)) continue;
      
      const suggestion = {
        date: getShanghaiDateStr(),
        source: `cras/insights/${f}`,
        insight: finding.slice(0, 500),
        matched_keywords: matchedKeywords,
        relevance_score: Math.min(1, matchedKeywords.length / 5),
        suggested_change: inferSuggestedChange(matchedKeywords, finding),
        target_file: targetFile,
        _hash: hash,
        emitted_at: new Date().toISOString()
      };
      
      fs.mkdirSync(path.dirname(PDCA_SUGGESTIONS), { recursive: true });
      fs.appendFileSync(PDCA_SUGGESTIONS, JSON.stringify(suggestion) + '\n');
      suggestionsEmitted++;
      existingHashes.add(hash);
    } catch {}
  }
  
  return suggestionsEmitted;
}

/** 根据匹配的关键词推断建议的改变 */
function inferSuggestedChange(keywords, finding) {
  const keywordSet = new Set(keywords.map(k => k.toLowerCase()));
  
  if (keywordSet.has('autonomy') || keywordSet.has('自主') || keywordSet.has('agentic')) {
    return '考虑在PDCA度量中增加Agent自主决策比率指标（自主完成任务数/总任务数）';
  }
  if (keywordSet.has('multi-agent') || keywordSet.has('多智能体') || keywordSet.has('协同')) {
    return '考虑增加多Agent协同效率度量（协同任务完成时间/单Agent基线时间）';
  }
  if (keywordSet.has('meta-learning') || keywordSet.has('continual learning') || keywordSet.has('自我进化')) {
    return '考虑增加进化速率度量（单位时间内规则/技能的有效新增数）';
  }
  if (keywordSet.has('benchmark') || keywordSet.has('evaluation') || keywordSet.has('评估')) {
    return '考虑引入该评估方法论改进当前PDCA的Check阶段度量';
  }
  if (keywordSet.has('metric') || keywordSet.has('度量') || keywordSet.has('指标')) {
    return '考虑将该度量方法集成到PDCA度量体系中';
  }
  
  return `基于洞察"${finding.slice(0, 80)}..."评估是否可改进PDCA度量标准`;
}

function writeIntentPatterns(metrics) {
  fs.mkdirSync(path.dirname(PATTERNS_JSONL), { recursive: true });
  const record = {
    ts: new Date().toISOString(),
    tz: 'Asia/Shanghai',
    ...metrics,
  };
  fs.appendFileSync(PATTERNS_JSONL, JSON.stringify(record) + '\n');
  return 1;
}

/**
 * 主流程
 */
function main() {
  log('=== CRAS 意图洞察沉淀 v2.0 ===');
  
  // 1. 扫描未知意图候选
  const candidates = scanUnknownCandidates();
  log(`未知意图候选: ${candidates.length}条`);
  
  // 2. 收割今日纠偏信号
  const corrections = harvestTodayCorrections();
  log(`今日纠偏信号: ${corrections.length}条`);
  
  // 3. 自动生成评测用例
  const newCases = generateEvalCases(corrections);
  log(`新增评测用例: ${newCases}条`);
  
  // 4. 战略行研 → PDCA反馈闭环
  const pdcaSuggestions = researchToPdcaFeedback();
  log(`PDCA改进建议: ${pdcaSuggestions}条`);

  // 5. 新模式写入 reports/intent/patterns.jsonl
  const patternCount = writeIntentPatterns({
    date: getShanghaiDateStr(),
    unknown_candidates: candidates.length,
    corrections_harvested: corrections.length,
    eval_cases_generated: newCases,
    pdca_suggestions_emitted: pdcaSuggestions
  });
  log(`模式写入: ${patternCount}条`);
  
  // 6. emit事件
  if (candidates.length > 0 || newCases > 0 || pdcaSuggestions > 0) {
    const event = {
      type: 'cras.insight.hourly_digest',
      source: 'cras-intent-insight',
      timestamp: new Date().toISOString(),
      data: {
        unknown_candidates: candidates.length,
        corrections_harvested: corrections.length,
        eval_cases_generated: newCases,
        pdca_suggestions_emitted: pdcaSuggestions
      }
    };
    fs.mkdirSync(path.dirname(EVENT_BUS), { recursive: true });
    fs.appendFileSync(EVENT_BUS, JSON.stringify(event) + '\n');
    log('洞察摘要已写入事件总线');
  }
  
  log('=== 完成 ===');
}

if (require.main === module) {
  main();
}

module.exports = { main };
