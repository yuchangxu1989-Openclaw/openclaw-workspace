/**
 * @file examples/integration-example.js
 * @description EvoMap流水线组件集成示例
 * @version 1.0.0
 * 
 * 展示如何使用：
 * 1. EvoMapUploader - EvoMap上传器
 * 2. TaskScheduler - 任务调度器
 * 3. ErrorHandler - 错误处理器
 * 4. NotificationManager - 通知系统
 */

import { 
  EvolutionPipeline,
  createPipeline,
  EvoMapUploader,
  createErrorHandler,
  createProductionErrorHandler,
  createDevelopmentErrorHandler,
  ErrorSeverity,
  ErrorCategory
} from '../src/index.js';
import { TaskScheduler, Task, createTaskScheduler } from '../src/scheduler/index.js';
import { NotificationManager, Notification, createNotificationManager } from '../src/notification/index.js';
import { 
  TaskPriority, 
  TaskStatus, 
  NotificationType, 
  NotificationChannel
} from '../src/types/index.js';

// ============================================================
// 示例1: 使用 TaskScheduler 管理任务队列
// ============================================================
async function exampleTaskScheduler() {
  console.log('\n📋 示例1: TaskScheduler - 任务调度器');
  console.log('='.repeat(50));

  const scheduler = createTaskScheduler({
    maxConcurrency: 2,
    queueLimit: 100,
    autoStart: true
  });

  await scheduler.initialize();

  // 添加不同优先级的任务
  const tasks = [
    {
      name: 'skill_analysis',
      priority: TaskPriority.HIGH,
      executor: async (task) => {
        console.log(`   🔍 执行技能分析任务: ${task.name}`);
        await new Promise(r => setTimeout(r, 100));
        return { analyzed: 5 };
      }
    },
    {
      name: 'quality_check',
      priority: TaskPriority.CRITICAL,
      executor: async (task) => {
        console.log(`   ✅ 执行质量检查任务: ${task.name}`);
        return { score: 95 };
      }
    },
    {
      name: 'cleanup_old_logs',
      priority: TaskPriority.BACKGROUND,
      executor: async (task) => {
        console.log(`   🧹 执行清理任务: ${task.name}`);
        return { cleaned: 100 };
      }
    }
  ];

  // 添加任务
  const createdTasks = scheduler.addTasks(tasks);
  console.log(`   📥 添加了 ${createdTasks.length} 个任务到队列`);

  // 等待所有任务完成
  await scheduler.waitForAll(10000);

  // 查看统计
  const stats = scheduler.getStats();
  console.log('   📊 调度器统计:');
  console.log(`      - 总执行: ${stats.totalExecuted}`);
  console.log(`      - 失败: ${stats.totalFailed}`);
  console.log(`      - 成功率: ${stats.successRate}%`);

  scheduler.stop();
}

// ============================================================
// 示例2: 使用 NotificationManager 发送通知
// ============================================================
async function exampleNotificationManager() {
  console.log('\n🔔 示例2: NotificationManager - 通知系统');
  console.log('='.repeat(50));

  const notificationMgr = createNotificationManager({
    defaultChannels: [NotificationChannel.CONSOLE, NotificationChannel.EVENT],
    enablePersistence: false
  });

  await notificationMgr.initialize();

  // 发送各种类型的通知
  await notificationMgr.info('系统启动', 'EvoMap流水线已启动');
  await notificationMgr.success('任务完成', '技能验证成功完成', { skillId: 'test-skill' });
  await notificationMgr.warning('性能警告', '处理时间超过阈值', { duration: 5000 });
  await notificationMgr.error('执行错误', 'ISC验证失败', { error: 'INVALID_FORMAT' });
  
  // 进度通知
  for (let progress = 0; progress <= 100; progress += 25) {
    await notificationMgr.progress('同步进度', `正在同步到EvoMap...`, { progress });
  }

  // 查看历史记录
  const history = notificationMgr.getHistory({ limit: 5 });
  console.log(`   📜 最近 ${history.length} 条通知:`);
  history.forEach(n => {
    console.log(`      - [${n.type.toUpperCase()}] ${n.title}: ${n.summary}`);
  });

  // 查看统计
  const stats = notificationMgr.getStats();
  console.log('   📊 通知统计:');
  console.log(`      - 总通知: ${stats.total}`);
  console.log(`      - 未读: ${stats.unreadCount}`);
}

