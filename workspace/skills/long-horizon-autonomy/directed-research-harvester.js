#!/usr/bin/env node
/**
 * 定向学术研究探针 v1.0
 * 
 * 每天定时搜索指定课题的最新研究，发现有价值洞察后
 * 自动启动本地系统排查 → 生成优化方案 → 写入DTO任务
 * 
 * 课题列表可动态扩展
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const WORKSPACE = '/root/.openclaw/workspace';
const REPORT_DIR = path.join(WORKSPACE, 'reports/research-signals/directed');
const INSIGHT_DIR = path.join(WORKSPACE, 'reports/research-signals/insights');
const EVENT_BUS = path.join(WORKSPACE, 'infrastructure/event-bus/events.jsonl');

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.mkdirSync(INSIGHT_DIR, { recursive: true });

/**
 * 定向研究课题注册表
 * 每个课题包含：搜索关键词、本地排查脚本、优化方向
 */
const RESEARCH_TOPICS = [
  {
    id: 'meta-cognition-unknown-unknowns',
    name: '知道自己不知道 (Known Unknowns / Unknown Unknowns)',
    description: 'AI系统如何识别自身认知盲区、能力边界、知识缺口',
    search_queries: [
      'AI metacognition self-awareness unknown unknowns',
      'LLM calibration uncertainty estimation blind spots',
      'agent self-reflection capability boundary detection',
      'AI epistemic humility knowledge gap identification',
      'autonomous agent self-diagnosis limitation awareness'
    ],
    local_scan: {
      description: '扫描本地系统的认知盲区',
      checks: [
        '检查意图识别的no-match率和未知意图候选',
        '检查规则库中缺少感知/执行层的规则数量',
        '检查handler_not_found的模式是否暗示能力缺失',
        '检查告警响应率（被忽视的告警=不知道自己应该知道的）',
        '检查评测集覆盖率vs实际场景覆盖率的差距'
      ],
      script: 'infrastructure/self-check/unknown-unknowns-scanner.js'
    },
    optimization_targets: [
      '未知意图自动发现机制',
      '能力边界自动检测',
      '认知盲区定期自查',
      '告警响应完整性'
    ]
  },
  {
    id: 'agent-self-improvement',
    name: 'Agent自主进化',
    search_queries: [
      'autonomous agent self-improvement loop',
      'LLM agent continuous learning self-evolution',
      'AI system automatic capability expansion'
    ],
    local_scan: {
      description: '扫描进化机制的完整性',
      checks: [
        '检查evolver技能的运行频率和产出',
        '检查CRAS的学习闭环是否真正闭合',
        '检查ISC规则的全链路展开率'
      ]
    }
  },
  {
    id: 'multi-agent-coordination',
    name: '多Agent协同',
    search_queries: [
      'multi-agent coordination task decomposition',
      'LLM agent collaboration delegation patterns',
      'autonomous agent team orchestration'
    ],
    local_scan: {
      description: '扫描多Agent协同的效率',
      checks: [
        '检查子Agent空跑率（empty runs）',
        '检查任务分配vs完成率',
        '检查Agent间通信瓶颈'
      ]
    }
  }
];

function fetchJson(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeout);
    https.get(url, { headers: { 'User-Agent': 'openclaw-research/1.0' } }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { clearTimeout(timer); try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    }).on('error', e => { clearTimeout(timer); reject(e); });
  });
}

async function searchArxiv(query) {
  const encoded = encodeURIComponent(query);
  const url = `https://export.arxiv.org/api/query?search_query=all:${encoded}&sortBy=submittedDate&sortOrder=descending&max_results=3`;
  try {
    const xml = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 15000);
      https.get(url, { headers: { 'User-Agent': 'openclaw-research/1.0' } }, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => { clearTimeout(timer); resolve(data); });
      }).on('error', e => { clearTimeout(timer); reject(e); });
    });
    
    // 简单解析XML提取标题和摘要
    const entries = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];
      const title = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim();
      const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1]?.trim().slice(0, 300);
      const link = (entry.match(/<id>([\s\S]*?)<\/id>/) || [])[1]?.trim();
      const published = (entry.match(/<published>([\s\S]*?)<\/published>/) || [])[1]?.trim();
      if (title) entries.push({ title, summary, link, published });
    }
    return entries;
  } catch (e) {
    return [];
  }
}

