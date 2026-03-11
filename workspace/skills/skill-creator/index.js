'use strict';

/**
 * skill-creator — 技能全生命周期管理入口
 *
 * 桥接到 Python 脚本：
 *   validate  → scripts/quick_validate.py
 *   eval      → scripts/run_eval.py
 *   improve   → scripts/run_loop.py
 *   package   → scripts/package_skill.py
 *   post-create → post_create.py
 *
 * 流水线完成后自动写入 .skill-creator-stamp（第1层防护的信任凭据）
 */

const { execFile } = require('child_process');
const path = require('path');
const { writeStamp } = require('./stamp');

const SKILL_DIR = __dirname;
const SCRIPTS = {
  validate:      path.join(SKILL_DIR, 'scripts', 'quick_validate.py'),
  eval:          path.join(SKILL_DIR, 'scripts', 'run_eval.py'),
  improve:       path.join(SKILL_DIR, 'scripts', 'run_loop.py'),
  package:       path.join(SKILL_DIR, 'scripts', 'package_skill.py'),
  'post-create': path.join(SKILL_DIR, 'post_create.py'),
};

const VALID_ACTIONS = new Set(Object.keys(SCRIPTS));

// 会触发stamp写入的action（流水线终态）
const STAMP_ACTIONS = new Set(['post-create', 'package', 'improve']);

function runPython(scriptPath, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = execFile('python3', [scriptPath, ...args], {
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${path.basename(scriptPath)} failed: ${err.message}\nstderr: ${stderr}`));
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function tryParseJSON(str) {
  try { return JSON.parse(str); } catch { return null; }
}

async function run(input, context) {
  const logger = context?.logger || console;
  const t0 = Date.now();

  const action = input?.action;
  const skillPath = input?.skillPath;

  if (!action || !VALID_ACTIONS.has(action)) {
    return { ok: false, error: `action必须是: ${[...VALID_ACTIONS].join(' / ')}` };
  }
  if (!skillPath) {
    return { ok: false, error: 'skillPath 必填' };
  }

  logger.info?.(`[skill-creator] action=${action} skillPath=${skillPath}`);

  const scriptPath = SCRIPTS[action];
  const args = [];
  const timeoutMs = (action === 'improve') ? 600000 : 120000;

  switch (action) {
    case 'validate':
      args.push(skillPath);
      break;
    case 'eval':
      args.push(skillPath);
      if (input.model) args.push('--model', input.model);
      break;
    case 'improve':
      args.push(skillPath);
      if (input.maxIterations) args.push('--max-iterations', String(input.maxIterations));
      if (input.holdout != null) args.push('--holdout', String(input.holdout));
      if (input.model) args.push('--model', input.model);
      args.push('--verbose');
      break;
    case 'package':
      args.push(skillPath);
      if (input.outputDir) args.push(input.outputDir);
      break;
    case 'post-create':
      args.push(skillPath);
      break;
  }

  try {
    const { stdout, stderr } = await runPython(scriptPath, args, timeoutMs);
    if (stderr) logger.info?.(`[skill-creator] stderr: ${stderr}`);

    const parsed = tryParseJSON(stdout);
    const result = parsed || { raw: stdout };
    const ok = parsed ? (parsed.success !== false) : true;

    // ── 流水线终态成功 → 写入stamp凭据 ──
    if (ok && STAMP_ACTIONS.has(action)) {
      try {
        const steps = action === 'post-create'
          ? ['validate', 'create', 'post-create']
          : [action];
        const stampPath = writeStamp(skillPath, steps);
        logger.info?.(`[skill-creator] ✅ stamp已写入: ${stampPath}`);
      } catch (stampErr) {
        logger.error?.(`[skill-creator] ⚠️ stamp写入失败（不阻断）: ${stampErr.message}`);
      }
    }

    return {
      ok,
      action,
      skillPath,
      result,
      duration_ms: Date.now() - t0,
    };
  } catch (err) {
    logger.error?.(`[skill-creator] ${err.message}`);
    return {
      ok: false,
      action,
      skillPath,
      error: err.message,
      duration_ms: Date.now() - t0,
    };
  }
}

module.exports = run;
module.exports.run = run;
