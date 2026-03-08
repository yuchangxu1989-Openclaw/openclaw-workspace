'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const rulePath = '/root/.openclaw/workspace/skills/isc-core/rules/rule.self-correction-to-rule-001.json';
const n020Path = '/root/.openclaw/workspace/skills/isc-core/rules/rule.n020-auto-universal-root-cause-analysis-020.json';
const handlerPath = '/root/.openclaw/workspace/infrastructure/event-bus/handlers/self-correction-root-cause.js';

const rule = JSON.parse(fs.readFileSync(rulePath, 'utf8'));
const n020 = JSON.parse(fs.readFileSync(n020Path, 'utf8'));
const handler = require(handlerPath);

async function test_rule_and_handler_exist() {
  assert.strictEqual(rule.action.handler, 'self-correction-root-cause');
  assert.ok(fs.existsSync(handlerPath), 'handler file missing');
}

async function test_current_pipeline_eval_is_weak() {
  const pb = JSON.parse(fs.readFileSync('/root/.openclaw/workspace/tests/benchmarks/pipeline/pipeline-benchmark-dataset.json', 'utf8'));
  const c = pb.find(x => x.id === 'PB-010');
  assert.ok(c, 'PB-010 missing');
  assert.strictEqual(c.input_events[0].type, 'agent.behavior.defect_acknowledged');
  assert.strictEqual(c.expected_rules_matched_min, 1);
  assert.strictEqual(c.expected_dispatches_min, 0, 'dispatch expectation should expose laxity');
  assert.ok(!JSON.stringify(c).includes('root_cause'));
  assert.ok(!JSON.stringify(c).includes('fix_type'));
}

async function test_real_closed_book_root_cause_path_no_fs_side_effect() {
  const beforeRules = new Set(fs.readdirSync('/root/.openclaw/workspace/skills/isc-core/rules'));
  const res = await handler({
    payload: {
      defect_summary: '我漏了把纠偏类意图泛化成规则',
      defect_description: '这是我的问题，我遗漏了对一类纠偏意图的检测和规则固化',
    }
  }, { id: 'rule.self-correction-to-rule-001' }, {});
  const afterRules = new Set(fs.readdirSync('/root/.openclaw/workspace/skills/isc-core/rules'));
  assert.strictEqual(res.root_cause, 'cognitive_bias');
  assert.strictEqual(res.fix_type, 'update_rule_condition');
  assert.ok(Array.isArray(res.actions) && res.actions.some(a => a.action === 'condition_review_requested'));
  assert.deepStrictEqual(afterRules, beforeRules, 'should not create rule for cognitive-bias case');
}

async function test_real_closed_book_handler_missing_semantics_exposes_bug() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isc-self-correction-'));
  process.chdir(tmp);
  const defect = {
    payload: {
      defect_summary: '规则存在但handler缺失',
      defect_description: '规则存在但handler缺失，应该自动创建handler并补验证',
    }
  };
  const emitted = [];
  const beforeRules = new Set(fs.readdirSync('/root/.openclaw/workspace/skills/isc-core/rules'));
  const res = await handler(defect, { id: 'rule.self-correction-to-rule-001' }, { bus: { emit: (t, p) => emitted.push({ t, p }) } });
  const afterRules = new Set(fs.readdirSync('/root/.openclaw/workspace/skills/isc-core/rules'));

  // 严格期望：该语义应命中 handler_missing/create_handler，而不是 create_rule。
  assert.strictEqual(res.root_cause, 'handler_missing', `BUG: misclassified as ${res.root_cause}`);
  assert.strictEqual(res.fix_type, 'create_handler');
  assert.ok(emitted.some(e => e.t === 'lto.task.created'));
  assert.deepStrictEqual(afterRules, beforeRules, 'handler-missing case should not create new rule');
}

async function test_n020_is_not_closed_loop() {
  assert.strictEqual(n020.action.handler, 'notify-alert');
  assert.ok(n020.execution.steps.some(s => s.action === 'root_cause_analysis'));
  assert.ok(n020.execution.steps.some(s => s.action === 'gap_analysis'));
  // 真实执行层仍只绑 notify-alert，未验证 RCA/gap/repair 真执行。
}

(async () => {
  const tests = [
    test_rule_and_handler_exist,
    test_current_pipeline_eval_is_weak,
    test_real_closed_book_root_cause_path_no_fs_side_effect,
    test_real_closed_book_handler_missing_semantics_exposes_bug,
    test_n020_is_not_closed_loop,
  ];
  let failed = 0;
  for (const t of tests) {
    try {
      await t();
      console.log('PASS', t.name);
    } catch (e) {
      failed++;
      console.error('FAIL', t.name, '-', e.message);
    }
  }
  process.exit(failed ? 1 : 0);
})();
