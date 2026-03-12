#!/usr/bin/env node
/**
 * 每日公众号复盘文章 — 调度/执行引擎
 *
 * 两种运行模式：
 * 1. dispatch模式（默认）：生成3个Agent派发指令，由主Agent执行sessions_spawn
 * 2. standalone模式：自行调LLM生成文章，写入本地文件
 *
 * CLI:
 *   node index.js                       # 输出dispatch指令
 *   node index.js --standalone          # 单Agent直接生成文章
 *   node index.js --date 2026-03-11     # 指定日期
 *   node index.js --list-sources        # 列出素材文件
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Paths ──────────────────────────────────────────────────────────

const SKILL_DIR = __dirname;
const WORKSPACE = path.resolve(SKILL_DIR, '../../../');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const REPORTS_DIR = path.join(WORKSPACE, 'reports');

const PROMPT_FILE = path.join(SKILL_DIR, 'prompt.md');
const SOUL_FILE = path.join(WORKSPACE, 'SOUL.md');
const USER_FILE = path.join(WORKSPACE, 'USER.md');
const MEMORY_FILE = path.join(WORKSPACE, 'MEMORY.md');

// ─── Helpers ────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  const offset = 8 * 60; // UTC+8
  const local = new Date(d.getTime() + offset * 60000);
  return local.toISOString().slice(0, 10);
}

function safeRead(fp, maxKB = 50) {
  try {
    const stat = fs.statSync(fp);
    if (stat.size > maxKB * 1024) {
      // Read first and last portions
      const buf = Buffer.alloc(maxKB * 1024);
      const fd = fs.openSync(fp, 'r');
      fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      return buf.toString('utf8') + `\n\n[...truncated, total ${(stat.size / 1024).toFixed(0)}KB...]`;
    }
    return fs.readFileSync(fp, 'utf8');
  } catch {
    return null;
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Source Material Collection ─────────────────────────────────────

/**
 * Collect all source materials for today's article.
 * @param {string} date — YYYY-MM-DD
 * @returns {object} — { prompt, soul, user, memory, dailyMemory, date, missing }
 */
function collectSources(date) {
  const dailyMemoryPath = path.join(MEMORY_DIR, `${date}.md`);

  const sources = {
    date,
    prompt: safeRead(PROMPT_FILE),
    soul: safeRead(SOUL_FILE, 10),
    user: safeRead(USER_FILE, 10),
    memory: safeRead(MEMORY_FILE, 30),
    dailyMemory: safeRead(dailyMemoryPath, 40),
    dailyMemoryPath,
    missing: [],
  };

  if (!sources.prompt) sources.missing.push('prompt.md');
  if (!sources.dailyMemory) sources.missing.push(`memory/${date}.md`);
  if (!sources.soul) sources.missing.push('SOUL.md');
  if (!sources.user) sources.missing.push('USER.md');

  return sources;
}

// ─── Build Full Prompt ──────────────────────────────────────────────

/**
 * Build the complete prompt with all context injected.
 * @param {object} sources — from collectSources()
 * @param {string} agentRole — writer/researcher/coder
 * @returns {string} — full prompt
 */
function buildPrompt(sources, agentRole = 'writer') {
  let prompt = sources.prompt || '';
  prompt = prompt.replace(/YYYY-MM-DD/g, sources.date);

  const roleFlavor = {
    writer: '你是深度思考型作者，擅长从哲学和人文角度讲述技术故事。你的文章有深度、有灵魂、引发共鸣。',
    researcher: '你是调研型作者，擅长从行业趋势和数据角度讲述故事。你的文章有洞察、有对比、引发思考。',
    coder: '你是技术型作者，擅长用工程师的直觉讲述真实的构建过程。你的文章接地气、有细节、引发好奇。',
  };

  const fullPrompt = `${prompt}

---

## 你的独特视角
${roleFlavor[agentRole] || roleFlavor.writer}

---

## 素材

### SOUL.md（AI身份设定）
${sources.soul || '（未找到）'}

### USER.md（主人信息）
${sources.user || '（未找到）'}

### MEMORY.md（长期认知）
${sources.memory || '（未找到）'}

### 当日记忆 (${sources.date})
${sources.dailyMemory || `（未找到 memory/${sources.date}.md — 请从系统日志中获取今天发生的事）`}
`;

  return fullPrompt;
}

// ─── Dispatch Mode ──────────────────────────────────────────────────

/**
 * Generate dispatch instructions for 3 agents.
 * @param {string} date
 * @returns {object} — { instructions, agents[] }
 */
function generateDispatch(date) {
  const sources = collectSources(date);

  if (sources.missing.length > 0) {
    console.error(`⚠️  缺少素材文件: ${sources.missing.join(', ')}`);
  }

  const agents = [
    {
      agentId: 'writer',
      label: `gongzhonghao-${date}-writer`,
      model: 'claude-opus-4-6-thinking',
      role: 'writer',
      thinking: 'high',
    },
    {
      agentId: 'researcher',
      label: `gongzhonghao-${date}-researcher`,
      model: 'claude-opus-4-6-thinking',
      role: 'researcher',
      thinking: 'high',
    },
    {
      agentId: 'coder',
      label: `gongzhonghao-${date}-coder`,
      model: 'gpt-5.3-codex',
      role: 'coder',
      thinking: 'enabled',
    },
  ];

  const tasks = agents.map(agent => {
    const prompt = buildPrompt(sources, agent.role);
    const outputPath = `reports/gongzhonghao-${date}-${agent.role}.md`;

    return {
      ...agent,
      task: `你是"一个人和他的AI"公众号文章作者（${agent.role}视角）。

请根据以下素材，写一篇面向公众号读者的故事文章。

${prompt}

## 交付要求
1. 用 feishu_doc create 创建飞书文档，标题用你拟的文章标题
2. 用 feishu_doc write 写入完整文章
3. 同时写本地文件: ${outputPath}
4. 字数2000-3000字
5. 必须真正执行写入操作，不能只说"我会写"

🚨 铁令：绝对禁止修改 openclaw.json`,
      outputPath,
    };
  });

  return {
    date,
    sources: {
      available: Object.keys(sources).filter(k => !['missing', 'date'].includes(k) && sources[k]),
      missing: sources.missing,
    },
    agents: tasks,
    dispatchCommands: tasks.map(t => ({
      action: 'sessions_spawn',
      params: {
        agentId: t.agentId,
        label: t.label,
        task: t.task,
        thinking: t.thinking,
      },
    })),
  };
}

