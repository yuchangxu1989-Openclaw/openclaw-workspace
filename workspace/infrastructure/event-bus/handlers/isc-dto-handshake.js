const fs = require('fs');
const path = require('path');
const { exists, readText, readJson, walk } = require('./p0-utils');

/**
 * ISC-DTO定期握手机制
 * 感知：isc.rule.matched / isc.category.matched
 * 执行：双向扫描ISC规则与DTO订阅，对齐检查→自动修复→生成报告→闭环
 */
module.exports = async function(event, rule, context) {
  const workspace = (context && context.workspace) || '/root/.openclaw/workspace';
  const logger = context.logger;
  const bus = context.bus;

  logger.info('[isc-dto-handshake] 启动ISC-DTO双向握手');

  try {
    const rulesDir = path.join(workspace, 'infrastructure', 'isc', 'rules');
    const dtoDir = path.join(workspace, 'infrastructure', 'dto');
    const reportsDir = path.join(workspace, 'infrastructure', 'event-bus', 'reports');

    // 确保reports目录存在
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // 1. 扫描所有ISC规则，提取事件定义
    const iscEvents = new Map(); // eventName → ruleFile
    const ruleFiles = exists(rulesDir) ? walk(rulesDir, ['.json']) : [];
    
    for (const file of ruleFiles) {
      try {
        const ruleData = readJson(file);
        const triggers = ruleData?.trigger?.events || ruleData?.events || [];
        const triggerList = Array.isArray(triggers) ? triggers : [triggers];
        for (const evt of triggerList) {
          if (typeof evt === 'string') {
            iscEvents.set(evt, { rule: path.basename(file), file });
          }
        }
      } catch (e) {
        logger.warn(`[isc-dto-handshake] 解析规则失败: ${file}`, e.message);
      }
    }

    // 2. 扫描DTO订阅/映射
    const dtoSubscriptions = new Map(); // eventName → dtoFile
    const dtoFiles = exists(dtoDir) ? walk(dtoDir, ['.json', '.js']) : [];

    for (const file of dtoFiles) {
      try {
        if (file.endsWith('.json')) {
          const dtoData = readJson(file);
          const events = dtoData?.subscribes || dtoData?.events || dtoData?.triggers || [];
          const eventList = Array.isArray(events) ? events : [events];
          for (const evt of eventList) {
            if (typeof evt === 'string') {
              dtoSubscriptions.set(evt, { dto: path.basename(file), file });
            }
          }
        }
      } catch (e) {
        logger.warn(`[isc-dto-handshake] 解析DTO失败: ${file}`, e.message);
      }
    }

    // 3. 双向对齐检查
    const aligned = [];
    const iscOnly = []; // ISC有但DTO没有
    const dtoOnly = []; // DTO有但ISC没有

    for (const [evt, info] of iscEvents) {
      if (dtoSubscriptions.has(evt)) {
        aligned.push({ event: evt, isc: info.rule, dto: dtoSubscriptions.get(evt).dto });
      } else {
        iscOnly.push({ event: evt, rule: info.rule });
      }
    }

    for (const [evt, info] of dtoSubscriptions) {
      if (!iscEvents.has(evt)) {
        dtoOnly.push({ event: evt, dto: info.dto });
      }
    }

    const total = iscEvents.size + dtoOnly.length;
    const alignmentRate = total > 0 ? Math.round((aligned.length / total) * 100) : 100;

    // 4. 尝试自动修复不对齐
    const autoFixes = [];
    // 对于ISC有但DTO没有的，记录（DTO需要手动创建或自动生成骨架）
    for (const item of iscOnly) {
      logger.warn(`[isc-dto-handshake] ISC事件无DTO映射: ${item.event} (来自 ${item.rule})`);
      autoFixes.push({ type: 'isc_without_dto', event: item.event, action: 'needs_dto_mapping' });
    }
    for (const item of dtoOnly) {
      logger.warn(`[isc-dto-handshake] DTO订阅无ISC规则: ${item.event} (来自 ${item.dto})`);
      autoFixes.push({ type: 'dto_without_isc', event: item.event, action: 'orphan_subscription' });
    }

    // 5. 生成对齐报告
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalIscEvents: iscEvents.size,
        totalDtoSubscriptions: dtoSubscriptions.size,
        aligned: aligned.length,
        iscOnly: iscOnly.length,
        dtoOnly: dtoOnly.length,
        alignmentRate: `${alignmentRate}%`
      },
      aligned,
      iscOnly,
      dtoOnly,
      autoFixes
    };

    const reportPath = path.join(reportsDir, `isc-dto-handshake-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    logger.info(`[isc-dto-handshake] 对齐报告已写入: ${reportPath}`);

    // 6. 对齐率<90%则告警
    if (alignmentRate < 90) {
      const alertMsg = `⚠️ ISC-DTO对齐率低: ${alignmentRate}% (阈值90%)，${iscOnly.length}个ISC无DTO，${dtoOnly.length}个DTO无ISC`;
      logger.warn('[isc-dto-handshake]', alertMsg);
      bus.emit('isc.dto.alignment.warning', { alignmentRate, report });
      if (context.notify) context.notify(alertMsg);
    }

    bus.emit('isc.dto.handshake.completed', { alignmentRate, reportPath, summary: report.summary });
    logger.info('[isc-dto-handshake] 握手完成', report.summary);

    return {
      status: 'completed',
      alignmentRate,
      reportPath,
      summary: report.summary
    };
  } catch (err) {
    logger.error('[isc-dto-handshake] 执行失败:', err.message);
    bus.emit('isc.dto.handshake.failed', { error: err.message });
    throw err;
  }
};
