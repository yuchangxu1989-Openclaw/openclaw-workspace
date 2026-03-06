const fs = require('fs');
const path = require('path');
const { exists, readText, readJson, walk, hasAny } = require('./p0-utils');

/**
 * AEO End-to-End Test Gate Handler
 * 
 * 规则意图：决策流水线变更后，必须通过端到端AEO测试
 * 感知：event_bus.handler.modified / isc.rule.created/modified / sprint.day.completion
 * 执行：扫描测试报告，验证真实事件覆盖，通过→gate.passed，不通过→gate.blocked + throw
 */
module.exports = async function(event, rule, context) {
  const logger = context.logger || console;
  const bus = context.bus;
  const workspace = context.workspace || process.cwd();

  logger.info(`[aeo-e2e-test] Triggered by ${event.type}`, { eventId: event.id });

  try {
    // === 感知：定位测试报告 ===
    const reportsDir = path.join(workspace, 'reports');
    const aeoDir = path.join(workspace, 'skills/isc-core/aeo');
    const reportFiles = [];

    // 扫描 reports/ 目录
    if (await exists(reportsDir)) {
      const reportWalk = await walk(reportsDir);
      for (const f of reportWalk) {
        if (f.endsWith('.json') && (f.includes('aeo') || f.includes('e2e') || f.includes('test'))) {
          reportFiles.push(f);
        }
      }
    }

    // 扫描 skills/isc-core/aeo/ 目录
    if (await exists(aeoDir)) {
      const aeoWalk = await walk(aeoDir);
      for (const f of aeoWalk) {
        if (f.endsWith('.json') && (f.includes('report') || f.includes('result'))) {
          reportFiles.push(f);
        }
      }
    }

    logger.info(`[aeo-e2e-test] Found ${reportFiles.length} test report(s)`);

    // === 判断：报告是否存在 ===
    if (reportFiles.length === 0) {
      const failResult = {
        status: 'BLOCKED',
        reason: 'No AEO test reports found in reports/ or skills/isc-core/aeo/',
        timestamp: new Date().toISOString(),
        trigger: event.type
      };

      logger.warn('[aeo-e2e-test] GATE BLOCKED: No test reports found');

      if (bus) {
        await bus.emit('sprint.day.gate.blocked', {
          source: 'aeo-e2e-test',
          reason: failResult.reason,
          trigger: event.type
        });
      }

      throw new Error(`AEO E2E Gate Blocked: ${failResult.reason}`);
    }

    // === 执行：验证每份报告 ===
    const validationResults = [];
    let allPassed = true;
    const issues = [];

    for (const reportPath of reportFiles) {
      try {
        const report = await readJson(reportPath);

        const validation = {
          file: path.relative(workspace, reportPath),
          passed: false,
          checks: {}
        };

        // 检查1：报告是否标记通过
        const hasPassed = report.status === 'passed' || report.result === 'pass' || report.success === true;
        validation.checks.statusPassed = hasPassed;

        // 检查2：数据源是否真实（非mock/synthetic）
        const dataSource = report.dataSource || report.data_source || report.source || '';
        const isRealData = !['mock', 'synthetic', 'fake', 'stub', 'test-fixture'].some(
          tag => String(dataSource).toLowerCase().includes(tag)
        );
        validation.checks.realDataSource = isRealData;

        // 检查3：是否有真实事件覆盖
        const eventsCovered = report.events_covered || report.eventsCovered || report.coverage || [];
        const hasRealEvents = Array.isArray(eventsCovered) ? eventsCovered.length > 0 : !!eventsCovered;
        validation.checks.realEventCoverage = hasRealEvents;

        // 检查4：时间戳合理性（不超过7天）
        const reportTime = report.timestamp || report.created_at || report.date;
        let isFresh = true;
        if (reportTime) {
          const reportDate = new Date(reportTime);
          const now = new Date();
          const daysDiff = (now - reportDate) / (1000 * 60 * 60 * 24);
          isFresh = daysDiff <= 7;
        }
        validation.checks.freshReport = isFresh;

        validation.passed = hasPassed && isRealData && hasRealEvents && isFresh;

        if (!validation.passed) {
          allPassed = false;
          const failedChecks = Object.entries(validation.checks)
            .filter(([, v]) => !v)
            .map(([k]) => k);
          issues.push(`${validation.file}: failed checks [${failedChecks.join(', ')}]`);
        }

        validationResults.push(validation);
      } catch (parseErr) {
        logger.error(`[aeo-e2e-test] Failed to parse report: ${reportPath}`, parseErr);
        issues.push(`${path.relative(workspace, reportPath)}: parse error - ${parseErr.message}`);
        allPassed = false;
      }
    }

    // === 闭环：emit结果 ===
    if (allPassed) {
      logger.info('[aeo-e2e-test] GATE PASSED: All AEO E2E tests validated');

      if (bus) {
        await bus.emit('sprint.day.gate.passed', {
          source: 'aeo-e2e-test',
          reports: validationResults.length,
          trigger: event.type,
          timestamp: new Date().toISOString()
        });
      }

      return {
        status: 'PASSED',
        reportsValidated: validationResults.length,
        validations: validationResults,
        timestamp: new Date().toISOString()
      };
    } else {
      logger.warn('[aeo-e2e-test] GATE BLOCKED', { issues });

      if (bus) {
        await bus.emit('sprint.day.gate.blocked', {
          source: 'aeo-e2e-test',
          issues,
          reports: validationResults,
          trigger: event.type
        });
      }

      throw new Error(`AEO E2E Gate Blocked: ${issues.join('; ')}`);
    }
  } catch (err) {
    if (err.message.startsWith('AEO E2E Gate Blocked')) {
      throw err; // re-throw gate blocks
    }
    logger.error('[aeo-e2e-test] Unexpected error', err);
    throw err;
  }
};
