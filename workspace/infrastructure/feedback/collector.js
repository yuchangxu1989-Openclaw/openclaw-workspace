/**
 * 用户反馈收录系统
 * 
 * 来源：
 * 1. 手动提交（用户对话中说"记录问题/反馈"）
 * 2. AEO 评测失败自动收录
 * 3. 系统错误自动收录
 * 4. CRAS 洞察中的建议
 */
const fs = require('fs');
const path = require('path');

const FEEDBACK_DIR = path.join(__dirname, 'items');
const INDEX_FILE = path.join(__dirname, 'index.json');

if (!fs.existsSync(FEEDBACK_DIR)) fs.mkdirSync(FEEDBACK_DIR, { recursive: true });

const SOURCES = ['user', 'aeo', 'system', 'cras', 'evomap'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const STATUSES = ['new', 'triaged', 'in_progress', 'resolved', 'wontfix'];

function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) return { items: [], stats: { total: 0, by_source: {}, by_status: {} } };
  return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
}

function saveIndex(index) {
  index.stats = {
    total: index.items.length,
    by_source: {},
    by_status: {},
    by_priority: {}
  };
  index.items.forEach(item => {
    index.stats.by_source[item.source] = (index.stats.by_source[item.source] || 0) + 1;
    index.stats.by_status[item.status] = (index.stats.by_status[item.status] || 0) + 1;
    index.stats.by_priority[item.priority] = (index.stats.by_priority[item.priority] || 0) + 1;
  });
  index.last_updated = new Date().toISOString();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

function submit(feedback) {
  const id = `fb_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  const item = {
    id,
    title: feedback.title || '未命名反馈',
    description: feedback.description || '',
    source: SOURCES.includes(feedback.source) ? feedback.source : 'user',
    priority: PRIORITIES.includes(feedback.priority) ? feedback.priority : 'medium',
    status: 'new',
    skill_name: feedback.skill_name || null,
    tags: feedback.tags || [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  fs.writeFileSync(path.join(FEEDBACK_DIR, `${id}.json`), JSON.stringify(item, null, 2));
  
  const index = loadIndex();
  index.items.push({ id, title: item.title, source: item.source, priority: item.priority, status: item.status, created_at: item.created_at });
  saveIndex(index);
  
  console.log(`[Feedback] 收录: ${id} - ${item.title} (${item.source}/${item.priority})`);
  return id;
}

function autoCollectFromEvents() {
  // 尝试加载 event-bus，如不可用则跳过
  let bus = null;
  try {
    const busPath = path.join(__dirname, '..', 'event-bus', 'bus.js');
    if (fs.existsSync(busPath)) bus = require(busPath);
  } catch (e) {
    console.log('[Feedback] event-bus 不可用，跳过自动收录');
    return { collected: 0 };
  }

  if (!bus) return { collected: 0 };

  const events = bus.consume('feedback-collector', {
    types: ['aeo.assessment.failed', 'system.error']
  });
  
  let collected = 0;
  for (const event of events) {
    if (event.type === 'aeo.assessment.failed') {
      submit({
        title: `评测失败: ${event.payload?.skill_name}`,
        description: `${event.payload?.track} 轨道得分 ${event.payload?.score}, 问题: ${JSON.stringify(event.payload?.issues)}`,
        source: 'aeo',
        priority: event.payload?.score < 0.3 ? 'high' : 'medium',
        skill_name: event.payload?.skill_name,
        tags: ['auto-collected', 'assessment-failure']
      });
      collected++;
    }
    if (event.type === 'system.error') {
      submit({
        title: `系统错误: ${event.payload?.source}`,
        description: event.payload?.error || '',
        source: 'system',
        priority: 'high',
        tags: ['auto-collected', 'system-error']
      });
      collected++;
    }
    bus.ack('feedback-collector', event.id);
  }
  
  return { collected };
}

function query(filters = {}) {
  let items = loadIndex().items;
  if (filters.source) items = items.filter(i => i.source === filters.source);
  if (filters.status) items = items.filter(i => i.status === filters.status);
  if (filters.priority) items = items.filter(i => i.priority === filters.priority);
  return items;
}

function updateStatus(id, status) {
  const filePath = path.join(FEEDBACK_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return false;
  const item = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  item.status = status;
  item.updated_at = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(item, null, 2));
  
  const index = loadIndex();
  const idx = index.items.findIndex(i => i.id === id);
  if (idx >= 0) index.items[idx].status = status;
  saveIndex(index);
  return true;
}

if (require.main === module) {
  // 测试手动提交
  submit({ title: '测试反馈', description: '这是一条测试', source: 'user', priority: 'low' });
  
  // 测试自动收录
  const auto = autoCollectFromEvents();
  console.log('自动收录:', auto);
  
  // 查询
  const all = query({});
  console.log('总计:', all.length, '条反馈');
  all.forEach(i => console.log(' ', i.id, '-', i.title, `(${i.source}/${i.priority}/${i.status})`));
}

module.exports = { submit, autoCollectFromEvents, query, updateStatus };
