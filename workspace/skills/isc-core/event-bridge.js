/**
 * ISC 事件桥接 - 监控规则变更并发布事件
 * 
 * 工作方式：维护规则文件的 hash 快照，每次运行时比对变更
 * 由 Cron 或 dispatcher 定期触发
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const bus = require(path.join(__dirname, '..', '..', 'infrastructure', 'event-bus', 'bus.js'));

const RULES_DIR = path.join(__dirname, 'rules');
const SNAPSHOT_FILE = path.join(__dirname, '.rules-snapshot.json');

function hashFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('md5').update(content).digest('hex');
}

function loadSnapshot() {
  if (!fs.existsSync(SNAPSHOT_FILE)) return {};
  return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
}

function saveSnapshot(snapshot) {
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
}

function detectChanges() {
  const oldSnapshot = loadSnapshot();
  const newSnapshot = {};
  const changes = [];
  
  // 扫描当前规则（所有 .json 文件）
  const ruleFiles = fs.readdirSync(RULES_DIR)
    .filter(f => f.endsWith('.json'));
  
  for (const file of ruleFiles) {
    const filePath = path.join(RULES_DIR, file);
    const hash = hashFile(filePath);
    const ruleId = file.replace('.json', '');
    newSnapshot[ruleId] = hash;
    
    if (!oldSnapshot[ruleId]) {
      // 新规则
      changes.push({ type: 'created', rule_id: ruleId, file });
    } else if (oldSnapshot[ruleId] !== hash) {
      // 规则变更
      changes.push({ type: 'updated', rule_id: ruleId, file });
    }
  }
  
  // 检查删除的规则
  for (const ruleId of Object.keys(oldSnapshot)) {
    if (!newSnapshot[ruleId]) {
      changes.push({ type: 'deleted', rule_id: ruleId });
    }
  }
  
  // 保存新快照
  saveSnapshot(newSnapshot);
  
  return changes;
}

function publishChanges() {
  const changes = detectChanges();
  
  if (changes.length === 0) {
    console.log('[ISC-Bridge] 无规则变更');
    return { changes: 0 };
  }
  
  console.log(`[ISC-Bridge] 检测到 ${changes.length} 个变更`);
  
  for (const change of changes) {
    bus.emit(`isc.rule.${change.type}`, {
      rule_id: change.rule_id,
      action: change.type,
      file: change.file || null,
      detected_at: Date.now()
    }, 'isc-core');
    
    console.log(`[ISC-Bridge] 发布: isc.rule.${change.type} - ${change.rule_id}`);
  }
  
  return { changes: changes.length, details: changes };
}

// CLI
if (require.main === module) {
  const result = publishChanges();
  console.log(`[ISC-Bridge] 完成: ${JSON.stringify(result)}`);
}

/**
 * 统一规则变更事件 — 在 publishChanges 基础上额外发布汇总事件
 * @param {Array} changes - 变更列表
 * @returns {object} 发布的事件
 */
function emitRuleChanged(changes) {
  if (!changes || changes.length === 0) return null;
  const event = bus.emit('isc.rule.changed', {
    change_count: changes.length,
    changes: changes.map(c => ({ rule_id: c.rule_id, action: c.type })),
    timestamp: Date.now()
  }, 'isc-core');
  console.log(`[ISC-Bridge] 发布事件: isc.rule.changed (${changes.length} changes)`);
  return event;
}

/**
 * 规则检查接口 — 供 Dispatcher 反向调用
 * 检查规则是否存在、是否有效
 * @param {object} event - 触发事件
 * @returns {object} 检查结果
 */
function checkRulesFromEvent(event) {
  const payload = event.payload || event;
  const ruleId = payload.rule_id || payload.ruleId;
  
  const result = {
    status: 'ok',
    handler: 'isc-rule-check',
    timestamp: new Date().toISOString()
  };
  
  if (ruleId) {
    // 检查特定规则
    const ruleFile = path.join(RULES_DIR, `${ruleId}.json`);
    if (fs.existsSync(ruleFile)) {
      try {
        const rule = JSON.parse(fs.readFileSync(ruleFile, 'utf8'));
        result.rule = { id: ruleId, exists: true, valid: true, content: rule };
      } catch (err) {
        result.rule = { id: ruleId, exists: true, valid: false, error: err.message };
      }
    } else {
      result.rule = { id: ruleId, exists: false };
    }
  } else {
    // 返回所有规则摘要
    const ruleFiles = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.json'));
    result.rules = ruleFiles.map(f => ({
      id: f.replace('.json', ''),
      file: f
    }));
    result.total = ruleFiles.length;
  }
  
  return result;
}

/**
 * 增强版 publishChanges — 在发布细粒度事件之外额外发布汇总事件
 */
function publishChangesWithSummary() {
  const result = publishChanges();
  if (result.changes > 0 && result.details) {
    emitRuleChanged(result.details);
  }
  return result;
}

module.exports = { detectChanges, publishChanges, publishChangesWithSummary, emitRuleChanged, checkRulesFromEvent };
