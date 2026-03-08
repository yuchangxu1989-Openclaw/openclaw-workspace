/**
 * AEO 评测结果持久化存储
 * 
 * 评测结果存储为 JSON + 可选向量化（需要智谱 API Key）
 */
const fs = require('fs');
const path = require('path');

const STORE_DIR = path.join(__dirname, 'store');
const INDEX_FILE = path.join(STORE_DIR, 'index.json');

// 确保目录存在
if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });

function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) return { assessments: [], last_updated: null };
  return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
}

function saveIndex(index) {
  index.last_updated = new Date().toISOString();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

/**
 * 存储评测结果
 */
function store(assessment) {
  const id = `assess_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  const record = {
    id,
    ...assessment,
    stored_at: new Date().toISOString()
  };
  
  // 写入单独文件
  fs.writeFileSync(path.join(STORE_DIR, `${id}.json`), JSON.stringify(record, null, 2));
  
  // 更新索引
  const index = loadIndex();
  index.assessments.push({
    id,
    skill_name: assessment.skill_name,
    track: assessment.track,
    score: assessment.score,
    passed: assessment.passed,
    stored_at: record.stored_at
  });
  
  // 保留最近 1000 条索引
  if (index.assessments.length > 1000) {
    index.assessments = index.assessments.slice(-1000);
  }
  
  saveIndex(index);
  console.log(`[AEO-Store] 已存储: ${id} (${assessment.skill_name}, ${assessment.track}, ${assessment.score})`);
  return id;
}

/**
 * 查询评测历史
 */
function query(filters = {}) {
  const index = loadIndex();
  let results = index.assessments;
  
  if (filters.skill_name) results = results.filter(a => a.skill_name === filters.skill_name);
  if (filters.track) results = results.filter(a => a.track === filters.track);
  if (filters.passed !== undefined) results = results.filter(a => a.passed === filters.passed);
  if (filters.min_score) results = results.filter(a => a.score >= filters.min_score);
  if (filters.limit) results = results.slice(-filters.limit);
  
  return results;
}

/**
 * 获取技能的评测趋势
 */
function trend(skillName, limit = 10) {
  return query({ skill_name: skillName, limit });
}

// CLI
if (require.main === module) {
  // 存储一些测试数据
  store({ skill_name: 'lto-core', track: 'quality', score: 0.88, passed: true, issues: [] });
  store({ skill_name: 'aeo', track: 'effect', score: 0.95, passed: true, issues: [] });
  store({ skill_name: 'cras', track: 'quality', score: 0.45, passed: false, issues: ['模拟数据'] });
  
  console.log('\n查询所有失败:', query({ passed: false }));
  console.log('\n查询lto-core趋势:', trend('lto-core'));
}

module.exports = { store, query, trend };
