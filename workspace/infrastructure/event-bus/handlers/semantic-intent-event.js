'use strict';

/**
 * 自主执行器：语义意图事件处理
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 收到意图事件 → 匹配ISC规则 → 触发对应handler → 记录处理结果
 */

const fs = require('fs');
const path = require('path');

function loadISCRules(root) {
  const candidates = [
    path.join(root, 'CRITICAL_ENFORCEMENT_RULES.md'),
    path.join(root, 'infrastructure', 'isc-rules.json'),
    path.join(root, 'infrastructure', 'event-bus', 'isc-rules.json'),
  ];

  // 尝试JSON规则文件
  for (const p of candidates.slice(1)) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch { /* continue */ }
    }
  }

  // 从Markdown解析ISC规则
  const mdPath = candidates[0];
  if (fs.existsSync(mdPath)) {
    const content = fs.readFileSync(mdPath, 'utf8');
    const rules = [];
    const rulePattern = /ISC[-_]?(\d+)[:\s]+(.+?)(?:\n|$)/gi;
    let match;
    while ((match = rulePattern.exec(content)) !== null) {
      rules.push({
        id: `ISC-${match[1]}`,
        description: match[2].trim(),
        eventPattern: `isc.${match[1]}.*`,
      });
    }
    return rules;
  }

  return [];
}

function matchIntent(intent, iscRules) {
  const matched = [];
  const intentLower = (intent || '').toLowerCase();

  for (const rule of iscRules) {
    const ruleId = (rule.id || '').toLowerCase();
    const desc = (rule.description || '').toLowerCase();
    const pattern = (rule.eventPattern || '').toLowerCase();

    // 多策略匹配
    if (pattern && intentLower.includes(pattern.replace(/\*/g, ''))) {
      matched.push({ ...rule, matchType: 'pattern' });
    } else if (intentLower.includes(ruleId.replace(/-/g, ''))) {
      matched.push({ ...rule, matchType: 'id' });
    } else if (rule.keywords && rule.keywords.some(k => intentLower.includes(k.toLowerCase()))) {
      matched.push({ ...rule, matchType: 'keyword' });
    }
  }
  return matched;
}

function findHandler(root, handlerName) {
  const handlersDir = path.join(root, 'infrastructure', 'event-bus', 'handlers');
  const candidates = [
    path.join(handlersDir, `${handlerName}.js`),
    path.join(handlersDir, `${handlerName.replace(/[._]/g, '-')}.js`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const resultsPath = path.join(root, 'infrastructure', 'intent-processing-log.jsonl');
  const actions = [];
  const results = [];

  // ─── 感知：提取语义意图 ───
  const payload = event?.payload || {};
  const intent = payload.intent || payload.semanticIntent || '';
  const sourceEvent = payload.sourceEvent || payload.eventRef || event?.type || '';

  if (!intent && !sourceEvent) {
    return {
      ok: false,
      autonomous: true,
      actions: ['rejected_incomplete_event'],
      message: '事件缺少语义意图和源事件，无法处理',
    };
  }

  // ─── 判断：匹配ISC规则 ───
  const iscRules = loadISCRules(root);
  const matchedRules = matchIntent(intent || sourceEvent, iscRules);
  actions.push(`matched_rules:${matchedRules.length}`);

  // ─── 自主执行：触发对应handler ───
  if (matchedRules.length > 0) {
    for (const matched of matchedRules) {
      const handlerRef = matched.handler || matched.id?.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      let handlerResult = null;

      // 尝试通过event bus分发
      if (context?.bus?.emit) {
        try {
          await context.bus.emit(`isc.rule.triggered`, {
            ruleId: matched.id,
            intent,
            sourceEvent,
            matchType: matched.matchType,
          });
          actions.push(`dispatched:${matched.id}`);
          handlerResult = { dispatched: true, ruleId: matched.id };
        } catch (e) {
          actions.push(`dispatch_failed:${matched.id}:${e.message}`);
          handlerResult = { dispatched: false, error: e.message };
        }
      }

      // 尝试直接调用handler
      if (handlerRef) {
        const handlerPath = findHandler(root, handlerRef);
        if (handlerPath) {
          try {
            const handler = require(handlerPath);
            const fn = typeof handler === 'function' ? handler : handler?.run || handler?.default;
            if (typeof fn === 'function') {
              const hr = await fn(
                { ...event, payload: { ...payload, triggeredByRule: matched.id } },
                { ...rule, iscRule: matched },
                context
              );
              handlerResult = { executed: true, ruleId: matched.id, result: hr };
              actions.push(`executed:${matched.id}`);
            }
          } catch (e) {
            handlerResult = { executed: false, ruleId: matched.id, error: e.message };
            actions.push(`execution_failed:${matched.id}`);
          }
        }
      }

      results.push({
        rule: matched.id,
        matchType: matched.matchType,
        result: handlerResult,
        timestamp: new Date().toISOString(),
      });
    }
  } else {
    // 无匹配规则 → 作为通用意图事件传播
    if (context?.bus?.emit) {
      await context.bus.emit('intent.unmatched', {
        intent,
        sourceEvent,
        timestamp: new Date().toISOString(),
      });
      actions.push('propagated_as_unmatched');
    }
  }

  // ─── 记录处理结果 ───
  const logEntry = {
    intent,
    sourceEvent,
    matchedRules: matchedRules.map(r => r.id),
    results,
    actions,
    timestamp: new Date().toISOString(),
  };

  try {
    fs.appendFileSync(resultsPath, JSON.stringify(logEntry) + '\n', 'utf8');
    actions.push('logged');
  } catch (e) {
    actions.push(`log_failed:${e.message}`);
  }

  // ─── 验证 ───
  const allExecuted = results.every(r => r.result?.dispatched || r.result?.executed);
  const verifyOk = matchedRules.length === 0 || allExecuted;

  // ─── 闭环：仅在执行失败时通知 ───
  if (!verifyOk && context?.notify) {
    const failedRules = results.filter(r => !r.result?.dispatched && !r.result?.executed);
    await context.notify(
      `[semantic-intent-event] ${failedRules.length}/${matchedRules.length}条规则执行失败: ${failedRules.map(r => r.rule).join(', ')}`,
      'warning'
    );
  }

  return {
    ok: verifyOk,
    autonomous: true,
    intent,
    sourceEvent,
    matchedRules: matchedRules.length,
    results,
    actions,
    message: matchedRules.length > 0
      ? `处理${matchedRules.length}条匹配规则, ${results.filter(r => r.result?.dispatched || r.result?.executed).length}条成功执行`
      : `未匹配ISC规则，已作为通用意图传播`,
  };
};
