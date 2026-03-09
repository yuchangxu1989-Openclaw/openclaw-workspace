#!/usr/bin/env node
/**
 * openclaw.json API 协议一致性校验
 * 规则：
 *   claude-* provider → anthropic-messages
 *   boom-* / gpt-* provider → openai-completions  
 *   zhipu-* provider → openai-completions
 * 
 * 用法: node scripts/config-api-protocol-check.js [--fix]
 */
const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.HOME || '/root', '.openclaw', 'openclaw.json');
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const fix = process.argv.includes('--fix');

const RULES = [
  { match: /^claude-/, expected: 'anthropic-messages', label: 'Claude → anthropic-messages' },
  { match: /^boom-/, expected: 'openai-completions', label: 'Boom → openai-completions' },
  { match: /^zhipu-(?!embedding|multimodal)/, expected: 'openai-completions', label: 'Zhipu → openai-completions' },
];

let issues = 0, fixed = 0;
for (const [name, prov] of Object.entries(cfg.models.providers)) {
  for (const rule of RULES) {
    if (rule.match.test(name) && prov.api !== rule.expected) {
      issues++;
      if (fix) {
        prov.api = rule.expected;
        fixed++;
        console.log(`🔧 FIX: ${name} api=${prov.api} (was wrong, now ${rule.expected})`);
      } else {
        console.log(`❌ ${name}: api=${prov.api}, 应为 ${rule.expected}`);
      }
    }
  }
}

if (fix && fixed > 0) {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
  console.log(`\n修复了 ${fixed} 个 provider`);
}

if (issues === 0) console.log('✅ 全部 PASS');
else if (!fix) console.log(`\n发现 ${issues} 个不一致，运行 --fix 自动修复`);