// ─── Standalone Mode ────────────────────────────────────────────────

const DEFAULT_LLM_BASE = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_LLM_MODEL = 'glm-4-flash';

async function callLLM(prompt, config = {}) {
  const apiKey = config.apiKey || process.env.LLM_API_KEY || process.env.ZHIPU_API_KEY_1;
  const baseUrl = (config.baseUrl || process.env.LLM_BASE_URL || DEFAULT_LLM_BASE).replace(/\/+$/, '');
  const model = config.model || process.env.LLM_MODEL || DEFAULT_LLM_MODEL;

  if (!apiKey) throw new Error('No API key available.');

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 4096,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`LLM API ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Run standalone: generate article with direct LLM call.
 * @param {string} date
 * @param {object} options
 */
async function runStandalone(date, options = {}) {
  const sources = collectSources(date);

  if (sources.missing.length > 0) {
    console.error(`⚠️  缺少素材: ${sources.missing.join(', ')}`);
  }

  if (!sources.dailyMemory) {
    console.error(`❌ 没有 memory/${date}.md，无法生成有意义的文章。`);
    if (!options.force) {
      console.error('使用 --force 强制生成。');
      process.exit(1);
    }
  }

  const role = options.role || 'writer';
  const prompt = buildPrompt(sources, role);

  console.error(`📝 开始生成公众号文章...`);
  console.error(`📅 日期: ${date} | 视角: ${role}`);
  console.error(`🤖 模型: ${options.model || process.env.LLM_MODEL || DEFAULT_LLM_MODEL}`);

  const article = await callLLM(prompt, options);

  // Save to local file
  ensureDir(REPORTS_DIR);
  const outputPath = path.join(REPORTS_DIR, `gongzhonghao-${date}-${role}.md`);
  fs.writeFileSync(outputPath, article, 'utf8');
  console.error(`✅ 文章已保存: ${outputPath}`);
  console.error(`📏 字数: ${article.length}`);

  return { article, outputPath, date, role };
}

// ─── CLI ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { date: today() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--date' && argv[i + 1]) { args.date = argv[++i]; continue; }
    if (a === '--role' && argv[i + 1]) { args.role = argv[++i]; continue; }
    if (a === '--model' && argv[i + 1]) { args.model = argv[++i]; continue; }
    if (a === '--standalone') { args.standalone = true; continue; }
    if (a === '--force') { args.force = true; continue; }
    if (a === '--list-sources') { args.listSources = true; continue; }
    if (a === '--help' || a === '-h') { args.help = true; continue; }
  }
  return args;
}

function printUsage() {
  console.log(`
每日公众号复盘文章 📝

Usage:
  node index.js [options]

Modes:
  (default)       输出3个Agent的dispatch指令（供主Agent执行）
  --standalone    单Agent模式，直接调LLM生成文章
  --list-sources  列出素材文件及状态

Options:
  --date DATE     指定日期 [default: today]
  --role ROLE     standalone模式的视角: writer|researcher|coder [default: writer]
  --model MODEL   standalone模式的模型名
  --force         即使缺少当日记忆也强制生成
  --help          显示帮助

Environment:
  LLM_API_KEY / ZHIPU_API_KEY_1  — API密钥
  LLM_BASE_URL — API地址
  LLM_MODEL — 默认模型

Examples:
  node index.js                          # 输出dispatch指令
  node index.js --standalone --role coder # 技术视角生成文章
  node index.js --date 2026-03-10        # 指定日期
`.trim());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (args.listSources) {
    const sources = collectSources(args.date);
    console.log(`📅 日期: ${sources.date}`);
    console.log(`\n素材状态:`);
    console.log(`  prompt.md:      ${sources.prompt ? '✅' : '❌ 缺失'}`);
    console.log(`  SOUL.md:        ${sources.soul ? '✅' : '❌ 缺失'}`);
    console.log(`  USER.md:        ${sources.user ? '✅' : '❌ 缺失'}`);
    console.log(`  MEMORY.md:      ${sources.memory ? '✅' : '❌ 缺失'}`);
    console.log(`  memory/${sources.date}.md: ${sources.dailyMemory ? '✅' : '❌ 缺失'}`);
    if (sources.missing.length > 0) {
      console.log(`\n⚠️  缺失: ${sources.missing.join(', ')}`);
    }
    process.exit(sources.missing.includes(`memory/${sources.date}.md`) ? 1 : 0);
  }

  if (args.standalone) {
    try {
      const result = await runStandalone(args.date, {
        role: args.role,
        model: args.model,
        force: args.force,
      });
      console.log(result.article);
    } catch (err) {
      console.error(`Fatal: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  // Default: dispatch mode
  const dispatch = generateDispatch(args.date);
  console.log(JSON.stringify(dispatch, null, 2));
}

if (require.main === module) {
  main();
}

// ─── Exports ────────────────────────────────────────────────────────

module.exports = {
  collectSources,
  buildPrompt,
  generateDispatch,
  runStandalone,
  today,
};
