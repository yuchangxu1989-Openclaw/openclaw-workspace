#!/usr/bin/env node
/**
 * api-probe.js — API Provider Health Probe
 *
 * 从 openclaw.json 读取所有 provider 配置，对每个 provider 发送轻量级探测请求，
 * 输出 JSON 格式的探测结果。如果主 provider 失败，通过飞书 webhook 通知。
 *
 * 用法:
 *   node api-probe.js [--config <path>] [--feishu-webhook <url>] [--timeout <ms>] [--quiet]
 *
 * 输出: JSON 格式探测报告到 stdout
 * 日志: 写入 /root/.openclaw/workspace/scripts/logs/api-probe.log
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ─── CLI 参数解析 ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : defaultVal;
}
const hasFlag = (name) => args.includes(name);

const CONFIG_PATH = getArg('--config', '/root/.openclaw/openclaw.json');
const FEISHU_WEBHOOK = getArg('--feishu-webhook', process.env.FEISHU_PROBE_WEBHOOK || '');
const TIMEOUT_MS = parseInt(getArg('--timeout', '15000'), 10);
const QUIET = hasFlag('--quiet');
const LOG_DIR = path.join(path.dirname(__filename), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'api-probe.log');

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  ensureDir(LOG_DIR);
  fs.appendFileSync(LOG_FILE, line);
  if (!QUIET) process.stderr.write(line);
}

/**
 * 发起 HTTP(S) 请求，返回 Promise<{statusCode, body, latencyMs}>
 */
function httpRequest(url, options, postData) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body,
          latencyMs: Date.now() - start,
        });
      });
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`Timeout after ${TIMEOUT_MS}ms`));
    });
    if (postData) req.write(postData);
    req.end();
  });
}

// ─── 探测策略 ────────────────────────────────────────────────────────────────

/**
 * 对 Anthropic Messages API 发送轻量探测
 * 使用 messages endpoint 发送极小 payload（max_tokens=1）
 */
async function probeAnthropic(baseUrl, apiKey, modelId) {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/messages`;
  const payload = JSON.stringify({
    model: modelId,
    max_tokens: 1,
    messages: [{ role: 'user', content: 'hi' }],
  });
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  };
  const res = await httpRequest(url, options, payload);
  // 200 = 成功; 401/403 = 认证失败但API可达; 429 = 限流但API可达
  const reachable = res.statusCode >= 200 && res.statusCode < 500;
  const healthy = res.statusCode === 200;
  return {
    method: 'anthropic-messages',
    url,
    statusCode: res.statusCode,
    latencyMs: res.latencyMs,
    reachable,
    healthy,
    detail: healthy ? 'ok' : tryParseError(res.body),
  };
}

/**
 * 对 OpenAI-compatible API 发送 GET /models（最轻量）
 */
async function probeOpenAI(baseUrl, apiKey) {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`;
  const options = {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  };
  const res = await httpRequest(url, options);
  const reachable = res.statusCode >= 200 && res.statusCode < 500;
  const healthy = res.statusCode === 200;
  return {
    method: 'openai-list-models',
    url,
    statusCode: res.statusCode,
    latencyMs: res.latencyMs,
    reachable,
    healthy,
    detail: healthy ? 'ok' : tryParseError(res.body),
  };
}

function tryParseError(body) {
  try {
    const obj = JSON.parse(body);
    return obj.error?.message || obj.error?.type || obj.message || body.slice(0, 200);
  } catch {
    return body.slice(0, 200);
  }
}

// ─── 主探测入口 ──────────────────────────────────────────────────────────────

