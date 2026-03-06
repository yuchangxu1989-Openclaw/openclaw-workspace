'use strict';

/**
 * Condition Evaluator — 认知层核心
 * 
 * 替换 dispatcher 中的占位符条件评估，实现真正的条件求值引擎。
 * 
 * 支持的条件格式：
 * 
 *   1. 空/缺失条件        → 直接通过
 *   2. 简单对象相等         { "status": "failed" }
 *   3. MongoDB风格运算符    { "score": { "$lt": 0.8 } }
 *   4. 逻辑组合            { "$and": [...] }, { "$or": [...] }, { "$not": {...} }
 *   5. 存在性检查          { "field": { "$exists": true } }
 *   6. 正则匹配            { "path": { "$regex": "^skills/" } }
 *   7. 包含检查            { "tags": { "$in": ["urgent", "critical"] } }
 *   8. 字符串条件          "enforcement_rate < 100%" → 解析后求值
 *   9. 数组条件            [cond1, cond2] → $and 语义
 *  10. json-rules-engine风格  { "all": [...], "any": [...] }  with fact/operator/value
 *  11. 描述性/语义条件      无法机器求值 → needs_llm: true
 * 
 * 字段路径支持点号访问：payload.metrics.yellowLightRatio
 * 
 * 设计原则：
 *   - 条件求值异常时默认 pass: true（fail-open），避免阻塞事件流
 *   - 不可求值的语义条件标记 needs_llm，不阻塞但记录
 *   - 所有运算符可扩展（注册自定义运算符）
 * 
 * @module condition-evaluator
 */

// ─── Field Path Resolution ───────────────────────────────────────

/**
 * 从嵌套对象中按点号路径取值
 * 支持：'a.b.c', 'metrics.yellowLightRatio', 'payload.items.0.name'
 * 
 * @param {object} obj - 源对象
 * @param {string} path - 点号分隔的路径
 * @returns {*} 字段值，不存在返回 undefined
 */
function getFieldValue(obj, fieldPath) {
  if (obj == null || typeof fieldPath !== 'string') return undefined;
  
  const parts = fieldPath.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current == null) return undefined;
    if (typeof current === 'object') {
      current = current[part];
    } else {
      return undefined;
    }
  }
  
  return current;
}

// ─── Value Parsing ───────────────────────────────────────────────

/**
 * 将字符串值解析为适当的JS类型
 * "100%" → 100, "true" → true, "0.3" → 0.3, 保留其他字符串
 */
function parseValue(raw) {
  if (typeof raw !== 'string') return raw;
  
  const trimmed = raw.trim();
  
  // Boolean
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  
  // Percentage → number (去掉%号)
  if (trimmed.endsWith('%')) {
    const num = parseFloat(trimmed.slice(0, -1));
    if (!isNaN(num)) return num;
  }
  
  // Number
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== '') return num;
  
  // Quoted string → strip quotes
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  
  return trimmed;
}

// ─── Comparison Operators ────────────────────────────────────────

/**
 * 内建运算符映射
 * 可通过 registerOperator() 扩展
 */
const OPERATORS = {
  // 数值/字符串比较
  '$eq':  (a, b) => a === b,
  '$ne':  (a, b) => a !== b,
  '$gt':  (a, b) => a > b,
  '$gte': (a, b) => a >= b,
  '$lt':  (a, b) => a < b,
  '$lte': (a, b) => a <= b,
  
  // 集合操作
  '$in':     (a, b) => Array.isArray(b) ? b.includes(a) : false,
  '$nin':    (a, b) => Array.isArray(b) ? !b.includes(a) : true,
  '$contains': (a, b) => {
    if (typeof a === 'string') return a.includes(String(b));
    if (Array.isArray(a)) return a.includes(b);
    return false;
  },
  
  // 存在性
  '$exists': (a, b) => b ? (a !== undefined && a !== null) : (a === undefined || a === null),
  
  // 正则
  '$regex':  (a, b) => {
    if (typeof a !== 'string') return false;
    try {
      return new RegExp(b).test(a);
    } catch (_) {
      return false;
    }
  },
  
  // 类型检查
  '$type': (a, b) => typeof a === b,
  
  // 数组长度
  '$size': (a, b) => Array.isArray(a) && a.length === b,
  
  // 字符串操作符别名（用于string condition解析）
  'eq':  (a, b) => a === b,
  'ne':  (a, b) => a !== b,
  'gt':  (a, b) => a > b,
  'gte': (a, b) => a >= b,
  'lt':  (a, b) => a < b,
  'lte': (a, b) => a <= b,
  'in':  (a, b) => Array.isArray(b) ? b.includes(a) : false,
  'equal': (a, b) => a === b,
  'exists': (a, _b) => a !== undefined && a !== null,
};

