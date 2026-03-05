'use strict';

const MAX_PAYLOAD_SIZE = 10 * 1024; // 10KB
const MAX_DEPTH = 5;
const SENSITIVE_PATTERNS = /key|secret|token|password/i;

function sanitizePayload(payload) {
  const report = { removedFields: [], truncated: false, originalSize: 0 };

  const jsonStr = JSON.stringify(payload);
  report.originalSize = jsonStr ? jsonStr.length : 0;

  if (payload === null || payload === undefined) {
    return { cleaned: payload, report };
  }

  const cleaned = _sanitize(payload, 0, report);

  const cleanedStr = JSON.stringify(cleaned);
  if (cleanedStr && cleanedStr.length > MAX_PAYLOAD_SIZE) {
    report.truncated = true;
    return { cleaned: JSON.parse(cleanedStr.slice(0, MAX_PAYLOAD_SIZE) + (typeof cleaned === 'object' ? '' : '')), report };
  }

  return { cleaned, report };
}

function _sanitize(obj, depth, report) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (depth >= MAX_DEPTH) {
    report.truncated = true;
    return '[depth limit exceeded]';
  }

  if (Array.isArray(obj)) {
    return obj.map(item => _sanitize(item, depth + 1, report));
  }

  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_PATTERNS.test(k)) {
      report.removedFields.push(k);
      continue;
    }
    result[k] = _sanitize(v, depth + 1, report);
  }
  return result;
}

// Handle oversized payloads by truncating at top level
function sanitizePayloadSafe(payload) {
  const report = { removedFields: [], truncated: false, originalSize: 0 };

  try {
    const jsonStr = JSON.stringify(payload);
    report.originalSize = jsonStr ? jsonStr.length : 0;
  } catch { report.originalSize = -1; }

  if (payload === null || payload === undefined) {
    return { cleaned: payload, report };
  }

  const cleaned = _sanitize(payload, 0, report);

  try {
    const cleanedStr = JSON.stringify(cleaned);
    if (cleanedStr && cleanedStr.length > MAX_PAYLOAD_SIZE) {
      report.truncated = true;
      // Truncate string values to fit
      return { cleaned: _truncateToSize(cleaned, MAX_PAYLOAD_SIZE), report };
    }
  } catch { /* ignore */ }

  return { cleaned, report };
}

function _truncateToSize(obj, maxSize) {
  const str = JSON.stringify(obj);
  if (!str || str.length <= maxSize) return obj;
  // Simple truncation: return a summary
  return { _truncated: true, _message: `Payload exceeded ${maxSize} bytes (was ${str.length})` };
}

module.exports = { sanitizePayload: sanitizePayloadSafe };
