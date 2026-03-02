/**
 * @file __tests__/notification-system.test.js
 * @description NotificationSystem 单元测试
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { NotificationManager, Notification, createNotificationManager } from '../notification/index.js';
import { NotificationType, NotificationChannel } from '../types/index.js';

describe('NotificationManager', () => {
  let manager;

  beforeEach(async () => {
    manager = createNotificationManager({
      defaultChannels: [NotificationChannel.CONSOLE, NotificationChannel.EVENT],
      enablePersistence: false
    });
    await manager.initialize();
  });

  afterEach(() => {
    if (manager) {
      manager.clearHistory();
    }
  });

  test('should create notification manager', () => {
    expect(manager).toBeInstanceOf(NotificationManager);
    expect(manager.config.defaultChannels).toContain(NotificationChannel.CONSOLE);
  });

  test('should send info notification', async () => {
    const notification = await manager.info('Test Title', 'Test message');

    expect(notification).toBeInstanceOf(Notification);
    expect(notification.type).toBe(NotificationType.INFO);
    expect(notification.title).toBe('Test Title');
    expect(notification.message).toBe('Test message');
    expect(notification.delivered).toBe(true);
  });

  test('should send success notification', async () => {
    const notification = await manager.success('Success', 'Operation completed', { id: 123 });

    expect(notification.type).toBe(NotificationType.SUCCESS);
    expect(notification.data).toEqual({ id: 123 });
  });

  test('should send warning notification', async () => {
    const notification = await manager.warning('Warning', 'Something might be wrong');

    expect(notification.type).toBe(NotificationType.WARNING);
  });

  test('should send error notification', async () => {
    const notification = await manager.error('Error', 'Something went wrong');

    expect(notification.type).toBe(NotificationType.ERROR);
  });

  test('should send critical notification', async () => {
    const notification = await manager.critical('Critical', 'System failure');

    expect(notification.type).toBe(NotificationType.CRITICAL);
  });

  test('should send progress notification', async () => {
    const notification = await manager.progress('Progress', 'Processing...', { progress: 50 });

    expect(notification.type).toBe(NotificationType.PROGRESS);
    expect(notification.data.progress).toBe(50);
  });

  test('should track notification history', async () => {
    await manager.info('Info 1', 'Message 1');
    await manager.success('Success 1', 'Message 2');
    await manager.error('Error 1', 'Message 3');

    const history = manager.getHistory();

    expect(history.length).toBe(3);
    expect(history[0].type).toBe(NotificationType.ERROR); // 最新的在前
  });

  test('should filter history by type', async () => {
    await manager.info('Info', 'Message');
    await manager.error('Error', 'Message');
    await manager.success('Success', 'Message');

    const filtered = manager.getHistory({
      types: [NotificationType.ERROR]
    });

    expect(filtered.length).toBe(1);
    expect(filtered[0].type).toBe(NotificationType.ERROR);
  });

  test('should track unread notifications', async () => {
    await manager.info('Info', 'Message');
    await manager.error('Error', 'Message');

    expect(manager.getStats().unreadCount).toBe(2);

    manager.markAllAsRead();

    expect(manager.getStats().unreadCount).toBe(0);
  });

  test('should mark single notification as read', async () => {
    const notification = await manager.info('Info', 'Message');

    expect(notification.read).toBe(false);

    manager.markAsRead(notification.id);

    expect(notification.read).toBe(true);
    expect(notification.readAt).toBeInstanceOf(Date);
  });

  test('should provide accurate stats', async () => {
    await manager.info('Info', 'Message');
    await manager.success('Success', 'Message');
    await manager.error('Error', 'Message');

    const stats = manager.getStats();

    expect(stats.total).toBe(3);
    expect(stats.byType[NotificationType.INFO]).toBe(1);
    expect(stats.byType[NotificationType.SUCCESS]).toBe(1);
    expect(stats.byType[NotificationType.ERROR]).toBe(1);
    expect(stats.historySize).toBe(3);
  });

  test('should clear history', async () => {
    await manager.info('Info', 'Message');
    await manager.success('Success', 'Message');

    const cleared = manager.clearHistory();

    expect(cleared).toBe(2);
    expect(manager.getHistory().length).toBe(0);
  });

  test('should emit events', async () => {
    const createdSpy = jest.fn();
    const sentSpy = jest.fn();

    manager.on('notification:created', createdSpy);
    manager.on('notification:sent', sentSpy);

    await manager.info('Test', 'Message');

    expect(createdSpy).toHaveBeenCalled();
    expect(sentSpy).toHaveBeenCalled();
  });
});

describe('Notification', () => {
  test('should create notification with defaults', () => {
    const notification = new Notification({
      type: NotificationType.INFO,
      title: 'Test',
      message: 'Test message'
    });

    expect(notification.type).toBe(NotificationType.INFO);
    expect(notification.title).toBe('Test');
    expect(notification.ttl).toBe(86400);
    expect(notification.read).toBe(false);
    expect(notification.delivered).toBe(false);
  });

  test('should generate summary', () => {
    const notification = new Notification({
      type: NotificationType.INFO,
      title: 'Test',
      message: 'This is a very long message that should be truncated for the summary view'
    });

    expect(notification.summary.length).toBeLessThan(notification.message.length);
    expect(notification.summary.endsWith('...')).toBe(true);
  });

  test('should check expiration', () => {
    const notification = new Notification({
      type: NotificationType.INFO,
      title: 'Test',
      message: 'Test',
      ttl: 0 // 立即过期
    });

    expect(notification.isExpired).toBe(true);
  });

  test('should mark as read', () => {
    const notification = new Notification({
      type: NotificationType.INFO,
      title: 'Test',
      message: 'Test'
    });

    notification.markAsRead();

    expect(notification.read).toBe(true);
    expect(notification.readAt).toBeInstanceOf(Date);
  });

  test('should mark as delivered', () => {
    const notification = new Notification({
      type: NotificationType.INFO,
      title: 'Test',
      message: 'Test'
    });

    notification.markAsDelivered([NotificationChannel.CONSOLE, NotificationChannel.FILE]);

    expect(notification.delivered).toBe(true);
    expect(notification.channels).toHaveLength(2);
  });

  test('should convert to JSON', () => {
    const notification = new Notification({
      type: NotificationType.INFO,
      title: 'Test',
      message: 'Test message',
      data: { key: 'value' }
    });

    const json = notification.toJSON();

    expect(json).toHaveProperty('id');
    expect(json).toHaveProperty('type', NotificationType.INFO);
    expect(json).toHaveProperty('title', 'Test');
    expect(json).toHaveProperty('message', 'Test message');
    expect(json).toHaveProperty('data', { key: 'value' });
  });
});
