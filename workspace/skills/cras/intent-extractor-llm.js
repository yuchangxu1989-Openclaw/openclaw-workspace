#!/usr/bin/env node
'use strict';

/**
 * Intent Extractor LLM调用层
 *
 * 从openclaw.json动态读取模型配置，支持多provider failover。
 * 支持两种API格式：
 *   - openai-completions (OpenAI兼容)
 *   - anthropic-messages (Anthropic Messages API)
 *
 * Provider选择优先级（为intent-extractor优化）：
 *   1. boom-scout / boom-cron-worker（便宜、快）
 *   2. zhipu-cron（国内低延迟）
 *   3. claude-scout（高质量但贵）
 *
 * 绝对不硬编码模型ID或API Key — 全部从配置读取。
 *
 * @module intent-extractor-llm
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const LOG_PREFIX = '[IntentExtractor:LLM]';
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || '/root/.openclaw';

// Provider选择优先级（用于intent extraction任务）
// 意图提取需要严格JSON输出，优先选择遵循system prompt的模型
const PROVIDER_PRIORITY = [
  'zhipu-cron',         // GLM-5: 国内低延迟，指令遵循好
  'claude-scout',       // Claude: 高质量，指令遵循好
  'claude-main',        // Claude fallback
  'boom-scout',         // GPT-5.3 Codex（JSON遵循较差，作为fallback）
  'boom-cron-worker',
  'boom-main',
];

/**
 * 从openclaw.json加载模型provider配置
 * @returns {object} providers map
 */
function loadProviders() {
  try {
    const config = JSON.parse(
      fs.readFileSync(path.join(OPENCLAW_HOME, 'openclaw.json'), 'utf8')
    );
    return config?.models?.providers || {};
  } catch (err) {
    console.error(`${LOG_PREFIX} openclaw.json读取失败: ${err.message}`);
    return {};
  }
}

/**
 * 选择最优provider
 *
 * 按优先级列表选择第一个可用的provider。
 * "可用"= 存在于openclaw.json且有至少一个非embedding模型。
 *
 * @returns {{ provider: object, providerName: string, model: object } | null}
 */
function selectProvider() {
  const providers = loadProviders();

  for (const name of PROVIDER_PRIORITY) {
    const provider = providers[name];
    if (!provider || !provider.baseUrl || !provider.apiKey) continue;

    // 找到第一个非embedding、非vision、非thinking的文本模型
    // 意图提取不需要深度推理，优先选快速模型
    const models = provider.models || [];
    const textModel = models.find(m =>
      m.id &&
      !m.id.includes('embedding') &&
      !m.id.includes('vision') &&
      !m.id.includes('-4v') &&
      !m.id.includes('thinking')
    ) || models.find(m =>
      m.id &&
      !m.id.includes('embedding') &&
      !m.id.includes('vision') &&
      !m.id.includes('-4v')
    );

    if (textModel) {
      return { provider, providerName: name, model: textModel };
    }
  }

  // Fallback: 尝试所有providers
  for (const [name, provider] of Object.entries(providers)) {
    if (!provider.baseUrl || !provider.apiKey) continue;
    const models = provider.models || [];
    const textModel = models.find(m =>
      m.id &&
      !m.id.includes('embedding') &&
      !m.id.includes('vision') &&
      !m.id.includes('-4v') &&
      !m.id.includes('thinking')
    ) || models.find(m =>
      m.id &&
      !m.id.includes('embedding') &&
      !m.id.includes('vision') &&
      !m.id.includes('-4v')
    );
    if (textModel) {
      return { provider, providerName: name, model: textModel };
    }
  }

  return null;
}

/**
 * HTTP(S) POST请求（Promise化）
 * @param {string} url
 * @param {object} headers
 * @param {string} body
 * @param {number} timeoutMs
 * @returns {Promise<{statusCode: number, body: string}>}
 */
function httpPost(url, headers, body, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
      timeout: timeoutMs,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`HTTP timeout after ${timeoutMs}ms`));
    });

    req.write(body);
    req.end();
  });
}

/**
 * 通过OpenAI兼容API调用LLM
 *
 * @param {object} provider
 * @param {object} model
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} options
 * @returns {Promise<string>}
 */
async function callOpenAI(provider, model, systemPrompt, userPrompt, options = {}) {
  const url = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers = {
    'Authorization': `Bearer ${provider.apiKey}`,
  };

  const body = JSON.stringify({
    model: model.id,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,  // 低温度，提高一致性
    max_tokens: Math.min(model.maxTokens || 4096, 4096),
    // 注意：不使用 response_format，因为部分provider不支持
    // JSON输出通过prompt约束实现
  });

  const res = await httpPost(url, headers, body, options.timeout || 30000);

  if (res.statusCode !== 200) {
    throw new Error(`OpenAI API ${res.statusCode}: ${res.body.slice(0, 200)}`);
  }

  const result = JSON.parse(res.body);
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI API: empty response content');
  }

  return content;
}

/**
 * 通过Anthropic Messages API调用LLM
 *
 * @param {object} provider
 * @param {object} model
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} options
 * @returns {Promise<string>}
 */
