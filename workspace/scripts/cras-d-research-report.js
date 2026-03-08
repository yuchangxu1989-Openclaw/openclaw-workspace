const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(WORKSPACE, 'reports');
const CRAS_DIR = path.join(WORKSPACE, 'skills', 'cras');
const INSIGHTS_DIR = path.join(CRAS_DIR, 'insights');
const KNOWLEDGE_DIR = path.join(CRAS_DIR, 'knowledge');
const OBS_DIR = path.join(WORKSPACE, 'infrastructure', 'observability');
const EVENT_BUS_DIR = path.join(WORKSPACE, 'infrastructure', 'event-bus');
const TASKS_DIR = path.join(WORKSPACE, 'skills', 'dto-core', 'tasks');
const ROUTES_PATH = path.join(WORKSPACE, 'infrastructure', 'dispatcher', 'routes.json');
const TRACKER_PATH = path.join(WORKSPACE, 'PROJECT-TRACKER.md');
const TODO_PATH = path.join(WORKSPACE, 'todo.md');

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

function readJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf-8'); } catch { return ''; }
}

function listFiles(dir, suffixes = []) {
  try {
    return fs.readdirSync(dir)
      .filter(name => suffixes.length === 0 || suffixes.some(s => name.endsWith(s)))
      .map(name => path.join(dir, name));
  } catch {
    return [];
  }
}

