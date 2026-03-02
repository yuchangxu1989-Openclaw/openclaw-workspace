/**
 * AEO Phase 3 - 实时监控仪表盘
 * 系统资源、会话状态、模型负载、cron任务实时监控
 * 支持 WebSocket 实时推送和飞书卡片输出
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// 模拟 WebSocket 服务器（实际使用时需要配合 ws 库）
class MockWebSocketServer extends EventEmitter {
  constructor(port = 8080) {
    super();
    this.port = port;
    this.clients = new Set();
    this.isRunning = false;
  }

  start() {
    this.isRunning = true;
    console.log(`[WebSocket] 模拟服务器已启动 (端口: ${this.port})`);
    this.emit('listening', this.port);
  }

  stop() {
    this.isRunning = false;
    this.clients.clear();
    console.log('[WebSocket] 服务器已停止');
  }

  broadcast(data) {
    if (!this.isRunning) return;
    
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.clients.forEach(client => {
      // 模拟发送
    });
    this.emit('broadcast', message);
  }

  addClient(client) {
    this.clients.add(client);
  }

  removeClient(client) {
    this.clients.delete(client);
  }
}

class RealtimeMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      refreshInterval: options.refreshInterval || 5000, // 默认5秒刷新
      historyRetention: options.historyRetention || 10080, // 保留7天数据（按分钟计算）
      enableWebSocket: options.enableWebSocket !== false,
      webSocketPort: options.webSocketPort || 8080,
      enableFeishuCard: options.enableFeishuCard !== false,
      alertThresholds: {
        cpu: options.cpuThreshold || 80,
        memory: options.memoryThreshold || 85,
        disk: options.diskThreshold || 90,
        responseTime: options.responseTimeThreshold || 5000,
        errorRate: options.errorRateThreshold || 0.05,
        ...options.alertThresholds
      },
      ...options
    };

    this.history = {
      system: [],
      sessions: [],
      models: [],
      cron: []
    };

    this.currentStatus = {
      system: null,
      sessions: null,
      models: null,
      cron: null
    };

    this.webSocketServer = null;
    this.monitorInterval = null;
    this.isMonitoring = false;

    // 模型调用统计
    this.modelStats = new Map();
    
    // Cron任务跟踪
    this.cronTasks = new Map();
  }

  /**
   * 启动监控
   */
  start() {
    if (this.isMonitoring) {
      console.log('[Monitor] 监控已在运行中');
      return;
    }

    this.isMonitoring = true;
    console.log('[Monitor] 实时监控已启动');

    // 初始化 WebSocket
    if (this.options.enableWebSocket) {
      this._initWebSocket();
    }

    // 启动定时采集
    this._collectInitialData();
    this.monitorInterval = setInterval(() => {
      this._collectAllMetrics();
    }, this.options.refreshInterval);

    this.emit('started');
  }

  /**
   * 停止监控
   */
  stop() {
    this.isMonitoring = false;
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    if (this.webSocketServer) {
      this.webSocketServer.stop();
      this.webSocketServer = null;
    }

    console.log('[Monitor] 监控已停止');
    this.emit('stopped');
  }

  /**
   * 获取当前系统资源状态
   */
  getSystemStatus() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // 计算CPU使用率（简化计算）
    const cpuUsage = this._calculateCPUUsage(cpus);
    
    // 获取磁盘信息（模拟，实际实现可能需要调用系统命令）
    const diskInfo = this._getDiskInfo();

    const status = {
      timestamp: Date.now(),
      cpu: {
        usage: cpuUsage,
        count: cpus.length,
        model: cpus[0]?.model || 'Unknown',
        loadAverage: os.loadavg()
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usage: usedMem / totalMem,
        totalGB: (totalMem / 1024 / 1024 / 1024).toFixed(2),
        usedGB: (usedMem / 1024 / 1024 / 1024).toFixed(2)
      },
      disk: diskInfo,
      network: {
        interfaces: Object.keys(os.networkInterfaces()).length
      },
      uptime: os.uptime(),
      platform: os.platform(),
      hostname: os.hostname()
    };

    // 检查告警阈值
    this._checkSystemAlerts(status);

    return status;
  }

  /**
   * 获取会话状态
   */
  getSessionStatus(sessions = []) {
    // 如果没有传入会话数据，返回模拟数据
    const sessionData = sessions.length > 0 ? sessions : this._generateMockSessions();

    const status = {
      timestamp: Date.now(),
      activeSessions: sessionData.filter(s => s.status === 'active').length,
      totalSessions: sessionData.length,
      messageQueue: {
        pending: sessionData.reduce((sum, s) => sum + (s.pendingMessages || 0), 0),
        processing: sessionData.reduce((sum, s) => sum + (s.processingMessages || 0), 0),
        failed: sessionData.reduce((sum, s) => sum + (s.failedMessages || 0), 0)
      },
      sessions: sessionData.map(s => ({
        id: s.id,
        status: s.status,
        duration: s.duration || 0,
        messageCount: s.messageCount || 0,
        lastActivity: s.lastActivity || Date.now()
      })),
      peakConnections: this._calculatePeakConnections(sessionData),
      avgSessionDuration: this._calculateAvgSessionDuration(sessionData)
    };

    return status;
  }

  /**
   * 获取模型负载状态
   */
  getModelStatus(models = []) {
    const modelData = models.length > 0 ? models : this._generateMockModels();

    const status = {
      timestamp: Date.now(),
      totalCalls: modelData.reduce((sum, m) => sum + m.calls, 0),
      totalErrors: modelData.reduce((sum, m) => sum + m.errors, 0),
      avgResponseTime: 0,
      models: modelData.map(m => {
        const errorRate = m.calls > 0 ? m.errors / m.calls : 0;
        const stats = this.modelStats.get(m.name) || { totalCalls: 0, totalTime: 0 };
        const avgTime = stats.totalCalls > 0 ? stats.totalTime / stats.totalCalls : 0;

        return {
          name: m.name,
          calls: m.calls,
          errors: m.errors,
          errorRate: errorRate,
          avgResponseTime: m.avgResponseTime || avgTime,
          lastResponseTime: m.lastResponseTime || 0,
          status: this._getModelHealthStatus(errorRate, m.avgResponseTime || avgTime),
          load: m.load || Math.random() * 100
        };
      })
    };

    // 计算整体平均响应时间
    const activeModels = status.models.filter(m => m.calls > 0);
    status.avgResponseTime = activeModels.length > 0 
      ? activeModels.reduce((sum, m) => sum + m.avgResponseTime, 0) / activeModels.length 
      : 0;

    // 检查模型告警
    this._checkModelAlerts(status);

    return status;
  }

  /**
   * 获取Cron任务状态
   */
  getCronStatus(tasks = []) {
    const taskData = tasks.length > 0 ? tasks : this._generateMockCronTasks();

    const status = {
      timestamp: Date.now(),
      totalTasks: taskData.length,
      runningTasks: taskData.filter(t => t.status === 'running').length,
      failedTasks: taskData.filter(t => t.status === 'failed').length,
      successRate: 0,
      tasks: taskData.map(t => {
        const history = t.history || [];
        const successCount = history.filter(h => h.success).length;
        const taskSuccessRate = history.length > 0 ? successCount / history.length : 1;

        return {
          name: t.name,
          status: t.status,
          schedule: t.schedule,
          lastRun: t.lastRun,
          nextRun: t.nextRun,
          successRate: taskSuccessRate,
          runCount: history.length,
          avgDuration: history.length > 0 
            ? history.reduce((sum, h) => sum + (h.duration || 0), 0) / history.length 
            : 0
        };
      })
    };

    // 计算整体成功率
    const totalHistory = taskData.reduce((sum, t) => sum + (t.history?.length || 0), 0);
    const totalSuccess = taskData.reduce((sum, t) => {
      return sum + (t.history?.filter(h => h.success).length || 0);
    }, 0);
    status.successRate = totalHistory > 0 ? totalSuccess / totalHistory : 1;

    return status;
  }

  /**
   * 记录模型调用
   */
  recordModelCall(modelName, responseTime, success = true) {
    const stats = this.modelStats.get(modelName) || {
      totalCalls: 0,
      totalTime: 0,
      errors: 0,
      history: []
    };

    stats.totalCalls++;
    stats.totalTime += responseTime;
    if (!success) stats.errors++;
    
    stats.history.push({
      timestamp: Date.now(),
      responseTime,
      success
    });

    // 只保留最近100条记录
    if (stats.history.length > 100) {
      stats.history = stats.history.slice(-100);
    }

    this.modelStats.set(modelName, stats);
  }

  /**
   * 记录Cron任务执行
   */
  recordCronExecution(taskName, duration, success = true, error = null) {
    const task = this.cronTasks.get(taskName) || {
      name: taskName,
      history: [],
      lastRun: null,
      lastStatus: null
    };

    task.history.push({
      timestamp: Date.now(),
      duration,
      success,
      error
    });

    // 只保留最近50条记录
    if (task.history.length > 50) {
      task.history = task.history.slice(-50);
    }

    task.lastRun = Date.now();
    task.lastStatus = success ? 'success' : 'failed';

    this.cronTasks.set(taskName, task);
  }

  /**
   * 生成飞书监控卡片
   */
  generateFeishuCard(type = 'full') {
    const system = this.currentStatus.system || this.getSystemStatus();
    const sessions = this.currentStatus.sessions || this.getSessionStatus();
    const models = this.currentStatus.models || this.getModelStatus();
    const cron = this.currentStatus.cron || this.getCronStatus();

    const cardConfig = {
      config: { wide_screen_mode: true },
      header: {
        template: this._getCardTheme(system),
        title: { tag: "plain_text", content: "🖥️ AEO 实时监控仪表盘" },
        subtitle: { tag: "plain_text", content: this._formatTime(system.timestamp) }
      },
      elements: []
    };

    // 系统资源区
    cardConfig.elements.push({
      tag: "div",
      text: { tag: "lark_md", content: "**🔧 系统资源**" }
    });
    cardConfig.elements.push({
      tag: "div",
      text: {
        tag: "lark_md",
        content: this._generateSystemStatusText(system)
      }
    });

    if (type === 'full') {
      cardConfig.elements.push({ tag: "hr" });

      // 会话状态区
      cardConfig.elements.push({
        tag: "div",
        text: { tag: "lark_md", content: "**💬 会话状态**" }
      });
      cardConfig.elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: `活跃会话: ${sessions.activeSessions} | 消息队列: ${sessions.messageQueue.pending} 待处理`
        }
      });

      cardConfig.elements.push({ tag: "hr" });

      // 模型负载区
      cardConfig.elements.push({
        tag: "div",
        text: { tag: "lark_md", content: "**🤖 模型负载**" }
      });
      cardConfig.elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: this._generateModelStatusText(models)
        }
      });

      cardConfig.elements.push({ tag: "hr" });

      // Cron任务区
      cardConfig.elements.push({
        tag: "div",
        text: { tag: "lark_md", content: "**⏰ Cron任务**" }
      });
      cardConfig.elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: `运行中: ${cron.runningTasks} | 成功率: ${(cron.successRate * 100).toFixed(1)}%`
        }
      });
    }

    // 底部操作按钮
    cardConfig.elements.push({
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "刷新数据" },
          type: "primary",
          value: { action: "refresh_monitor" }
        },
        {
          tag: "button",
          text: { tag: "plain_text", content: "查看详情" },
          type: "default",
          value: { action: "view_details" }
        }
      ]
    });

    return cardConfig;
  }

  /**
   * 获取监控历史数据
   */
  getHistory(metric = 'system', limit = 100) {
    const data = this.history[metric] || [];
    return data.slice(-limit);
  }

  /**
   * 导出监控报告
   */
  exportReport(filepath) {
    const report = {
      generatedAt: new Date().toISOString(),
      currentStatus: this.currentStatus,
      history: this.history,
      modelStats: Object.fromEntries(this.modelStats),
      cronTasks: Object.fromEntries(this.cronTasks)
    };

    if (filepath) {
      fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    }

    return report;
  }

  // ============ 私有方法 ============

  _initWebSocket() {
    this.webSocketServer = new MockWebSocketServer(this.options.webSocketPort);
    this.webSocketServer.start();

    // 监听数据变化并推送
    this.on('metricsUpdated', (data) => {
      this.webSocketServer.broadcast({
        type: 'metrics',
        timestamp: Date.now(),
        data
      });
    });
  }

  _collectInitialData() {
    this._collectAllMetrics();
  }

  _collectAllMetrics() {
    const system = this.getSystemStatus();
    const sessions = this.getSessionStatus();
    const models = this.getModelStatus();
    const cron = this.getCronStatus();

    this.currentStatus = { system, sessions, models, cron };

    // 保存历史
    this._addToHistory('system', system);
    this._addToHistory('sessions', sessions);
    this._addToHistory('models', models);
    this._addToHistory('cron', cron);

    // 触发事件
    this.emit('metricsUpdated', this.currentStatus);
  }

  _addToHistory(metric, data) {
    this.history[metric].push({
      timestamp: Date.now(),
      data
    });

    // 限制历史数据量
    const maxRecords = this.options.historyRetention;
    if (this.history[metric].length > maxRecords) {
      this.history[metric] = this.history[metric].slice(-maxRecords);
    }
  }

  _calculateCPUUsage(cpus) {
    // 简化计算：基于负载平均值
    const loadAvg = os.loadavg()[0];
    const cpuCount = cpus.length;
    return Math.min((loadAvg / cpuCount) * 100, 100) / 100;
  }

  _getDiskInfo() {
    // 模拟磁盘信息（实际实现可能需要调用系统命令如 df）
    try {
      // 尝试获取根目录信息
      const stats = fs.statSync('/');
      return {
        total: 500 * 1024 * 1024 * 1024, // 模拟500GB
        used: 250 * 1024 * 1024 * 1024,  // 模拟已使用250GB
        free: 250 * 1024 * 1024 * 1024,
        usage: 0.5
      };
    } catch (e) {
      return {
        total: 0,
        used: 0,
        free: 0,
        usage: 0
      };
    }
  }

  _generateMockSessions() {
    return Array.from({ length: 5 }, (_, i) => ({
      id: `session_${i + 1}`,
      status: Math.random() > 0.2 ? 'active' : 'idle',
      duration: Math.floor(Math.random() * 3600000),
      messageCount: Math.floor(Math.random() * 100),
      pendingMessages: Math.floor(Math.random() * 10),
      processingMessages: Math.floor(Math.random() * 5),
      failedMessages: Math.floor(Math.random() * 3),
      lastActivity: Date.now() - Math.floor(Math.random() * 300000)
    }));
  }

  _generateMockModels() {
    const models = ['GPT-4', 'Claude-3', 'Kimi', 'Gemini'];
    return models.map(name => ({
      name,
      calls: Math.floor(Math.random() * 1000),
      errors: Math.floor(Math.random() * 50),
      avgResponseTime: Math.floor(Math.random() * 5000) + 1000,
      lastResponseTime: Math.floor(Math.random() * 3000) + 500,
      load: Math.random() * 100
    }));
  }

  _generateMockCronTasks() {
    const tasks = ['数据备份', '日志清理', '报告生成', '健康检查'];
    return tasks.map(name => {
      const history = Array.from({ length: 10 }, () => ({
        timestamp: Date.now() - Math.floor(Math.random() * 86400000),
        duration: Math.floor(Math.random() * 60000),
        success: Math.random() > 0.1
      }));

      return {
        name,
        status: Math.random() > 0.8 ? 'running' : 'idle',
        schedule: '0 */6 * * *',
        lastRun: Date.now() - Math.floor(Math.random() * 3600000),
        nextRun: Date.now() + Math.floor(Math.random() * 3600000),
        history
      };
    });
  }

  _calculatePeakConnections(sessions) {
    // 模拟峰值计算
    return sessions.length + Math.floor(Math.random() * 10);
  }

  _calculateAvgSessionDuration(sessions) {
    if (sessions.length === 0) return 0;
    return sessions.reduce((sum, s) => sum + (s.duration || 0), 0) / sessions.length;
  }

  _getModelHealthStatus(errorRate, responseTime) {
    if (errorRate > this.options.alertThresholds.errorRate || 
        responseTime > this.options.alertThresholds.responseTime) {
      return 'critical';
    }
    if (errorRate > this.options.alertThresholds.errorRate * 0.5 || 
        responseTime > this.options.alertThresholds.responseTime * 0.7) {
      return 'warning';
    }
    return 'healthy';
  }

  _checkSystemAlerts(status) {
    const { cpu, memory, disk } = status;
    const thresholds = this.options.alertThresholds;

    if (cpu.usage > thresholds.cpu / 100) {
      this.emit('alert', { type: 'cpu', level: 'warning', value: cpu.usage });
    }
    if (memory.usage > thresholds.memory / 100) {
      this.emit('alert', { type: 'memory', level: 'warning', value: memory.usage });
    }
    if (disk.usage > thresholds.disk / 100) {
      this.emit('alert', { type: 'disk', level: 'critical', value: disk.usage });
    }
  }

  _checkModelAlerts(status) {
    status.models.forEach(model => {
      if (model.status === 'critical') {
        this.emit('alert', { 
          type: 'model', 
          level: 'critical', 
          model: model.name,
          errorRate: model.errorRate,
          responseTime: model.avgResponseTime
        });
      }
    });
  }

  _getCardTheme(system) {
    if (!system) return 'blue';
    
    const { cpu, memory, disk } = system;
    const thresholds = this.options.alertThresholds;

    if (cpu.usage > thresholds.cpu / 100 || 
        memory.usage > thresholds.memory / 100 || 
        disk.usage > thresholds.disk / 100) {
      return 'red';
    }
    if (cpu.usage > (thresholds.cpu * 0.7) / 100 || 
        memory.usage > (thresholds.memory * 0.7) / 100) {
      return 'orange';
    }
    return 'green';
  }

  _formatTime(timestamp) {
    return new Date(timestamp).toLocaleString('zh-CN');
  }

  _generateSystemStatusText(system) {
    const cpuEmoji = system.cpu.usage > 0.8 ? '🔴' : system.cpu.usage > 0.6 ? '🟡' : '🟢';
    const memEmoji = system.memory.usage > 0.85 ? '🔴' : system.memory.usage > 0.7 ? '🟡' : '🟢';
    const diskEmoji = system.disk.usage > 0.9 ? '🔴' : system.disk.usage > 0.7 ? '🟡' : '🟢';

    return [
      `${cpuEmoji} CPU: ${(system.cpu.usage * 100).toFixed(1)}% (${system.cpu.count}核)`,
      `${memEmoji} 内存: ${(system.memory.usage * 100).toFixed(1)}% (${system.memory.usedGB}/${system.memory.totalGB}GB)`,
      `${diskEmoji} 磁盘: ${(system.disk.usage * 100).toFixed(1)}%`
    ].join(' | ');
  }

  _generateModelStatusText(models) {
    return models.models.map(m => {
      const emoji = m.status === 'healthy' ? '🟢' : m.status === 'warning' ? '🟡' : '🔴';
      return `${emoji} ${m.name}: ${m.calls}次调用, ${m.avgResponseTime.toFixed(0)}ms`;
    }).join('\n');
  }
}

