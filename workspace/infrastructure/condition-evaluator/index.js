'use strict';

class ConditionEvaluator {
  evaluate(conditions, payload) {
    if (!conditions || (typeof conditions === 'object' && Object.keys(conditions).length === 0)) {
      return { match: true, reason: 'No conditions specified' };
    }
    if (payload === null || payload === undefined) {
      return { match: false, reason: 'Payload is null or undefined' };
    }
    return this._evaluateObject(conditions, payload);
  }

  _evaluateObject(conditions, payload) {
    for (const key of Object.keys(conditions)) {
      if (key === '$and') return this._evalAnd(conditions.$and, payload);
      if (key === '$or') return this._evalOr(conditions.$or, payload);
      const result = this._evaluateField(key, conditions[key], payload);
      if (!result.match) return result;
    }
    return { match: true, reason: 'All conditions met' };
  }

  _evalAnd(arr, payload) {
    for (const cond of arr) {
      const r = this._evaluateObject(cond, payload);
      if (!r.match) return { match: false, reason: `$and failed: ${r.reason}` };
    }
    return { match: true, reason: 'All $and conditions met' };
  }

  _evalOr(arr, payload) {
    for (const cond of arr) {
      const r = this._evaluateObject(cond, payload);
      if (r.match) return { match: true, reason: `$or passed: ${r.reason}` };
    }
    return { match: false, reason: 'No $or conditions met' };
  }

  _getNestedValue(obj, path) {
    const parts = path.split('.');
    let current = obj;
    for (const p of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[p];
    }
    return current;
  }

  _evaluateField(field, expected, payload) {
    const value = this._getNestedValue(payload, field);

    if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
      return this._evaluateOperators(field, expected, value);
    }

    if (value === expected) return { match: true, reason: `${field} equals expected` };
    return { match: false, reason: `${field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}` };
  }

  _evaluateOperators(field, ops, value) {
    for (const op of Object.keys(ops)) {
      const expected = ops[op];
      let ok = false;
      switch (op) {
        case '$gt':  ok = value > expected; break;
        case '$gte': ok = value >= expected; break;
        case '$lt':  ok = value < expected; break;
        case '$lte': ok = value <= expected; break;
        case '$exists': ok = expected ? value !== undefined : value === undefined; break;
        case '$regex': ok = new RegExp(expected).test(value); break;
        case '$in':  ok = Array.isArray(expected) && expected.includes(value); break;
        case '$nin': ok = Array.isArray(expected) && !expected.includes(value); break;
        default:
          return { match: false, reason: `Unknown operator: ${op}` };
      }
      if (!ok) return { match: false, reason: `${field}: ${op} ${JSON.stringify(expected)} failed (value: ${JSON.stringify(value)})` };
    }
    return { match: true, reason: `${field} passed all operators` };
  }
}

module.exports = { ConditionEvaluator };
