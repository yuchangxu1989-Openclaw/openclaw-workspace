/**
 * @file __tests__/task-scheduler.test.js
 * @description TaskScheduler 单元测试
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { TaskScheduler, Task, createTaskScheduler } from '../scheduler/index.js';
import { TaskPriority, TaskStatus } from '../types/index.js';

describe('TaskScheduler', () => {
  let scheduler;

  beforeEach(() => {
    scheduler = createTaskScheduler({
      maxConcurrency: 2,
      autoStart: false
    });
  });

  afterEach(async () => {
    if (scheduler) {
      scheduler.stop();
    }
  });

  test('should create task scheduler', () => {
    expect(scheduler).toBeInstanceOf(TaskScheduler);
    expect(scheduler.config.maxConcurrency).toBe(2);
  });

  test('should add task to queue', () => {
    const task = scheduler.addTask({
      name: 'test_task',
      executor: async () => 'result'
    });

    expect(task).toBeInstanceOf(Task);
    expect(task.name).toBe('test_task');
    expect(scheduler.taskQueue.length).toBe(1);
  });

  test('should respect priority ordering', () => {
    scheduler.addTask({
      name: 'low_priority',
      priority: TaskPriority.LOW,
      executor: async () => {}
    });

    scheduler.addTask({
      name: 'high_priority',
      priority: TaskPriority.HIGH,
      executor: async () => {}
    });

    scheduler.addTask({
      name: 'critical_priority',
      priority: TaskPriority.CRITICAL,
      executor: async () => {}
    });

    expect(scheduler.taskQueue[0].name).toBe('critical_priority');
    expect(scheduler.taskQueue[1].name).toBe('high_priority');
    expect(scheduler.taskQueue[2].name).toBe('low_priority');
  });

  test('should execute task successfully', async () => {
    const executor = async () => 'success_result';
    
    const task = new Task({
      name: 'success_task',
      executor
    });

    const result = await scheduler.executeTask(task);

    expect(result).toBe('success_result');
    expect(task.status).toBe(TaskStatus.COMPLETED);
  });

  test('should handle task failure', async () => {
    const error = new Error('Task failed');
    
    const task = scheduler.addTask({
      name: 'fail_task',
      executor: async () => { throw error; },
      maxRetries: 0
    });

    await expect(scheduler.executeTask(task)).rejects.toThrow('Task failed');
    expect(task.status).toBe(TaskStatus.FAILED);
  });

  test('should retry failed tasks', async () => {
    let attempts = 0;
    
    const task = scheduler.addTask({
      name: 'retry_task',
      executor: async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary error');
        }
        return 'success';
      },
      maxRetries: 2
    });

    const result = await scheduler.executeTask(task);

    expect(result).toBe('success');
    expect(attempts).toBe(2);
    expect(task.retryCount).toBe(1);
  }, 10000);

  test('should cancel task', () => {
    const task = scheduler.addTask({
      name: 'cancel_task',
      executor: async () => {}
    });

    const cancelled = scheduler.cancelTask(task.id);

    expect(cancelled).toBe(true);
    expect(task.status).toBe(TaskStatus.CANCELLED);
  });

  test('should provide accurate stats', () => {
    scheduler.addTask({
      name: 'task1',
      priority: TaskPriority.HIGH,
      executor: async () => {}
    });

    scheduler.addTask({
      name: 'task2',
      priority: TaskPriority.NORMAL,
      executor: async () => {}
    });

    const stats = scheduler.getStats();

    expect(stats.queueLength).toBe(2);
    expect(stats.runningCount).toBe(0);
    expect(stats.isRunning).toBe(false);
  });
});

describe('Task', () => {
  test('should create task with defaults', () => {
    const task = new Task({
      name: 'simple_task',
      executor: async () => {}
    });

    expect(task.name).toBe('simple_task');
    expect(task.priority).toBe(TaskPriority.NORMAL);
    expect(task.status).toBe(TaskStatus.PENDING);
    expect(task.maxRetries).toBe(3);
    expect(task.timeout).toBe(30000);
  });

  test('should track task lifecycle', () => {
    const task = new Task({
      name: 'lifecycle_task',
      executor: async () => {}
    });

    expect(task.canExecute()).toBe(true);

    task.markRunning();
    expect(task.status).toBe(TaskStatus.RUNNING);
    expect(task.startedAt).toBeInstanceOf(Date);

    task.markCompleted('result');
    expect(task.status).toBe(TaskStatus.COMPLETED);
    expect(task.result).toBe('result');
    expect(task.completedAt).toBeInstanceOf(Date);
    expect(task.duration).toBeGreaterThanOrEqual(0);
  });

  test('should convert to JSON', () => {
    const task = new Task({
      name: 'json_task',
      executor: async () => {}
    });

    const json = task.toJSON();

    expect(json).toHaveProperty('id');
    expect(json).toHaveProperty('name', 'json_task');
    expect(json).toHaveProperty('status');
    expect(json).toHaveProperty('createdAt');
  });
});
