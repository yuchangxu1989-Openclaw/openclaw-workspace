#!/usr/bin/env node
/**
 * Dependency Direction Check (CI Gate)
 * 
 * 5 Rules:
 *   DEP-001: L1 must not depend on L3 (skills/ non-event-bridge → infrastructure/)
 *   DEP-002: L2 must not depend on L3 (skills/ event-bridge → infrastructure/ directly)
 *   DEP-003: No circular dependencies between L3 modules (hard requires only)
 *   DEP-004: External dependencies must be declared in package.json
 *   DEP-005: No direct require of .secrets/
 *
 * Usage:
 *   node dependency-check.js              # Check all staged files
 *   node dependency-check.js --all        # Check all JS files in workspace
 *   node dependency-check.js --files a.js b.js  # Check specific files
 *
 * Exit codes:
 *   0 = pass
 *   1 = violations found
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WS = path.resolve(__dirname, '..');
const INFRA_DIR = path.join(WS, 'infrastructure');
const SKILLS_DIR = path.join(WS, 'skills');

// Node.js built-in modules (v22+)
const BUILTIN_MODULES = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster',
  'console', 'constants', 'crypto', 'dgram', 'diagnostics_channel',
  'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https',
  'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl',
  'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events',
  'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
  // node: prefixed
  'node:assert', 'node:buffer', 'node:child_process', 'node:cluster',
  'node:console', 'node:constants', 'node:crypto', 'node:dgram',
  'node:diagnostics_channel', 'node:dns', 'node:domain', 'node:events',
  'node:fs', 'node:http', 'node:http2', 'node:https', 'node:inspector',
  'node:module', 'node:net', 'node:os', 'node:path', 'node:perf_hooks',
  'node:process', 'node:punycode', 'node:querystring', 'node:readline',
  'node:repl', 'node:stream', 'node:string_decoder', 'node:sys',
  'node:timers', 'node:tls', 'node:trace_events', 'node:tty', 'node:url',
  'node:util', 'node:v8', 'node:vm', 'node:wasi', 'node:worker_threads',
  'node:zlib', 'node:test',
]);

// EventBus SDK exception — once created, this path is the only allowed L2→L3 bridge
const EVENTBUS_SDK_ALLOWED = 'infrastructure/event-bus/sdk.js';

// ─── File Discovery ───────────────────────────────────────────────────

function getStagedFiles() {
  try {
    return execSync('git diff --cached --name-only --diff-filter=ACM', {
      cwd: WS, encoding: 'utf8'
    }).trim().split('\n').filter(f => /\.[cm]?js$/.test(f));
  } catch { return []; }
}

function getAllJSFiles() {
  const results = [];
  function walk(dir, rel) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.test-tmp')) continue;
        walk(fullPath, relPath);
      } else if (/\.[cm]?js$/.test(entry.name) && !/\.(test|spec)\.[cm]?js$/.test(entry.name)) {
        results.push(relPath);
      }
    }
  }
  if (fs.existsSync(INFRA_DIR)) walk(INFRA_DIR, 'infrastructure');
  if (fs.existsSync(SKILLS_DIR)) walk(SKILLS_DIR, 'skills');
  return results;
}

// ─── Require Extraction ───────────────────────────────────────────────

/**
 * Extract require() and import statements from a file.
 * Returns: [{ line: number, raw: string, target: string, isLazy: boolean }]
 */