/**
 * 标准化运算符字符串到函数
 */
const SYMBOL_TO_OP = {
  '==':  '$eq',
  '===': '$eq',
  '!=':  '$ne',
  '!==': '$ne',
  '>':   '$gt',
  '>=':  '$gte',
  '<':   '$lt',
  '<=':  '$lte',
};

/**
 * 注册自定义运算符
 * @param {string} name - 运算符名（如 '$customOp'）
 * @param {Function} fn - (actual, expected) => boolean
 */
function registerOperator(name, fn) {
  if (typeof fn !== 'function') throw new Error(`Operator ${name} must be a function`);
  OPERATORS[name] = fn;
}

// ─── Core Evaluation Engine ──────────────────────────────────────

/**
 * 主入口：评估条件
 * 
 * @param {object|Array|string|null|undefined} conditions - 规则中的条件
 * @param {object} payload - 事件 payload
 * @param {object} [context={}] - 额外上下文（系统状态等）
 * @returns {{ pass: boolean, reason: string, needs_llm: boolean, details?: Array }}
 */
function evaluate(conditions, payload, context = {}) {
  try {
    return _evaluate(conditions, payload, context);
  } catch (err) {
    // Fail-open: 条件求值异常时默认通过，避免阻塞事件流
    return {
      pass: true,
      reason: `evaluation error (fail-open): ${err.message}`,
      needs_llm: false,
      error: err.message,
    };
  }
}

/**
 * 内部求值（可能抛异常）
 */
function _evaluate(conditions, payload, context) {
  // 空条件 → 通过
  if (conditions === undefined || conditions === null) {
    return { pass: true, reason: 'no conditions', needs_llm: false };
  }
  
  // 空对象 → 通过
  if (typeof conditions === 'object' && !Array.isArray(conditions) && Object.keys(conditions).length === 0) {
    return { pass: true, reason: 'empty conditions object', needs_llm: false };
  }
  
  // 布尔条件
  if (typeof conditions === 'boolean') {
    return { pass: conditions, reason: `boolean: ${conditions}`, needs_llm: false };
  }
  
  // 字符串条件
  if (typeof conditions === 'string') {
    return _evaluateString(conditions, payload, context);
  }
  
  // 数组条件 → $and 语义
  if (Array.isArray(conditions)) {
    return _evaluateAnd(conditions, payload, context);
  }
  
  // 对象条件
  return _evaluateObject(conditions, payload, context);
}

/**
 * 评估对象条件
 */
