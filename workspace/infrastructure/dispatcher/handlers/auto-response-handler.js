'use strict';

/**
 * Auto-Response Handler
 * 
 * [Day3-Gap2] 事件驱动的自动响应管道 handler。
 * 接收 evolver.insight.detected / cras.insight.critical / system.metric.threshold_exceeded
 * 事件，执行分类、影响评估和响应逻辑。
 * 
 * 取代旧模式中 Cron 独立触发的响应路径。
 * 
 * Triggered by:
 *   - evolver.insight.detected
 *   - cras.insight.critical
 *   - system.metric.threshold_exceeded
 * 
 * @module infrastructure/dispatcher/handlers/auto-response-handler
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..', '..', '..');
const LOG_DIR = path.join(WORKSPACE, 'infrastructure', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'auto-response.jsonl');

// ─── Observability ───
let _metrics = null;
try { _metrics = require('../../observability/metrics'); } catch (_) {}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

// ─── Security / Quality Classification ───

const SECURITY_KEYWORDS = [
  'vulnerability', 'exploit', 'malware', 'injection',
  'oauth', 'permission', 'security', 'cve', 'auth',
  'xss', 'csrf', 'rce', 'privilege'
];

const QUALITY_KEYWORDS = [
  'performance', 'reliability', 'coverage', 'test_failure',
  'quality', 'degradation', 'bottleneck', 'regression',
  'error_rate', 'latency', 'timeout'
];

function classify(event) {
  const text = JSON.stringify(event.payload || event).toLowerCase();
  
  const isSecurityIssue = SECURITY_KEYWORDS.some(kw => text.includes(kw));
  const isQualityIssue = QUALITY_KEYWORDS.some(kw => text.includes(kw));
  
  if (isSecurityIssue) return 'security';
  if (isQualityIssue) return 'quality';
  
  // Event-type based classification
  if (event.type === 'system.metric.threshold_exceeded') return 'system_alert';
  if (event.type === 'cras.insight.critical') return 'critical_insight';
  
  return 'unknown';
}

function assessImpact(event, category) {
  const payload = event.payload || {};
  
  // Impact assessment based on event characteristics
  let severity = 'low';
  let autoFixable = false;
  let blastRadius = 1;
  
  if (category === 'security') {
    severity = 'critical';
    blastRadius = 10;
    autoFixable = false;
  } else if (category === 'critical_insight') {
    severity = payload.impact >= 0.9 ? 'critical' : 'high';
    blastRadius = payload.scope === 'system_wide' ? 10 : 5;
    autoFixable = false;
  } else if (category === 'quality') {
    severity = 'medium';
    blastRadius = payload.affectedComponents ? payload.affectedComponents.length : 3;
    autoFixable = blastRadius < 5;
  } else if (category === 'system_alert') {
    severity = 'high';
    blastRadius = 5;
    autoFixable = false;
  }
  
  return {
    category,
    severity,
    autoFixable,
    blastRadius,
    needsEscalation: severity === 'critical' || blastRadius >= 10,
    confidence: category !== 'unknown' ? 0.8 : 0.3,
  };
}

/**
 * Handle auto-response events.
 * 
 * @param {object} event - The dispatcher event
 * @param {object} [context] - Dispatcher context
 * @returns {object} Handler result
 */
async function handle(event, context) {
  const startTime = Date.now();
  
  try {
    ensureLogDir();
    
    const category = classify(event);
    const impact = assessImpact(event, category);
    
    const entry = {
      ts: new Date().toISOString(),
      eventId: event.id || 'unknown',
      eventType: event.type || 'unknown',
      source: event.source || 'unknown',
      category,
      impact,
      action: impact.needsEscalation ? 'escalate' : (impact.autoFixable ? 'auto_fix_candidate' : 'log_and_monitor'),
      duration_ms: Date.now() - startTime,
    };
    
    // Log the response
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
    
    // Track metrics
    if (_metrics) {
      _metrics.inc('pipeline_runs_total');
      _metrics.inc('dispatch_success');
    }
    
    console.log(`[auto-response-handler] ${event.type} → ${category} (${impact.severity}) → ${entry.action}`);
    
    return {
      status: 'ok',
      handler: 'auto-response-handler',
      category,
      impact,
      action: entry.action,
      eventId: event.id,
      duration_ms: entry.duration_ms,
    };
    
  } catch (err) {
    console.error(`[auto-response-handler] Error: ${err.message}`);
    if (_metrics) _metrics.inc('dispatch_failed');
    
    return {
      status: 'error',
      handler: 'auto-response-handler',
      error: err.message,
      duration_ms: Date.now() - startTime,
    };
  }
}

module.exports = handle;
module.exports.handle = handle;