// ============ 快捷函数 ============

function createMonitor(options = {}) {
  return new RealtimeMonitor(options);
}

function generateSystemStatus(options = {}) {
  const monitor = new RealtimeMonitor(options);
  return monitor.getSystemStatus();
}

function generateFeishuMonitorCard(options = {}) {
  const monitor = new RealtimeMonitor(options);
  return monitor.generateFeishuCard();
}

// ============ 导出 ============

module.exports = {
  RealtimeMonitor,
  MockWebSocketServer,
  createMonitor,
  generateSystemStatus,
  generateFeishuMonitorCard
};

// CLI测试
if (require.main === module) {
  console.log('=== AEO 实时监控仪表盘 ===\n');

  const monitor = new RealtimeMonitor({
    refreshInterval: 5000,
    enableWebSocket: true,
    alertThresholds: {
      cpu: 70,
      memory: 80,
      disk: 90
    }
  });

  // 监听告警
  monitor.on('alert', (alert) => {
    console.log(`\n⚠️ 告警: [${alert.level.toUpperCase()}] ${alert.type}`, alert);
  });

  // 监听数据更新
  monitor.on('metricsUpdated', (data) => {
    console.log('\n📊 数据已更新:', new Date().toLocaleTimeString('zh-CN'));
  });

  // 启动监控
  monitor.start();

  // 显示当前状态
  console.log('\n--- 系统状态 ---');
  console.log(JSON.stringify(monitor.getSystemStatus(), null, 2));

  console.log('\n--- 会话状态 ---');
  console.log(JSON.stringify(monitor.getSessionStatus(), null, 2));

  console.log('\n--- 模型负载 ---');
  console.log(JSON.stringify(monitor.getModelStatus(), null, 2));

  console.log('\n--- Cron任务 ---');
  console.log(JSON.stringify(monitor.getCronStatus(), null, 2));

  console.log('\n--- 飞书卡片 ---');
  console.log(JSON.stringify(monitor.generateFeishuCard(), null, 2));

  // 5秒后停止
  setTimeout(() => {
    monitor.stop();
    console.log('\n=== 监控演示结束 ===');
    process.exit(0);
  }, 6000);
}