function _evaluateObject(conditions, payload, context) {
  // 逻辑组合运算符
  if (conditions.$and) return _evaluateAnd(conditions.$and, payload, context);
  if (conditions.$or) return _evaluateOr(conditions.$or, payload, context);
  if (conditions.$not) return _evaluateNot(conditions.$not, payload, context);
  
  // json-rules-engine 风格: { all: [...] } / { any: [...] }
  if (conditions.all) return _evaluateRulesEngineAll(conditions.all, payload, context);
  if (conditions.any) return _evaluateRulesEngineAny(conditions.any, payload, context);
  
  // 字段匹配对象：每个 key 是字段名，value 是期望值或运算符表达式
  // 所有字段必须满足（隐式 AND）
  const merged = { ...(payload || {}), ...(context || {}) };
  const details = [];
  let allPass = true;
  let hasLlm = false;
  let hasMachineEvaluable = false;
  
  for (const [field, expected] of Object.entries(conditions)) {
    const result = _evaluateField(field, expected, merged);
    details.push({ field, ...result });
    
    if (result.needs_llm) {
      hasLlm = true;
      // LLM条件不阻塞其他条件的求值
    } else {
      hasMachineEvaluable = true;
      if (!result.pass) {
        allPass = false;
      }
    }
  }
  
  // 如果所有条件都是语义条件（需要LLM），默认通过但标记
  if (!hasMachineEvaluable && hasLlm) {
    return {
      pass: true,
      reason: 'all conditions require LLM evaluation, defaulting to pass',
      needs_llm: true,
      details,
    };
  }
  
  return {
    pass: allPass,
    reason: allPass
      ? `all ${details.length} field conditions satisfied`
      : `failed: ${details.filter(d => !d.pass && !d.needs_llm).map(d => d.field).join(', ')}`,
    needs_llm: hasLlm,
    details,
  };
}

/**
 * 评估单个字段条件
 */
function _evaluateField(field, expected, data) {
  const actual = getFieldValue(data, field);
  
  // expected 是运算符对象: { "$lt": 0.8, "$gte": 0 }
  if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
    const opKeys = Object.keys(expected).filter(k => k.startsWith('$') || OPERATORS[k]);
    
    if (opKeys.length > 0) {
      // 所有运算符必须同时满足（多运算符 = AND）
      for (const opKey of opKeys) {
        const opFn = OPERATORS[opKey];
        if (!opFn) {
          return { pass: true, reason: `unknown operator ${opKey}, skip`, needs_llm: false };
        }
        const result = opFn(actual, expected[opKey]);
        if (!result) {
          return {
            pass: false,
            reason: `${field} ${opKey} ${JSON.stringify(expected[opKey])} → false (actual: ${JSON.stringify(actual)})`,
            needs_llm: false,
          };
        }
      }
      return {
        pass: true,
        reason: `${field}: all ${opKeys.length} operator(s) passed`,
        needs_llm: false,
      };
    }
    
    // 不是运算符对象 → 可能是描述性条件（如 { "fast_channel": { "interval": "5min" } }）
    // 这类条件是声明性的，无法机器求值，标记 needs_llm
    return _classifyDescriptiveCondition(field, expected, actual);
  }
  
  // expected 是数组 → $in 语义（actual 在 expected 数组中）
  if (Array.isArray(expected)) {
    if (actual !== undefined && expected.includes(actual)) {
      return { pass: true, reason: `${field}: ${JSON.stringify(actual)} in ${JSON.stringify(expected)}`, needs_llm: false };
    }
    // 也许 actual 是数组，检查交集
    if (Array.isArray(actual) && actual.some(v => expected.includes(v))) {
      return { pass: true, reason: `${field}: arrays overlap`, needs_llm: false };
    }
    // 如果 actual 不存在，这可能是声明性条件
    if (actual === undefined) {
      return { pass: true, reason: `${field}: not in payload, declarative array condition (skip)`, needs_llm: false };
    }
    return { pass: false, reason: `${field}: ${JSON.stringify(actual)} not in ${JSON.stringify(expected)}`, needs_llm: false };
  }
  
  // 检测描述性字符串值（长中文句子 = 语义条件，不应做精确匹配）
  if (typeof expected === 'string' && _isDescriptiveString(expected)) {
    return {
      pass: true,
      reason: `${field}: descriptive string condition, deferred to LLM`,
      needs_llm: true,
    };
  }
  
  // expected 是原始值 → 精确相等
  if (actual === expected) {
    return { pass: true, reason: `${field} === ${JSON.stringify(expected)}`, needs_llm: false };
  }
  
  // 类型宽容比较（字符串"10" == 数字10）
  if (actual !== undefined && String(actual) === String(expected)) {
    return { pass: true, reason: `${field} ≈ ${JSON.stringify(expected)} (loose)`, needs_llm: false };
  }
  
  // actual 不存在且 expected 非空 → 字段可能不在 payload 中
  // 对于声明性规则条件，字段不在 payload 中是正常的（规则描述的是期望，不是匹配条件）
  if (actual === undefined) {
    return { pass: true, reason: `${field}: not in payload, skip (declarative)`, needs_llm: false };
  }
  
  return { pass: false, reason: `${field}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`, needs_llm: false };
}

