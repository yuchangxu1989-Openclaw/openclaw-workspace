/**
 * Cron 触发器
 */
// const cron = require('node-cron'); // 可选依赖

class CronTrigger {
  constructor() {
    this.jobs = new Map();
  }

  async start(dto) {
    try {
      const cron = require('node-cron');
      
      // 获取所有带 cron 触发的任务
      const tasks = dto.taskRegistry.getAll().filter(t => 
        t.triggers.some(tr => tr.type === 'cron')
      );
      
      for (const task of tasks) {
        for (const trigger of task.triggers) {
          if (trigger.type === 'cron') {
            const job = cron.schedule(trigger.spec, async () => {
              console.log(`[CronTrigger] 触发任务: ${task.id}`);
              try {
                await dto.execute(task.id, { trigger: 'cron' });
              } catch (e) {
                console.error(`[CronTrigger] 执行失败: ${task.id}`, e.message);
              }
            });
            
            this.jobs.set(task.id, job);
          }
        }
      }
      
      console.log(`[CronTrigger] 已启动 ${this.jobs.size} 个 cron 任务`);
    } catch (e) {
      console.log('[CronTrigger] node-cron 未安装，跳过 cron 触发器');
    }
  }

  stop() {
    for (const [id, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
  }
}

module.exports = new CronTrigger();
