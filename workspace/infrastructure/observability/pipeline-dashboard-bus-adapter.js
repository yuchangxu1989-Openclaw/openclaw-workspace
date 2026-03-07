#!/usr/bin/env node
'use strict';

/**
 * Pipeline Dashboard EventBus Adapter
 * 
 * Day2 Gap2 — 让五层仪表盘也支持事件驱动触发
 * 
 * 监听事件:
 *   - system.health.request       → 触发快速检查
 *   - pipeline.dashboard.request  → 触发完整采集
 *   - system.alert.triggered      → 触发快速检查+推送
 * 
 * 发射事件:
 *   - pipeline.dashboard.collected  → 采集完成
 *   - pipeline.dashboard.alert      → 状态恶化告警
 * 
 * @module infrastructure/observability/pipeline-dashboard-bus-adapter
 */

const path = require('path');

function register(bus) {
  if (!bus || typeof bus.on !== 'function') {
    console.warn('[pipeline-dashboard-bus-adapter] No valid bus provided');
    return;
  }

  const collector = require('./pipeline-dashboard-collector');
  const monitor = require('./autonomous-pipeline-monitor');

  // ─── Handler: Full collection ───
  function handleFullCollection(event) {
    try {
      const snapshot = collector.collectAll({ windowHours: 24 });
      const previous = collector.loadLastSnapshot();
      const delta = monitor.computeDelta(snapshot, previous);
      collector.persist(snapshot);

      bus.emit('pipeline.dashboard.collected', {
        source: 'pipeline-dashboard-bus-adapter',
        status: snapshot.overall.status,
        score: snapshot.overall.composite_score,
        alerts: snapshot.all_alerts.length,
        trigger_event: event?.type || 'manual',
      });

      // Auto-alert on degradation
      if (previous && snapshot.overall.status === 'critical' && previous.overall?.status !== 'critical') {
        bus.emit('pipeline.dashboard.alert', {
          source: 'pipeline-dashboard-bus-adapter',
          type: 'status_degradation',
          from: previous.overall?.status,
          to: snapshot.overall.status,
          score: snapshot.overall.composite_score,
          alerts: snapshot.all_alerts,
        });
      }

      return { status: 'ok', overall: snapshot.overall.status, score: snapshot.overall.composite_score };
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }

  // ─── Handler: Quick check ───
  function handleQuickCheck(event) {
    try {
      const snapshot = collector.collectAll({ windowHours: 1 });
      const previous = collector.loadLastSnapshot();
      collector.persist(snapshot);

      if (snapshot.overall.status === 'critical') {
        bus.emit('pipeline.dashboard.alert', {
          source: 'pipeline-dashboard-bus-adapter',
          type: 'critical_status',
          status: snapshot.overall.status,
          score: snapshot.overall.composite_score,
          alerts: snapshot.all_alerts,
          trigger: event?.type || 'manual',
        });
      }

      return { status: 'ok', overall: snapshot.overall.status };
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }

  // ─── Register listeners ───
  bus.on('pipeline.dashboard.request', handleFullCollection);
  bus.on('system.health.request', handleQuickCheck);
  bus.on('system.alert.triggered', handleQuickCheck);

  return {
    handleFullCollection,
    handleQuickCheck,
  };
}

module.exports = { register };
