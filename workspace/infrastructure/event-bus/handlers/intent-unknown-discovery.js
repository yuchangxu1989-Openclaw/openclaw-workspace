'use strict';

/**
 * 自主执行器：未知意图发现与自动分类
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * v2.0: 纯LLM语义理解，移除所有关键词/正则分类。
 * LLM不可用时直接escalate，不猜。
 */

const fs = require('fs');
const path = require('path');

// ─── LLM调用层 ───
let _callLLM = null;
try {
  _callLLM = require(path.join(__dirname, '../../../skills/cras/intent-extractor-llm')).callLLM;
} catch (_) {
  try {
    _callLLM = require('../../llm-context').chat;
  } catch (_2) {}
}

const CLASSIFY_SYSTEM_PROMPT = `你是一个意图分类系统。分析用户消息，识别其意图类型。

常见意图类型：
- query.* — 查询类（天气、搜索、帮助、列表查看等）
- command.* — 操作指令类（创建、删除、修改、发送、启动、停止等）
- confirmation — 确认
- rejection — 拒绝
- greeting — 问候
- gratitude — 感谢

规则：
- 语义理解，不做关键词匹配
- 只输出JSON
- 无法分类返回 null

输出格式：
{"intent":"类型","confidence":0.0-1.0}`;

async function classifyText(text) {
  if (!text || typeof text !== 'string' || !text.trim()) return null;
  if (!_callLLM) return null;

  try {
    const response = await _callLLM(
      CLASSIFY_SYSTEM_PROMPT,
      `用户消息：${text.slice(0, 300)}`,
      { timeout: 8000 }
    );

    let jsonStr = String(response || '').trim();
    if (jsonStr === 'null') return null;
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    jsonStr = jsonStr.slice(start, end + 1);

    const parsed = JSON.parse(jsonStr);
    if (!parsed || !parsed.intent) return null;
    return {
      intent: parsed.intent,
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.6,
      method: 'llm',
    };
  } catch (_) {
    return null;
  }
}

function loadUnknownLog(logPath) {
  if (!fs.existsSync(logPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(logPath, 'utf8'));
  } catch {
    return [];
  }
}

function saveUnknownLog(logPath, data) {
  fs.writeFileSync(logPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const logPath = path.join(root, 'infrastructure', 'unknown-intents.json');
  const registryPath = path.join(root, 'infrastructure', 'intent-registry.json');
  const actions = [];

  const payload = event?.payload || {};
  const text = (payload.text || payload.query || payload.message || '').trim();
  const existingIntent = payload.intent || payload.semanticIntent || '';
  const confidence = Number(payload.intentConfidence ?? payload.confidence ?? 0);
  const isUnknown = !existingIntent || confidence < 0.55;

  if (!isUnknown) {
    return {
      ok: true, autonomous: true, actions: ['no_action_needed'],
      message: `意图已知: ${existingIntent} (置信度: ${confidence})`,
    };
  }

  // ─── LLM分类 ───
  const classification = await classifyText(text);
  let autoClassified = false;
  let escalated = false;

  if (classification && classification.confidence >= 0.6) {
    autoClassified = true;
    actions.push(`auto_classified:${classification.intent}(${classification.confidence})`);
    logger.info?.(`[intent-unknown-discovery] LLM分类: "${text.slice(0, 50)}" → ${classification.intent}`);

    try {
      let registry = { types: [], entries: [] };
      if (fs.existsSync(registryPath)) {
        registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      }
      if (!registry.entries) registry.entries = [];
      registry.entries.push({
        text: text.slice(0, 200),
        intent: classification.intent,
        confidence: classification.confidence,
        method: 'llm',
        autoClassified: true,
        timestamp: new Date().toISOString(),
      });
      const intentBase = classification.intent.split('.')[0];
      if (!registry.types?.includes(intentBase)) {
        registry.types = registry.types || [];
        registry.types.push(intentBase);
      }
      fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
      actions.push('registry_updated');
    } catch (e) {
      actions.push(`registry_update_failed:${e.message}`);
    }

    if (context?.bus?.emit) {
      await context.bus.emit('intent.classified', {
        text: text.slice(0, 200),
        intent: classification.intent,
        confidence: classification.confidence,
        source: 'auto_discovery_llm',
      });
    }
  } else {
    escalated = true;
    const unknownLog = loadUnknownLog(logPath);
    unknownLog.push({
      text: text.slice(0, 200),
      originalIntent: existingIntent || null,
      originalConfidence: confidence,
      attemptedClassification: classification || null,
      timestamp: new Date().toISOString(),
      status: 'pending_human_review',
    });

    if (unknownLog.length > 200) unknownLog.splice(0, unknownLog.length - 200);
    saveUnknownLog(logPath, unknownLog);
    actions.push('logged_unknown');

    const pendingCount = unknownLog.filter(e => e.status === 'pending_human_review').length;
    if (pendingCount >= 5 && context?.notify) {
      await context.notify(
        `[intent-unknown-discovery] ${pendingCount}个未知意图待确认，请查看 infrastructure/unknown-intents.json`,
        'info'
      );
      actions.push('user_notified');
    }
  }

  let verifyOk = false;
  if (autoClassified) {
    try {
      const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const lastEntry = reg.entries?.[reg.entries.length - 1];
      verifyOk = lastEntry?.intent === classification.intent;
    } catch { verifyOk = false; }
  } else {
    const log = loadUnknownLog(logPath);
    verifyOk = log.some(e => e.text === text.slice(0, 200) && e.status === 'pending_human_review');
  }
  actions.push(verifyOk ? 'verification_passed' : 'verification_failed');

  return {
    ok: verifyOk, autonomous: true, autoClassified, escalated,
    classification: classification || undefined, actions,
    message: autoClassified
      ? `LLM分类成功: "${text.slice(0, 30)}…" → ${classification.intent}`
      : `无法分类，已记录待人工确认: "${text.slice(0, 30)}…"`,
  };
};
