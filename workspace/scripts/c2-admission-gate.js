#!/usr/bin/env node
/**
 * C2 评测用例自动准入门禁
 *
 * 检查维度（ABCD质量标准）：
 *   A. 数据源合法性 — 禁止从评测标准文档逆向合成
 *   B. context 完整性 — 真实对话背景 ≥50字
 *   C. execution_chain 粒度 — ≥6步
 *   D. 元数据合规 — category/difficulty/source 枚举校验
 *
 * 用法：
 *   node c2-admission-gate.js <file1.json> [file2.json ...]
 *   被 pre-commit hook 自动调用
 */

const fs = require('fs');
const path = require('path');

// ─── 合法分类枚举 ───
const VALID_CATEGORIES = [
  '纠偏类',
  '认知错误类',
  '连锁跷跷板类',
  '头痛医头类',
  '反复未果类',
  '自主性缺失类',
  '全局未对齐类',
  '交付质量类',
];

const VALID_SOURCES = ['real_conversation', 'web_search'];
const REQUIRED_DIFFICULTY = 'C2';
const MIN_CONTEXT_LENGTH = 50;
const MIN_CHAIN_STEPS = 6;

// ─── 评测标准文档特征片段（用于检测逆向合成） ───
const EVAL_STANDARD_FINGERPRINTS = [
  '评分维度',
  'A级：',
  'B级：',
  'C级：',
  'D级：',
  '评测标准',
  '打分标准',
  '评分标准',
  '满分标准',
  'ABCD标准',
  '评测维度说明',
  '得分点',
];

/**
 * 检测文本是否包含评测标准原文（逆向合成检测）
 */
function detectReverseSynthesis(text) {
  if (!text) return false;
  let hitCount = 0;
  for (const fp of EVAL_STANDARD_FINGERPRINTS) {
    if (text.includes(fp)) hitCount++;
  }
  // 命中 ≥2 个特征片段视为逆向合成嫌疑
  return hitCount >= 2;
}

/**
 * 校验单条用例
 * @returns {{ pass: boolean, errors: string[] }}
 */
function validateCase(c, index) {
  const errors = [];
  const label = c.id || `#${index}`;

  // 1. 数据源合法性
  const textToCheck = [c.input, c.context, c.expected_output].filter(Boolean).join(' ');
  if (detectReverseSynthesis(textToCheck)) {
    errors.push(`[${label}] 数据源违规：input/context/expected_output 疑似包含评测标准原文（逆向合成）`);
  }

  // 2. context 完整性
  if (!c.context || typeof c.context !== 'string') {
    errors.push(`[${label}] context 缺失：必须有真实对话背景`);
  } else if (c.context.length < MIN_CONTEXT_LENGTH) {
    errors.push(`[${label}] context 不足：${c.context.length}字 < 要求${MIN_CONTEXT_LENGTH}字`);
  }

  // 3. execution_chain 粒度
  const chain = c.execution_chain_steps || c.execution_chain;
  if (!Array.isArray(chain)) {
    errors.push(`[${label}] execution_chain_steps 缺失或非数组`);
  } else if (chain.length < MIN_CHAIN_STEPS) {
    errors.push(`[${label}] execution_chain_steps 不足：${chain.length}步 < 要求${MIN_CHAIN_STEPS}步`);
  }

  // 4. category 合法性
  if (!c.category) {
    errors.push(`[${label}] category 缺失`);
  } else if (!VALID_CATEGORIES.includes(c.category)) {
    errors.push(`[${label}] category 非法："${c.category}"，合法值：${VALID_CATEGORIES.join('/')}`);
  }

  // 5. difficulty 必须为 C2
  if (c.difficulty !== REQUIRED_DIFFICULTY) {
    errors.push(`[${label}] difficulty 必须为 "${REQUIRED_DIFFICULTY}"，当前："${c.difficulty}"`);
  }

  // 6. source 合法性
  if (!VALID_SOURCES.includes(c.source)) {
    errors.push(`[${label}] source 非法："${c.source}"，合法值：${VALID_SOURCES.join('/')}`);
  }

  // 7. 基础必填字段
  if (!c.input || typeof c.input !== 'string' || c.input.length < 10) {
    errors.push(`[${label}] input 缺失或过短（<10字）`);
  }
  if (!c.expected_output || typeof c.expected_output !== 'string' || c.expected_output.length < 10) {
    errors.push(`[${label}] expected_output 缺失或过短（<10字）`);
  }

  return { pass: errors.length === 0, errors };
}

/**
 * 校验整个文件
 * @returns {{ file, pass, totalCases, passCount, failCount, errors }}
 */
function validateFile(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return { file: filePath, pass: false, totalCases: 0, passCount: 0, failCount: 0, errors: [`文件读取失败: ${e.message}`] };
  }

  let cases;
  try {
    cases = JSON.parse(raw);
  } catch (e) {
    return { file: filePath, pass: false, totalCases: 0, passCount: 0, failCount: 0, errors: [`JSON 解析失败: ${e.message}`] };
  }

  // 支持单对象或数组
  if (!Array.isArray(cases)) cases = [cases];

  const allErrors = [];
  let passCount = 0;
  let failCount = 0;

  cases.forEach((c, i) => {
    const result = validateCase(c, i);
    if (result.pass) {
      passCount++;
    } else {
      failCount++;
      allErrors.push(...result.errors);
    }
  });

  return {
    file: filePath,
    pass: failCount === 0,
    totalCases: cases.length,
    passCount,
    failCount,
    errors: allErrors,
  };
}

// ─── CLI ───
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('用法: node c2-admission-gate.js <file1.json> [file2.json ...]');
    process.exit(1);
  }

  console.log('🚪 C2 评测用例准入门禁\n');

  let hasFailure = false;

  for (const f of args) {
    const result = validateFile(f);
    if (result.pass) {
      console.log(`✅ ${path.basename(f)}: ${result.totalCases} 条用例全部通过`);
    } else {
      hasFailure = true;
      console.log(`❌ ${path.basename(f)}: ${result.failCount}/${result.totalCases} 条未通过`);
      for (const err of result.errors) {
        console.log(`   ${err}`);
      }
    }
  }

  console.log('');
  if (hasFailure) {
    console.log('⛔ 准入门禁未通过，请修复后重新提交');
    process.exit(1);
  } else {
    console.log('✅ 准入门禁通过');
  }
}

module.exports = { validateFile, validateCase, VALID_CATEGORIES, VALID_SOURCES };