async function callAnthropic(provider, model, systemPrompt, userPrompt, options = {}) {
  // Construct URL: if baseUrl already ends with /v1, use /messages; otherwise append /v1/messages
  let url;
  const base = provider.baseUrl.replace(/\/+$/, '');
  if (base.endsWith('/v1')) {
    url = `${base}/messages`;
  } else {
    url = `${base}/v1/messages`;
  }
  const headers = {
    'x-api-key': provider.apiKey,
    'anthropic-version': '2023-06-01',
  };

  const body = JSON.stringify({
    model: model.id,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: Math.min(model.maxTokens || 4096, 4096),
  });

  const res = await httpPost(url, headers, body, options.timeout || 30000);

  if (res.statusCode !== 200) {
    throw new Error(`Anthropic API ${res.statusCode}: ${res.body.slice(0, 200)}`);
  }

  const result = JSON.parse(res.body);
  const content = result.content?.[0]?.text;
  if (!content) {
    throw new Error('Anthropic API: empty response content');
  }

  return content;
}

/**
 * 调用LLM（统一入口，自动选择provider和API格式）
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} [options]
 * @param {number} [options.timeout=30000]
 * @returns {Promise<string>} LLM响应文本
 */
async function callLLM(systemPrompt, userPrompt, options = {}) {
  const selected = selectProvider();
  if (!selected) {
    throw new Error(`${LOG_PREFIX} 没有可用的LLM provider（检查openclaw.json配置）`);
  }

  const { provider, providerName, model } = selected;
  console.log(`${LOG_PREFIX} 使用 ${providerName}/${model.id}`);

  const apiType = provider.api || 'openai-completions';

  try {
    if (apiType === 'anthropic-messages') {
      return await callAnthropic(provider, model, systemPrompt, userPrompt, options);
    } else {
      // openai-completions 或其他 → 默认OpenAI兼容
      return await callOpenAI(provider, model, systemPrompt, userPrompt, options);
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} ${providerName}/${model.id} 调用失败: ${err.message}`);

    // Failover: 尝试下一个provider
    const providers = loadProviders();
    const currentIdx = PROVIDER_PRIORITY.indexOf(providerName);
    const remaining = PROVIDER_PRIORITY.slice(currentIdx + 1);

    for (const fallbackName of remaining) {
      const fbProvider = providers[fallbackName];
      if (!fbProvider || !fbProvider.baseUrl || !fbProvider.apiKey) continue;

      const fbModels = fbProvider.models || [];
      const fbModel = fbModels.find(m =>
        m.id && !m.id.includes('embedding') && !m.id.includes('vision') && !m.id.includes('-4v') && !m.id.includes('thinking')
      ) || fbModels.find(m =>
        m.id && !m.id.includes('embedding') && !m.id.includes('vision') && !m.id.includes('-4v')
      );
      if (!fbModel) continue;

      console.log(`${LOG_PREFIX} Failover → ${fallbackName}/${fbModel.id}`);

      try {
        const fbApiType = fbProvider.api || 'openai-completions';
        if (fbApiType === 'anthropic-messages') {
          return await callAnthropic(fbProvider, fbModel, systemPrompt, userPrompt, options);
        } else {
          return await callOpenAI(fbProvider, fbModel, systemPrompt, userPrompt, options);
        }
      } catch (fbErr) {
        console.error(`${LOG_PREFIX} Failover ${fallbackName} 也失败: ${fbErr.message}`);
        continue;
      }
    }

    // 所有provider都失败
    throw new Error(`${LOG_PREFIX} 所有LLM provider调用失败（最后错误: ${err.message}）`);
  }
}

// ═══════════════════════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════════════════════

module.exports = {
  callLLM,
  // 测试辅助
  _selectProvider: selectProvider,
  _loadProviders: loadProviders,
  _callOpenAI: callOpenAI,
  _callAnthropic: callAnthropic,
};

// ═══════════════════════════════════════════════════════════
// 自测
// ═══════════════════════════════════════════════════════════

if (require.main === module) {
  console.log('\n🔍 LLM Provider 诊断\n');

  const selected = selectProvider();
  if (selected) {
    console.log(`✅ 选中provider: ${selected.providerName}`);
    console.log(`   模型: ${selected.model.id} (${selected.model.name})`);
    console.log(`   API: ${selected.provider.api}`);
    console.log(`   BaseURL: ${selected.provider.baseUrl}`);
  } else {
    console.log('❌ 没有可用的LLM provider');
    process.exit(1);
  }

  // 快速测试调用
  if (process.argv.includes('--test')) {
    console.log('\n🧪 测试LLM调用...\n');
    callLLM(
      '你是意图识别系统。只输出JSON。',
      '分析："我觉得这个规则应该自动化执行，不要每次都手动检查"',
      { timeout: 15000 }
    ).then(res => {
      console.log('✅ LLM响应:', res.slice(0, 500));
    }).catch(err => {
      console.error('❌ 调用失败:', err.message);
      process.exit(1);
    });
  }
}