async function researchTopic(topic) {
  const results = [];
  for (const query of topic.search_queries.slice(0, 2)) { // 每课题最多2个query避免限流
    const papers = await searchArxiv(query);
    results.push(...papers);
    await new Promise(r => setTimeout(r, 3000)); // arXiv礼貌延迟
  }
  
  // 去重
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.title)) return false;
    seen.add(r.title);
    return true;
  });
}

async function main() {
  const shanghaiDate = new Date(new Date().toLocaleString('en-US', {timeZone: 'Asia/Shanghai'}));
  const dateStr = shanghaiDate.getFullYear() + '-' + String(shanghaiDate.getMonth()+1).padStart(2,'0') + '-' + String(shanghaiDate.getDate()).padStart(2,'0');
  const reportFile = path.join(REPORT_DIR, `directed-research-${dateStr}.md`);
  
  // 如果今天已抓取，跳过
  if (fs.existsSync(reportFile)) {
    console.log(`[${dateStr}] directed-research: already done today, skip`);
    return;
  }
  
  const lines = [
    `# 定向学术研究日报 ${dateStr}`,
    `_采集时间: ${new Date().toISOString()}_`,
    `_课题数量: ${RESEARCH_TOPICS.length}_`,
    ''
  ];
  
  let totalPapers = 0;
  const actionableInsights = [];
  
  for (const topic of RESEARCH_TOPICS) {
    console.log(`[research] 搜索课题: ${topic.name}`);
    const papers = await researchTopic(topic);
    totalPapers += papers.length;
    
    lines.push(`## ${topic.name}`, '');
    lines.push(`_${topic.description}_`, '');
    
    if (papers.length > 0) {
      papers.forEach(p => {
        lines.push(`### ${p.title}`);
        lines.push(`🔗 ${p.link}`);
        lines.push(`📅 ${p.published}`);
        if (p.summary) lines.push(`> ${p.summary}`);
        lines.push('');
      });
      
      // 每个有结果的课题生成本地排查提示
      if (topic.local_scan) {
        lines.push(`### 📋 本地系统排查方向`, '');
        topic.local_scan.checks.forEach(c => lines.push(`- [ ] ${c}`));
        lines.push('');
        
        actionableInsights.push({
          topic_id: topic.id,
          topic_name: topic.name,
          papers_found: papers.length,
          local_checks: topic.local_scan.checks,
          optimization_targets: topic.optimization_targets || []
        });
      }
    } else {
      lines.push('_本课题今日无新论文_', '');
    }
  }
  
  lines.push('---', `_共采集 ${totalPapers} 篇论文，${actionableInsights.length} 个课题有可操作洞察_`);
  fs.writeFileSync(reportFile, lines.join('\n'));
  console.log(`[${dateStr}] directed-research: ${totalPapers} papers, ${actionableInsights.length} actionable → ${reportFile}`);
  
  // 有可操作洞察时，写入事件总线触发本地排查
  if (actionableInsights.length > 0) {
    const event = {
      type: 'knowledge.discovery.actionable',
      source: 'directed-research-harvester',
      timestamp: new Date().toISOString(),
      data: {
        date: dateStr,
        insights: actionableInsights,
        action_required: '启动本地系统排查，基于学术洞察优化系统'
      }
    };
    fs.appendFileSync(EVENT_BUS, JSON.stringify(event) + '\n');
    console.log(`[${dateStr}] 可操作洞察已写入事件总线`);
  }
}

main().catch(e => {
  console.error(`[directed-research] ERROR:`, e.message);
  process.exit(1);
});
