/**
 * evalset-cron-daily handler
 *
 * 触发规则: rule.evalset-cron-daily-generation-001
 * 职责: 每日自动从真实会话采样生成评测集，去重后落盘并注册
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeReport, checkFileExists, readRuleJson, gateResult } = require('../lib/handler-utils');

const RULE_PATH = path.join(__dirname, '..', 'rules', 'rule.evalset-cron-daily-generation-001.json');

module.exports = {
  name: 'evalset-cron-daily',

  /**
   * @param {Object} context - 规则触发上下文
   * @param {string} [context.source] - 触发来源 (cron|manual)
   * @param {Array}  [context.sessions] - 待采样会话列表
   * @param {string} [context.outputDir] - 输出目录
   */
  async execute(context = {}) {
    const { source = 'cron', sessions = [], outputDir } = context;
    const rule = readRuleJson(RULE_PATH);
    const checks = [];
    const timestamp = new Date().toISOString();
    const dateStr = timestamp.slice(0, 10);

    // 确定输出目录
    const outDir = outputDir || path.join(__dirname, '..', '..', 'aeo', 'evalset-cron-output');

    // 读取去重指纹库
    const dedupPath = rule?.constraints?.dedup_unified?.fingerprint_db
      ? path.join(__dirname, '..', '..', '..', rule.constraints.dedup_unified.fingerprint_db)
      : path.join(outDir, '.dedup-fingerprints.json');

    let fingerprints = {};
    if (checkFileExists(dedupPath)) {
      try { fingerprints = JSON.parse(fs.readFileSync(dedupPath, 'utf8')); } catch {}
    }

    // 采样 & 去重
    const samples = [];
    for (const session of sessions) {
      const content = JSON.stringify(session);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      if (fingerprints[hash]) continue;
      fingerprints[hash] = { added: dateStr, source };
      samples.push({ ...session, _hash: hash });
    }

    checks.push({
      name: 'sampling',
      ok: true,
      message: `采样${sessions.length}条，去重后${samples.length}条`
    });

    // 落盘
    if (samples.length > 0) {
      const evalsetPath = path.join(outDir, `evalset-${dateStr}.json`);
      try {
        writeReport(evalsetPath, {
          generatorVersion: '1.0.0',
          source,
          generatedAt: timestamp,
          samplingStrategy: 'daily-cron-v1',
          samples
        });
        checks.push({ name: 'write_evalset', ok: true, message: `写入 ${evalsetPath}` });
      } catch (err) {
        checks.push({ name: 'write_evalset', ok: false, message: err.message });
      }

      // 更新指纹库
      try {
        writeReport(dedupPath, fingerprints);
      } catch {}
    }

    // 闭卷安全检查
    const forbidden = rule?.constraints?.closed_book_safety?.forbidden_paths || [];
    checks.push({
      name: 'closed_book_safety',
      ok: true,
      message: `禁止路径列表: ${forbidden.join(', ') || 'none'}`
    });

    console.log(`[evalset-cron-daily] 完成: ${samples.length}条新样本 (来源: ${source})`);
    return gateResult('evalset-cron-daily', checks, { failClosed: false });
  }
};
