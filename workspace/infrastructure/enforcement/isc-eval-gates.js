const fs = require('fs');
const path = require('path');

const FAIL_INTENT = 'FAIL-CLOSED: no LLM intent-recognition foundation, cannot report pass.';
const FAIL_CLOSED_BOOK = 'FAIL-CLOSED: closed-book evaluation violated; hardcoded evalset or reference material access detected.';

const PASS_WORDS = [
  'pass', 'passed', '通过', '可汇报通过', 'green', 'sign-off', 'signoff', '满足上线门槛'
];

const FORBIDDEN_REFERENCE_KEYWORDS = [
  'memory/', 'memory\\', 'memory.md',
  'label', 'labels', 'annotation', 'annotations',
  'answer', 'answers', 'gold', 'golden', 'ground_truth',
  'reference', 'references', 'expected_output', 'expected_outputs',
  'benchmark_answers', 'eval_set'
];

function asList(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textIncludesPass(payload) {
  const text = JSON.stringify(payload || {}, null, 2).toLowerCase();
  return PASS_WORDS.some(word => text.includes(word.toLowerCase()));
}

function containsForbiddenReference(values) {
  const hits = [];
  for (const item of asList(values)) {
    const s = String(item || '').toLowerCase();
    if (FORBIDDEN_REFERENCE_KEYWORDS.some(key => s.includes(key))) {
      hits.push(String(item));
    }
  }
  return hits;
}

function evaluateIntentGate(payload = {}) {
  const intentBasis = payload.intent_basis || {};
  const violations = [];

  if (intentBasis.llm_as_primary !== true) {
    violations.push('intent_basis.llm_as_primary != true');
  }
  if (!asList(intentBasis.evidence).length) {
    violations.push('intent_basis.evidence is empty');
  }

  return {
    ruleId: 'ISC-INTENT-EVAL-001',
    ok: violations.length === 0,
    failClosed: violations.length > 0,
    message: violations.length ? FAIL_INTENT : 'PASS: LLM intent-recognition foundation verified.',
    required: {
      'intent_basis.llm_as_primary': true,
      'intent_basis.evidence': 'non-empty'
    },
    evidence: {
      llm_as_primary: intentBasis.llm_as_primary === true,
      evidence_count: asList(intentBasis.evidence).length
    },
    violations
  };
}

function evaluateClosedBookGate(payload = {}) {
  const cbe = payload.closed_book_eval || {};
  const violations = [];

  if (cbe.enabled !== true) violations.push('closed_book_eval.enabled != true');
  if (cbe.no_hardcoded_evalset !== true) violations.push('closed_book_eval.no_hardcoded_evalset != true');
  if (cbe.no_reference_reads !== true) violations.push('closed_book_eval.no_reference_reads != true');
  if (!asList(cbe.forbidden_paths_checked).length) violations.push('closed_book_eval.forbidden_paths_checked is empty');
  if (!asList(cbe.evidence).length) violations.push('closed_book_eval.evidence is empty');

  const checkedHits = containsForbiddenReference(cbe.forbidden_paths_checked);
  if (checkedHits.length) {
    violations.push(`forbidden_paths_checked contains forbidden reference paths: ${checkedHits.join(', ')}`);
  }

  const accessed = asList(cbe.forbidden_paths_accessed);
  if (accessed.length) {
    violations.push(`closed_book_eval.forbidden_paths_accessed is non-empty: ${accessed.join(', ')}`);
  }

  return {
    ruleId: 'ISC-CLOSED-BOOK-001',
    ok: violations.length === 0,
    failClosed: violations.length > 0,
    message: violations.length ? FAIL_CLOSED_BOOK : 'PASS: closed-book evaluation hard gate verified.',
    required: {
      'closed_book_eval.enabled': true,
      'closed_book_eval.no_hardcoded_evalset': true,
      'closed_book_eval.no_reference_reads': true,
      'closed_book_eval.forbidden_paths_checked': 'non-empty-array',
      'closed_book_eval.evidence': 'non-empty-array'
    },
    evidence: {
      enabled: cbe.enabled === true,
      no_hardcoded_evalset: cbe.no_hardcoded_evalset === true,
      no_reference_reads: cbe.no_reference_reads === true,
      forbidden_paths_checked_count: asList(cbe.forbidden_paths_checked).length,
      evidence_count: asList(cbe.evidence).length,
      forbidden_paths_accessed_count: accessed.length
    },
    violations
  };
}

function evaluateAll(payload = {}) {
  const intent = evaluateIntentGate(payload);
  const closedBook = evaluateClosedBookGate(payload);
  const passRequested = textIncludesPass(payload);
  const ok = intent.ok && closedBook.ok;
  const gateStatus = ok ? 'PASS' : 'FAIL-CLOSED';

  return {
    ok,
    gateStatus,
    passRequested,
    summary: ok
      ? 'PASS: ISC intent-eval + closed-book hard gates satisfied.'
      : [intent.message, closedBook.message].filter(Boolean).join(' | '),
    rules: [intent, closedBook]
  };
}

function buildSandboxEvidence(context = {}) {
  const workspace = context.workspace || process.cwd();
  return {
    mode: 'sandbox',
    workspace,
    cwd: process.cwd(),
    node: process.version,
    timestamp: new Date().toISOString()
  };
}

function writeAuditReport(reportPath, data) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(data, null, 2), 'utf8');
  return reportPath;
}

module.exports = {
  FAIL_INTENT,
  FAIL_CLOSED_BOOK,
  PASS_WORDS,
  FORBIDDEN_REFERENCE_KEYWORDS,
  asList,
  textIncludesPass,
  containsForbiddenReference,
  evaluateIntentGate,
  evaluateClosedBookGate,
  evaluateAll,
  buildSandboxEvidence,
  writeAuditReport
};
