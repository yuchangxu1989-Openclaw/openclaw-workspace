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
 */

const { execFile } = require('child_process');
const path = require('path');

const SKILL_DIR = __dirname;
const SCRIPTS = {
  validate:      path.join(SKILL_DIR, 'scripts', 'quick_validate.py'),
  eval:          path.join(SKILL_DIR, 'scripts', 'run_eval.py'),
  improve:       path.join(SKILL_DIR, 'scripts', 'run_loop.py'),
  package:       path.join(SKILL_DIR, 'scripts', 'package_skill.py'),
  'post-create': path.join(SKILL_DIR, 'post_create.py'),
};

const VALID_ACTIONS = new Set(Object.keys(SCRIPTS));

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
  const timeoutMs = (action === 'improve') ? 600000 : 120000; // improve给10分钟

  // 构建各action的参数
  switch (action) {
    case 'validate':
      args.push(skillPath);
      break;

    case 'eval': {
      args.push(skillPath);
      if (input.model) args.push('--model', input.model);
      break;
    }

    case 'improve': {
      args.push(skillPath);
      if (input.maxIterations) args.push('--max-iterations', String(input.maxIterations));
      if (input.holdout != null) args.push('--holdout', String(input.holdout));
      if (input.model) args.push('--model', input.model);
      args.push('--verbose');
      break;
    }

    case 'package': {
      args.push(skillPath);
      if (input.outputDir) args.push(input.outputDir);
      break;
    }

    case 'post-create': {
      args.push(skillPath);
      break;
    }
  }

  try {
    const { stdout, stderr } = await runPython(scriptPath, args, timeoutMs);
    if (stderr) logger.info?.(`[skill-creator] stderr: ${stderr}`);

    const parsed = tryParseJSON(stdout);
    const result = parsed || { raw: stdout };

    return {
      ok: parsed ? (parsed.success !== false) : true,
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
