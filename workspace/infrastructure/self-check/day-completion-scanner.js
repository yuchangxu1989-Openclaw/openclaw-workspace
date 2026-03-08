#!/usr/bin/env node
/**
 * day-completion-scanner.js
 * =========================
 * 触发器：Day完成事件 - 检测 reports/dayN-closure-conditions.md 出现
 * 行为：全量扫描设计债务（TODO/FIXME、配置一致性、事件producer/consumer对齐）
 * 输出：reports/auto-debt-scan-dayN.md
 *
 * 使用说明：
 *   # 手动运行（扫描最新Day）
 *   node infrastructure/self-check/day-completion-scanner.js
 *
 *   # 指定Day
 *   node infrastructure/self-check/day-completion-scanner.js --day 3
 *
 *   # 由cron每小时调用（检测新的closure-conditions文件）
 *   node infrastructure/self-check/day-completion-scanner.js --auto
 *
 * 依赖：Node.js 18+ (无外部依赖)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = process.env.WORKSPACE_ROOT || '/root/.openclaw/workspace';
const REPORTS_DIR = path.join(WORKSPACE, 'reports');
const STATE_FILE = path.join(WORKSPACE, 'infrastructure/self-check/.scanner-state.json');

// ─────────────────────────────────────────────────────────────────────────────
// 状态管理：记录已扫描的Day，避免重复
// ─────────────────────────────────────────────────────────────────────────────
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { scannedDays: [], lastRun: null };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// 检测新出现的 closure-conditions 文件
// ─────────────────────────────────────────────────────────────────────────────
function detectNewDays(state) {
  const files = fs.readdirSync(REPORTS_DIR);
  const closurePattern = /^day(\d+)-closure-conditions\.md$/;
  const newDays = [];

  for (const file of files) {
    const match = file.match(closurePattern);
    if (match) {
      const dayNum = parseInt(match[1]);
      if (!state.scannedDays.includes(dayNum)) {
        newDays.push(dayNum);
      }
    }
  }
  return newDays.sort((a, b) => a - b);
}

// ─────────────────────────────────────────────────────────────────────────────
// 扫描代码级 TODO/FIXME
// ─────────────────────────────────────────────────────────────────────────────
function scanCodeDebt() {
  const results = [];
  const searchDirs = ['skills', 'infrastructure', 'scripts'];
  const extensions = ['.js', '.ts', '.cjs', '.mjs', '.sh', '.py'];

  for (const dir of searchDirs) {
    const fullDir = path.join(WORKSPACE, dir);
    if (!fs.existsSync(fullDir)) continue;

    try {
      // Use grep for efficiency
      const output = execSync(
        `grep -rn --include="*.js" --include="*.ts" --include="*.cjs" --include="*.sh" ` +
        `-E "(TODO|FIXME|HACK|XXX|BUG|TEMP|WORKAROUND)" "${fullDir}" 2>/dev/null || true`,
        { maxBuffer: 10 * 1024 * 1024 }
      ).toString();

      const lines = output.trim().split('\n').filter(l => l.trim());
      for (const line of lines) {
        const parts = line.split(':');
        if (parts.length >= 3) {
          const filePath = parts[0].replace(WORKSPACE + '/', '');
          const lineNum = parts[1];
          const content = parts.slice(2).join(':').trim();
          const tagMatch = content.match(/(TODO|FIXME|HACK|XXX|BUG|TEMP|WORKAROUND)/i);
          results.push({
            file: filePath,
            line: lineNum,
            tag: tagMatch ? tagMatch[1].toUpperCase() : 'TODO',
            content: content.substring(0, 120)
          });
        }
      }
    } catch (e) {
      // grep returns exit code 1 when no matches, that's ok
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// 检查配置一致性（检测引用但不存在的文件/路径）
// ─────────────────────────────────────────────────────────────────────────────
function scanConfigConsistency() {
  const issues = [];

  // 检查 cron jobs.json 中引用的脚本是否存在
  const cronJobsFile = path.join(WORKSPACE, 'infrastructure/cron/jobs.json');
  if (fs.existsSync(cronJobsFile)) {
    try {
      const jobs = JSON.parse(fs.readFileSync(cronJobsFile, 'utf8'));
      for (const job of (jobs.jobs || [])) {
        if (job.script) {
          const scriptPath = path.join(WORKSPACE, job.script);
          if (!fs.existsSync(scriptPath)) {
            issues.push({
              type: 'missing_script',
              config: 'infrastructure/cron/jobs.json',
              ref: job.script,
              message: `Cron job "${job.name}" 引用的脚本不存在: ${job.script}`
            });
          }
        }
      }
    } catch (e) {
      issues.push({ type: 'parse_error', config: 'infrastructure/cron/jobs.json', message: e.message });
    }
  }

  // 检查 ISC 规则中引用的技能是否存在
  const iscRulesDir = path.join(WORKSPACE, 'skills/isc-core/rules');
  if (fs.existsSync(iscRulesDir)) {
    const ruleFiles = fs.readdirSync(iscRulesDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    for (const ruleFile of ruleFiles) {
      try {
        const rule = JSON.parse(fs.readFileSync(path.join(iscRulesDir, ruleFile), 'utf8'));
        if (rule.action && rule.action.skill) {
          const skillDir = path.join(WORKSPACE, 'skills', rule.action.skill);
          if (!fs.existsSync(skillDir)) {
            issues.push({
              type: 'missing_skill_ref',
              config: `skills/isc-core/rules/${ruleFile}`,
              ref: rule.action.skill,
              message: `ISC规则 "${rule.id}" 引用的技能目录不存在: skills/${rule.action.skill}`
            });
          }
        }
      } catch (e) {
        issues.push({ type: 'parse_error', config: `skills/isc-core/rules/${ruleFile}`, message: e.message });
      }
    }
  }

  // 检查 本地任务编排 订阅中引用的 ISC 规则是否存在
  const dtoSubDir = path.join(WORKSPACE, 'skills/lto-core/subscriptions');
  if (fs.existsSync(dtoSubDir)) {
    const subFiles = fs.readdirSync(dtoSubDir).filter(f => f.endsWith('.json'));
    for (const subFile of subFiles) {
      try {
        const sub = JSON.parse(fs.readFileSync(path.join(dtoSubDir, subFile), 'utf8'));
        if (sub.rule_id) {
          const ruleFile = path.join(WORKSPACE, 'skills/isc-core/rules', `${sub.rule_id}.json`);
          if (!fs.existsSync(ruleFile)) {
            // try alternate naming
            const altRuleFile = path.join(WORKSPACE, 'skills/isc-core/rules', `rule.${sub.rule_id}.json`);
            if (!fs.existsSync(altRuleFile)) {
              issues.push({
                type: 'orphan_dto_subscription',
                config: `skills/lto-core/subscriptions/${subFile}`,
                ref: sub.rule_id,
                message: `DTO订阅 "${subFile}" 引用的ISC规则不存在: ${sub.rule_id}`
              });
            }
          }
        }
      } catch (e) {
        // skip parse errors for subscriptions
      }
    }
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// 检查事件 Producer/Consumer 对齐
// ─────────────────────────────────────────────────────────────────────────────
function scanEventAlignment() {
  const producers = new Map(); // eventName -> [files]
  const consumers = new Map(); // eventName -> [files]
  const issues = [];

  const searchDirs = ['skills', 'infrastructure/event-bus', 'infrastructure/pipeline'];
  const patterns = {
    produce: /(?:emit|publish|fire|dispatch|produce)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    consume: /(?:on|subscribe|listen|consume|handle)\s*\(\s*['"`]([^'"`]+)['"`]/g,
  };

  function scanFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const relPath = filePath.replace(WORKSPACE + '/', '');

      // Scan for produces
      let match;
      const produceRe = new RegExp(patterns.produce.source, 'g');
      while ((match = produceRe.exec(content)) !== null) {
        const evt = match[1];
        if (!producers.has(evt)) producers.set(evt, []);
        producers.get(evt).push(relPath);
      }

      // Scan for consumes
      const consumeRe = new RegExp(patterns.consume.source, 'g');
      while ((match = consumeRe.exec(content)) !== null) {
        const evt = match[1];
        if (!consumers.has(evt)) consumers.set(evt, []);
        consumers.get(evt).push(relPath);
      }
    } catch (e) {
      // skip unreadable files
    }
  }

  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.match(/\.(js|ts|cjs|mjs)$/)) {
        scanFile(fullPath);
      }
    }
  }

  for (const dir of searchDirs) {
    walkDir(path.join(WORKSPACE, dir));
  }

  // Find orphan producers (events emitted but never consumed)
  for (const [evt, files] of producers) {
    if (!consumers.has(evt) && !evt.includes('*') && evt.length > 3) {
      issues.push({
        type: 'orphan_producer',
        event: evt,
        producers: files,
        consumers: [],
        message: `事件 "${evt}" 被生产但无消费者 (${files[0]})`
      });
    }
  }

  // Find orphan consumers (events consumed but never produced)
  for (const [evt, files] of consumers) {
    if (!producers.has(evt) && !evt.includes('*') && evt.length > 3) {
      issues.push({
        type: 'orphan_consumer',
        event: evt,
        producers: [],
        consumers: files,
        message: `事件 "${evt}" 被消费但无生产者 (${files[0]})`
      });
    }
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// 读取 Day 的 closure-conditions 内容
// ─────────────────────────────────────────────────────────────────────────────
function readDayClosureConditions(dayNum) {
  const filePath = path.join(REPORTS_DIR, `day${dayNum}-closure-conditions.md`);
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 生成扫描报告
// ─────────────────────────────────────────────────────────────────────────────
function generateReport(dayNum, codeDebt, configIssues, eventIssues, closureContent) {
  const now = new Date().toISOString();
  const totalIssues = codeDebt.length + configIssues.length + eventIssues.length;

  // Group code debt by tag
  const debtByTag = {};
  for (const item of codeDebt) {
    if (!debtByTag[item.tag]) debtByTag[item.tag] = [];
    debtByTag[item.tag].push(item);
  }

  let report = `# Auto Debt Scan - Day ${dayNum}

> 自动生成于: ${now}
> 触发器: day${dayNum}-closure-conditions.md 检测
> 总计发现: **${totalIssues} 个设计债务项**

---

## 📊 概览

| 类别 | 数量 | 严重度 |
|------|------|--------|
| 代码级 TODO/FIXME | ${codeDebt.length} | ${codeDebt.length > 20 ? '🔴 高' : codeDebt.length > 5 ? '🟡 中' : '🟢 低'} |
| 配置一致性问题 | ${configIssues.length} | ${configIssues.length > 5 ? '🔴 高' : configIssues.length > 0 ? '🟡 中' : '🟢 低'} |
| 事件对齐缺口 | ${eventIssues.length} | ${eventIssues.length > 10 ? '🔴 高' : eventIssues.length > 3 ? '🟡 中' : '🟢 低'} |

`;

  // Day closure context
  if (closureContent) {
    const closureExcerpt = closureContent.substring(0, 500);
    report += `## 📋 Day ${dayNum} 完成条件摘要

\`\`\`
${closureExcerpt}${closureContent.length > 500 ? '\n... (截断)' : ''}
\`\`\`

---

`;
  }

  // Code debt section
  report += `## 🔧 代码级债务 (${codeDebt.length} 项)

`;
  if (codeDebt.length === 0) {
    report += `✅ 未发现代码级债务\n\n`;
  } else {
    for (const [tag, items] of Object.entries(debtByTag)) {
      report += `### ${tag} (${items.length})\n\n`;
      for (const item of items.slice(0, 10)) {
        report += `- \`${item.file}:${item.line}\` — ${item.content}\n`;
      }
      if (items.length > 10) {
        report += `- ... 还有 ${items.length - 10} 项\n`;
      }
      report += '\n';
    }
  }

  // Config issues section
  report += `## ⚙️ 配置一致性问题 (${configIssues.length} 项)

`;
  if (configIssues.length === 0) {
    report += `✅ 配置引用全部对齐\n\n`;
  } else {
    for (const issue of configIssues) {
      report += `- **[${issue.type}]** ${issue.message}\n  → 在: \`${issue.config}\`\n`;
    }
    report += '\n';
  }

  // Event alignment section
  report += `## 📡 事件 Producer/Consumer 对齐 (${eventIssues.length} 项)

`;
  if (eventIssues.length === 0) {
    report += `✅ 事件流完全对齐\n\n`;
  } else {
    const orphanProducers = eventIssues.filter(i => i.type === 'orphan_producer');
    const orphanConsumers = eventIssues.filter(i => i.type === 'orphan_consumer');

    if (orphanProducers.length > 0) {
      report += `### 孤立生产者 (有emit无consume)\n\n`;
      for (const issue of orphanProducers.slice(0, 15)) {
        report += `- \`${issue.event}\` → ${issue.producers[0]}\n`;
      }
      if (orphanProducers.length > 15) {
        report += `- ... 还有 ${orphanProducers.length - 15} 项\n`;
      }
      report += '\n';
    }

    if (orphanConsumers.length > 0) {
      report += `### 孤立消费者 (有subscribe无emit)\n\n`;
      for (const issue of orphanConsumers.slice(0, 15)) {
        report += `- \`${issue.event}\` → ${issue.consumers[0]}\n`;
      }
      if (orphanConsumers.length > 15) {
        report += `- ... 还有 ${orphanConsumers.length - 15} 项\n`;
      }
      report += '\n';
    }
  }

  // Action recommendations
  report += `## 🎯 修复建议

`;
  if (totalIssues === 0) {
    report += `✅ Day ${dayNum} 扫描通过，无需立即修复。\n`;
  } else {
    if (configIssues.filter(i => i.type === 'missing_script').length > 0) {
      report += `1. **优先级P0**: 修复 cron jobs 中的断链脚本引用\n`;
    }
    if (configIssues.filter(i => i.type === 'missing_skill_ref').length > 0) {
      report += `2. **优先级P0**: 修复 ISC 规则中的技能引用\n`;
    }
    if (codeDebt.filter(i => i.tag === 'FIXME').length > 0) {
      report += `3. **优先级P1**: 清理 FIXME 标记（${codeDebt.filter(i => i.tag === 'FIXME').length} 项）\n`;
    }
    if (eventIssues.length > 0) {
      report += `4. **优先级P2**: 补全孤立事件的 consumer 或移除无用 producer\n`;
    }
    if (codeDebt.filter(i => i.tag === 'TODO').length > 0) {
      report += `5. **优先级P3**: 逐步清理 TODO 标记（${codeDebt.filter(i => i.tag === 'TODO').length} 项）\n`;
    }
  }

  report += `
---
*由 infrastructure/self-check/day-completion-scanner.js 自动生成*
`;

  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const isAuto = args.includes('--auto');
  const dayArg = args.find(a => a.startsWith('--day=') || a === '--day');
  let targetDays = [];

  const state = loadState();

  if (dayArg) {
    // Manual: specific day
    const dayIdx = args.indexOf('--day');
    const dayNum = dayArg.includes('=')
      ? parseInt(dayArg.split('=')[1])
      : parseInt(args[dayIdx + 1]);
    if (isNaN(dayNum)) {
      console.error('错误: --day 需要一个数字参数');
      process.exit(1);
    }
    targetDays = [dayNum];
  } else if (isAuto) {
    // Auto: detect new days
    targetDays = detectNewDays(state);
    if (targetDays.length === 0) {
      console.log(`[${new Date().toISOString()}] 自动扫描: 无新的Day完成事件，跳过`);
      state.lastRun = new Date().toISOString();
      saveState(state);
      return;
    }
    console.log(`[${new Date().toISOString()}] 自动扫描: 检测到新Day: ${targetDays.join(', ')}`);
  } else {
    // Default: scan most recent day
    const allDays = fs.readdirSync(REPORTS_DIR)
      .map(f => f.match(/^day(\d+)-closure-conditions\.md$/))
      .filter(Boolean)
      .map(m => parseInt(m[1]))
      .sort((a, b) => b - a);

    if (allDays.length === 0) {
      console.log('未找到任何 closure-conditions 文件，退出');
      return;
    }
    targetDays = [allDays[0]];
    console.log(`扫描最新Day: ${targetDays[0]}`);
  }

  // Run scans (shared across days to avoid redundancy)
  console.log('🔍 扫描代码级债务...');
  const codeDebt = scanCodeDebt();
  console.log(`   发现 ${codeDebt.length} 项 TODO/FIXME`);

  console.log('⚙️  检查配置一致性...');
  const configIssues = scanConfigConsistency();
  console.log(`   发现 ${configIssues.length} 项配置问题`);

  console.log('📡 扫描事件对齐...');
  const eventIssues = scanEventAlignment();
  console.log(`   发现 ${eventIssues.length} 项事件缺口`);

  for (const dayNum of targetDays) {
    const closureContent = readDayClosureConditions(dayNum);
    const report = generateReport(dayNum, codeDebt, configIssues, eventIssues, closureContent);

    const outputPath = path.join(REPORTS_DIR, `auto-debt-scan-day${dayNum}.md`);
    fs.writeFileSync(outputPath, report);
    console.log(`✅ 报告已写入: ${outputPath}`);

    if (isAuto) {
      state.scannedDays.push(dayNum);
    }
  }

  state.lastRun = new Date().toISOString();
  saveState(state);
}

main().catch(err => {
  console.error('扫描器错误:', err);
  process.exit(1);
});
