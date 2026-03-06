'use strict';

/**
 * gate-check handler — Runtime Enforcement PoC
 * 
 * Reads the ISC rule's check/trigger definition and validates the event payload.
 * Returns { passed: true } or { blocked: true, reason: "..." }
 */

const fs = require('fs');
const path = require('path');

const RULES_DIR = path.join(__dirname, '../../../skills/isc-core/rules');

/**
 * Load an ISC rule by ID from the rules directory.
 */
function loadRule(ruleId) {
  if (!fs.existsSync(RULES_DIR)) return null;
  const files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  for (const file of files) {
    try {
      const rule = JSON.parse(fs.readFileSync(path.join(RULES_DIR, file), 'utf8'));
      if (rule.id === ruleId) return rule;
    } catch (_) {}
  }
  return null;
}

/**
 * Load all P0 gate rules (enforcement_tier === 'P0_gate' or action.type === 'gate').
 */
function loadGateRules() {
  if (!fs.existsSync(RULES_DIR)) return [];
  const rules = [];
  const files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  for (const file of files) {
    try {
      const rule = JSON.parse(fs.readFileSync(path.join(RULES_DIR, file), 'utf8'));
      if (rule.enforcement_tier === 'P0_gate' || (rule.action && rule.action.type === 'gate')) {
        rules.push(rule);
      }
    } catch (_) {}
  }
  return rules;
}

/**
 * Check if an event type matches a rule's trigger events.
 */
function eventMatchesTrigger(eventType, trigger) {
  if (!trigger || !trigger.events) return false;
  // trigger.events can be { L1: [...], L2: [...], META: [...] } or flat array
  const allEvents = [];
  if (Array.isArray(trigger.events)) {
    allEvents.push(...trigger.events);
  } else {
    for (const tier of Object.values(trigger.events)) {
      if (Array.isArray(tier)) allEvents.push(...tier);
    }
  }
  return allEvents.some(e => {
    if (e === eventType) return true;
    if (e.endsWith('*') && eventType.startsWith(e.slice(0, -1))) return true;
    return false;
  });
}

/**
 * Core gate check logic:
 * For each matching P0 gate rule, verify the event payload meets basic requirements.
 */
function evaluateGate(event, rule) {
  const checks = [];

  // Basic: event must have a type
  if (!event.type && !event.eventType) {
    return { blocked: true, reason: `[${rule.id}] Event missing type field` };
  }

  // If rule requires gate-check_required condition, verify payload has gate evidence
  if (rule.trigger && rule.trigger.condition === 'gate-check_required') {
    // The event payload must indicate it has passed or is requesting a gate check
    // For enforcement: if the event represents an action without prior gate approval, block it
    if (!event.gateApproved && !event._gateCheckRequest) {
      return {
        blocked: true,
        reason: `[${rule.id}] ${rule.rule_name || rule.id}: Action requires gate check approval. No gateApproved flag in payload.`,
      };
    }
  }

  // If rule has explicit check fields, validate them
  if (rule.check) {
    for (const [field, constraint] of Object.entries(rule.check)) {
      if (constraint.required && !event[field] && !(event.payload && event.payload[field])) {
        return {
          blocked: true,
          reason: `[${rule.id}] Required field "${field}" missing from event payload`,
        };
      }
    }
  }

  return { passed: true };
}

/**
 * Handler entry point — called by dispatcher.
 * 
 * @param {object} event - The event being processed
 * @param {object} context - Dispatch context (rule, route, etc.)
 * @returns {{ passed: boolean, blocked?: boolean, reason?: string, checkedRules: string[] }}
 */
function handle(event, context) {
  const eventType = event.type || event.eventType || 'unknown';
  const gateRules = loadGateRules();
  const checkedRules = [];
  const results = [];

  for (const rule of gateRules) {
    if (eventMatchesTrigger(eventType, rule.trigger)) {
      checkedRules.push(rule.id);
      const result = evaluateGate(event, rule);
      results.push({ ruleId: rule.id, ...result });

      // If any rule blocks, return immediately (fail-fast)
      if (result.blocked) {
        return {
          blocked: true,
          reason: result.reason,
          checkedRules,
          handler: 'gate-check',
        };
      }
    }
  }

  // If no rules matched this event type, still pass (no gate required)
  return {
    passed: true,
    checkedRules,
    handler: 'gate-check',
  };
}

module.exports = handle;
module.exports.handle = handle;
module.exports.loadGateRules = loadGateRules;
module.exports.evaluateGate = evaluateGate;
module.exports.eventMatchesTrigger = eventMatchesTrigger;
module.exports.loadRule = loadRule;
