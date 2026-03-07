import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createTaskScheduler } from '../scheduler/index.js';
import { EventType, TaskStatus } from '../types/index.js';

describe('TaskScheduler schedule event-driven integration', () => {
  let scheduler;

  beforeEach(async () => {
    scheduler = createTaskScheduler({
      autoStart: false,
      pollInterval: 20,
      scheduleCheckInterval: 10,
      maxConcurrency: 1
    });
    await scheduler.initialize();
    scheduler.start();
  });

  afterEach(() => {
    if (scheduler) {
      scheduler.stop();
    }
  });

  test('should convert scheduled task into runtime task and emit schedule event', async () => {
    const executions = [];
    const scheduleEvents = [];

    scheduler.on(EventType.SCHEDULE_TRIGGERED, (payload) => {
      scheduleEvents.push(payload);
    });

    const scheduledTask = scheduler.scheduleTask({
      name: 'event_driven_schedule_task',
      executor: async (task) => {
        executions.push(task.metadata);
        return 'ok';
      },
      metadata: {
        source: 'unit-test'
      }
    }, new Date(Date.now() + 30));

    await new Promise((resolve) => setTimeout(resolve, 200));
    await scheduler.waitForAll(2000);

    expect(scheduleEvents.length).toBe(1);
    expect(executions.length).toBe(1);
    expect(executions[0].scheduledTaskId).toBe(scheduledTask.id);
    expect(executions[0].trigger).toBe('schedule');
    expect(scheduler.completedTasks.size).toBe(1);
  });

  test('should keep schedule template in scheduled status after triggering', async () => {
    const scheduledTask = scheduler.scheduleTask({
      name: 'hourly_like_template',
      executor: async () => 'ok'
    }, new Date(Date.now() + 20));

    await new Promise((resolve) => setTimeout(resolve, 120));

    const entry = scheduler.scheduledTasks.get(scheduledTask.id);
    expect(entry).toBeTruthy();
    expect(entry.task.status).toBe(TaskStatus.SCHEDULED);
    expect(entry.lastTriggeredAt).toBeTruthy();
  });
});
