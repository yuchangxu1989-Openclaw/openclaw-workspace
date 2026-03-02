/**
 * 灰度路由器 - Gradual Rollout Router
 * @version 3.0.0
 * 
 * 功能：
 * - 根据rollout-percentage决定使用哪个版本 (MVP vs Full)
 * - 支持agent-whitelist白名单覆盖
 * - 支持agent-blacklist黑名单排除
 * - 失败自动回退MVP版
 * - 监控指标收集
 * - 自动熔断机制
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Configuration & State
// ============================================================================

const CONFIG_PATH = path.join(__dirname, 'config', 'rollout.json');
const METRICS_PATH = path.join(__dirname, '..', '..', 'monitoring', 'metrics.json');

// 默认配置
const DEFAULT_CONFIG = {
  percentage: 0,           // 0-100，灰度比例
  whitelist: [],           // 白名单Agent列表
  blacklist: [],           // 黑名单Agent列表
  fallback: 'mvp',         // 回退策略: 'mvp' | 'error'
  autoRollback: true,      // 是否启用自动熔断
  circuitBreaker: {
    enabled: true,
    errorThreshold: 5,     // 错误率阈值(%)
    minRequests: 10,       // 最小请求数才触发熔断
    cooldownMs: 30000,     // 熔断后冷却时间
    consecutiveErrors: 3   // 连续错误数触发熔断
  },
  lastUpdated: Date.now()
};

// 运行时状态
let rolloutConfig = { ...DEFAULT_CONFIG };
let metrics = {
  mvp: { requests: 0, success: 0, errors: 0, totalLatency: 0, latencies: [] },
  full: { requests: 0, success: 0, errors: 0, totalLatency: 0, latencies: [] },
  downgradeCount: 0,
  circuitBreakerTrips: 0,
  lastReset: Date.now(),
  errorTypes: {}
};

let circuitBreakerState = {
  isOpen: false,
  lastFailure: null,
  consecutiveErrors: 0,
  openedAt: null
};

// 路由器缓存
let mvpRouter = null;
let fullRouter = null;

// ============================================================================
// Configuration Management
// ============================================================================

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const loaded = JSON.parse(raw);
      rolloutConfig = { ...DEFAULT_CONFIG, ...loaded };
      if (loaded.circuitBreaker) {
        rolloutConfig.circuitBreaker = { ...DEFAULT_CONFIG.circuitBreaker, ...loaded.circuitBreaker };
      }
      console.log(`[GradualRouter] 配置已加载: ${rolloutConfig.percentage}%`);
      return true;
    }
  } catch (err) {
    console.error('[GradualRouter] 配置加载失败:', err.message);
  }
  return false;
}

function saveConfig() {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    rolloutConfig.lastUpdated = Date.now();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(rolloutConfig, null, 2));
    return true;
  } catch (err) {
    console.error('[GradualRouter] 配置保存失败:', err.message);
    return false;
  }
}

function setPercentage(percentage) {
  if (percentage < 0 || percentage > 100) {
    throw new Error('Percentage must be between 0 and 100');
  }
  rolloutConfig.percentage = percentage;
  
  // 重置熔断状态
  if (percentage === 0) {
    resetCircuitBreaker();
  }
  
  saveConfig();
  console.log(`[GradualRouter] 灰度比例已设置为: ${percentage}%`);
  return { percentage, timestamp: Date.now() };
}

function addToWhitelist(agentId) {
  if (!rolloutConfig.whitelist.includes(agentId)) {
    rolloutConfig.whitelist.push(agentId);
    saveConfig();
  }
  return { whitelist: rolloutConfig.whitelist };
}

function removeFromWhitelist(agentId) {
  rolloutConfig.whitelist = rolloutConfig.whitelist.filter(id => id !== agentId);
  saveConfig();
  return { whitelist: rolloutConfig.whitelist };
}

function addToBlacklist(agentId) {
  if (!rolloutConfig.blacklist.includes(agentId)) {
    rolloutConfig.blacklist.push(agentId);
    saveConfig();
  }
  return { blacklist: rolloutConfig.blacklist };
}

function removeFromBlacklist(agentId) {
  rolloutConfig.blacklist = rolloutConfig.blacklist.filter(id => id !== agentId);
  saveConfig();
  return { blacklist: rolloutConfig.blacklist };
}

// ============================================================================
// Router Loading
// ============================================================================

async function loadMvpRouter() {
  if (!mvpRouter) {
    const mvpPath = path.join(__dirname, 'mr-router.mvp.js');
    const mvpModule = require(mvpPath);
    mvpRouter = mvpModule;
  }
  return mvpRouter;
}

async function loadFullRouter() {
  if (!fullRouter) {
    const fullPath = path.join(__dirname, 'dist', 'mr-router.js');
    try {
      // 使用动态import支持ESM
      if (fs.existsSync(fullPath)) {
        const fullModule = await import(fullPath);
        fullRouter = fullModule.MRRouter || fullModule.default;
      }
    } catch (err) {
      console.warn('[GradualRouter] 完整版加载失败:', err.message);
    }
  }
  return fullRouter;
}

// ============================================================================
// Decision Logic
// ============================================================================

function shouldUseFullVersion(agentId) {
  // 1. 检查黑名单
  if (rolloutConfig.blacklist.includes(agentId)) {
    return { useFull: false, reason: 'blacklist' };
  }

  // 2. 检查白名单
  if (rolloutConfig.whitelist.includes(agentId)) {
    return { useFull: true, reason: 'whitelist' };
  }

  // 3. 检查熔断器状态
  if (circuitBreakerState.isOpen) {
    const now = Date.now();
    const cooldown = rolloutConfig.circuitBreaker.cooldownMs;
    
    if (now - circuitBreakerState.openedAt < cooldown) {
      return { useFull: false, reason: 'circuit-breaker' };
    } else {
      // 冷却结束，半开状态
      circuitBreakerState.isOpen = false;
      circuitBreakerState.consecutiveErrors = 0;
      console.log('[GradualRouter] 熔断器半开，允许尝试完整版');
    }
  }

  // 4. 根据百分比决策
  const hash = hashString(`${agentId}_${Date.now()}`);
  const bucket = hash % 100;
  const useFull = bucket < rolloutConfig.percentage;
  
  return { 
    useFull, 
    reason: useFull ? 'percentage' : 'fallback',
    bucket,
    percentage: rolloutConfig.percentage
  };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转为32位整数
  }
  return Math.abs(hash);
}

// ============================================================================
// Circuit Breaker
// ============================================================================

function recordSuccess(version) {
  circuitBreakerState.consecutiveErrors = 0;
  updateMetrics(version, true, 0);
}

function recordError(version, errorCode) {
  circuitBreakerState.consecutiveErrors++;
  circuitBreakerState.lastFailure = Date.now();
  
  updateMetrics(version, false, 0, errorCode);
  
  const cb = rolloutConfig.circuitBreaker;
  
  // 检查是否触发熔断
  if (cb.enabled && !circuitBreakerState.isOpen) {
    const stats = metrics[version];
    const errorRate = stats.requests > 0 ? (stats.errors / stats.requests) * 100 : 0;
    
    if (errorRate > cb.errorThreshold && stats.requests >= cb.minRequests) {
      tripCircuitBreaker(`Error rate ${errorRate.toFixed(2)}% exceeds threshold ${cb.errorThreshold}%`);
    } else if (circuitBreakerState.consecutiveErrors >= cb.consecutiveErrors) {
      tripCircuitBreaker(`${cb.consecutiveErrors} consecutive errors`);
    }
  }
}

function tripCircuitBreaker(reason) {
  circuitBreakerState.isOpen = true;
  circuitBreakerState.openedAt = Date.now();
  metrics.circuitBreakerTrips++;
  
  console.error(`[GradualRouter] ⚠️ 熔断器触发: ${reason}`);
  console.error(`[GradualRouter] 自动回滚到MVP版，冷却时间: ${rolloutConfig.circuitBreaker.cooldownMs}ms`);
  
  // 自动回滚
  if (rolloutConfig.autoRollback) {
    emergencyStop();
  }
}

function resetCircuitBreaker() {
  circuitBreakerState = {
    isOpen: false,
    lastFailure: null,
    consecutiveErrors: 0,
    openedAt: null
  };
  console.log('[GradualRouter] 熔断器已重置');
}

function emergencyStop() {
  const oldPercentage = rolloutConfig.percentage;
  rolloutConfig.percentage = 0;
  saveConfig();
  console.log(`[GradualRouter] 🚨 紧急停止: ${oldPercentage}% -> 0%`);
  return { oldPercentage, newPercentage: 0, timestamp: Date.now() };
}

// ============================================================================
// Metrics Collection
// ============================================================================

function updateMetrics(version, success, latency, errorCode = null) {
  const stats = metrics[version];
  stats.requests++;
  
  if (success) {
    stats.success++;
  } else {
    stats.errors++;
    if (errorCode) {
      metrics.errorTypes[errorCode] = (metrics.errorTypes[errorCode] || 0) + 1;
    }
  }
  
  if (latency > 0) {
    stats.totalLatency += latency;
    stats.latencies.push(latency);
    // 保持数组大小，防止内存泄漏
    if (stats.latencies.length > 1000) {
      stats.latencies = stats.latencies.slice(-500);
    }
  }
}

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { p50: 0, p95: 0, p99: 0 };
  
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50Index = Math.floor(sorted.length * 0.5);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p99Index = Math.floor(sorted.length * 0.99);
  
  return {
    p50: sorted[p50Index],
    p95: sorted[p95Index],
    p99: sorted[p99Index]
  };
}

function getMetrics() {
  // 确保metrics对象完整
  const safeMetrics = {
    mvp: metrics.mvp || { requests: 0, success: 0, errors: 0, totalLatency: 0, latencies: [] },
    full: metrics.full || { requests: 0, success: 0, errors: 0, totalLatency: 0, latencies: [] },
    downgradeCount: metrics.downgradeCount || 0,
    circuitBreakerTrips: metrics.circuitBreakerTrips || 0,
    errorTypes: metrics.errorTypes || {}
  };
  
  const mvpLatencies = calculatePercentiles(safeMetrics.mvp.latencies || []);
  const fullLatencies = calculatePercentiles(safeMetrics.full.latencies || []);
  
  return {
    timestamp: Date.now(),
    config: {
      percentage: rolloutConfig.percentage,
      whitelist: rolloutConfig.whitelist || [],
      blacklist: rolloutConfig.blacklist || [],
      circuitBreaker: circuitBreakerState || { isOpen: false, consecutiveErrors: 0 }
    },
    comparison: {
      mvp: {
        requests: safeMetrics.mvp.requests || 0,
        success: safeMetrics.mvp.success || 0,
        errors: safeMetrics.mvp.errors || 0,
        successRate: safeMetrics.mvp.requests > 0 ? (safeMetrics.mvp.success / safeMetrics.mvp.requests * 100).toFixed(2) + '%' : 'N/A',
        avgLatency: safeMetrics.mvp.requests > 0 ? Math.round(safeMetrics.mvp.totalLatency / safeMetrics.mvp.requests) : 0,
        percentiles: mvpLatencies
      },
      full: {
        requests: safeMetrics.full.requests || 0,
        success: safeMetrics.full.success || 0,
        errors: safeMetrics.full.errors || 0,
        successRate: safeMetrics.full.requests > 0 ? (safeMetrics.full.success / safeMetrics.full.requests * 100).toFixed(2) + '%' : 'N/A',
        avgLatency: safeMetrics.full.requests > 0 ? Math.round(safeMetrics.full.totalLatency / safeMetrics.full.requests) : 0,
        percentiles: fullLatencies
      }
    },
    downgradeCount: safeMetrics.downgradeCount,
    circuitBreakerTrips: safeMetrics.circuitBreakerTrips,
    errorDistribution: safeMetrics.errorTypes
  };
}

function saveMetrics() {
  try {
    const dir = path.dirname(METRICS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(METRICS_PATH, JSON.stringify(getMetrics(), null, 2));
    return true;
  } catch (err) {
    console.error('[GradualRouter] 指标保存失败:', err.message);
    return false;
  }
}

function resetMetrics() {
  metrics = {
    mvp: { requests: 0, success: 0, errors: 0, totalLatency: 0, latencies: [] },
    full: { requests: 0, success: 0, errors: 0, totalLatency: 0, latencies: [] },
    downgradeCount: 0,
    circuitBreakerTrips: metrics.circuitBreakerTrips, // 保留熔断次数
    lastReset: Date.now(),
    errorTypes: {}
  };
  console.log('[GradualRouter] 指标已重置');
  return { reset: true, timestamp: Date.now() };
}

// ============================================================================
// Main Router Function
// ============================================================================

async function routeAndExecute(request) {
  const startTime = Date.now();
  const agentId = request.agentId || 'default';
  
  // 决策使用哪个版本
  const decision = shouldUseFullVersion(agentId);
  
  console.log(`[GradualRouter] Agent: ${agentId}, Decision: ${decision.useFull ? 'FULL' : 'MVP'} (reason: ${decision.reason})`);
  
  let result;
  let latency;
  
  if (decision.useFull) {
    try {
      const FullRouter = await loadFullRouter();
      if (!FullRouter) {
        throw new Error('Full version not available');
      }
      
      const router = new FullRouter();
      const execStart = Date.now();
      result = await router.routeAndExecute(request);
      latency = Date.now() - execStart;
      
      // 检查结果状态
      if (result.status === 'success') {
        recordSuccess('full');
      } else {
        recordError('full', result.error?.code || 'UNKNOWN');
        
        // 失败回退到MVP
        if (rolloutConfig.fallback === 'mvp') {
          console.log('[GradualRouter] Full版失败，回退到MVP版');
          metrics.downgradeCount++;
          return await executeMvp(request, startTime, true);
        }
      }
    } catch (err) {
      latency = Date.now() - startTime;
      recordError('full', err.code || 'EXECUTION_ERROR');
      
      console.error('[GradualRouter] Full版异常:', err.message);
      
      // 异常回退到MVP
      if (rolloutConfig.fallback === 'mvp') {
        console.log('[GradualRouter] 异常回退到MVP版');
        metrics.downgradeCount++;
        return await executeMvp(request, startTime, true);
      }
      
      throw err;
    }
  } else {
    result = await executeMvp(request, startTime, false);
  }
  
  // 异步保存指标
  setImmediate(() => saveMetrics());
  
  return result;
}

async function executeMvp(request, startTime, isFallback) {
  const MvpRouter = await loadMvpRouter();
  const execStart = Date.now();
  
  try {
    const result = await MvpRouter.routeAndExecute(request);
    const latency = Date.now() - execStart;
    
    if (result.status === 'success') {
      recordSuccess('mvp');
    } else {
      recordError('mvp', result.error?.code || 'UNKNOWN');
    }
    
    return {
      ...result,
      _gradualRouter: {
        version: 'mvp',
        isFallback,
        totalLatency: Date.now() - startTime
      }
    };
  } catch (err) {
    recordError('mvp', err.code || 'EXECUTION_ERROR');
    throw err;
  }
}

// ============================================================================
// Health Check
// ============================================================================

async function healthCheck() {
  const results = {
    timestamp: Date.now(),
    config: {
      percentage: rolloutConfig.percentage,
      healthy: true
    },
    versions: {
      mvp: { available: false, healthy: false },
      full: { available: false, healthy: false }
    },
    circuitBreaker: circuitBreakerState,
    overall: 'unknown'
  };
  
  // 检查MVP版
  try {
    const MvpRouter = await loadMvpRouter();
    results.versions.mvp.available = !!MvpRouter;
    results.versions.mvp.healthy = true;
  } catch (err) {
    results.versions.mvp.error = err.message;
  }
  
  // 检查完整版
  try {
    const FullRouter = await loadFullRouter();
    results.versions.full.available = !!FullRouter;
    if (FullRouter && FullRouter.prototype && FullRouter.prototype.health) {
      const router = new FullRouter();
      const fullHealth = await router.health();
      results.versions.full.healthy = fullHealth.healthy;
    } else {
      results.versions.full.healthy = results.versions.full.available;
    }
  } catch (err) {
    results.versions.full.error = err.message;
  }
  
  // 总体状态
  if (results.versions.mvp.healthy) {
    results.overall = 'healthy';
  } else {
    results.overall = 'critical';
    results.config.healthy = false;
  }
  
  return results;
}

// ============================================================================
// Initialization
// ============================================================================

function init() {
  loadConfig();
  console.log('[GradualRouter] 初始化完成');
  console.log(`  - 当前灰度比例: ${rolloutConfig.percentage}%`);
  console.log(`  - 白名单: ${rolloutConfig.whitelist.length}个`);
  console.log(`  - 黑名单: ${rolloutConfig.blacklist.length}个`);
  console.log(`  - 熔断器: ${rolloutConfig.circuitBreaker.enabled ? '启用' : '禁用'}`);
}

// 自动初始化
init();

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // 主API
  routeAndExecute,
  healthCheck,
  
  // 配置管理
  setPercentage,
  getConfig: () => ({ ...rolloutConfig }),
  addToWhitelist,
  removeFromWhitelist,
  addToBlacklist,
  removeFromBlacklist,
  
  // 熔断器
  emergencyStop,
  resetCircuitBreaker,
  getCircuitBreakerState: () => ({ ...circuitBreakerState }),
  
  // 指标
  getMetrics,
  saveMetrics,
  resetMetrics,
  
  // 工具
  shouldUseFullVersion,
  loadConfig,
  saveConfig
};