function newestByMtime(files) {
  return files
    .map(file => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.file || null;
}

function extractTodoItems(content) {
  return content.split('\n')
    .map(line => line.trim())
    .filter(line => /^[-*]\s|^\d+\.\s/.test(line));
}

function summarizeTasks(tasks) {
  const recent = tasks
    .map(task => {
      const stat = fs.statSync(task);
      const content = readJson(task, {});
      return {
        file: path.basename(task),
        mtime: stat.mtimeMs,
        title: content.title || content.task || content.name || path.basename(task),
        status: content.status || content.state || 'unknown',
        priority: content.priority || 'unknown'
      };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const statusCount = {};
  for (const item of recent) statusCount[item.status] = (statusCount[item.status] || 0) + 1;
  return {
    total: recent.length,
    statusCount,
    recent: recent.slice(0, 8)
  };
}

function inferSourceQuality(results = []) {
  const domains = new Set();
  let academic = 0;
  let docs = 0;
  let vendor = 0;
  let community = 0;
  for (const r of results) {
    try {
      const host = new URL(r.url).hostname.replace(/^www\./, '');
      domains.add(host);
      if (/arxiv|acm|ieee|nature|science|openreview/.test(host)) academic += 1;
      else if (/docs\.|github\.com|openai\.github\.io/.test(host)) docs += 1;
      else if (/microsoft|google|aws|anthropic|openai|ibm/.test(host)) vendor += 1;
      else if (/reddit|medium|linkedin/.test(host)) community += 1;
    } catch {}
  }
  return { domains: [...domains], academic, docs, vendor, community };
}

function buildFeishuMarkdown(summary) {
  const lines = [];
  const recentTasks = summary.local.taskSummary.recent || [];
  lines.push(`# CRAS-D 研究→策略→执行闭环报告`);
  lines.push('');
  lines.push(`> 发布形态：Markdown / Feishu Doc Ready`);
  lines.push('');
  lines.push(`- 生成时间: ${summary.generatedAt}`);
  lines.push(`- 目标任务: ${summary.job}`);
  lines.push(`- 研究源文件: ${summary.sourceFile || 'unknown'}`);
  lines.push(`- 本地状态摘要: manual-queue=${summary.local.manualQueueBacklog}, open_tasks=${summary.local.taskSummary.total}, todo_items=${summary.local.todoCount}`);
  lines.push('');
  lines.push('## 一、研究源质量');
  lines.push('');
  lines.push('| 指标 | 数值 |');
  lines.push('| --- | ---: |');
  lines.push(`| 查询数 | ${summary.research.queryCount} |`);
  lines.push(`| 命中来源域名数 | ${summary.research.sourceQuality.domains.length} |`);
  lines.push(`| 学术源 | ${summary.research.sourceQuality.academic} |`);
  lines.push(`| 官方文档/GitHub | ${summary.research.sourceQuality.docs} |`);
  lines.push(`| 厂商源 | ${summary.research.sourceQuality.vendor} |`);
  lines.push(`| 社区/二手解读 | ${summary.research.sourceQuality.community} |`);
  lines.push('');
  lines.push('## 二、本地系统状态');
  lines.push('');
  lines.push('| 指标 | 数值 |');
  lines.push('| --- | ---: |');
  lines.push(`| manual-queue backlog | ${summary.local.manualQueueBacklog} |`);
  lines.push(`| stale warning events | ${summary.local.staleWarningCount} |`);
  lines.push(`| DTO任务总数 | ${summary.local.taskSummary.total} |`);
  lines.push(`| Tracker中未完成段命中 | ${summary.local.trackerOpenSignals} |`);
  lines.push(`| 路由总数 | ${summary.local.routeCount} |`);
  lines.push('');
  lines.push('## 三、关键行动建议');
  lines.push('');
  for (const item of summary.actions) {
    lines.push(`### ${item.id}. ${item.title}`);
    lines.push(`- 依据: ${item.basis}`);
    lines.push(`- 本地缺口: ${item.localGap}`);
    lines.push(`- 执行动作: ${item.execution}`);
    lines.push(`- 验证: ${item.verification}`);
    lines.push('');
  }
  lines.push('## 四、近期任务/队列');
  lines.push('');
  lines.push('| 状态 | 任务 | 优先级 |');
  lines.push('| --- | --- | --- |');
  for (const task of recentTasks) {
    lines.push(`| ${task.status} | ${task.title} | ${task.priority} |`);
  }
  lines.push('');
  lines.push('## 五、发布接入说明');
  lines.push('');
  lines.push('- 本 Markdown 可直接作为飞书文档正文原件发送。');
  lines.push('- 配套 summary.json 可供后续脚本读取 actions / metrics / sourceQuality。');
  lines.push('- 推荐交付链路：`scripts/cras-d-doc-publish.js` → `skills/cras/feishu_queue/*.json` → `skills/feishu-report-sender/index.js`。');
  return lines.join('\n');
}

function main() {
  const latestResearch = newestByMtime(listFiles(INSIGHTS_DIR, ['.json']));
  const research = latestResearch ? readJson(latestResearch, {}) : {};
  const rawResults = Array.isArray(research.rawResults) ? research.rawResults : [];
  const flattened = rawResults.flatMap(x => Array.isArray(x.results) ? x.results : []);
  const sourceQuality = inferSourceQuality(flattened);

  const events = readJsonl(path.join(EVENT_BUS_DIR, 'events.jsonl'));
  const manualQueueBacklog = events.filter(e => e.type === 'manual-queue.backlog.warning').slice(-1)[0]?.payload?.backlogSize || 0;
  const staleWarningCount = events.filter(e => e.type === 'manual-queue.item.stale').length;
  const taskSummary = summarizeTasks(listFiles(TASKS_DIR, ['.json']));
  const tracker = readText(TRACKER_PATH);
  const todoText = readText(TODO_PATH);
  const routes = readJson(ROUTES_PATH, {});

  const summary = {
    generatedAt: new Date().toISOString(),
    job: 'CRAS-D-战略行研与产品规划',
    sourceFile: latestResearch ? path.relative(WORKSPACE, latestResearch) : null,
    research: {
      queryCount: Array.isArray(research.queries) ? research.queries.length : 0,
      queries: research.queries || [],
      insightCount: Array.isArray(research.insights) ? research.insights.length : 0,
      sourceQuality
    },
    local: {
      manualQueueBacklog,
      staleWarningCount,
      taskSummary,
      trackerOpenSignals: (tracker.match(/🔴|⏳|未关闭|遗留/g) || []).length,
      todoCount: extractTodoItems(todoText).length,
      routeCount: Object.keys(routes).filter(k => k !== 'routes').length
    }
  };

  summary.actions = [
    {
      id: 'A1',
      title: '把研究源从二手社区文扩展到学术/官方优先采样',
      basis: `当前最新研究命中 academic=${sourceQuality.academic}, docs=${sourceQuality.docs}, community=${sourceQuality.community}`,
      localGap: '现有 research-*.json 以 Medium/LinkedIn/博客聚合为主，学术与官方文档占比偏低。',
      execution: '在 CRAS-D 查询生成中增加 arXiv/OpenReview/GitHub/docs 厂商文档优先模板，并对社区文章降权。',
      verification: '下一版 research 输出中 academic+docs 命中数 > community。'
    },
    {
      id: 'A2',
      title: '将研究结论绑定本地执行压力与积压',
      basis: `manual-queue backlog=${manualQueueBacklog}, stale=${staleWarningCount}, recent DTO tasks=${taskSummary.total}`,
      localGap: '现有洞察文件偏外部趋势总结，缺少对 manual-queue、DTO任务、tracker 遗留的直接映射。',
      execution: '生成 insight-action-map，把每条洞察映射到 backlog 清理、路由补齐、监控口径修复或 roadmap 任务。',
      verification: '报告中每条建议必须含本地缺口字段与验证命令。'
    },
    {
      id: 'A3',
      title: '生成 Feishu Doc 友好的结构化材料',
      basis: '当前 CRAS 报告多为 JSON，飞书可读性弱。',
      localGap: '缺少统一 Markdown/Doc 模板、关键指标表、任务卡片和执行清单。',
      execution: '输出 markdown + summary.json 双产物；markdown 采用飞书标题、表格、任务卡风格。',
      verification: '生成 report markdown，可直接写入 Feishu Doc。'
    },
    {
      id: 'A4',
      title: '把研究结论接入 Tracker / todo / DTO 任务树',
      basis: `todo_items=${extractTodoItems(todoText).length}, tracker_open_signals=${summary.local.trackerOpenSignals}`,
      localGap: '研究模块未持续把战略建议沉淀成项目管理对象。',
      execution: '从报告中输出 action cards，明确 owner、目标文件、验证命令，供 project-mgmt / DTO 直接消费。',
      verification: 'summary.json 中 actions 数组可被脚本化读取。'
    }
  ];

  const outJson = path.join(REPORTS_DIR, 'cras-d-research-strategy-summary.json');
  const outMd = path.join(REPORTS_DIR, 'cras-d-research-strategy-summary.md');
  fs.writeFileSync(outJson, JSON.stringify(summary, null, 2));
  fs.writeFileSync(outMd, buildFeishuMarkdown(summary));
  console.log(JSON.stringify({ ok: true, outJson, outMd, sourceFile: summary.sourceFile }, null, 2));
}

main();
