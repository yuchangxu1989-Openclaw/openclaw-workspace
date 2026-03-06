#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

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
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'api-probe.log');
const STATE_FILE = path.join(LOG_DIR, 'api-probe-state.json');

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  ensureDir(LOG_DIR);
  fs.appendFileSync(LOG_FILE, line);
  if (!QUIET) process.stderr.write(line);
}
function httpRequest(url, options, postData) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, body, latencyMs: Date.now() - start }));
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error(`Timeout after ${TIMEOUT_MS}ms`)));
    if (postData) req.write(postData);
    req.end();
  });
}
function tryParseError(body) { try { const o = JSON.parse(body); return o.error?.message || o.error?.type || o.message || body.slice(0,200);} catch { return body.slice(0,200);} }

// 探针：Anthropic Messages API
async function probeAnthropic(baseUrl, apiKey, modelId) {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/messages`;
  const payload = JSON.stringify({ model: modelId, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });
  const res = await httpRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } }, payload);
  const reachable = res.statusCode >= 200 && res.statusCode < 500;
  const healthy = res.statusCode === 200;
  return { method:'anthropic-messages', url, statusCode:res.statusCode, latencyMs:res.latencyMs, reachable, healthy, detail: healthy ? 'ok' : tryParseError(res.body) };
}

// 探针：OpenAI Chat Completion（真实推理，非/models列表）
async function probeOpenAI(baseUrl, apiKey, modelId) {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const payload = JSON.stringify({ model: modelId || 'gpt-5.4', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });
  const res = await httpRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } }, payload);
  const reachable = res.statusCode >= 200 && res.statusCode < 500;
  const healthy = res.statusCode === 200;
  return { method:'openai-chat', url, statusCode:res.statusCode, latencyMs:res.latencyMs, reachable, healthy, detail: healthy ? 'ok' : tryParseError(res.body) };
}

async function probeProvider(name, provider) {
  const { baseUrl, apiKey, api, models } = provider;
  const modelId = models?.[0]?.id || 'unknown';
  const startTime = Date.now();
  try {
    let result;
    if (api === 'anthropic-messages') result = await probeAnthropic(baseUrl, apiKey, modelId);
    else if (api === 'openai-completions') result = await probeOpenAI(baseUrl, apiKey, modelId);
    else return { provider:name, api, baseUrl, status:'skipped', reason:`Unknown API type: ${api}`, timestamp:new Date().toISOString() };
    return { provider:name, api, baseUrl, modelId, status: result.healthy ? 'healthy' : result.reachable ? 'degraded' : 'down', ...result, timestamp:new Date().toISOString() };
  } catch (err) { return { provider:name, api, baseUrl, modelId, status:'error', error:err.message, latencyMs:Date.now()-startTime, timestamp:new Date().toISOString() }; }
}

function deduplicateProviders(providers){ const seen=new Map(); const unique=[]; const mapping={}; for(const [name,c] of Object.entries(providers)){ const key=`${c.api}|${c.baseUrl}`; mapping[name]=key; if(!seen.has(key)){ seen.set(key,name); unique.push([name,c]); } } return {unique,mapping,seen}; }
function findPrimaryProviders(config){ const primaries=new Set(); for(const a of (config.agents?.list||[])){ const p=a.model?.primary; if(p) primaries.add(p.split('/')[0]); } const d=config.agents?.defaults?.model?.primary; if(d) primaries.add(d.split('/')[0]); return primaries; }

// 修复：用 id 而非 name 查找 main agent
function findMainAgent(config){ return (config.agents?.list||[]).find(a=>a.id==='main'); }

function readState(){ try{return JSON.parse(fs.readFileSync(STATE_FILE,'utf8'));}catch{return { main:{ mode:'primary', failCount:0, successCount:0 } }; } }
function writeState(s){ ensureDir(LOG_DIR); fs.writeFileSync(STATE_FILE, JSON.stringify(s,null,2)); }
function saveConfig(c){ fs.writeFileSync(CONFIG_PATH, JSON.stringify(c,null,2)+'\n'); }
function restartGateway(){ execSync('openclaw gateway restart', { stdio:'pipe', timeout: 30000 }); }
async function sendFeishuWebhook(webhookUrl, title, content, template='blue'){
  if(!webhookUrl) return;
  const payload=JSON.stringify({ msg_type:'interactive', card:{ header:{ title:{ tag:'plain_text', content:title }, template }, elements:[{ tag:'div', text:{ tag:'lark_md', content } }] } });
  try { await httpRequest(webhookUrl,{method:'POST',headers:{'Content-Type':'application/json'}},payload); } catch(e){ log(`飞书通知发送失败: ${e.message}`); }
}

// 从agent配置中提取fallback模型（兼容 fallbacks 数组和 fallback 字符串）
function getFallbackModel(modelCfg) {
  if (Array.isArray(modelCfg.fallbacks) && modelCfg.fallbacks.length > 0) return modelCfg.fallbacks[0];
  if (typeof modelCfg.fallback === 'string' && modelCfg.fallback) return modelCfg.fallback;
  return null;
}

async function main(){
  let config = JSON.parse(fs.readFileSync(CONFIG_PATH,'utf8'));
  const providers = config.models?.providers || {};
  const { unique, mapping, seen } = deduplicateProviders(providers);
  const primaryProviders = findPrimaryProviders(config);
  const probeResults = await Promise.all(unique.map(([n,c])=>probeProvider(n,c)));
  const resultByKey=new Map();
  for(const [name,cfg] of unique){ const key=`${cfg.api}|${cfg.baseUrl}`; resultByKey.set(key, probeResults.find(r=>r.provider===name)); }
  const allResults=[];
  for(const [name,cfg] of Object.entries(providers)){ const key=mapping[name]; const r=resultByKey.get(key); allResults.push({ ...r, provider:name, isPrimary:primaryProviders.has(name), probedVia: seen.get(key)!==name?seen.get(key):undefined }); }

  // Main agent failover 逻辑
  const mainAgent = findMainAgent(config);
  if (!mainAgent || !mainAgent.model) { log('未找到main agent配置，跳过failover'); writeState(readState()); return; }
  
  const modelCfg = mainAgent.model;
  const fallbackModel = getFallbackModel(modelCfg);
  
  if (!fallbackModel) { log('main agent无fallback配置，跳过failover'); writeState(readState()); return; }

  // 初始化failover状态
  if (!mainAgent.failover) mainAgent.failover = { originalPrimary: modelCfg.primary, fallbackModel, active: 'primary' };
  else { if (!mainAgent.failover.originalPrimary) mainAgent.failover.originalPrimary = modelCfg.primary; }

  const currentPrimary = modelCfg.primary;
  const primaryProvider = currentPrimary.split('/')[0];
  const primaryHealth = allResults.find(r=>r.provider===primaryProvider);
  const primaryOk = primaryHealth && primaryHealth.status==='healthy';

  const state = readState();
  if (!state.main) state.main = { mode:'primary', failCount:0, successCount:0 };

  if (!primaryOk) {
    state.main.failCount += 1; state.main.successCount = 0;
    log(`main primary(${primaryProvider}) 探测失败计数: ${state.main.failCount}/3`);
    if (state.main.mode !== 'fallback' && state.main.failCount >= 3) {
      await sendFeishuWebhook(FEISHU_WEBHOOK,'⚠️ 主渠道异常，即将切换备用',`主 provider **${primaryProvider}** 连续 3 次探测失败，正在自动切换到备用渠道 **${fallbackModel}**...`,'red');
      // 保存原primary，切换到fallback
      mainAgent.failover.originalPrimary = currentPrimary;
      modelCfg.primary = fallbackModel;
      mainAgent.failover.active = 'fallback';
      saveConfig(config);
      state.main.mode = 'fallback'; state.main.failCount = 0; state.main.successCount = 0;
      log(`已自动切换 main 到 fallback: ${fallbackModel}`);
      await sendFeishuWebhook(FEISHU_WEBHOOK,'🔁 已切换到备用渠道',`已将 main agent 切换到 **${fallbackModel}**。\n正在尝试自动重启 gateway...`,'orange');
      try {
        restartGateway();
        await sendFeishuWebhook(FEISHU_WEBHOOK,'✅ Gateway 已自动重启',`备用渠道 **${fallbackModel}** 已生效。`,'green');
      } catch(e) {
        log(`gateway重启失败: ${e.message}`);
        await sendFeishuWebhook(FEISHU_WEBHOOK,'❌ Gateway 自动重启失败',`切换已完成但 gateway 重启失败：${e.message}\n请手动执行: openclaw gateway restart`,'red');
      }
    }
  } else {
    state.main.successCount += 1; state.main.failCount = 0;
    log(`main primary(${primaryProvider}) 探测成功计数: ${state.main.successCount}`);
    // 在fallback模式下，检测原primary恢复
    if (state.main.mode === 'fallback' && state.main.successCount >= 3) {
      // 原primary恢复了，但当前已经切到fallback，需要检测原primary的健康状态
      const origPrimary = mainAgent.failover.originalPrimary;
      const origProvider = origPrimary.split('/')[0];
      const origHealth = allResults.find(r=>r.provider===origProvider);
      if (origHealth && origHealth.status === 'healthy') {
        modelCfg.primary = origPrimary;
        mainAgent.failover.active = 'primary';
        saveConfig(config);
        state.main.mode = 'primary'; state.main.successCount = 0; state.main.failCount = 0;
        log(`已自动恢复 main 到 primary: ${origPrimary}`);
        try { restartGateway(); } catch(e) { log(`gateway重启失败: ${e.message}`); }
        await sendFeishuWebhook(FEISHU_WEBHOOK,'✅ main 已恢复主渠道',`原主渠道 **${origPrimary}** 已恢复健康，切回主渠道。`,'green');
      }
    }
  }

  writeState(state);
  const summary={ total:allResults.length, healthy:allResults.filter(r=>r.status==='healthy').length, degraded:allResults.filter(r=>r.status==='degraded').length, down:allResults.filter(r=>r.status==='down').length, error:allResults.filter(r=>r.status==='error').length };
  console.log(JSON.stringify({ success:true, timestamp:new Date().toISOString(), summary, mainFailoverState:state.main, mainModel:mainAgent.model },null,2));
}
main().catch(err=>{ log(`致命错误: ${err.message}`); console.log(JSON.stringify({success:false,error:err.message,timestamp:new Date().toISOString()},null,2)); process.exit(2); });
