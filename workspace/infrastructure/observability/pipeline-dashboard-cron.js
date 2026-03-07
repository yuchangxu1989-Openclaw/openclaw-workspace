#!/usr/bin/env node
'use strict';

/**
 * Pipeline Dashboard Cron Entry — 自主决策流水线定时监控
 * 
 * Day2 Gap2: 全局自主决策流水线监控升级 / 集成改造
 * 
 * 功能:
 *   - 每4小时执行完整24h窗口仪表盘采集
 *   - 每小时执行1h窗口快速健康检查
 *   - 自动判定是否需要推送告警（仅当状态恶化或有critical告警时推送）
 *   - 生成报告 + 持久化快照 + 可选飞书卡片推送
 * 
 * 调度建议:
 *   完整报告: 0 *\/4 * * *  (每4小时)
 *   快速检查: 0 * * * *    (每小时，--quick 模式)
 * 
 * 用法:
 *   node pipeline-dashboard-cron.js                # 完整24h报告
 *   node pipeline-dashboard-cron.js --quick        # 1h快速检查
 *   node pipeline-dashboard-cron.js --force-send   # 强制推送卡片
 * 
 * 退出码: 0=正常 1=异常 2=超时
 */

const TIMEOUT_MS = 90_000;
const timer = setTimeout(() => {
  console.error(JSON.stringify({
    status: 'TIMEOUT',
    message: `Pipeline dashboard exceeded ${TIMEOUT_MS / 1000}s`,
    timestamp: new Date().toISOString(),
  }));
  process.exit(2);
}, TIMEOUT_MS);
timer.unref();

async function main() {
  const start = Date.now();
  const args = process.argv.slice(2);
  const isQuick = args.includes('--quick');
  const forceSend = args.includes('--force-send');

  try {
    // 1. Collect
    const collector = require('./pipeline-dashboard-collector');
    const monitor = require('./autonomous-pipeline-monitor');
    const windowHours = isQuick ? 1 : 24;
    const snapshot = collector.collectAll({ windowHours });

    // 2. Delta
    const previous = collector.loadLastSnapshot();
    const delta = monitor.computeDelta(snapshot, previous);

    // 3. Persist
    collector.persist(snapshot);

    // 4. Generate report (full mode only)
    if (!isQuick) {
      const fs = require('fs');
      const path = require('path');
      const REPORTS_DIR = '/root/.openclaw/workspace/reports';
      if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
      const dateTag = new Date().toISOString().slice(0, 10);
      const report = monitor.generateMarkdownReport(snapshot, delta);
      fs.writeFileSync(path.join(REPORTS_DIR, `pipeline-dashboard-${dateTag}.md`), report);
    }

    // 5. Determine if we need to push notification
    const shouldPush = forceSend
      || snapshot.overall.status === 'critical'
      || (previous && previous.overall?.status !== 'critical' && snapshot.overall.status === 'critical')
      || (delta && delta.score_change != null && delta.score_change <= -10);

    // 6. Output structured summary
    const elapsed = Date.now() - start;
    const output = {
      status: 'OK',
      mode: isQuick ? 'quick' : 'full',
      overall: snapshot.overall.status,
      score: snapshot.overall.composite_score,
      alerts: snapshot.all_alerts.length,
      layers: {},
      push_triggered: shouldPush,
      elapsed_ms: elapsed,
      timestamp: new Date().toISOString(),
    };

    for (const [key, layer] of Object.entries(snapshot.layers)) {
      output.layers[key] = { status: layer.status, alerts: layer.alerts.length };
    }

    console.log(JSON.stringify(output));

    // 7. Push if needed (best-effort, don't fail the cron)
    if (shouldPush) {
      try {
        const card = monitor.generateFeishuCard(snapshot, delta);
        // Write card for later pickup by feishu-report-sender
        const fs = require('fs');
        const path = require('path');
        const cardQueue = '/root/.openclaw/workspace/reports/.card-queue';
        if (!fs.existsSync(cardQueue)) fs.mkdirSync(cardQueue, { recursive: true });
        fs.writeFileSync(
          path.join(cardQueue, `pipeline-dashboard-${Date.now()}.json`),
          JSON.stringify({ type: 'pipeline-dashboard', card, snapshot_status: snapshot.overall.status }, null, 2)
        );
        console.log(JSON.stringify({ push: 'queued', reason: shouldPush === true ? 'forced' : snapshot.overall.status }));
      } catch (e) {
        console.error(JSON.stringify({ push: 'failed', error: e.message }));
      }
    }

    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({
      status: 'ERROR',
      message: err.message,
      stack: (err.stack || '').split('\n').slice(0, 5),
      elapsed_ms: Date.now() - start,
      timestamp: new Date().toISOString(),
    }));
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  console.error(JSON.stringify({ status: 'FATAL', reason: 'uncaught', message: err.message }));
  process.exit(1);
});

main();
