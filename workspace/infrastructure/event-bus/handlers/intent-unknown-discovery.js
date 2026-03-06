'use strict';

/**
 * 自主执行器：未知意图发现与自动分类
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 扫描未分类意图 → 尝试自动分类 → 分类失败的才escalate
 */

const fs = require('fs');
const path = require('path');

// 基于关键词的意图分类规则
const CLASSIFICATION_RULES = [
  { pattern: /天气|温度|气温|下雨|晴|forecast|weather/i, intent: 'query.weather' },
  { pattern: /提醒|闹钟|定时|remind|alarm|timer/i, intent: 'command.reminder' },
  { pattern: /搜索|查找|找一下|search|find|lookup/i, intent: 'query.search' },
  { pattern: /打开|启动|运行|open|launch|start|run/i, intent: 'command.launch' },
  { pattern: /关闭|停止|结束|close|stop|end|quit/i, intent: 'command.stop' },
  { pattern: /发送|发给|转发|send|forward/i, intent: 'command.send' },
  { pattern: /创建|新建|生成|create|new|generate/i, intent: 'command.create' },
  { pattern: /删除|移除|清除|delete|remove|clear/i, intent: 'command.delete' },
  { pattern: /修改|更新|编辑|update|edit|modify/i, intent: 'command.update' },
  { pattern: /列出|显示|查看|list|show|display|view/i, intent: 'query.list' },
  { pattern: /帮助|怎么|如何|help|how to/i, intent: 'query.help' },
  { pattern: /是的|好的|确认|对|yes|ok|confirm|sure/i, intent: 'confirmation' },
  { pattern: /不|取消|算了|no|cancel|never/i, intent: 'rejection' },
  { pattern: /你好|嗨|早|hello|hi|hey|morning/i, intent: 'greeting' },
  { pattern: /谢谢|感谢|thanks|thank/i, intent: 'gratitude' },
];

function classifyText(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const matches = [];
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.pattern.test(trimmed)) {
      matches.push({ intent: rule.intent, confidence: 0.75 });
    }
  }

  if (matches.length === 1) {
    return { ...matches[0], confidence: 0.85, method: 'keyword_single' };
  }
  if (matches.length > 1) {
    // 多匹配 → 取第一个但降低置信度
    return { ...matches[0], confidence: 0.6, method: 'keyword_multi', alternatives: matches.slice(1) };
  }

  // 基于长度和标点的粗分类
  if (trimmed.endsWith('?') || trimmed.endsWith('？')) {
    return { intent: 'query.general', confidence: 0.5, method: 'punctuation' };
  }
  if (trimmed.endsWith('!') || trimmed.endsWith('！')) {
    return { intent: 'command.general', confidence: 0.45, method: 'punctuation' };
  }

  return null;
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

  // ─── 感知：提取意图信息 ───
  const payload = event?.payload || {};
  const text = (payload.text || payload.query || payload.message || '').trim();
  const existingIntent = payload.intent || payload.semanticIntent || '';
  const confidence = Number(payload.intentConfidence ?? payload.confidence ?? 0);
  const isUnknown = !existingIntent || confidence < 0.55;

  if (!isUnknown) {
    return {
      ok: true,
      autonomous: true,
      actions: ['no_action_needed'],
      message: `意图已知: ${existingIntent} (置信度: ${confidence})`,
    };
  }

  // ─── 判断 & 自主执行：尝试自动分类 ───
  const classification = classifyText(text);
  let autoClassified = false;
  let escalated = false;

  if (classification && classification.confidence >= 0.6) {
    // 高置信度 → 自动分类
    autoClassified = true;
    actions.push(`auto_classified:${classification.intent}(${classification.confidence})`);
    logger.info?.(`[intent-unknown-discovery] 自动分类: "${text.slice(0, 50)}" → ${classification.intent}`);

    // 更新意图注册表
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
        method: classification.method,
        autoClassified: true,
        timestamp: new Date().toISOString(),
      });
      // 确保意图类型在注册表中
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

    // 发射分类完成事件
    if (context?.bus?.emit) {
      await context.bus.emit('intent.classified', {
        text: text.slice(0, 200),
        intent: classification.intent,
        confidence: classification.confidence,
        source: 'auto_discovery',
      });
    }
  } else {
    // 无法自动分类 → 记录到未知日志并escalate
    escalated = true;
    const unknownLog = loadUnknownLog(logPath);
    const entry = {
      text: text.slice(0, 200),
      originalIntent: existingIntent || null,
      originalConfidence: confidence,
      attemptedClassification: classification || null,
      timestamp: new Date().toISOString(),
      status: 'pending_human_review',
    };
    unknownLog.push(entry);

    // 只保留最近200条
    if (unknownLog.length > 200) unknownLog.splice(0, unknownLog.length - 200);
    saveUnknownLog(logPath, unknownLog);
    actions.push('logged_unknown');

    // 仅在积累到阈值时才通知用户
    const pendingCount = unknownLog.filter(e => e.status === 'pending_human_review').length;
    if (pendingCount >= 5 && context?.notify) {
      await context.notify(
        `[intent-unknown-discovery] ${pendingCount}个未知意图待确认，请查看 infrastructure/unknown-intents.json`,
        'info'
      );
      actions.push('user_notified');
    }
  }

  // ─── 验证 ───
  let verifyOk = false;
  if (autoClassified) {
    // 验证注册表中有分类记录
    try {
      const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const lastEntry = reg.entries?.[reg.entries.length - 1];
      verifyOk = lastEntry?.intent === classification.intent;
    } catch {
      verifyOk = false;
    }
  } else {
    // 验证未知日志中有记录
    const log = loadUnknownLog(logPath);
    verifyOk = log.some(e => e.text === text.slice(0, 200) && e.status === 'pending_human_review');
  }
  actions.push(verifyOk ? 'verification_passed' : 'verification_failed');

  return {
    ok: verifyOk,
    autonomous: true,
    autoClassified,
    escalated,
    classification: classification || undefined,
    actions,
    message: autoClassified
      ? `自动分类成功: "${text.slice(0, 30)}…" → ${classification.intent}`
      : `无法自动分类，已记录待人工确认: "${text.slice(0, 30)}…"`,
  };
};
