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

module.exports = { detectChanges, publishChanges };
