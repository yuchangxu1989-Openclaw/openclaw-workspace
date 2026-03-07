#!/usr/bin/env node
/**
 * 飞书报告发送器
 * 读取CRAS和EvoMap的报告队列，实际发送到飞书
 */

const fs = require('fs');
const path = require('path');
const { WORKSPACE, SKILLS_DIR } = require('../shared/paths');
const { autoSendArtifact } = require('../public/file-sender/artifact-auto-send');

const QUEUE_PATHS = [
  path.join(SKILLS_DIR, 'cras/feishu_queue'),
  path.join(WORKSPACE, 'evolver/reports')
];

const SENT_PATH = path.join(WORKSPACE, 'feishu_sent_reports');
const LOG_DIR = path.join(WORKSPACE, 'infrastructure', 'logs');
const DELIVERY_AUDIT = path.join(LOG_DIR, 'md-report-delivery.jsonl');
const ALERTS_FILE = path.join(LOG_DIR, 'alerts.jsonl');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function appendJsonl(file, entry) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

function appendAlert(entry) {
  appendJsonl(ALERTS_FILE, {
    timestamp: new Date().toISOString(),
    handler: 'feishu-report-sender',
    severity: entry.severity || 'error',
    acknowledged: false,
    ...entry,
  });
}

function isMarkdownFile(filePath) {
  return path.extname(String(filePath || '')).toLowerCase() === '.md';
}

function resolveArtifactPath(report = {}) {
  return report.artifact_path || report.file_path || report.report_path || report.source_file || report.output_file || report.original_file || null;
}

class FeishuReportSender {
  constructor() {
    this.ensureDirectories();
    this.targetUser = process.env.FEISHU_TARGET_USER || 'ou_a113e465324cc55f9ab3348c9a1a7b9b';
  }

  ensureDirectories() {
    if (!fs.existsSync(SENT_PATH)) {
      fs.mkdirSync(SENT_PATH, { recursive: true });
    }
    ensureDir(LOG_DIR);
  }

  findPendingReports() {
    const reports = [];
    for (const queuePath of QUEUE_PATHS) {
      if (!fs.existsSync(queuePath)) continue;
      const files = fs.readdirSync(queuePath)
        .filter(f => f.endsWith('.json'))
        .map(f => ({ path: path.join(queuePath, f), name: f, queue: queuePath }));
      reports.push(...files);
    }
    return reports.sort((a, b) => {
      const timeA = parseInt(a.name.match(/\d+/)?.[0] || 0);
      const timeB = parseInt(b.name.match(/\d+/)?.[0] || 0);
      return timeA - timeB;
    });
  }

  async sendReport(reportFile) {
    try {
      const content = fs.readFileSync(reportFile.path, 'utf8');
      const report = JSON.parse(content);
      const cardContent = report.card || this.buildDefaultCard(report);

      const sendQueuePath = path.join(WORKSPACE, 'feishu_send_queue');
      if (!fs.existsSync(sendQueuePath)) {
        fs.mkdirSync(sendQueuePath, { recursive: true });
      }

      const sendFile = path.join(sendQueuePath, `send_${Date.now()}_${reportFile.name}`);
      fs.writeFileSync(sendFile, JSON.stringify({
        target: this.targetUser,
        card: cardContent,
        original: reportFile.path,
        timestamp: Date.now()
      }, null, 2));

      console.log(`[FeishuSender] 报告已准备发送: ${reportFile.name}`);

      let artifactSend = null;
      const artifactPath = resolveArtifactPath(report);
      const mustSendArtifact = isMarkdownFile(artifactPath);

      if (artifactPath) {
        try {
          artifactSend = await autoSendArtifact({
            filePath: artifactPath,
            receiveId: report.target || this.targetUser,
            receiveIdType: report.receive_id_type,
            filename: report.filename,
            required: mustSendArtifact,
            source: `feishu-report-sender:${reportFile.name}`
          });

          appendJsonl(DELIVERY_AUDIT, {
            reportFile: reportFile.name,
            artifactPath,
            artifactExt: path.extname(artifactPath || '').toLowerCase(),
            required: mustSendArtifact,
            success: !!artifactSend?.success,
            skipped: !!artifactSend?.skipped,
            result: artifactSend || null,
          });

          if (mustSendArtifact && !artifactSend?.success) {
            const message = `MD 报告源文件未成功发给用户: ${artifactPath}`;
            console.error(`[FeishuSender] ${message}`);
            appendAlert({
              eventType: 'md_report.auto_send.failed',
              message,
              reportFile: reportFile.name,
              artifactPath,
            });
            return { success: false, error: message, artifactSend };
          }
        } catch (artifactError) {
          console.error(`[FeishuSender] 原文件自动发送失败 ${reportFile.name}: ${artifactError.message}`);
          appendJsonl(DELIVERY_AUDIT, {
            reportFile: reportFile.name,
            artifactPath,
            artifactExt: path.extname(artifactPath || '').toLowerCase(),
            required: mustSendArtifact,
            success: false,
            error: artifactError.message,
          });
          appendAlert({
            eventType: 'md_report.auto_send.failed',
            message: artifactError.message,
            reportFile: reportFile.name,
            artifactPath,
          });
          return { success: false, error: artifactError.message };
        }
      } else {
        const message = `[FeishuSender] 未找到可自动发送的原文件字段 ${reportFile.name}`;
        console.error(message);
        appendJsonl(DELIVERY_AUDIT, {
          reportFile: reportFile.name,
          artifactPath: null,
          required: false,
          success: false,
          error: 'missing_artifact_path',
        });
      }

      const sentFile = path.join(SENT_PATH, reportFile.name);
      fs.renameSync(reportFile.path, sentFile);
      return { success: true, sentFile, artifactSend };
    } catch (e) {
      console.error(`[FeishuSender] 发送失败 ${reportFile.name}:`, e.message);
      appendAlert({
        eventType: 'report.queue.send.failed',
        message: e.message,
        reportFile: reportFile.name,
      });
      return { success: false, error: e.message };
    }
  }

  buildDefaultCard(report) {
    return {
      config: { wide_screen_mode: true },
      header: {
        template: 'blue',
        title: { tag: 'plain_text', content: '📊 系统报告' }
      },
      elements: [
        {
          tag: 'div',
          text: { tag: 'plain_text', content: `生成时间: ${new Date(report.timestamp).toLocaleString('zh-CN')}` }
        },
        { tag: 'hr' },
        {
          tag: 'div',
          text: { tag: 'plain_text', content: '报告已生成，请查看详情。' }
        }
      ]
    };
  }

  async processAll() {
    console.log('[FeishuSender] 开始处理报告队列...');
    const reports = this.findPendingReports();
    console.log(`  发现 ${reports.length} 个待发送报告`);

    const results = [];
    for (const report of reports) {
      const result = await this.sendReport(report);
      results.push({ file: report.name, ...result });
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[FeishuSender] 完成: ${results.filter(r => r.success).length}/${results.length}`);
    return results;
  }
}

async function main() {
  const sender = new FeishuReportSender();
  await sender.processAll();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { FeishuReportSender, resolveArtifactPath, isMarkdownFile };