async function probeProvider(name, provider) {
  const { baseUrl, apiKey, api, models } = provider;
  const modelId = models?.[0]?.id || 'unknown';
  const startTime = Date.now();

  try {
    let result;
    if (api === 'anthropic-messages') {
      result = await probeAnthropic(baseUrl, apiKey, modelId);
    } else if (api === 'openai-completions') {
      result = await probeOpenAI(baseUrl, apiKey);
    } else {
      return {
        provider: name,
        api,
        baseUrl,
        status: 'skipped',
        reason: `Unknown API type: ${api}`,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      provider: name,
      api,
      baseUrl,
      modelId,
      status: result.healthy ? 'healthy' : result.reachable ? 'degraded' : 'down',
      ...result,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return {
      provider: name,
      api,
      baseUrl,
      modelId,
      status: 'error',
      error: err.message,
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

// ─── 去重：同一 baseUrl + api 只探测一次 ────────────────────────────────────

function deduplicateProviders(providers) {
  const seen = new Map(); // key -> first provider name
  const unique = [];
  const mapping = {}; // providerName -> probeKey

  for (const [name, config] of Object.entries(providers)) {
    const key = `${config.api}|${config.baseUrl}`;
    mapping[name] = key;
    if (!seen.has(key)) {
      seen.set(key, name);
      unique.push([name, config]);
    }
  }
  return { unique, mapping, seen };
}

// ─── 识别主 provider（每个 agent 的 primary model 对应的 provider） ──────────

function findPrimaryProviders(config) {
  const primaries = new Set();
  const agents = config.agents?.list || [];
  for (const agent of agents) {
    const primary = agent.model?.primary;
    if (primary) {
      const providerName = primary.split('/')[0];
      primaries.add(providerName);
    }
  }
  // defaults
  const defPrimary = config.agents?.defaults?.model?.primary;
  if (defPrimary) primaries.add(defPrimary.split('/')[0]);
  return primaries;
}

// ─── 飞书 Webhook 告警 ──────────────────────────────────────────────────────

async function sendFeishuAlert(webhookUrl, failures) {
  if (!webhookUrl) return;

  const lines = failures.map(
    (f) =>
      `❌ **${f.provider}** (${f.api})\n   状态: ${f.status} | 延迟: ${f.latencyMs}ms\n   详情: ${f.error || f.detail || 'N/A'}`
  );

  const payload = JSON.stringify({
    msg_type: 'interactive',
    card: {
      header: {
        title: { tag: 'plain_text', content: '🚨 API Provider 探测告警' },
        template: 'red',
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**探测时间:** ${new Date().toISOString()}\n**失败 Provider 数量:** ${failures.length}\n\n${lines.join('\n\n')}`,
          },
        },
      ],
    },
  });

  try {
    await httpRequest(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, payload);
    log('飞书告警发送成功');
  } catch (err) {
    log(`飞书告警发送失败: ${err.message}`);
  }
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

async function main() {
  log(`开始 API 探测，配置文件: ${CONFIG_PATH}`);

  // 1. 读取配置
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (err) {
    const errorResult = {
      success: false,
      error: `无法读取配置文件: ${err.message}`,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(errorResult, null, 2));
    process.exit(1);
  }

  const providers = config.models?.providers || {};
  const providerCount = Object.keys(providers).length;
  log(`发现 ${providerCount} 个 provider`);

  if (providerCount === 0) {
    const result = {
      success: true,
      providers: [],
      summary: { total: 0, healthy: 0, degraded: 0, down: 0, error: 0 },
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // 2. 去重并发探测
  const { unique, mapping, seen } = deduplicateProviders(providers);
  const primaryProviders = findPrimaryProviders(config);

  log(`去重后 ${unique.length} 个唯一端点，开始并发探测...`);

  const probeResults = await Promise.all(
    unique.map(([name, cfg]) => probeProvider(name, cfg))
  );

  // 3. 构建结果映射
  const resultByKey = new Map();
  for (const [name, cfg] of unique) {
    const key = `${cfg.api}|${cfg.baseUrl}`;
    const result = probeResults.find((r) => r.provider === name);
    resultByKey.set(key, result);
  }

  // 4. 为所有 provider 生成结果（共享同一端点的复用探测结果）
  const allResults = [];
  for (const [name, cfg] of Object.entries(providers)) {
    const key = mapping[name];
    const probeResult = resultByKey.get(key);
    const isPrimary = primaryProviders.has(name);

    allResults.push({
      ...probeResult,
      provider: name,
      isPrimary,
      // 如果是复用结果，标注参考的探测 provider
      probedVia: seen.get(key) !== name ? seen.get(key) : undefined,
    });
  }

  // 5. 汇总
  const summary = {
    total: allResults.length,
    uniqueEndpoints: unique.length,
    healthy: allResults.filter((r) => r.status === 'healthy').length,
    degraded: allResults.filter((r) => r.status === 'degraded').length,
    down: allResults.filter((r) => r.status === 'down').length,
    error: allResults.filter((r) => r.status === 'error').length,
    skipped: allResults.filter((r) => r.status === 'skipped').length,
  };

  // 6. 检查主 provider 失败情况
  const primaryFailures = allResults.filter(
    (r) => r.isPrimary && r.status !== 'healthy' && r.status !== 'skipped'
  );

  if (primaryFailures.length > 0) {
    log(`⚠️  ${primaryFailures.length} 个主 Provider 异常!`);
    primaryFailures.forEach((f) => {
      log(`  ❌ ${f.provider}: ${f.status} - ${f.error || f.detail || 'N/A'}`);
    });

    // 飞书告警
    if (FEISHU_WEBHOOK) {
      await sendFeishuAlert(FEISHU_WEBHOOK, primaryFailures);
    }
  } else {
    log('✅ 所有主 Provider 运行正常');
  }

  // 7. 输出 JSON 结果
  const report = {
    success: primaryFailures.length === 0,
    timestamp: new Date().toISOString(),
    config: CONFIG_PATH,
    summary,
    primaryFailures: primaryFailures.map((f) => ({
      provider: f.provider,
      status: f.status,
      error: f.error || f.detail,
    })),
    results: allResults.map((r) => ({
      provider: r.provider,
      api: r.api,
      baseUrl: r.baseUrl,
      modelId: r.modelId,
      isPrimary: r.isPrimary,
      status: r.status,
      statusCode: r.statusCode,
      latencyMs: r.latencyMs,
      detail: r.detail || r.error,
      probedVia: r.probedVia,
      timestamp: r.timestamp,
    })),
  };

  console.log(JSON.stringify(report, null, 2));

  log(`探测完成: ${summary.healthy} healthy, ${summary.degraded} degraded, ${summary.down} down, ${summary.error} error`);

  // 退出码: 主 provider 有失败则返回 1
  process.exit(primaryFailures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  log(`致命错误: ${err.message}`);
  console.log(
    JSON.stringify({
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    }, null, 2)
  );
  process.exit(2);
});