// ============================================================
// 示例3: 使用 ErrorHandler 处理错误
// ============================================================
async function exampleErrorHandler() {
  console.log('\n⚠️ 示例3: ErrorHandler - 错误处理器');
  console.log('='.repeat(50));

  const errorHandler = createProductionErrorHandler();
  await errorHandler.initialize();

  // 注册回滚处理器
  errorHandler.registerRollbackHandler('validation', async (ctx) => {
    console.log('   🔄 执行验证阶段回滚');
    return { rolledBack: true };
  });

  // 模拟处理一个带重试的操作
  let attemptCount = 0;
  try {
    const result = await errorHandler.withRetry(
      async () => {
        attemptCount++;
        console.log(`   📝 尝试执行操作 (${attemptCount})`);
        if (attemptCount < 3) {
          throw new Error('网络连接失败');
        }
        return { success: true, data: 'result' };
      },
      {
        operationId: 'test-operation',
        retryConfig: {
          maxRetries: 3,
          initialDelayMs: 100,
          exponentialBackoff: true
        }
      }
    );
    console.log(`   ✅ 操作最终成功: ${JSON.stringify(result)}`);
  } catch (error) {
    console.log(`   ❌ 操作最终失败: ${error.message}`);
  }

  // 查看错误报告
  const report = errorHandler.getErrorReport();
  console.log('   📊 错误统计:');
  console.log(`      - 总错误: ${report.total}`);
  console.log(`      - 已恢复: ${report.recovered}`);
  console.log(`      - 未恢复: ${report.unrecovered}`);
}

// ============================================================
// 示例4: 集成所有组件的完整流水线
// ============================================================
async function exampleIntegratedPipeline() {
  console.log('\n🔄 示例4: 完整集成流水线');
  console.log('='.repeat(50));

  // 创建流水线实例
  const pipeline = createPipeline({
    pipelineId: 'demo_pipeline',
    scheduler: { maxConcurrency: 2 },
    notification: { enablePersistence: false },
    errorHandler: createDevelopmentErrorHandler()
  });

  // 获取组件引用
  const scheduler = pipeline.scheduler;
  const notification = pipeline.notification;
  const errorHandler = pipeline.errorHandler;

  // 设置事件监听
  scheduler?.on('task:completed', ({ task }) => {
    notification?.success(
      '任务完成',
      `任务 ${task.name} 已成功完成`,
      { taskId: task.id, duration: task.duration }
    );
  });

  scheduler?.on('task:failed', ({ task, error }) => {
    notification?.error(
      '任务失败',
      `任务 ${task.name} 执行失败: ${error.message}`,
      { taskId: task.id, error: error.message }
    );
  });

  // 添加示例任务
  scheduler?.addTasks([
    {
      name: 'isc_validation',
      priority: TaskPriority.HIGH,
      executor: async () => {
        console.log('   🔍 执行ISC验证...');
        await new Promise(r => setTimeout(r, 50));
        return { score: 85, passed: true };
      }
    },
    {
      name: 'evomap_sync',
      priority: TaskPriority.NORMAL,
      executor: async () => {
        console.log('   🌐 同步到EvoMap...');
        await new Promise(r => setTimeout(r, 50));
        return { geneId: 'gene_123', synced: true };
      }
    },
    {
      name: 'report_generation',
      priority: TaskPriority.LOW,
      executor: async () => {
        console.log('   📄 生成报告...');
        await new Promise(r => setTimeout(r, 50));
        return { reportPath: '/reports/summary.pdf' };
      }
    }
  ]);

  console.log('   📥 任务已添加到队列');
  
  // 等待所有任务完成
  await scheduler?.waitForAll(10000);

  // 显示最终统计
  const stats = scheduler?.getStats();
  console.log('   📊 最终统计:');
  console.log(`      - 总任务数: ${stats?.totalExecuted}`);
  console.log(`      - 成功: ${stats?.totalExecuted - stats?.totalFailed}`);
  console.log(`      - 失败: ${stats?.totalFailed}`);

  // 停止流水线
  await pipeline.stop();
}

// ============================================================
// 运行所有示例
// ============================================================
async function main() {
  console.log('\n🚀 EvoMap流水线组件集成示例');
  console.log('='.repeat(50));
  console.log('演示四大核心组件的使用方法:\n');
  console.log('1. EvoMapUploader - EvoMap上传器');
  console.log('2. TaskScheduler - 任务调度器');
  console.log('3. ErrorHandler - 错误处理器');
  console.log('4. NotificationManager - 通知系统');

  try {
    await exampleTaskScheduler();
    await exampleNotificationManager();
    await exampleErrorHandler();
    await exampleIntegratedPipeline();

    console.log('\n' + '='.repeat(50));
    console.log('✅ 所有示例运行完成！');
    console.log('='.repeat(50) + '\n');
  } catch (error) {
    console.error('❌ 示例运行失败:', error);
    process.exit(1);
  }
}

// 运行主函数
main();