/**
 * 检测是否为描述性字符串（语义条件，非匹配值）
 * 规则：长度>15且含中文字符或长度>30的自然语言句子
 */
function _isDescriptiveString(str) {
  if (typeof str !== 'string') return false;
  // 含中文且长度较长 → 大概率是描述
  if (str.length > 15 && /[\u4e00-\u9fa5]/.test(str)) return true;
  // 英文长句（含空格）
  if (str.length > 40 && str.includes(' ') && !/^[\w.]+\s*(>=|<=|>|<|==|!=)\s*/.test(str)) return true;
  return false;
}

/**
 * 分类描述性条件：判断是可机器求值还是语义条件
 */
function _classifyDescriptiveCondition(field, expected, actual) {
  // 如果对象的value全是字符串且像是描述文本 → needs_llm
  const values = Object.values(expected);
  const isDescriptive = values.every(v => 
    typeof v === 'string' && v.length > 10 && /[\u4e00-\u9fa5]/.test(v)
  );
  
  if (isDescriptive) {
    return {
      pass: true,
      reason: `${field}: descriptive/semantic condition, deferred to LLM`,
      needs_llm: true,
    };
  }
  
  // 对象内有 operator/fact → json-rules-engine 格式的内嵌
  if (expected.operator && expected.fact) {
    return _evaluateRulesEngineCondition(expected, { ...(actual || {}) });
  }
  
  // 默认：未知结构的对象条件，跳过（fail-open）
  return {
    pass: true,
    reason: `${field}: complex object condition, not evaluable (skip)`,
    needs_llm: false,
  };
}

// ─── Logical Combinators ─────────────────────────────────────────

/**
 * $and / 数组语义：所有条件必须满足
 */
function _evaluateAnd(conditions, payload, context) {
  if (!Array.isArray(conditions)) {
    return _evaluate(conditions, payload, context);
  }
  
  const details = [];
  let allPass = true;
  let anyLlm = false;
  
  for (const cond of conditions) {
    const result = _evaluate(cond, payload, context);
    details.push(result);
    if (result.needs_llm) anyLlm = true;
    if (!result.pass) allPass = false;
  }
  
  return {
    pass: allPass,
    reason: allPass
      ? `$and: all ${conditions.length} conditions passed`
      : `$and: ${details.filter(d => !d.pass).length}/${conditions.length} failed`,
    needs_llm: anyLlm,
    details,
  };
}

/**
 * $or：任一条件满足即通过
 */
function _evaluateOr(conditions, payload, context) {
  if (!Array.isArray(conditions)) {
    return _evaluate(conditions, payload, context);
  }
  
  const details = [];
  let anyPass = false;
  let anyLlm = false;
  
  for (const cond of conditions) {
    const result = _evaluate(cond, payload, context);
    details.push(result);
    if (result.needs_llm) anyLlm = true;
    if (result.pass) anyPass = true;
  }
  
  return {
    pass: anyPass,
    reason: anyPass
      ? `$or: ${details.filter(d => d.pass).length}/${conditions.length} passed`
      : `$or: none of ${conditions.length} conditions passed`,
    needs_llm: anyLlm,
    details,
  };
}

/**
 * $not：条件取反
 */
function _evaluateNot(condition, payload, context) {
  const result = _evaluate(condition, payload, context);
  return {
    pass: !result.pass,
    reason: `$not: inner=${result.pass} → ${!result.pass}`,
    needs_llm: result.needs_llm,
    details: [result],
  };
}

// ─── String Condition Parser ─────────────────────────────────────

/**
 * 解析并求值字符串条件
 * 
 * 支持格式：
 *   - "field > value"
 *   - "field == 'string'"
 *   - "cond1 AND cond2"
 *   - "cond1 OR cond2"
 *   - "field operator value"
 *   - "field.path operator value"  (dot notation)
 */
