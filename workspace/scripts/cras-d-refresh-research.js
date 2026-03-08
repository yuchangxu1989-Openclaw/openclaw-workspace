#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { search } = require('../skills/public/tavily-search/index.js');

const WORKSPACE = path.resolve(__dirname, '..');
const INSIGHTS_DIR = path.join(WORKSPACE, 'skills', 'cras', 'insights');
const EVENTS_PATH = path.join(WORKSPACE, 'infrastructure', 'event-bus', 'events.jsonl');
const TASKS_DIR = path.join(WORKSPACE, 'skills', 'dto-core', 'tasks');
const TRACKER_PATH = path.join(WORKSPACE, 'PROJECT-TRACKER.md');

function readJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  } catch {
    return [];
  }
}

function recentSignals() {
  const events = readJsonl(EVENTS_PATH);
  const stale = events.filter(e => e.type === 'manual-queue.item.stale').length;
  const backlog = events.filter(e => e.type === 'manual-queue.backlog.warning').slice(-1)[0]?.payload?.backlogSize || 0;
  const taskCount = (() => { try { return fs.readdirSync(TASKS_DIR).filter(f => f.endsWith('.json')).length; } catch { return 0; } })();
  const tracker = (() => { try { return fs.readFileSync(TRACKER_PATH, 'utf-8'); } catch { return ''; } })();
  const trackerOpen = (tracker.match(/🔴|⏳|未关闭|遗留/g) || []).length;
  return { stale, backlog, taskCount, trackerOpen };
}

function buildQueries(sig) {
  return [
    'site:arxiv.org OR site:openreview.net multi-agent orchestration evaluation benchmark 2026',
    'site:github.com OR site:docs.langchain.com OR site:openai.github.io agent orchestration production observability memory evaluation',
    `AI agent autonomy execution backlog routing evaluation case studies ${sig.backlog > 0 ? 'manual queue backlog reliability' : 'reliability'}`,
    `Feishu doc interactive reporting automation markdown best practices AI operations ${sig.trackerOpen > 0 ? 'task tracker integration' : ''}`,
    `research to product strategy mapping AI agents roadmap local system state ${sig.taskCount > 0 ? 'execution backlog' : ''}`
  ].map(q => q.replace(/\s+/g, ' ').trim());
}

async function main() {
  const sig = recentSignals();
  const queries = buildQueries(sig);
  const rawResults = [];
  for (const topic of queries) {
    const result = await search(topic, { maxResults: 6, depth: 'advanced', includeAnswer: true, topic: 'general' });
    rawResults.push({ topic, answer: result.answer || '', results: result.results || [] });
  }

  const insights = [
    {
      id: 'signal-driven-source-priority',
      theme: '高质量源情报优先级',
      finding: '研究源应优先学术论文、官方文档、GitHub/规范，其次厂商发布，最后才是二手博客/社区二次解读。',
      implication: '当前 CRAS-D 外部情报应从“泛搜索摘要”升级到“源质量分层采样 + 降权社区内容”。'
    },
    {
      id: 'research-to-execution-map',
      theme: '研究必须绑定本地执行状态',
      finding: `当前本地 backlog=${sig.backlog}, stale=${sig.stale}, dto_tasks=${sig.taskCount}, tracker_open=${sig.trackerOpen}，说明研究报告必须直接回答“该先修什么”。`,
      implication: '外部趋势只在能映射到现有路由、队列、仪表盘、任务树时才有价值。'
    },
    {
      id: 'feishu-ready-reporting',
      theme: '飞书文档友好交付',
      finding: '高层读物应采用摘要、状态表、行动卡、验证命令与责任对象分区，避免只输出 JSON。',
      implication: 'CRAS-D 需要同时产出 markdown/doc-ready 材料与机器可读 JSON。'
    }
  ];

  const out = {
    generatedAt: new Date().toISOString(),
    timezone: 'Asia/Shanghai',
    module: 'CRAS-D 战略行研与产品规划',
    localSignals: sig,
    queries,
    rawResults,
    insights
  };

  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(INSIGHTS_DIR, `research-${date}-signal-driven.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: true, file, queries: queries.length, stale: sig.stale, backlog: sig.backlog }, null, 2));
}

main().catch(err => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
