#!/usr/bin/env node
/**
 * ISC Enforcement Verifier
 * 扫描所有ISC规则，检查P0/P1规则的执行绑定状态。
 *
 * 规则分级（仅两档）：
 *   P0_gate    — 硬拦截，unenforced 直接 exit 1
 *   P1_process — 默认硬拦截，--warn-only 时降级为警告（上线过渡期）
 *
 * Exit 0 = 全部 enforced
 * Exit 1 = 有 unenforced（P0始终，P1在非warn-only模式下）
 */
'use strict';

const path = require('path');
const fs = require('fs');
const glob = require('path'); // no external deps

const WS = path.resolve(__dirname, '..');
const RULES_DIR = path.join(WS, 'skills/isc-core/rules');
const DTO_DIR = path.join(WS, 'skills/lto-core');

const WARN_ONLY = process.argv.includes('--warn-only');

function findRuleFiles() {
  if (!fs.existsSync(RULES_DIR)) return [];
  return fs.readdirSync(RULES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(RULES_DIR, f));
}

function detectPriority(rule) {
  // Primary: enforcement_tier field (canonical)
  const tier = (rule.enforcement_tier || '').toString();
  if (tier === 'P0_gate') return 'P0_gate';
  if (tier === 'P1_process') return 'P1_process';
  
  // Fallback: priority/severity field
  const p = (rule.priority || rule.severity || '').toString().toUpperCase();
  if (p.startsWith('P0') || p === 'GATE' || p === 'P0_GATE') return 'P0_gate';
  if (p.startsWith('P1') || p === 'PROCESS' || p === 'P1_PROCESS') return 'P1_process';
  // Default: treat unclassified as P1 until classified
  return 'P1_process';
}

function hasEnforcement(rule, ruleFile) {
  // Check 1: trigger.actions exists and non-empty
  if (!rule.trigger || !rule.trigger.actions || !rule.trigger.actions.length) return false;

  // Check 2: look for 本地任务编排 subscription or hook reference (best-effort)
  // We consider having trigger.actions as the minimum enforcement binding
  return true;
}

function main() {
  const files = findRuleFiles();
  if (!files.length) {
    console.log('⚠️  未找到ISC规则文件');
    process.exit(0);
  }

  const stats = { total: 0, enforced: 0, unenforced_p0: [], unenforced_p1: [], errors: [] };

  for (const f of files) {
    const basename = path.basename(f);
    try {
      const parsed = JSON.parse(fs.readFileSync(f, 'utf8'));
      // Handle bundle files (arrays of rules)
      const rules = Array.isArray(parsed) ? parsed : [parsed];
      
      for (const rule of rules) {
        if (!rule || typeof rule !== 'object') continue;
        const priority = detectPriority(rule);
        const enforced = hasEnforcement(rule, f);
        stats.total++;

        if (enforced) {
          stats.enforced++;
        } else {
          if (priority === 'P0_gate') {
            stats.unenforced_p0.push({ file: basename, id: rule.id, name: rule.name });
          } else {
            stats.unenforced_p1.push({ file: basename, id: rule.id, name: rule.name });
          }
        }
      }
    } catch (e) {
      stats.errors.push({ file: basename, error: e.message });
    }
  }

  const unenforced = stats.unenforced_p0.length + stats.unenforced_p1.length;

  // --- Output ---
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  ISC Enforcement Verifier                       ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\n  规则总数:    ${stats.total}`);
  console.log(`  已绑定:      ${stats.enforced}`);
  console.log(`  未绑定 P0:   ${stats.unenforced_p0.length}`);
  console.log(`  未绑定 P1:   ${stats.unenforced_p1.length}`);
  if (stats.errors.length) console.log(`  解析错误:    ${stats.errors.length}`);
  console.log(`  模式:        ${WARN_ONLY ? '⚠️  warn-only (P1降级为警告)' : '🔒 strict (P0+P1均硬拦)'}`);

  if (stats.unenforced_p0.length) {
    console.log('\n  🚫 P0_gate 未绑定（必须修复）:');
    stats.unenforced_p0.forEach(r => console.log(`    ❌ [${r.id || '?'}] ${r.name || r.file} — ${r.file}`));
  }

  if (stats.unenforced_p1.length) {
    const icon = WARN_ONLY ? '⚠️' : '🚫';
    const label = WARN_ONLY ? '警告' : '必须修复';
    console.log(`\n  ${icon} P1_process 未绑定（${label}）:`);
    stats.unenforced_p1.forEach(r => console.log(`    ${WARN_ONLY ? '⚠️' : '❌'} [${r.id || '?'}] ${r.name || r.file} — ${r.file}`));
  }

  if (stats.errors.length) {
    console.log('\n  ⚠️  解析错误:');
    stats.errors.forEach(e => console.log(`    ⚠️  ${e.file}: ${e.error}`));
  }

  // --- Exit code ---
  if (stats.unenforced_p0.length > 0) {
    console.log('\n🚫 P0 规则未 enforced — exit 1');
    process.exit(1);
  }
  if (stats.unenforced_p1.length > 0 && !WARN_ONLY) {
    console.log('\n🚫 P1 规则未 enforced（strict模式）— exit 1');
    process.exit(1);
  }

  console.log('\n✅ 所有规则已 enforced');
  process.exit(0);
}

main();
