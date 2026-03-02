/**
 * Dashboard Data Layer - 仪表盘数据聚合层
 * @version 1.0.0
 * @description 提供实时监控数据、趋势分析、告警聚合的API
 */

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

// ============================================================================
// 数据源连接器
// ============================================================================

class DataSourceConnector {
  constructor(type, config) {
    this.type = type;
    this.config = config;
    this.connected = false;
  }

  async connect() {
    this.connected = true;
    return this;
  }

  async query(params) {
    throw new Error('Query not implemented');
  }
}

/**
 * 文件数据源 - 本地日志/JSON文件
 */
class FileDataSource extends DataSourceConnector {
  constructor(config) {
    super('file', config);
    this.basePath = config.path || path.join(__dirname, '../../data');
  }

  async query({ filePattern, since, until, limit = 1000 }) {
    const results = [];
    const files = fs.readdirSync(this.basePath)
      .filter(f => f.match(filePattern))
      .sort()
      .reverse()
      .slice(0, 7); // 最近7天

    for (const file of files) {
      const filePath = path.join(this.basePath, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        
        // 时间过滤
        if (since && data.timestamp < since) continue;
        if (until && data.timestamp > until) continue;
        
        results.push(data);
        if (results.length >= limit) break;
      } catch (e) {
        // 忽略解析错误的文件
      }
    }

    return results;
  }
}

/**
 * LEP执行数据源
 */
class LEPDataSource extends DataSourceConnector {
  constructor(config) {
    super('lep', config);
    this.lepPath = config.lepPath || path.join(__dirname, '../../../lep-executor');
  }

  async query({ taskType, status, since, limit = 100 }) {
    // 读取LEP执行日志
    const logPath = path.join(this.lepPath, 'logs/execution.log');
    if (!fs.existsSync(logPath)) return [];

    const logs = fs.readFileSync(logPath, 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);

    return logs
      .filter(log => !taskType || log.type === taskType)
      .filter(log => !status || log.status === status)
      .filter(log => !since || log.timestamp >= since)
      .slice(-limit);
  }
}

/**
 * AEO评测数据源
 */
class AEODatasource extends DataSourceConnector {
  constructor(config) {
    super('aeo', config);
    this.aeoPath = config.aeoPath || path.join(__dirname, '../..');
  }

  async query({ skillName, track, since, until }) {
    const resultsPath = path.join(this.aeoPath, 'data/evaluation-results');
    if (!fs.existsSync(resultsPath)) return [];

    const files = fs.readdirSync(resultsPath)
      .filter(f => f.endsWith('.json'))
      .filter(f => !skillName || f.includes(skillName));

    const results = [];
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(resultsPath, file), 'utf8'));
        if (track && data.track !== track) continue;
        if (since && data.timestamp < since) continue;
        if (until && data.timestamp > until) continue;
        results.push(data);
      } catch (e) {}
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }
}

// ============================================================================
// 数据聚合器
// ============================================================================

class DataAggregator {
  constructor() {
    this.connectors = new Map();
  }

  registerConnector(name, connector) {
    this.connectors.set(name, connector);
  }

  /**
   * 聚合多源数据
   */
  async aggregate(queryPlan) {
    const results = {};
    
    for (const [key, { source, params }] of Object.entries(queryPlan)) {
      const connector = this.connectors.get(source);
      if (connector) {
        results[key] = await connector.query(params);
      }
    }

    return results;
  }
}

// ============================================================================
// 仪表盘数据API
// ============================================================================

