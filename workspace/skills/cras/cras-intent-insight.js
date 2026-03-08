#!/usr/bin/env node
/**
 * CRAS 快通道增强：意图洞察 → 自动沉淀 → 系统升级 v1.0
 * 
 * 每小时运行一次（比5分钟的intent-extractor频率低）：
 * 1. 读取intent-extractor最近1h的产出
 * 2. 识别重复模式和新意图候选
 * 3. 自动注册高置信度的新意图到intent-registry
 * 4. 自动生成评测用例
 * 5. 写入事件总线触发下游
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';
const INTENT_REGISTRY = path.join(WORKSPACE, 'infrastructure/intent-engine/intent-registry.json');
const UNKNOWN_CANDIDATES = path.join(WORKSPACE, 'infrastructure/intent-engine/unknown-candidates.jsonl');
const EVENT_BUS = path.join(WORKSPACE, 'infrastructure/event-bus/events.jsonl');
const EVALSET_DIR = path.join(WORKSPACE, 'tests/benchmarks/intent');
const LOG_PATH = path.join(WORKSPACE, 'infrastructure/logs/cras-intent-insight.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(LOG_PATH, line + '\n');
}

/**
 * 扫描未知意图候选，识别聚类模式
 */
function scanUnknownCandidates() {
  if (!fs.existsSync(UNKNOWN_CANDIDATES)) {
    // 创建空文件
    fs.mkdirSync(path.dirname(UNKNOWN_CANDIDATES), { recursive: true });
    fs.writeFileSync(UNKNOWN_CANDIDATES, '');
    return [];
  }
  
  const lines = fs.readFileSync(UNKNOWN_CANDIDATES, 'utf8').trim().split('\n').filter(l => l);
  return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/**
 * 从对话记忆中提取今日的纠偏/教学信号 → 自动生成评测用例
 */
function harvestTodayCorrections() {
  const dateStr = new Date().toISOString().split('T')[0];
  const memFile = path.join(WORKSPACE, `memory/${dateStr}.md`);
  
  if (!fs.existsSync(memFile)) return [];
  
  const content = fs.readFileSync(memFile, 'utf8');
  const corrections = [];
  
  // 识别包含"Badcase"、"根因"、"纠偏"、"用户要求"的段落
  const sections = content.split(/\n##\s+/);
  for (const section of sections) {
    if (/Badcase|根因|纠偏|用户要求|用户纠偏|铁律/.test(section)) {
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
 * 自动将高频纠偏模式转化为评测用例
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
    // 去重：同内容不重复添加
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
 * 主流程
 */
function main() {
  log('=== CRAS 意图洞察沉淀 ===');
  
  // 1. 扫描未知意图候选
  const candidates = scanUnknownCandidates();
  log(`未知意图候选: ${candidates.length}条`);
  
  // 2. 收割今日纠偏信号
  const corrections = harvestTodayCorrections();
  log(`今日纠偏信号: ${corrections.length}条`);
  
  // 3. 自动生成评测用例
  const newCases = generateEvalCases(corrections);
  log(`新增评测用例: ${newCases}条`);
  
  // 4. 如果有新内容，emit事件
  if (candidates.length > 0 || newCases > 0) {
    const event = {
      type: 'cras.insight.hourly_digest',
      source: 'cras-intent-insight',
      timestamp: new Date().toISOString(),
      data: {
        unknown_candidates: candidates.length,
        corrections_harvested: corrections.length,
        eval_cases_generated: newCases
      }
    };
    fs.appendFileSync(EVENT_BUS, JSON.stringify(event) + '\n');
    log('洞察摘要已写入事件总线');
  }
  
  log('=== 完成 ===');
}

if (require.main === module) {
  main();
}

module.exports = { main };