function _evaluateString(condStr, payload, context) {
  const trimmed = condStr.trim();
  if (!trimmed) {
    return { pass: true, reason: 'empty string condition', needs_llm: false };
  }
  
  // 尝试拆分 AND / OR（顶层，不处理括号嵌套）
  // OR 优先级低于 AND，先拆 OR
  const orResult = _trySplitLogical(trimmed, ' OR ', payload, context, 'or');
  if (orResult) return orResult;
  
  const andResult = _trySplitLogical(trimmed, ' AND ', payload, context, 'and');
  if (andResult) return andResult;
  
  // 单个条件表达式
  return _evaluateSingleStringCondition(trimmed, payload, context);
}

/**
 * 尝试按逻辑运算符拆分字符串
 */
function _trySplitLogical(condStr, separator, payload, context, mode) {
  const parts = _splitTopLevel(condStr, separator);
  if (parts.length <= 1) return null;
  
  const results = parts.map(part => _evaluateString(part.trim(), payload, context));
  
  if (mode === 'or') {
    const anyPass = results.some(r => r.pass);
    const anyLlm = results.some(r => r.needs_llm);
    return {
      pass: anyPass,
      reason: `string OR: ${results.filter(r => r.pass).length}/${results.length} passed`,
      needs_llm: anyLlm,
      details: results,
    };
  } else {
    const allPass = results.every(r => r.pass);
    const anyLlm = results.some(r => r.needs_llm);
    return {
      pass: allPass,
      reason: `string AND: ${results.filter(r => r.pass).length}/${results.length} passed`,
      needs_llm: anyLlm,
      details: results,
    };
  }
}

/**
 * 在顶层拆分字符串（不拆分引号或括号内的内容）
 */
function _splitTopLevel(str, separator) {
  const parts = [];
  let depth = 0;
  let inQuote = false;
  let quoteChar = '';
  let current = '';
  
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    
    if (inQuote) {
      current += ch;
      if (ch === quoteChar) inQuote = false;
      continue;
    }
    
    if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
      current += ch;
      continue;
    }
    
    if (ch === '(' || ch === '[') { depth++; current += ch; continue; }
    if (ch === ')' || ch === ']') { depth--; current += ch; continue; }
    
    if (depth === 0 && str.substring(i, i + separator.length) === separator) {
      parts.push(current);
      current = '';
      i += separator.length - 1;
      continue;
    }
    
    current += ch;
  }
  
  if (current) parts.push(current);
  return parts;
}

/**
 * 解析单个 "field op value" 表达式
 */
