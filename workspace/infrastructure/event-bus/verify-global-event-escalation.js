const fs = require('fs');
const { Dispatcher } = require('./dispatcher');

(async () => {
  const dispatcher = new Dispatcher({ rulesDir: '/root/.openclaw/workspace/infrastructure/event-bus/empty-rules-for-test' });
  fs.mkdirSync('/root/.openclaw/workspace/infrastructure/event-bus/empty-rules-for-test', { recursive: true });
  await dispatcher.init();

  const events = [
    {
      type: 'system.warning',
      payload: {
        severity: 'warning',
        entityType: 'system_check',
        entityId: 'disk-usage',
        message: 'disk usage warning',
        sandbox: true,
        reportId: 'sandbox-warning-report',
        reportData: { source: 'sandbox', phase: 'warning' }
      }
    },
    {
      type: 'system.error',
      payload: {
        severity: 'error',
        entityType: 'dispatcher_handler',
        entityId: 'notify-alert',
        message: 'sandbox handler error',
        sandbox: true,
        reportId: 'sandbox-error-report',
        reportData: { source: 'sandbox', phase: 'error' }
      }
    },
    {
      type: 'system.risk',
      payload: {
        severity: 'risk',
        entityType: 'policy',
        entityId: 'gate-bypass',
        message: 'sandbox risk detected',
        sandbox: true,
        reportId: 'sandbox-risk-report',
        reportData: { source: 'sandbox', phase: 'risk' }
      }
    },
    {
      type: 'system.check.failed',
      payload: {
        severity: 'error',
        entityType: 'system_check',
        entityId: 'health-check',
        message: 'sandbox health check failed',
        sandbox: true,
        reportId: 'sandbox-checkfail-report',
        reportData: { source: 'sandbox', phase: 'check_failed' }
      }
    },
    {
      type: 'day2.handler.failure.test',
      payload: {
        severity: 'error',
        source: 'day2-verifier',
        subsystem: 'dispatcher',
        sandbox: true,
        manualTest: true
      }
    },
    {
      type: 'day2.unrouted.event',
      payload: {
        severity: 'warning',
        source: 'day2-verifier',
        subsystem: 'dispatcher',
        sandbox: true,
        manualTest: true
      }
    }
  ];

  for (const event of events) {
    await dispatcher.dispatch(event.type, event.payload);
  }

  const tasksStore = JSON.parse(fs.readFileSync('/root/.openclaw/workspace/infrastructure/dispatcher/state/auto-repair-tasks.json', 'utf8'));
  const reviewsStore = JSON.parse(fs.readFileSync('/root/.openclaw/workspace/infrastructure/dispatcher/state/auto-repair-reviews.json', 'utf8'));
  const tasks = tasksStore.tasks || tasksStore.items || [];
  const reviews = reviewsStore.items || reviewsStore.reviews || [];
  const manualQueuePath = '/root/.openclaw/workspace/infrastructure/dispatcher/manual-queue.jsonl';
  const manualQueueLines = fs.existsSync(manualQueuePath)
    ? fs.readFileSync(manualQueuePath, 'utf8').trim().split('\n').filter(Boolean)
    : [];

  const routeFailedTasks = tasks.filter(t => String(t.finding?.kind || '').startsWith('dispatcher.route.failed'));
  const handlerFailedTasks = tasks.filter(t => String(t.finding?.kind || '').startsWith('dispatcher.handler.failed'));
  const manualQueuedTasks = tasks.filter(t => String(t.finding?.kind || '').startsWith('dispatcher.manual_queue.enqueued'));

  console.log(JSON.stringify({
    routesLoaded: dispatcher.getRuleCount(),
    stats: dispatcher.getStats(),
    taskCount: tasks.length,
    reviewCount: reviews.length,
    routeFailedCount: routeFailedTasks.length,
    handlerFailedCount: handlerFailedTasks.length,
    manualQueuedCount: manualQueuedTasks.length,
    manualQueueEntries: manualQueueLines.length,
    latestStandardTasks: tasks
      .filter(t => [
        'dispatcher.route.failed',
        'dispatcher.handler.failed',
        'dispatcher.manual_queue.enqueued'
      ].includes(t.finding?.kind))
      .slice(-6)
      .map(t => ({ id: t.id, kind: t.finding?.kind, entityId: t.finding?.entityId, severity: t.finding?.severity })),
    latestReviews: reviews.slice(-6).map(r => ({ id: r.id, taskId: r.taskId, status: r.status }))
  }, null, 2));
})();
