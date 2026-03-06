const fs = require('fs');
const path = require('path');

const IGNORE_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.nuxt', '.turbo'
]);

function safeRead(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_) {
    return '';
  }
}

function walkFiles(root, exts = ['.js', '.ts', '.tsx', '.jsx', '.md', '.json', '.yaml', '.yml']) {
  const out = [];
  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name)) walk(full);
      } else if (e.isFile()) {
        if (exts.includes(path.extname(e.name))) out.push(full);
      }
    }
  }
  walk(root);
  return out;
}

function scoreHits(files, regexes) {
  let hits = 0;
  const matched = [];
  for (const f of files) {
    const c = safeRead(f);
    if (!c) continue;
    for (const re of regexes) {
      if (re.test(c)) {
        hits += 1;
        matched.push({ file: f, pattern: String(re) });
        break;
      }
    }
  }
  return { hits, matched };
}

function collectConversationSamples(files) {
  const samples = [];
  const convoPairRegex = /(?:user|human|assistant|system|role)\s*[:=]\s*['"`]/i;
  const turnsRegex = /(messages|conversation|dialog|history)\s*[:=]\s*\[/i;
  for (const f of files) {
    const c = safeRead(f);
    if (!c) continue;
    if (convoPairRegex.test(c) || turnsRegex.test(c)) {
      const turns = (c.match(/\b(role|user|assistant|human|system)\b/gi) || []).length;
      samples.push({ file: f, turns });
    }
  }
  return samples;
}

function result(ok, code, message, details = {}) {
  return { ok, code, message, details };
}

module.exports = async function(event, rule, context) {
  const workspace = (context && context.workspace) || process.cwd();
  const logger = context && context.logger;
  const bus = context && context.bus;
  const notify = context && context.notify;

  const files = walkFiles(workspace);
  const ruleId = (rule && (rule.id || rule.ruleId || rule.name)) || (event && event.ruleId) || '';

  const checks = {
    'rule.arch-real-data-gate-005': () => {
      const realDataSignals = [
        /real[_-]?data/i, /production[_-]?snapshot/i, /customer[_-]?log/i,
        /human[_-]?labeled/i, /ground[_-]?truth/i, /from\s+conversation/i
      ];
      const syntheticSignals = [/synthetic/i, /mock[_-]?data/i, /faker/i, /lorem\s+ipsum/i, /generated[_-]?sample/i];
      const real = scoreHits(files, realDataSignals);
      const synthetic = scoreHits(files, syntheticSignals);
      const ok = real.hits > 0 && synthetic.hits <= real.hits;
      return result(
        ok,
        'rule.arch-real-data-gate-005',
        ok ? '检测到真实评测数据信号，且未被合成数据信号主导' : '未检测到足够真实数据信号或合成数据信号过强',
        { realHits: real.hits, syntheticHits: synthetic.hits, realExamples: real.matched.slice(0, 8), syntheticExamples: synthetic.matched.slice(0, 8) }
      );
    },

    'rule.auto-collect-eval-from-conversation-001': () => {
      const sampleFiles = collectConversationSamples(files);
      const autoCollectSignals = scoreHits(files, [/auto[_-]?collect/i, /collect.*sample/i, /extract.*conversation/i, /eval[_-]?sample/i]);
      const ok = sampleFiles.length > 0 && autoCollectSignals.hits > 0;
      return result(
        ok,
        'rule.auto-collect-eval-from-conversation-001',
        ok ? '检测到对话样本及自动收集逻辑' : '未同时检测到可收集对话样本与自动收集逻辑',
        { sampleFiles: sampleFiles.slice(0, 12), autoCollectHits: autoCollectSignals.hits, autoCollectExamples: autoCollectSignals.matched.slice(0, 8) }
      );
    },

    'rule.coding-quality-thinking-001': () => {
      const thinkingSignals = scoreHits(files, [/thinking\s*mode/i, /reasoning/i, /chain[_-]?of[_-]?thought/i, /deliberate/i, /step[-\s]?by[-\s]?step/i]);
      const codingSignals = scoreHits(files, [/implement/i, /refactor/i, /bug\s*fix/i, /feature/i, /coding\s*task/i]);
      const ok = codingSignals.hits > 0 && thinkingSignals.hits > 0;
      return result(
        ok,
        'rule.coding-quality-thinking-001',
        ok ? '编码任务存在thinking/reasoning模式证据' : '缺少编码任务thinking模式证据',
        { codingHits: codingSignals.hits, thinkingHits: thinkingSignals.hits, thinkingExamples: thinkingSignals.matched.slice(0, 8) }
      );
    },

    'rule.eval-data-source-redline-001': () => {
      const allowedSignals = scoreHits(files, [/consent/i, /privacy/i, /pii\s*removed/i, /anonymi[sz]ed/i, /approved\s*source/i, /data[_-]?policy/i]);
      const blockedSignals = scoreHits(files, [/leak/i, /scrape\s+private/i, /unauthori[sz]ed/i, /credential/i, /secret\s+dump/i, /raw\s+pii/i]);
      const ok = allowedSignals.hits > 0 && blockedSignals.hits === 0;
      return result(
        ok,
        'rule.eval-data-source-redline-001',
        ok ? '评测数据源合规信号通过，未发现红线词' : '评测数据源合规不足或命中红线风险',
        { allowHits: allowedSignals.hits, blockHits: blockedSignals.hits, allowExamples: allowedSignals.matched.slice(0, 8), blockExamples: blockedSignals.matched.slice(0, 8) }
      );
    },

    'rule.eval-driven-development-loop-001': () => {
      const loopSignals = scoreHits(files, [/evaluate\s*->\s*improve\s*->\s*re-?evaluate/i, /feedback\s*loop/i, /regression\s*test/i, /baseline/i, /iteration/i]);
      const evalSignals = scoreHits(files, [/eval/i, /metric/i, /score/i, /benchmark/i]);
      const devSignals = scoreHits(files, [/implementation|code\s+change|patch|commit/i]);
      const ok = loopSignals.hits > 0 && evalSignals.hits > 0 && devSignals.hits > 0;
      return result(
        ok,
        'rule.eval-driven-development-loop-001',
        ok ? '检测到评测驱动开发闭环证据' : '评测驱动开发闭环证据不足',
        { loopHits: loopSignals.hits, evalHits: evalSignals.hits, devHits: devSignals.hits, loopExamples: loopSignals.matched.slice(0, 8) }
      );
    },

    'rule.eval-must-include-multi-turn-001': () => {
      const samples = collectConversationSamples(files);
      const multiTurn = samples.filter(s => s.turns >= 4);
      const ok = multiTurn.length > 0;
      return result(
        ok,
        'rule.eval-must-include-multi-turn-001',
        ok ? '检测到多轮对话评测样本' : '未检测到多轮对话评测样本',
        { multiTurnCount: multiTurn.length, examples: multiTurn.slice(0, 10) }
      );
    },

    'rule.eval-sample-auto-collection-001': () => {
      const collectorSignals = scoreHits(files, [/sample\s*collector/i, /auto\s*collection/i, /collect\s*eval\s*sample/i, /harvest\s*conversation/i]);
      const persistSignals = scoreHits(files, [/writeFileSync\(|appendFileSync\(|save\s*sample/i, /dataset/i, /eval[_-]?set/i]);
      const ok = collectorSignals.hits > 0 && persistSignals.hits > 0;
      return result(
        ok,
        'rule.eval-sample-auto-collection-001',
        ok ? '检测到评测样本自动收集与持久化逻辑' : '缺少自动收集或持久化证据',
        { collectorHits: collectorSignals.hits, persistHits: persistSignals.hits, collectorExamples: collectorSignals.matched.slice(0, 8), persistExamples: persistSignals.matched.slice(0, 8) }
      );
    }
  };

  const run = checks[ruleId];
  if (!run) {
    const unknown = result(false, ruleId || 'unknown-rule', '未实现该规则检查逻辑', { supportedRules: Object.keys(checks) });
    if (logger && logger.warn) logger.warn('[eval-quality-check] unsupported rule', unknown);
    if (notify) await notify(unknown.message);
    return unknown;
  }

  const res = run();
  if (logger && logger.info) logger.info('[eval-quality-check] result', res);
  if (bus && typeof bus.emit === 'function') {
    await bus.emit('eval-quality-check.result', {
      ruleId: res.code,
      ok: res.ok,
      message: res.message,
      details: res.details,
      event: event || null
    });
  }
  if (notify) await notify(`${res.code}: ${res.ok ? 'PASS' : 'FAIL'} - ${res.message}`);
  return res;
};