class DashboardDataAPI extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      cacheTtl: 30000,  // 30秒缓存
      maxHistoryPoints: 100,
      ...config
    };
    
    this.aggregator = new DataAggregator();
    this.cache = new Map();
    this.cacheTimestamps = new Map();
    
    this._initConnectors();
  }

  _initConnectors() {
    // 注册默认数据源
    this.aggregator.registerConnector('aeo', new AEODatasource({}));
    this.aggregator.registerConnector('lep', new LEPDataSource({}));
    this.aggregator.registerConnector('file', new FileDataSource({}));
  }

  // ==========================================================================
  // 核心API方法
  // ==========================================================================

  /**
   * 获取实时监控数据
   */
  async getRealtimeMetrics() {
    const cacheKey = 'realtime';
    if (this._isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const since = Date.now() - 3600000; // 最近1小时

    const data = await this.aggregator.aggregate({
      evaluations: {
        source: 'aeo',
        params: { since, limit: 1000 }
      },
      executions: {
        source: 'lep',
        params: { since, limit: 1000 }
      }
    });

    const metrics = this._calculateRealtimeMetrics(data);
    this._setCache(cacheKey, metrics);
    
    return metrics;
  }

  /**
   * 获取技能评分排行
   */
  async getSkillRankings(options = {}) {
    const { track, limit = 20 } = options;
    
    const data = await this.aggregator.aggregate({
      evaluations: {
        source: 'aeo',
        params: { track, limit: 1000 }
      }
    });

    const rankings = this._calculateSkillRankings(data.evaluations, limit);
    return rankings;
  }

  /**
   * 获取趋势数据
   */
  async getTrends(timeRange = '7d') {
    const ranges = {
      '1h': 3600000,
      '24h': 86400000,
      '7d': 604800000,
      '30d': 2592000000
    };
    
    const since = Date.now() - (ranges[timeRange] || ranges['7d']);

    const data = await this.aggregator.aggregate({
      evaluations: {
        source: 'aeo',
        params: { since, limit: 10000 }
      }
    });

    return this._calculateTrends(data.evaluations, timeRange);
  }

  /**
   * 获取告警聚合
   */
  async getAlerts(options = {}) {
    const { severity, status = 'active', limit = 50 } = options;
    
    const since = Date.now() - 86400000; // 最近24小时

    const data = await this.aggregator.aggregate({
      evaluations: {
        source: 'aeo',
        params: { since, limit: 5000 }
      }
    });

    return this._extractAlerts(data.evaluations, { severity, status, limit });
  }

  /**
   * 获取系统健康状态
   */
  async getSystemHealth() {
    const [realtime, trends] = await Promise.all([
      this.getRealtimeMetrics(),
      this.getTrends('24h')
    ]);

    const health = {
      overall: this._calculateOverallHealth(realtime, trends),
      components: {
        evaluation: this._calculateComponentHealth(realtime, 'evaluation'),
        execution: this._calculateComponentHealth(realtime, 'execution'),
        dataFlow: this._calculateComponentHealth(realtime, 'dataFlow')
      },
      trends: trends.summary,
      lastUpdate: Date.now()
    };

    return health;
  }

  /**
   * 获取技能详情
   */
  async getSkillDetails(skillName) {
    const since = Date.now() - 604800000; // 最近7天

    const data = await this.aggregator.aggregate({
      evaluations: {
        source: 'aeo',
        params: { skillName, since, limit: 1000 }
      }
    });

    return this._calculateSkillDetails(data.evaluations, skillName);
  }

  // ==========================================================================
  // 私有计算方法
  // ==========================================================================

  _calculateRealtimeMetrics(data) {
    const evaluations = data.evaluations || [];
    const executions = data.executions || [];

    // 按轨道分组统计
    const byTrack = {
      'ai-effect': { count: 0, totalScore: 0, passed: 0 },
      'functional-quality': { count: 0, totalScore: 0, passed: 0 }
    };

    evaluations.forEach(ev => {
      const track = byTrack[ev.track];
      if (track) {
        track.count++;
        track.totalScore += ev.overallScore || 0;
        if (ev.passed) track.passed++;
      }
    });

    // 计算执行指标
    const execStats = {
      total: executions.length,
      success: executions.filter(e => e.status === 'success').length,
      failed: executions.filter(e => e.status === 'failed').length,
      avgDuration: executions.length > 0
        ? executions.reduce((sum, e) => sum + (e.duration || 0), 0) / executions.length
        : 0
    };

    return {
      timestamp: Date.now(),
      evaluations: {
        total: evaluations.length,
        byTrack: Object.entries(byTrack).map(([name, stats]) => ({
          name,
          count: stats.count,
          avgScore: stats.count > 0 ? stats.totalScore / stats.count : 0,
          passRate: stats.count > 0 ? stats.passed / stats.count : 0
        }))
      },
      executions: execStats,
      throughput: {
        evaluationsPerHour: evaluations.length,
        executionsPerHour: executions.length
      }
    };
  }

  _calculateSkillRankings(evaluations, limit) {
    const skillMap = new Map();

    evaluations.forEach(ev => {
      const name = ev.skillName;
      if (!skillMap.has(name)) {
        skillMap.set(name, {
          name,
          evaluations: [],
          totalScore: 0,
          passed: 0,
          tracks: new Set()
        });
      }

      const skill = skillMap.get(name);
      skill.evaluations.push(ev);
      skill.totalScore += ev.overallScore || 0;
      if (ev.passed) skill.passed++;
      skill.tracks.add(ev.track);
    });

    const rankings = Array.from(skillMap.values())
      .map(skill => ({
        name: skill.name,
        avgScore: skill.evaluations.length > 0 
          ? skill.totalScore / skill.evaluations.length 
          : 0,
        passRate: skill.evaluations.length > 0 
          ? skill.passed / skill.evaluations.length 
          : 0,
        evaluationCount: skill.evaluations.length,
        tracks: Array.from(skill.tracks)
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, limit);

    return rankings;
  }

  _calculateTrends(evaluations, timeRange) {
    const bucketSize = timeRange === '1h' ? 60000 :      // 1分钟
                       timeRange === '24h' ? 3600000 :   // 1小时
                       86400000;                         // 1天

    const buckets = new Map();

    evaluations.forEach(ev => {
      const bucketTime = Math.floor(ev.timestamp / bucketSize) * bucketSize;
      if (!buckets.has(bucketTime)) {
        buckets.set(bucketTime, { count: 0, totalScore: 0, passed: 0 });
      }
      const bucket = buckets.get(bucketTime);
      bucket.count++;
      bucket.totalScore += ev.overallScore || 0;
      if (ev.passed) bucket.passed++;
    });

    const points = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, stats]) => ({
        timestamp: time,
        count: stats.count,
        avgScore: stats.count > 0 ? stats.totalScore / stats.count : 0,
        passRate: stats.count > 0 ? stats.passed / stats.count : 0
      }));

    return {
      timeRange,
      points,
      summary: {
        totalEvaluations: evaluations.length,
        avgScore: points.length > 0 
          ? points.reduce((sum, p) => sum + p.avgScore, 0) / points.length 
          : 0,
        trendDirection: this._calculateTrendDirection(points)
      }
    };
  }

  _calculateTrendDirection(points) {
    if (points.length < 2) return 'stable';
    
    const first = points.slice(0, Math.ceil(points.length / 2));
    const second = points.slice(Math.floor(points.length / 2));
    
    const firstAvg = first.reduce((s, p) => s + p.avgScore, 0) / first.length;
    const secondAvg = second.reduce((s, p) => s + p.avgScore, 0) / second.length;
    
    const diff = secondAvg - firstAvg;
    if (diff > 0.05) return 'improving';
    if (diff < -0.05) return 'degrading';
    return 'stable';
  }

  _extractAlerts(evaluations, options) {
    const alerts = [];
    const { severity, limit } = options;

    // 低分告警
    evaluations
      .filter(ev => ev.overallScore < 0.6)
      .forEach(ev => {
        alerts.push({
          id: `low-score-${ev.skillName}-${ev.timestamp}`,
          type: 'low_score',
          severity: ev.overallScore < 0.4 ? 'critical' : 'high',
          skillName: ev.skillName,
          message: `Skill ${ev.skillName} scored ${(ev.overallScore * 100).toFixed(1)}%`,
          timestamp: ev.timestamp,
          details: ev
        });
      });

    // 连续失败告警
    const skillFailures = new Map();
    evaluations.forEach(ev => {
      if (!ev.passed) {
        const count = skillFailures.get(ev.skillName) || 0;
        skillFailures.set(ev.skillName, count + 1);
      }
    });

    skillFailures.forEach((count, skillName) => {
      if (count >= 3) {
        alerts.push({
          id: `consecutive-failures-${skillName}`,
          type: 'consecutive_failures',
          severity: count >= 5 ? 'critical' : 'high',
          skillName,
          message: `Skill ${skillName} failed ${count} consecutive evaluations`,
          timestamp: Date.now()
        });
      }
    });

    let filtered = alerts;
    if (severity) {
      filtered = alerts.filter(a => a.severity === severity);
    }

    return filtered
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  _calculateOverallHealth(realtime, trends) {
    const passRate = realtime.evaluations.byTrack.reduce(
      (sum, t) => sum + t.passRate, 0
    ) / (realtime.evaluations.byTrack.length || 1);

    const successRate = realtime.executions.total > 0
      ? realtime.executions.success / realtime.executions.total
      : 1;

    const healthScore = (passRate * 0.6 + successRate * 0.4);

    return {
      score: healthScore,
      status: healthScore > 0.9 ? 'healthy' : 
              healthScore > 0.7 ? 'warning' : 'critical',
      indicators: {
        evaluationPassRate: passRate,
        executionSuccessRate: successRate,
        trend: trends.summary.trendDirection
      }
    };
  }

  _calculateComponentHealth(realtime, component) {
    // 简化版，实际应根据各组件指标计算
    return {
      status: 'healthy',
      score: 0.95,
      lastCheck: Date.now()
    };
  }

  _calculateSkillDetails(evaluations, skillName) {
    const byTrack = {};
    const byDimension = {};

    evaluations.forEach(ev => {
      // 按轨道分组
      if (!byTrack[ev.track]) {
        byTrack[ev.track] = { count: 0, scores: [] };
      }
      byTrack[ev.track].count++;
      byTrack[ev.track].scores.push(ev.overallScore);

      // 按维度分组
      if (ev.dimensions) {
        Object.entries(ev.dimensions).forEach(([dim, score]) => {
          if (!byDimension[dim]) {
            byDimension[dim] = { count: 0, total: 0 };
          }
          byDimension[dim].count++;
          byDimension[dim].total += score;
        });
      }
    });

    return {
      name: skillName,
      totalEvaluations: evaluations.length,
      tracks: Object.entries(byTrack).map(([name, stats]) => ({
        name,
        count: stats.count,
        avgScore: stats.scores.reduce((a, b) => a + b, 0) / stats.count,
        minScore: Math.min(...stats.scores),
        maxScore: Math.max(...stats.scores)
      })),
      dimensions: Object.entries(byDimension).map(([name, stats]) => ({
        name,
        avgScore: stats.total / stats.count
      })),
      recentEvaluations: evaluations
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10)
    };
  }

  // ==========================================================================
  // 缓存管理
  // ==========================================================================

  _isCacheValid(key) {
    if (!this.cache.has(key)) return false;
    const timestamp = this.cacheTimestamps.get(key);
    return Date.now() - timestamp < this.config.cacheTtl;
  }

  _setCache(key, value) {
    this.cache.set(key, value);
    this.cacheTimestamps.set(key, Date.now());
  }

  clearCache() {
    this.cache.clear();
    this.cacheTimestamps.clear();
  }
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
  DashboardDataAPI,
  DataAggregator,
  FileDataSource,
  LEPDataSource,
  AEODatasource
};
