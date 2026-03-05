/**
 * 智谱 API Key 统一读取模块
 * 唯一真相源：/root/.openclaw/openclaw.json
 * 
 * 用途分组：
 *   - zhipu-embedding: 向量化
 *   - zhipu-multimodal: 视觉/图像/视频/OCR/TTS/ASR等多模态
 *   - zhipu-cron: Cron任务(GLM-5)
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = '/root/.openclaw/openclaw.json';

// 用途 → provider 名映射
const PURPOSE_MAP = {
  'embedding':   'zhipu-embedding',
  'multimodal':  'zhipu-multimodal',
  'vision':      'zhipu-multimodal',
  'image':       'zhipu-multimodal',
  'video':       'zhipu-multimodal',
  'ocr':         'zhipu-multimodal',
  'tts':         'zhipu-multimodal',
  'asr':         'zhipu-multimodal',
  'cron':        'zhipu-cron',
  'glm5':        'zhipu-cron',
  'default':     'zhipu-multimodal',
};

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 60000; // 1分钟缓存

function loadConfig() {
  const now = Date.now();
  if (_cache && (now - _cacheTime) < CACHE_TTL) return _cache;
  
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  _cache = JSON.parse(raw);
  _cacheTime = now;
  return _cache;
}

function getKey(purpose = 'default') {
  const cfg = loadConfig();
  const providerName = PURPOSE_MAP[purpose] || PURPOSE_MAP['default'];
  const provider = cfg?.models?.providers?.[providerName];
  
  if (!provider || !provider.apiKey) {
    throw new Error(`[zhipu-keys] Provider "${providerName}" not found or missing apiKey in ${CONFIG_PATH}`);
  }
  
  return provider.apiKey;
}

function getBaseUrl(purpose = 'default') {
  const cfg = loadConfig();
  const providerName = PURPOSE_MAP[purpose] || PURPOSE_MAP['default'];
  const provider = cfg?.models?.providers?.[providerName];
  return provider?.baseUrl || 'https://open.bigmodel.cn/api/coding/paas/v4';
}

module.exports = { getKey, getBaseUrl, PURPOSE_MAP };
