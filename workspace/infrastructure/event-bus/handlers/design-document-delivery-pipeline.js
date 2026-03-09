/**
 * design-document-delivery-pipeline handler
 * 设计文档9步交付流水线 — 每步都是门禁，不许跳步，任何一步不过打回
 * 
 * Trigger event: document.design.requested
 * Rule: rule.design-document-delivery-pipeline-001
 */
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '../../logs/design-doc-pipeline.jsonl');
const STATE_DIR = path.resolve(__dirname, '../../state/design-doc-pipeline');

const PIPELINE_STEPS = [
  { step: 1, name: '结构审查',     gate: 'rule.design-document-structure-001' },
  { step: 2, name: '内容瘦身',     gate: 'content_slim_check' },
  { step: 3, name: 'MECE校验',     gate: 'rule.naming-mece-consistency-001' },
  { step: 4, name: '质量扫描',     gate: 'isc-document-quality' },
  { step: 5, name: '架构图标准化', gate: 'rule.architecture-diagram-visual-output-001' },
  { step: 6, name: 'MD模拟演讲',   gate: 'rule.design-document-narrative-review-001' },
  { step: 7, name: 'PDF生成',      gate: 'pdf_generation' },
  { step: 8, name: 'PDF模拟演讲',  gate: 'rule.design-document-narrative-review-001' },
  { step: 9, name: '交付',         gate: 'delivery_final' },
];

function loadState(docId) {
  const file = path.join(STATE_DIR, `${docId}.json`);
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  }
  return null;
}

function saveState(docId, state) {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(path.join(STATE_DIR, `${docId}.json`), JSON.stringify(state, null, 2));
}

module.exports = async function(event, rule, context) {
  const payload = event.payload || {};
  const docId = payload.docId || payload.document_id || `doc-${Date.now()}`;
  const action = payload.action || 'start'; // start | advance | status
  const stepResult = payload.stepResult; // { pass: bool, issues: [] }

  // Load or create pipeline state
  let state = loadState(docId);

  if (action === 'status') {
    return {
      success: true,
      result: state || 'no_pipeline_found',
      message: state ? `文档 ${docId} 当前在第${state.currentStep}步: ${PIPELINE_STEPS[state.currentStep - 1].name}` : '未找到流水线记录',
    };
  }

  if (action === 'start' || !state) {
    state = {
      docId,
      startedAt: new Date().toISOString(),
      currentStep: 1,
      status: 'in_progress',
      history: [],
    };
    saveState(docId, state);

    const record = {
      timestamp: state.startedAt,
      handler: 'design-document-delivery-pipeline',
      eventType: event.type,
      docId,
      action: 'pipeline_started',
      currentStep: 1,
      stepName: PIPELINE_STEPS[0].name,
    };
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');

    return {
      success: true,
      result: 'pipeline_started',
      state,
      nextGate: PIPELINE_STEPS[0],
      message: `设计文档流水线已启动，文档: ${docId}，第1步: ${PIPELINE_STEPS[0].name}`,
    };
  }

  if (action === 'advance') {
    if (state.status === 'completed') {
      return { success: false, result: 'already_completed', message: '流水线已完成' };
    }
    if (state.status === 'blocked') {
      return { success: false, result: 'blocked', message: `流水线在第${state.currentStep}步被阻断，请修复后重试` };
    }

    const currentIdx = state.currentStep - 1;
    const currentStepInfo = PIPELINE_STEPS[currentIdx];

    if (!stepResult || !stepResult.pass) {
      // Gate failed — block
      state.status = 'blocked';
      state.history.push({
        step: state.currentStep,
        name: currentStepInfo.name,
        gate: currentStepInfo.gate,
        result: 'blocked',
        issues: (stepResult && stepResult.issues) || ['门禁未通过'],
        timestamp: new Date().toISOString(),
      });
      saveState(docId, state);

      const record = {
        timestamp: new Date().toISOString(),
        handler: 'design-document-delivery-pipeline',
        docId,
        action: 'step_blocked',
        step: state.currentStep,
        stepName: currentStepInfo.name,
        issues: (stepResult && stepResult.issues) || [],
      };
      fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');

      return {
        success: false,
        result: 'step_blocked',
        step: state.currentStep,
        stepName: currentStepInfo.name,
        message: `第${state.currentStep}步「${currentStepInfo.name}」未通过，流水线阻断`,
      };
    }

    // Gate passed — advance
    state.history.push({
      step: state.currentStep,
      name: currentStepInfo.name,
      gate: currentStepInfo.gate,
      result: 'pass',
      timestamp: new Date().toISOString(),
    });

    if (state.currentStep >= PIPELINE_STEPS.length) {
      state.status = 'completed';
      state.completedAt = new Date().toISOString();
      saveState(docId, state);
      return {
        success: true,
        result: 'pipeline_completed',
        message: `设计文档流水线全部通过，文档 ${docId} 已交付`,
      };
    }

    state.currentStep++;
    state.status = 'in_progress';
    saveState(docId, state);

    const nextStep = PIPELINE_STEPS[state.currentStep - 1];
    return {
      success: true,
      result: 'step_passed',
      completedStep: currentStepInfo.name,
      nextStep: state.currentStep,
      nextGate: nextStep,
      message: `第${state.currentStep - 1}步「${currentStepInfo.name}」通过，进入第${state.currentStep}步「${nextStep.name}」`,
    };
  }

  return { success: false, result: 'unknown_action', message: `未知操作: ${action}` };
};

// Allow direct invocation for testing
if (require.main === module) {
  const testEvent = {
    type: 'document.design.requested',
    id: 'test-' + Date.now(),
    payload: { docId: 'test-doc-001', action: 'start' },
  };
  const testRule = { id: 'rule.design-document-delivery-pipeline-001' };
  module.exports(testEvent, testRule, {}).then(r => console.log(JSON.stringify(r, null, 2)));
}
