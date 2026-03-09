/**
 * caijuedian-tribunal handler
 * 裁决殿：7席认知维度独立battle，生成裁决建议
 * 
 * Trigger events:
 *   - architecture.decision.major
 *   - design.direction.uncertain
 *   - system.evolution.direction_change
 *   - sprint.day.completed
 *   - review.rejection.count >= 2
 * 
 * Rule: rule.caijuedian-tribunal-001
 */
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '../../logs/caijuedian-tribunal.jsonl');
const ALERTS_FILE = path.resolve(__dirname, '../../logs/alerts.jsonl');

const SEATS = {
  '道': '第一性原理 — 追问本质',
  '战': '战略取舍 — 做什么不做什么',
  '工': '工程实现 — 可落地性',
  '盾': '风险安全 — 防御视角',
  '眼': '用户市场 — 需求洞察',
  '远': '未来进化 — 扩展性',
  '衡': '综合仲裁 — 最终建议',
};

const TRIGGER_EVENTS = [
  'architecture.decision.major',
  'design.direction.uncertain',
  'system.evolution.direction_change',
  'sprint.day.completed',
  'review.rejection.count',
];

module.exports = async function(event, rule, context) {
  const payload = event.payload || {};
  const subject = payload.subject || payload.title || event.type;

  // Validate: 半成品不进裁决殿
  if (payload.status === 'draft' || payload.status === 'incomplete') {
    return {
      success: false,
      result: 'blocked',
      reason: '半成品不进裁决殿，请完善后再提交',
    };
  }

  // Build tribunal session record
  const session = {
    timestamp: new Date().toISOString(),
    handler: 'caijuedian-tribunal',
    eventType: event.type,
    eventId: event.id,
    ruleId: rule.id,
    subject,
    seats: {},
    status: 'pending_battle',
    finalAuthority: 'user',
  };

  // Initialize each seat with pending status
  for (const [key, desc] of Object.entries(SEATS)) {
    session.seats[key] = {
      dimension: desc,
      verdict: null,
      reasoning: null,
      status: 'awaiting',
    };
  }

  // Write tribunal log
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(session) + '\n');

  // Write alert for visibility
  const alert = {
    timestamp: session.timestamp,
    handler: 'caijuedian-tribunal',
    severity: 'high',
    eventType: event.type,
    eventId: event.id,
    ruleId: rule.id,
    message: `裁决殿已受理: ${subject} — 7席battle待执行，用户是最终裁决者`,
    acknowledged: false,
  };
  const alertDir = path.dirname(ALERTS_FILE);
  if (!fs.existsSync(alertDir)) fs.mkdirSync(alertDir, { recursive: true });
  fs.appendFileSync(ALERTS_FILE, JSON.stringify(alert) + '\n');

  return {
    success: true,
    result: 'tribunal_initiated',
    session,
    message: `裁决殿已启动，主题: ${subject}，7席将独立battle，用户为最终裁决者`,
  };
};

// Allow direct invocation for testing
if (require.main === module) {
  const testEvent = {
    type: 'architecture.decision.major',
    id: 'test-' + Date.now(),
    payload: { subject: '测试裁决' },
  };
  const testRule = { id: 'rule.caijuedian-tribunal-001', name: '裁决殿' };
  module.exports(testEvent, testRule, {}).then(r => console.log(JSON.stringify(r, null, 2)));
}