function extractRequires(filePath) {
  const fullPath = path.join(WS, filePath);
  if (!fs.existsSync(fullPath)) return [];

  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  const results = [];

  // Track if we're inside a try block or function body (heuristic)
  let tryDepth = 0;
  let funcDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    // Heuristic: track try/function depth
    if (/\btry\s*\{/.test(line)) tryDepth++;
    if (/\bfunction\b/.test(line) && /\{/.test(line)) funcDepth++;
    if (/\}\s*catch/.test(line)) tryDepth = Math.max(0, tryDepth - 1);

    // Match require('...')
    const reqMatches = line.matchAll(/require\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g);
    for (const m of reqMatches) {
      results.push({
        line: i + 1,
        raw: m[0],
        target: m[2],
        isLazy: tryDepth > 0 || funcDepth > 0,
      });
    }

    // Match import ... from '...'
    const importMatch = line.match(/(?:import|from)\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      results.push({
        line: i + 1,
        raw: importMatch[0],
        target: importMatch[1],
        isLazy: false,
      });
    }

    // Match dynamic requires: require(path.join(__dirname, '..', '..', 'infrastructure', ...))
    if (/require\s*\(.*path\.join/.test(line) && /infrastructure/.test(line)) {
      results.push({
        line: i + 1,
        raw: line.trim(),
        target: 'infrastructure/*dynamic*',
        isLazy: tryDepth > 0 || funcDepth > 0,
        isDynamic: true,
      });
    }

    // Match dynamic requires: require(path.join(WORKSPACE, 'skills', ...))
    if (/require\s*\(.*path\.join/.test(line) && /skills/.test(line) && !/'skills'.*'shared'/.test(line)) {
      results.push({
        line: i + 1,
        raw: line.trim(),
        target: 'skills/*dynamic*',
        isLazy: tryDepth > 0 || funcDepth > 0,
        isDynamic: true,
      });
    }

    // Track closing braces (rough heuristic)
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    if (closes > opens && funcDepth > 0) funcDepth--;
  }

  return results;
}

/**
 * Classify a file into layer.
 * Returns: 'L1' | 'L2' | 'L3' | null
 */
function classifyFile(filePath) {
  if (filePath.startsWith('infrastructure/')) return 'L3';
  if (filePath.startsWith('skills/')) {
    // L2 if it's an event-bridge file or contains event-bridge requires
    if (/event-bridge/.test(filePath) || /rule-suggester/.test(filePath)) return 'L2';
    return 'L1';
  }
  return null;
}

/**
 * Get the L3 module name from a file path.
 */
function getL3Module(filePath) {
  const m = filePath.match(/^infrastructure\/([^/]+)/);
  return m ? m[1] : null;
}

/**
 * Resolve a relative require target to a workspace-relative path.
 */
function resolveRequire(fromFile, target) {
  if (!target.startsWith('.')) return null; // not a relative require
  const fromDir = path.dirname(path.join(WS, fromFile));
  const resolved = path.resolve(fromDir, target);
  const relToWs = path.relative(WS, resolved);
  return relToWs;
}

/**
 * Check if a require target references infrastructure/.
 */
function targetsInfrastructure(fromFile, target) {
  // Direct path.join patterns
  if (/infrastructure/.test(target)) return true;
  // Relative path resolution
  const resolved = resolveRequire(fromFile, target);
  if (resolved && resolved.startsWith('infrastructure/')) return true;
  return false;
}

/**
 * Check if a require target references skills/.
 */
function targetsSkills(fromFile, target) {
  if (/skills/.test(target)) return true;
  const resolved = resolveRequire(fromFile, target);
  if (resolved && resolved.startsWith('skills/')) return true;
  return false;
}

// ─── Rule Checks ──────────────────────────────────────────────────────

function checkDEP001(files) {
  // L1 must not depend on L3
  const violations = [];
  for (const f of files) {
    if (classifyFile(f) !== 'L1') continue;
    for (const req of extractRequires(f)) {
      if (targetsInfrastructure(f, req.target)) {
        violations.push({
          rule: 'DEP-001',
          file: f,
          line: req.line,
          message: `L1 skill requires L3 infrastructure: ${req.target}`,
          severity: 'error',
        });
      }
    }
  }
  return violations;
}

function checkDEP002(files) {
  // L2 must not depend on L3 (direct require, SDK exception pending)
  const violations = [];
  for (const f of files) {
    if (classifyFile(f) !== 'L2') continue;
    for (const req of extractRequires(f)) {
      if (targetsInfrastructure(f, req.target)) {
        // Check if it's the allowed SDK path (future)
        const resolved = resolveRequire(f, req.target);
        if (resolved && resolved === EVENTBUS_SDK_ALLOWED) continue;

        violations.push({
          rule: 'DEP-002',
          file: f,
          line: req.line,
          message: `L2 skill directly requires L3 infrastructure: ${req.target} (should use EventBus SDK)`,
          severity: 'warning', // warning until SDK is created, then escalate to error
        });
      }
    }
  }
  return violations;
}

function checkDEP003(files) {
  // No circular dependencies between L3 modules (hard requires only)
  // Build adjacency list from ALL L3 files (not just staged)
  const allL3Files = getAllJSFiles().filter(f => f.startsWith('infrastructure/'));
  const adj = new Map(); // module → Set<module>

  for (const f of allL3Files) {
    const fromMod = getL3Module(f);
    if (!fromMod) continue;
    if (!adj.has(fromMod)) adj.set(fromMod, new Set());

    for (const req of extractRequires(f)) {
      if (req.isLazy) continue; // skip lazy requires for cycle detection
      const resolved = resolveRequire(f, req.target);
      if (!resolved || !resolved.startsWith('infrastructure/')) continue;
      const toMod = getL3Module(resolved);
      if (toMod && toMod !== fromMod) {
        adj.get(fromMod).add(toMod);
      }
    }
  }

  // DFS cycle detection
  const cycles = [];
  const visited = new Set();
  const stack = new Set();
  const pathStack = [];

  function dfs(node) {
    if (stack.has(node)) {
      // Found cycle
      const cycleStart = pathStack.indexOf(node);
      const cycle = pathStack.slice(cycleStart).concat(node);
      cycles.push(cycle);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    pathStack.push(node);

    for (const neighbor of (adj.get(node) || [])) {
      dfs(neighbor);
    }

    stack.delete(node);
    pathStack.pop();
  }

  for (const mod of adj.keys()) {
    dfs(mod);
  }

  // Only report if staged files are in the cycle
  const stagedL3Mods = new Set(files.filter(f => f.startsWith('infrastructure/')).map(f => getL3Module(f)).filter(Boolean));

  return cycles
    .filter(cycle => {
      // In --all mode, report all; otherwise only if staged file is involved
      if (stagedL3Mods.size === 0 && files.length > 0) return true; // --all mode
      return cycle.some(mod => stagedL3Mods.has(mod));
    })
    .map(cycle => ({
      rule: 'DEP-003',
      file: cycle.join(' → '),
      line: 0,
      message: `L3 circular dependency: ${cycle.join(' → ')}`,
      severity: 'error',
    }));
}

function checkDEP004(files) {
  // External dependencies must be declared in package.json
  const violations = [];

  // Load root package.json deps
  const rootPkgPath = path.join(WS, 'package.json');
  let rootDeps = new Set();
  if (fs.existsSync(rootPkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
      const all = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
        ...(pkg.optionalDependencies || {}),
      };
      rootDeps = new Set(Object.keys(all));
    } catch {}
  }

  // Also check per-module package.json
  function getLocalDeps(filePath) {
    const parts = filePath.split('/');
    // Check infrastructure/MODULE/package.json or skills/MODULE/package.json
    if (parts.length >= 2) {
      const localPkg = path.join(WS, parts[0], parts[1], 'package.json');
      if (fs.existsSync(localPkg)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(localPkg, 'utf8'));
          return new Set(Object.keys({
            ...(pkg.dependencies || {}),
            ...(pkg.devDependencies || {}),
          }));
        } catch {}
      }
    }
    return new Set();
  }

  for (const f of files) {
    const localDeps = getLocalDeps(f);
    for (const req of extractRequires(f)) {
      const target = req.target;
      // Skip relative requires
      if (target.startsWith('.') || target.startsWith('/')) continue;
      // Skip dynamic requires (already handled by other rules)
      if (req.isDynamic || /\*dynamic\*/.test(target)) continue;
      // Skip template literal placeholders
      if (/\$\{/.test(target)) continue;
      // Skip Node.js builtins
      if (BUILTIN_MODULES.has(target)) continue;
      // Get package name (handle scoped packages)
      const pkgName = target.startsWith('@')
        ? target.split('/').slice(0, 2).join('/')
        : target.split('/')[0];
      if (BUILTIN_MODULES.has(pkgName)) continue;

      if (!rootDeps.has(pkgName) && !localDeps.has(pkgName)) {
        violations.push({
          rule: 'DEP-004',
          file: f,
          line: req.line,
          message: `External dependency not declared in package.json: ${pkgName}`,
          severity: 'warning',
        });
      }
    }
  }
  return violations;
}

function checkDEP005(files) {
  // No direct require/reference to .secrets/
  const violations = [];
  for (const f of files) {
    const fullPath = path.join(WS, f);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

      // Match .secrets references (require, readFileSync, path constants, etc.)
      // Exempt: skills/shared/paths.js is the designated secrets path provider
      if (f === 'skills/shared/paths.js') continue;
      if (/['"\/]\.secrets[\/'"]/i.test(line) || /\.secrets\//.test(line)) {
        violations.push({
          rule: 'DEP-005',
          file: f,
          line: i + 1,
          message: `Direct .secrets/ reference found. Use environment variables or shared/paths.js SECRETS_DIR instead.`,
          severity: 'error',
        });
      }
    }
  }
  return violations;
}

// Also check: L3 → L1/L2 violations (infrastructure requiring skills)
function checkL3toL1L2(files) {
  const violations = [];
  for (const f of files) {
    if (classifyFile(f) !== 'L3') continue;
    for (const req of extractRequires(f)) {
      if (targetsSkills(f, req.target)) {
        violations.push({
          rule: 'DEP-001-R',
          file: f,
          line: req.line,
          message: `L3 infrastructure requires L1/L2 skill: ${req.target}`,
          severity: 'error',
        });
      }
    }
  }
  return violations;
}

// ─── Main ─────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  let files;

  if (args.includes('--all')) {
    files = getAllJSFiles();
  } else if (args.includes('--files')) {
    const idx = args.indexOf('--files');
    files = args.slice(idx + 1).filter(f => /\.[cm]?js$/.test(f));
  } else {
    files = getStagedFiles();
    if (!files.length) {
      if (!args.includes('--quiet')) console.log('✅ DEP-CHECK: No staged JS files');
      process.exit(0);
    }
  }

  const allViolations = [
    ...checkDEP001(files),
    ...checkDEP002(files),
    ...checkDEP003(files),
    ...checkDEP004(files),
    ...checkDEP005(files),
    ...checkL3toL1L2(files),
  ];

  const errors = allViolations.filter(v => v.severity === 'error');
  const warnings = allViolations.filter(v => v.severity === 'warning');

  // Output
  if (args.includes('--json')) {
    console.log(JSON.stringify({ errors, warnings, total: allViolations.length }, null, 2));
  } else {
    if (warnings.length) {
      console.log('⚠️  DEP-CHECK 警告:');
      for (const w of warnings) {
        console.log(`  [${w.rule}] ${w.file}:${w.line} — ${w.message}`);
      }
    }
    if (errors.length) {
      console.log('🚫 DEP-CHECK 拦截 — 依赖方向违规:');
      for (const e of errors) {
        console.log(`  [${e.rule}] ${e.file}:${e.line} — ${e.message}`);
      }
      console.log(`\n共 ${errors.length} 个错误 + ${warnings.length} 个警告`);
    }
    if (!errors.length && !warnings.length) {
      console.log('✅ DEP-CHECK: 依赖方向检查通过');
    }
  }

  // Export for programmatic use
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { errors, warnings, allViolations };
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

// Allow require() for integration
if (require.main === module) {
  main();
} else {
  module.exports = {
    checkDEP001, checkDEP002, checkDEP003, checkDEP004, checkDEP005,
    checkL3toL1L2, extractRequires, classifyFile, getL3Module,
  };
}