function _evaluateSingleStringCondition(condStr, payload, context) {
  const merged = { ...(payload || {}), ...(context || {}) };
  
  // 模式1: "field >= value", "field == value", "field != value" 等
  const symbolPattern = /^([\w.]+)\s*(>=|<=|>|<|===|!==|==|!=)\s*(.+)$/;
  const symbolMatch = condStr.match(symbolPattern);
  if (symbolMatch) {
    const [, field, op, rawVal] = symbolMatch;
    return _resolveAndCompare(field, op, rawVal, merged);
  }
  
  // 模式2: "field gt value", "field gte value" 等文字运算符
  const wordPattern = /^([\w.]+)\s+(gt|gte|lt|lte|eq|ne|in|contains)\s+(.+)$/i;
  const wordMatch = condStr.match(wordPattern);
  if (wordMatch) {
    const [, field, op, rawVal] = wordMatch;
    return _resolveAndCompare(field, '$' + op.toLowerCase(), rawVal, merged);
  }
  
  // 模式3: "field.path.with.dots operator value"（更宽松的匹配）
  const loosePattern = /^([\w.]+(?:\.\w+)*)\s+(>=|<=|>|<|==|!=|===|!==)\s*(.+)$/;
  const looseMatch = condStr.match(loosePattern);
  if (looseMatch) {
    const [, field, op, rawVal] = looseMatch;
    return _resolveAndCompare(field, op, rawVal, merged);
  }
  
  // 模式4: "field_name" 存在性检查（单个标识符）
  const existsPattern = /^[\w.]+$/;
  if (existsPattern.test(condStr)) {
    const actual = getFieldValue(merged, condStr);
    if (actual !== undefined && actual !== null && actual !== false && actual !== 0) {
      return { pass: true, reason: `${condStr} exists and is truthy`, needs_llm: false };
    }
    // 字段不在payload中，可能是未来事件才有的字段 → 默认pass
    if (actual === undefined) {
      return { pass: true, reason: `${condStr}: not in payload, skip`, needs_llm: false };
    }
    return { pass: false, reason: `${condStr} is falsy: ${JSON.stringify(actual)}`, needs_llm: false };
  }
  
  // 模式5: 含有 "contains" / "includes" 等关键词
  const containsPattern = /^([\w.]+)\s+contains\s+'([^']+)'/i;
  const containsMatch = condStr.match(containsPattern);
  if (containsMatch) {
    const [, field, substr] = containsMatch;
    const actual = getFieldValue(merged, field);
    if (typeof actual === 'string') {
      const result = actual.includes(substr);
      return { pass: result, reason: `${field} contains '${substr}' → ${result}`, needs_llm: false };
    }
    return { pass: true, reason: `${field}: not a string, skip contains check`, needs_llm: false };
  }
  
  // 无法解析 → 标记需要LLM判断
  return {
    pass: true,
    reason: `unparseable condition: "${condStr}", deferred to LLM`,
    needs_llm: true,
  };
}

/**
 * 解析字段值并执行比较
 */
function _resolveAndCompare(field, op, rawVal, data) {
  const actual = getFieldValue(data, field);
  
  // 字段不存在 → 无法评估，默认通过
  if (actual === undefined) {
    return { pass: true, reason: `${field}: not in payload, skip`, needs_llm: false };
  }
  
  const expected = parseValue(rawVal);
  const normalizedOp = SYMBOL_TO_OP[op] || op;
  const opFn = OPERATORS[normalizedOp];
  
  if (!opFn) {
    return { pass: true, reason: `unknown operator: ${op}, skip`, needs_llm: false };
  }
  
  const result = opFn(actual, expected);
  return {
    pass: result,
    reason: `${field} ${op} ${JSON.stringify(expected)} → ${result} (actual: ${JSON.stringify(actual)})`,
    needs_llm: false,
  };
}

// ─── json-rules-engine Compatible ────────────────────────────────

/**
 * { all: [ {fact, operator, value}, ... ] } → AND
 */
function _evaluateRulesEngineAll(conditions, payload, context) {
  if (!Array.isArray(conditions)) {
    return { pass: true, reason: 'all: not an array, skip', needs_llm: false };
  }
  
  const details = [];
  let allPass = true;
  let anyLlm = false;
  
  for (const cond of conditions) {
    const result = _evaluateRulesEngineCondition(cond, { ...(payload || {}), ...(context || {}) });
    details.push(result);
    if (result.needs_llm) anyLlm = true;
    if (!result.pass) allPass = false;
  }
  
  return {
    pass: allPass,
    reason: allPass
      ? `all: ${conditions.length}/${conditions.length} passed`
      : `all: ${details.filter(d => !d.pass).length}/${conditions.length} failed`,
    needs_llm: anyLlm,
    details,
  };
}

/**
 * { any: [ {fact, operator, value}, ... ] } → OR
 */
function _evaluateRulesEngineAny(conditions, payload, context) {
  if (!Array.isArray(conditions)) {
    return { pass: true, reason: 'any: not an array, skip', needs_llm: false };
  }
  
  const details = [];
  let anyPass = false;
  let anyLlm = false;
  
  for (const cond of conditions) {
    const result = _evaluateRulesEngineCondition(cond, { ...(payload || {}), ...(context || {}) });
    details.push(result);
    if (result.needs_llm) anyLlm = true;
    if (result.pass) anyPass = true;
  }
  
  return {
    pass: anyPass,
    reason: anyPass
      ? `any: ${details.filter(d => d.pass).length}/${conditions.length} passed`
      : `any: none of ${conditions.length} passed`,
    needs_llm: anyLlm,
    details,
  };
}

