#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { autoSendArtifact } = require('../skills/public/file-sender/artifact-auto-send');

const WORKSPACE = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(WORKSPACE, 'reports');
const DEFAULT_REPORT_PATH = path.join(REPORTS_DIR, 'cras-d-research-strategy-summary.md');
const DEFAULT_SUMMARY_PATH = path.join(REPORTS_DIR, 'cras-d-research-strategy-summary.json');
const QUEUE_DIR = path.join(WORKSPACE, 'skills', 'cras', 'feishu_queue');
const LOG_DIR = path.join(WORKSPACE, 'infrastructure', 'logs');
const AUDIT_PATH = path.join(LOG_DIR, 'cras-d-doc-publish.jsonl');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function appendJsonl(file, entry) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function buildCard(summary, mdPath) {
  const actions = Array.isArray(summary?.actions) ? summary.actions : [];
  const topActions = actions.slice(0, 3)
    .map(item => `- **${item.id} ${item.title}**：${item.localGap}`)
    .join('\n');

  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: '📘 CRAS-D 研究策略闭环报告' }
    },
    elements: [
      {
        tag: 'markdown',
        content: [
          `**生成时间**：${summary.generatedAt || 'unknown'}`,
          `**任务**：${summary.job || 'CRAS-D'}`,
          `**源文件**：${summary.sourceFile || 'unknown'}`,
          `**本地产物**：${path.relative(WORKSPACE, mdPath)}`
        ].join('\n')
      },
      { tag: 'hr' },
      {
        tag: 'markdown',
        content: [
          '### 关键指标',
          `- manual-queue backlog：${summary?.local?.manualQueueBacklog ?? 'n/a'}`,
          `- stale warnings：${summary?.local?.staleWarningCount ?? 'n/a'}`,
          `- DTO任务总数：${summary?.local?.taskSummary?.total ?? 'n/a'}`,
          `- Tracker未完成信号：${summary?.local?.trackerOpenSignals ?? 'n/a'}`
        ].join('\n')
      },
      { tag: 'hr' },
      {
        tag: 'markdown',
        content: `### Top Actions\n${topActions || '- 无'}`
      },
      { tag: 'hr' },
      {
        tag: 'markdown',
        content: 'Markdown 原件已随队列挂载，可直接通过现有 feishu-report-sender / artifact-auto-send 发送。'
      }
    ]
  };
}

function buildQueuePayload({ summary, mdPath, summaryPath, target, receiveIdType }) {
  const timestamp = Date.now();
  return {
    kind: 'cras-d.research-strategy-summary',
    timestamp,
    title: 'CRAS-D 研究策略闭环报告',
    source: 'scripts/cras-d-doc-publish.js',
    artifact_path: mdPath,
    file_path: mdPath,
    source_file: mdPath,
    summary_path: summaryPath,
    filename: path.basename(mdPath),
    target: target || process.env.FEISHU_TARGET_USER || null,
    receive_id_type: receiveIdType || process.env.ARTIFACT_AUTO_SEND_TARGET_TYPE || process.env.FEISHU_TARGET_TYPE || null,
    card: buildCard(summary, mdPath),
    metadata: {
      generatedAt: summary.generatedAt || null,
      sourceFile: summary.sourceFile || null,
      local: summary.local || {},
      research: {
        queryCount: summary?.research?.queryCount ?? null,
        insightCount: summary?.research?.insightCount ?? null,
        sourceQuality: summary?.research?.sourceQuality || null,
      },
      actions: summary.actions || []
    }
  };
}

async function directPublish({ mdPath, target, receiveIdType, filename }) {
  const result = await autoSendArtifact({
    filePath: mdPath,
    receiveId: target,
    receiveIdType,
    filename: filename || path.basename(mdPath),
    required: true,
    source: 'cras-d-doc-publish:direct'
  });
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const direct = args.includes('--direct-publish');
  const validateOnly = args.includes('--validate-only');
  const mdArg = args.find(arg => arg.startsWith('--md='));
  const summaryArg = args.find(arg => arg.startsWith('--summary='));
  const targetArg = args.find(arg => arg.startsWith('--target='));
  const receiveTypeArg = args.find(arg => arg.startsWith('--receive-id-type='));

  const mdPath = path.resolve(mdArg ? mdArg.split('=')[1] : DEFAULT_REPORT_PATH);
  const summaryPath = path.resolve(summaryArg ? summaryArg.split('=')[1] : DEFAULT_SUMMARY_PATH);
  const target = targetArg ? targetArg.split('=')[1] : undefined;
  const receiveIdType = receiveTypeArg ? receiveTypeArg.split('=')[1] : undefined;

  if (!fs.existsSync(mdPath)) throw new Error(`Markdown 报告不存在: ${mdPath}`);
  if (!fs.existsSync(summaryPath)) throw new Error(`Summary JSON 不存在: ${summaryPath}`);

  const markdown = readText(mdPath);
  const summary = readJson(summaryPath, {});
  if (!markdown.trim().startsWith('#')) throw new Error('Markdown 报告缺少标题，未达到 Doc-ready 最低要求');
  if (!Array.isArray(summary.actions) || summary.actions.length === 0) throw new Error('Summary JSON 缺少 actions，未达到 Doc-ready 要求');

  const queuePayload = buildQueuePayload({ summary, mdPath, summaryPath, target, receiveIdType });
  ensureDir(QUEUE_DIR);
  const queueFile = path.join(QUEUE_DIR, `cras_d_research_strategy_${Date.now()}.json`);
  fs.writeFileSync(queueFile, JSON.stringify(queuePayload, null, 2));

  const result = {
    ok: true,
    mode: direct ? 'direct-publish' : validateOnly ? 'validate-only' : 'doc-ready',
    mdPath,
    summaryPath,
    queueFile,
    integrationPoints: [
      'scripts/cras-d-research-report.js -> reports/cras-d-research-strategy-summary.{md,json}',
      'scripts/cras-d-doc-publish.js -> skills/cras/feishu_queue/*.json',
      'skills/feishu-report-sender/index.js -> resolveArtifactPath(report) + autoSendArtifact(markdown)',
      'skills/public/file-sender/artifact-auto-send.js -> FileSender.sendFile()'
    ],
    published: false
  };

  appendJsonl(AUDIT_PATH, { stage: 'queue', queueFile, mdPath, summaryPath, direct });

  if (direct) {
    try {
      result.publishResult = await directPublish({ mdPath, target, receiveIdType, filename: queuePayload.filename });
      result.published = !!result.publishResult?.success;
      appendJsonl(AUDIT_PATH, {
        stage: 'direct-publish',
        queueFile,
        mdPath,
        success: result.published,
        publishResult: result.publishResult
      });
    } catch (error) {
      result.published = false;
      result.publishError = error.message;
      appendJsonl(AUDIT_PATH, {
        stage: 'direct-publish',
        queueFile,
        mdPath,
        success: false,
        error: error.message
      });
      throw error;
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error(`[cras-d-doc-publish] 失败: ${error.message}`);
  process.exit(1);
});
