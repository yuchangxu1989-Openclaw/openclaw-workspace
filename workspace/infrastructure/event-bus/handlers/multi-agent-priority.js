const fs = require('fs');
const path = require('path');
const { exists, readText } = require('./p0-utils');

/**
 * 多Agent并行与用户沟通优先
 * 感知：isc.rule.matched / isc.category.matched
 * 执行：检查并行适配性→验证配置→确保通道畅通→记录决策→闭环
 */
module.exports = async function(event, rule, context) {
  const workspace = (context && context.workspace) || '/root/.openclaw/workspace';
  const logger = context.logger || console;
  const bus = context.bus;

  logger.info('[multi-agent-priority] 启动多Agent并行配置检查');

  try {
    const payload = event.payload || event;
    const taskInfo = payload.task || payload.taskInfo || {};
    const taskName = taskInfo.name || payload.name || 'unknown';
    const taskType = taskInfo.type || payload.type || 'general';

    // 1. 检查当前任务是否适合并行
    const parallelAssessment = assessParallelizability(taskType, taskInfo, logger);
    logger.info('[multi-agent-priority] 并行评估结果:', parallelAssessment);

    // 2. 验证并行配置
    const configPaths = [
      path.join(workspace, 'infrastructure', 'config', 'parallel.json'),
      path.join(workspace, 'config', 'parallel.json'),
      path.join(workspace, '.openclaw', 'config.json')
    ];

    let parallelConfig = null;
    for (const cp of configPaths) {
      if (exists(cp)) {
        try {
          const cfg = JSON.parse(readText(cp));
          parallelConfig = cfg.parallel || cfg.concurrency || cfg;
          logger.info('[multi-agent-priority] 加载并行配置:', cp);
          break;
        } catch (e) {
          logger.warn('[multi-agent-priority] 配置解析失败:', cp, e.message);
        }
      }
    }

    if (!parallelConfig) {
      parallelConfig = {
        max_concurrency: 3,
        user_priority: true,
        communication_first: true,
        timeout_ms: 30000
      };
      logger.info('[multi-agent-priority] 使用默认并行配置');
    }

    const maxConcurrency = parallelConfig.max_concurrency || parallelConfig.maxConcurrency || 3;
    const userPriority = parallelConfig.user_priority !== false;
    const commFirst = parallelConfig.communication_first !== false;

    // 3. 主Agent沟通通道是否畅通
    const channelStatus = checkCommunicationChannel(context, logger);

    // 4. 决策逻辑
    const decision = {
      task: taskName,
      taskType,
      parallelSuitable: parallelAssessment.suitable,
      reason: parallelAssessment.reason,
      maxConcurrency,
      userPriority,
      communicationFirst: commFirst,
      channelStatus: channelStatus.status,
      recommendation: 'sequential'
    };

    if (parallelAssessment.suitable && channelStatus.status === 'healthy') {
      decision.recommendation = 'parallel';
      decision.suggestedConcurrency = Math.min(parallelAssessment.suggestedWorkers, maxConcurrency);
    } else if (parallelAssessment.suitable && channelStatus.status !== 'healthy') {
      decision.recommendation = 'parallel_with_caution';
      decision.suggestedConcurrency = 1;
      decision.warning = '通道状态异常，限制并行度';
    }

    // 如果用户沟通优先，确保主Agent始终可用
    if (userPriority) {
      decision.reserveMainAgent = true;
      decision.mainAgentRole = 'communication';
    }

    // 5. 记录决策日志
    const logsDir = path.join(workspace, 'infrastructure', 'event-bus', 'reports');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logEntry = {
      timestamp: new Date().toISOString(),
      event: event.type || event.name || 'unknown',
      decision
    };
    const logPath = path.join(logsDir, 'multi-agent-decisions.jsonl');
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n', 'utf-8');
    logger.info('[multi-agent-priority] 决策已记录:', logPath);

    bus.emit('orchestration.parallel.configured', {
      task: taskName,
      recommendation: decision.recommendation,
      concurrency: decision.suggestedConcurrency || 1,
      decision
    });

    logger.info('[multi-agent-priority] 完成', decision);

    return {
      status: 'completed',
      decision
    };
  } catch (err) {
    logger.error('[multi-agent-priority] 执行失败:', err.message);
    bus.emit('orchestration.parallel.config.failed', { error: err.message });
    throw err;
  }
};

/**
 * 评估任务是否适合并行处理
 */
function assessParallelizability(taskType, taskInfo, logger) {
  // 不适合并行的任务类型
  const sequentialTypes = ['user_conversation', 'interactive', 'approval', 'review'];
  // 适合并行的任务类型
  const parallelTypes = ['batch', 'scan', 'analysis', 'generation', 'test', 'build'];

  if (sequentialTypes.includes(taskType)) {
    return { suitable: false, reason: `任务类型 ${taskType} 需要顺序执行`, suggestedWorkers: 1 };
  }

  if (parallelTypes.includes(taskType)) {
    const items = taskInfo.items || taskInfo.count || 1;
    const workers = Math.min(Math.ceil(items / 2), 5);
    return { suitable: true, reason: `任务类型 ${taskType} 适合并行`, suggestedWorkers: workers };
  }

  // 检查是否有明确的子任务
  const subtasks = taskInfo.subtasks || taskInfo.steps || [];
  if (Array.isArray(subtasks) && subtasks.length > 1) {
    // 检查子任务间是否有依赖
    const hasDeps = subtasks.some(t => t.dependsOn || t.after);
    if (!hasDeps) {
      return { suitable: true, reason: '多个独立子任务', suggestedWorkers: subtasks.length };
    }
  }

  return { suitable: false, reason: '默认顺序执行，无明确并行信号', suggestedWorkers: 1 };
}

/**
 * 检查沟通通道状态
 */
function checkCommunicationChannel(context, logger) {
  // 检查context中的通道信息
  if (context.channel && context.channel.status === 'connected') {
    return { status: 'healthy', channel: context.channel.type || 'default' };
  }

  // 检查notify功能是否可用
  if (typeof context.notify === 'function') {
    return { status: 'healthy', channel: 'notify' };
  }

  // 检查bus是否可用
  if (context.bus && typeof context.bus.emit === 'function') {
    return { status: 'degraded', channel: 'bus_only', note: '仅event bus可用，无直接通知' };
  }

  return { status: 'unavailable', channel: 'none' };
}