/**
 * 单个 json-rules-engine 条件: { fact, operator, value, id?, failMessage?, then? }
 */
function _evaluateRulesEngineCondition(cond, data) {
  if (!cond || !cond.fact || !cond.operator) {
    // 可能是嵌套 all/any
    if (cond && cond.all) return _evaluateRulesEngineAll(cond.all, data, {});
    if (cond && cond.any) return _evaluateRulesEngineAny(cond.any, data, {});
    return { pass: true, reason: 'incomplete rules-engine condition, skip', needs_llm: false };
  }
  
  const actual = getFieldValue(data, cond.fact);
  const op = cond.operator;
  const expected = cond.value;
  
  // 字段不存在
  if (actual === undefined) {
    // exists operator is special
    if (op === 'exists') {
      return { pass: false, reason: `${cond.fact}: does not exist`, needs_llm: false, id: cond.id };
    }
    return { pass: true, reason: `${cond.fact}: not in data, skip`, needs_llm: false, id: cond.id };
  }
  
  const opFn = OPERATORS[op] || OPERATORS['$' + op];
  if (!opFn) {
    return { pass: true, reason: `unknown operator: ${op}, skip`, needs_llm: false, id: cond.id };
  }
  
  const result = opFn(actual, expected);
  
  // 处理 then 子句（条件通过时继续评估 then 内的条件）
  if (result && cond.then) {
    const thenResult = _evaluateObject(cond.then, data, {});
    return {
      pass: thenResult.pass,
      reason: `${cond.fact} ${op} ${JSON.stringify(expected)} → true, then: ${thenResult.reason}`,
      needs_llm: thenResult.needs_llm,
      id: cond.id,
      details: thenResult.details,
    };
  }
  
  return {
    pass: result,
    reason: `${cond.fact} ${op} ${JSON.stringify(expected)} → ${result} (actual: ${JSON.stringify(actual)})`,
    needs_llm: false,
    id: cond.id,
    failMessage: !result ? cond.failMessage : undefined,
  };
}

// ─── LLM Interface (Extension Point) ────────────────────────────

/**
 * LLM判断接口 — 预留扩展点
 * 
 * 当条件标记为 needs_llm 时，可通过此接口注册LLM评估回调。
 * 默认实现：无LLM可用时，needs_llm条件默认通过。
 * 
 * @type {Function|null}
 */
let _llmJudge = null;

/**
 * 注册LLM判断函数（传null清除）
 * @param {Function|null} judgeFn - async (condition, payload, context) => { pass: boolean, reason: string }
 */
function registerLLMJudge(judgeFn) {
  if (judgeFn !== null && typeof judgeFn !== 'function') {
    throw new Error('LLM judge must be a function or null');
  }
  _llmJudge = judgeFn;
}

/**
 * 异步评估（支持LLM判断）
 * 对于 needs_llm 的条件，调用已注册的LLM判断函数
 */
async function evaluateAsync(conditions, payload, context = {}) {
  const result = evaluate(conditions, payload, context);
  
  if (result.needs_llm && _llmJudge) {
    try {
      const llmResult = await _llmJudge(conditions, payload, context);
      return {
        ...result,
        pass: llmResult.pass,
        reason: `LLM judge: ${llmResult.reason}`,
        needs_llm: false,
        llm_evaluated: true,
      };
    } catch (err) {
      return {
        ...result,
        reason: `${result.reason} (LLM judge failed: ${err.message})`,
      };
    }
  }
  
  return result;
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = {
  evaluate,
  evaluateAsync,
  getFieldValue,
  parseValue,
  registerOperator,
  registerLLMJudge,
  
  // 内部函数导出（供测试用）
  _evaluate,
  _evaluateString,
  _evaluateObject,
  _evaluateField,
  _evaluateAnd,
  _evaluateOr,
  _evaluateNot,
  _evaluateRulesEngineCondition,
  _evaluateRulesEngineAll,
  _evaluateRulesEngineAny,
};
