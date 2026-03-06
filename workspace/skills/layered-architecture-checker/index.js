#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function walkFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function detectKind(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) return 'skill_dir';
  if (targetPath.endsWith('.json')) return 'isc_rule_json';
  return 'design_doc';
}

function collectContent(targetPath, kind) {
  if (kind === 'skill_dir') {
    const files = walkFiles(targetPath)
      .filter(f => /SKILL\.md$|\.md$|\.txt$|\.json$|\.js$/i.test(f))
      .slice(0, 200);
    return files.map(f => `\n\n# FILE: ${f}\n` + readText(f)).join('\n');
  }
  return readText(targetPath);
}

function testAny(text, patterns) {
  return patterns.some(p => p.test(text));
}

function check(content) {
  const text = content.toLowerCase();

  const perception = testAny(text, [
    /感知层/, /perception/, /探测/, /捕获/, /observe/, /probe/, /signal/
  ]);
  const cognition = testAny(text, [
    /认知层/, /cognition/, /决策/, /判断/, /reason/, /engine/, /inference/
  ]);
  const execution = testAny(text, [
    /执行层/, /execution/, /行动/, /执行/, /act/, /invoke/, /skill/
  ]);

  const eventBusEvidence = testAny(text, [
    /事件总线/, /event bus/, /event-bus/, /pub\s*\/\s*sub/, /pubsub/, /event-driven/, /message bus/
  ]);

  const directCouplingEvidence = testAny(text, [
    /直接耦合/, /direct coupling/, /紧耦合/, /hard coupling/, /bypass event bus/, /直接调用/
  ]);

  const violations = [];
  if (!perception) violations.push('未明确感知层归属（谁探测/捕获信号）');
  if (!cognition) violations.push('未明确认知层归属（谁理解/决策）');
  if (!execution) violations.push('未明确执行层归属（谁行动/执行）');
  if (!eventBusEvidence) violations.push('未发现事件总线/发布订阅解耦证据');
  if (directCouplingEvidence) violations.push('发现直接耦合迹象（应通过事件总线解耦）');

  return {
    layers: {
      perception,
      cognition,
      execution,
    },
    decoupling: {
      eventBusEvidence,
      directCouplingEvidence,
      decoupled: eventBusEvidence && !directCouplingEvidence,
    },
    violations,
    pass: violations.length === 0,
  };
}

function main() {
  const args = process.argv.slice(2);
  const targetPath = args.find(a => !a.startsWith('--'));
  const strict = args.includes('--strict');
  const json = args.includes('--json');

  if (!targetPath) {
    console.error('Usage: node index.js <targetPath> [--strict] [--json]');
    process.exit(2);
  }

  const abs = path.resolve(process.cwd(), targetPath);
  if (!exists(abs)) {
    console.error(`Target not found: ${abs}`);
    process.exit(2);
  }

  const kind = detectKind(abs);
  const content = collectContent(abs, kind);
  const report = {
    target: abs,
    kind,
    timestamp: new Date().toISOString(),
    ...check(content),
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('=== Layered Architecture Check Report ===');
    console.log(`Target: ${report.target}`);
    console.log(`Kind: ${report.kind}`);
    console.log(`Perception Layer: ${report.layers.perception ? 'OK' : 'MISSING'}`);
    console.log(`Cognition Layer: ${report.layers.cognition ? 'OK' : 'MISSING'}`);
    console.log(`Execution Layer: ${report.layers.execution ? 'OK' : 'MISSING'}`);
    console.log(`Event Bus Evidence: ${report.decoupling.eventBusEvidence ? 'YES' : 'NO'}`);
    console.log(`Direct Coupling Evidence: ${report.decoupling.directCouplingEvidence ? 'YES' : 'NO'}`);
    console.log(`Decoupled: ${report.decoupling.decoupled ? 'YES' : 'NO'}`);
    if (report.violations.length) {
      console.log('Violations:');
      report.violations.forEach((v, i) => console.log(`  ${i + 1}. ${v}`));
    } else {
      console.log('Violations: none');
    }
    console.log(`PASS: ${report.pass ? 'YES' : 'NO'}`);
  }

  if (strict && !report.pass) process.exit(1);
}

main();
