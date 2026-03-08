module.exports = async function publishSilenceWatchdog(event, rule, context) {
  const watchdog = require('../../../skills/evomap-publisher/publish-silence-watchdog');

  const payload = event && event.payload ? event.payload : {};
  const config = {
    thresholdMinutes: payload.thresholdMinutes || rule.thresholdMinutes,
    lookbackHours: payload.lookbackHours || rule.lookbackHours,
    autoReplayLimit: payload.autoReplayLimit || rule.autoReplayLimit,
    alertCooldownMinutes: payload.alertCooldownMinutes || rule.alertCooldownMinutes,
  };

  const result = watchdog.run(config);

  if (context && typeof context.notify === 'function' && result.pendingCount > 0) {
    const preview = result.replayed.slice(0, 10).join(', ') || '无';
    context.notify('feishu', `⚠️ 发布静默巡检发现 ${result.pendingCount} 个超阈值窗口，已自动补发 ${result.replayed.length} 个。\n补发对象: ${preview}`, { severity: result.replayFailed.length > 0 ? 'high' : 'warning' });
  }

  return {
    success: result.replayFailed.length === 0,
    result,
  };
};
