#!/usr/bin/env node
/**
 * ISC Handler: Dedup Scan
 * Checks for duplicate rules by comparing event sets, conditions, and actions.
 * Used by: rule.isc-rule-creation-dedup-gate-001, rule.isc-rule-modified-dedup-scan-001
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { scanFiles, readRuleJson, gateResult, writeReport } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');
const RULES_DIR = path.join(WORKSPACE, 'skills/isc-core/rules');

/**
 * Extract all event names from a rule's trigger config (handles various formats)
 */
function extractEvents(rule) {
  const events = new Set();
  const trigger = rule?.trigger;
  if (!trigger) return events;

  if (Array.isArray(trigger.events)) {
    trigger.events.forEach(e => typeof e === 'string' && events.add(e));
  } else if (trigger.events && typeof trigger.events === 'object') {
    // L1/L2/L3 format
    for (const level of Object.values(trigger.events)) {
      if (Array.isArray(level)) level.forEach(e => events.add(e));
    }
  }
  if (trigger.event) events.add(trigger.event);
  return events;
}

/**
 * Compute Jaccard similarity between two sets
 */
function setOverlap(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Phase 1: Fast filter by event intersection
 */
function findEventOverlaps(targetRule, allRules) {
  const targetEvents = extractEvents(targetRule);
  if (targetEvents.size === 0) return [];

  const candidates = [];
  for (const rule of allRules) {
    if (rule.id === targetRule.id) continue;
    const ruleEvents = extractEvents(rule);
    const overlap = setOverlap(targetEvents, ruleEvents);
    if (overlap > 0) {
      candidates.push({ rule, overlap });
    }
  }
  return candidates;
}

/**
 * Phase 2: Deep check — compare action type and handler
 */
function isActionEquivalent(a, b) {
  if (!a?.action || !b?.action) return false;
  return a.action.type === b.action.type && a.action.handler === b.action.handler;
}

function main() {
  const targetFile = process.env.TARGET_RULE || process.argv[2];
  const checks = [];

  if (!targetFile) {
    // Scan all rules for cross-duplicates
    const allRules = [];
    scanFiles(RULES_DIR, /^rule\..*\.json$/, (filePath) => {
      const rule = readRuleJson(filePath);
      if (rule) allRules.push(rule);
    });

    const duplicatePairs = new Set();
    for (const rule of allRules) {
      const overlaps = findEventOverlaps(rule, allRules);
      for (const { rule: candidate, overlap } of overlaps) {
        const pairKey = [rule.id, candidate.id].sort().join('|');
        if (duplicatePairs.has(pairKey)) continue;
        if (overlap >= 0.8 && isActionEquivalent(rule, candidate)) {
          duplicatePairs.add(pairKey);
          checks.push({
            name: `dedup:${rule.id}↔${candidate.id}`,
            ok: false,
            message: `Potential duplicate: event overlap=${overlap.toFixed(2)}, same handler=${rule.action?.handler}`,
          });
        }
      }
    }

    if (checks.length === 0) {
      checks.push({ name: 'dedup-global-scan', ok: true, message: 'No duplicates found' });
    }
  } else {
    // Single rule check
    const targetPath = path.isAbsolute(targetFile) ? targetFile : path.join(RULES_DIR, targetFile);
    const targetRule = readRuleJson(targetPath);
    if (!targetRule) {
      checks.push({ name: 'read-target', ok: false, message: `Cannot read rule: ${targetFile}` });
    } else {
      const allRules = [];
      scanFiles(RULES_DIR, /^rule\..*\.json$/, (filePath) => {
        const rule = readRuleJson(filePath);
        if (rule) allRules.push(rule);
      });

      const overlaps = findEventOverlaps(targetRule, allRules);
      if (overlaps.length === 0) {
        checks.push({ name: 'event-overlap', ok: true, message: 'No event overlap with existing rules' });
      } else {
        for (const { rule: candidate, overlap } of overlaps) {
          const actionEq = isActionEquivalent(targetRule, candidate);
          const isDup = overlap >= 0.8 && actionEq;
          checks.push({
            name: `vs:${candidate.id}`,
            ok: !isDup,
            message: isDup
              ? `DUPLICATE: overlap=${overlap.toFixed(2)}, same action/handler`
              : `Similar events (overlap=${overlap.toFixed(2)}) but different action — OK`,
          });
        }
      }
    }
  }

  const result = gateResult('dedup-scan', checks);
  const reportPath = path.join(WORKSPACE, 'reports', 'dedup-scan-latest.json');
  writeReport(reportPath, result);

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.exitCode);
}

main();
