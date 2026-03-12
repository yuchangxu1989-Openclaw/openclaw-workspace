#!/usr/bin/env node
/**
 * evolution-daily-report.js
 * 自主进化日报系统：每天自动总结复盘当天进化，关键沉淀自动闭环。
 * cron: 0 22 * * * (flock防重入)
 * 
 * v2: 结构化三段式 + 纯文本飞书推送 + 行动闭环追踪
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = process.env.WORKSPACE || '/root/.openclaw/workspace';

// Use Asia/Shanghai timezone
function getShanghaiDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const shanghai = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  return shanghai.toISOString().slice(0, 10);
}

const TODAY = getShanghaiDate(0);
const YESTERDAY = getShanghaiDate(-1);
const IS_TEST = process.argv.includes('--test');

// ─── Feishu Config ───
const OPENCLAW_CONFIG_PATH = '/root/.openclaw/openclaw.json';
const FEISHU_RECEIVE_ID = 'ou_a113e465324cc55f9ab3348c9a1a7b9b';

// ─── Helpers ───

function readFileOr(filePath, fallback = '') {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return fallback; }
}

function readJsonOr(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return fallback; }
}

function readJsonlOr(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function execOr(cmd, fallback = '') {
  try { return execSync(cmd, { cwd: WORKSPACE, encoding: 'utf8', timeout: 15000 }).trim(); } catch { return fallback; }
}

// ─── Feishu API Helpers ───

function getFeishuConfig() {
  const config = readJsonOr(OPENCLAW_CONFIG_PATH, {});
  const account = config?.channels?.feishu?.accounts?.default || {};
  if (!account.appId || !account.appSecret) {
    throw new Error('飞书配置缺失: 未找到 channels.feishu.accounts.default.appId/appSecret');
  }
  return { appId: account.appId, appSecret: account.appSecret };
}

async function feishuRequest(url, body, token) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`飞书API错误 [${url}]: code=${data.code} msg=${data.msg}`);
  }
  return data;
}

async function getFeishuTenantToken() {
  const { appId, appSecret } = getFeishuConfig();
  const data = await feishuRequest(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    { app_id: appId, app_secret: appSecret }
  );
  if (!data.tenant_access_token) {
    throw new Error('获取 tenant_access_token 失败: ' + JSON.stringify(data));
  }
  return data.tenant_access_token;
}

async function createFeishuDoc(token, title) {
  const data = await feishuRequest(
    'https://open.feishu.cn/open-apis/docx/v1/documents',
    { title },
    token
  );
  const doc = data.data?.document;
  if (!doc?.document_id) {
    throw new Error('创建飞书文档失败: ' + JSON.stringify(data));
  }
  return { documentId: doc.document_id, blockId: doc.document_id };
}

/**
 * Convert markdown to Feishu blocks - PLAIN TEXT ONLY to avoid error 1770001
 * Only use: heading1/2/3 and paragraph (no code, no divider)
 */
function mdToFeishuBlocksPlain(md) {
  const blocks = [];
  const lines = md.split('\n');

  for (const line of lines) {
    if (line.startsWith('# ')) {
      blocks.push({
        block_type: 3,
        heading1: { elements: [{ text_run: { content: line.slice(2), text_element_style: {} } }] }
      });
    } else if (line.startsWith('## ')) {
      blocks.push({
        block_type: 4,
        heading2: { elements: [{ text_run: { content: line.slice(3), text_element_style: {} } }] }
      });
    } else if (line.startsWith('### ')) {
      blocks.push({
        block_type: 5,
        heading3: { elements: [{ text_run: { content: line.slice(4), text_element_style: {} } }] }
      });
    } else if (line.startsWith('---')) {
      // Skip dividers - they cause 1770001
      continue;
    } else if (line.trim()) {
      // Plain paragraph - strip markdown formatting
      const plainText = line
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1');
      blocks.push({
        block_type: 2,
        paragraph: { elements: [{ text_run: { content: plainText, text_element_style: {} } }] }
      });
    }
  }

  return blocks;
}

async function writeFeishuDocContent(token, documentId, blockId, mdContent) {
  const blocks = mdToFeishuBlocksPlain(mdContent);
  const BATCH_SIZE = 50;
  for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
    const batch = blocks.slice(i, i + BATCH_SIZE);
    await feishuRequest(
      `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${blockId}/children`,
      { children: batch, index: -1 },
      token
    );
  }
  return blocks.length;
}

async function sendFeishuMessage(token, receiveId, text) {
  await feishuRequest(
    'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',
    {
      receive_id: receiveId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    },
    token
  );
}

async function publishToFeishu(report, date) {
  const title = `焰崽进化日报 ${date}`;
  console.log(`[feishu] 开始推送飞书文档: ${title}`);

  const token = await getFeishuTenantToken();
  console.log('[feishu] 获取 tenant_access_token 成功');

  const { documentId, blockId } = await createFeishuDoc(token, title);
  const docUrl = `https://bytedance.feishu.cn/docx/${documentId}`;
  console.log(`[feishu] 文档已创建: ${docUrl}`);

  const blockCount = await writeFeishuDocContent(token, documentId, blockId, report);
  console.log(`[feishu] 内容已写入: ${blockCount} 个块`);

  const msgText = `📊 进化日报已生成\n📄 ${title}\n🔗 ${docUrl}`;
  await sendFeishuMessage(token, FEISHU_RECEIVE_ID, msgText);
  console.log('[feishu] 消息已推送');

  return docUrl;
}

async function testFeishuConnectivity() {
  console.log('[test] 验证飞书API连通性...');
  try {
    getFeishuConfig();
    console.log('[test] ✅ 飞书配置读取成功');
  } catch (e) {
    console.error('[test] ❌ 飞书配置读取失败:', e.message);
    process.exit(1);
  }

  try {
    const token = await getFeishuTenantToken();
    console.log('[test] ✅ tenant_access_token 获取成功');
    const { documentId } = await createFeishuDoc(token, `[测试] 日报推送测试 ${new Date().toISOString()}`);
    console.log(`[test] ✅ 测试文档创建成功: ${documentId}`);
    console.log('[test] ✅ 飞书API连通性验证通过');
  } catch (e) {
    console.error('[test] ❌ 飞书API连通性验证失败:', e.message);
    process.exit(1);
  }
}

// ─── 1. Data Collection ───

function collectGitLog() {
  const log = execOr(`git log --since="${TODAY}T00:00:00+08:00" --oneline 2>/dev/null`, '');
  if (!log) return { commits: [], count: 0 };
  const commits = log.split('\n').filter(Boolean).map(line => {
    const [hash, ...msgParts] = line.split(' ');
    return { hash, message: msgParts.join(' ') };
  });
  return { commits, count: commits.length };
}

function analyzeCommits(commits) {
  const stats = { features: 0, fixes: 0, refactors: 0, docs: 0, chores: 0, other: 0 };
  const details = { features: [], fixes: [], other: [] };
  
  for (const c of commits) {
    const msg = c.message.toLowerCase();
    if (msg.startsWith('feat') || msg.includes('feature')) {
      stats.features++;
      details.features.push(c.message);
    } else if (msg.startsWith('fix') || msg.includes('fix')) {
      stats.fixes++;
      details.fixes.push(c.message);
    } else if (msg.startsWith('refactor')) {
      stats.refactors++;
    } else if (msg.startsWith('doc') || msg.includes('docs')) {
      stats.docs++;
    } else if (msg.startsWith('chore') || msg.startsWith('ci')) {
      stats.chores++;
    } else {
      stats.other++;
      details.other.push(c.message);
    }
  }
  return { stats, details };
}

function collectSkillChanges() {
  const skillsDir = path.join(WORKSPACE, 'skills');
  const changes = { newSkills: [], modifiedSkills: [], deletedSkills: [] };
  
  try {
    // Check git diff for skills directory
    const diff = execOr(`git diff --name-status HEAD~10 -- skills/ 2>/dev/null`, '');
    if (diff) {
      for (const line of diff.split('\n').filter(Boolean)) {
        const [status, file] = line.split('\t');
        const skillMatch = file?.match(/skills\/([^\/]+)/);
        if (skillMatch) {
          const skillName = skillMatch[1];
          if (status === 'A' && !changes.newSkills.includes(skillName)) {
            changes.newSkills.push(skillName);
          } else if (status === 'M' && !changes.modifiedSkills.includes(skillName)) {
            changes.modifiedSkills.push(skillName);
          } else if (status === 'D' && !changes.deletedSkills.includes(skillName)) {
            changes.deletedSkills.push(skillName);
          }
        }
      }
    }
  } catch {}
  
  return changes;
}

function collectTaskBoard() {
  const board = readJsonOr(path.join(WORKSPACE, 'logs/subagent-task-board.json'), { tasks: [] });
  const tasks = Array.isArray(board) ? board : (board.tasks || board.board || []);
  const todayTasks = tasks.filter(t => {
    const ts = t.completedAt || t.updatedAt || t.createdAt || '';
    return ts.startsWith(TODAY);
  });
  const completed = todayTasks.filter(t => t.status === 'completed' || t.status === 'done');
  const failed = todayTasks.filter(t => t.status === 'failed' || t.status === 'error');
  const timeout = todayTasks.filter(t => t.status === 'timeout');
  return { completed, failed, timeout, total: todayTasks.length };
}

function collectPDCA() {
  const filePath = path.join(WORKSPACE, 'reports/pdca-check-history.jsonl');
  const records = readJsonlOr(filePath);
  const today = records.filter(r => (r.timestamp || r.date || '').startsWith(TODAY));
  const yesterday = records.filter(r => (r.timestamp || r.date || '').startsWith(YESTERDAY));
  return { today, yesterday };
}

function collectQualityAudit() {
  const auditFile = path.join(WORKSPACE, 'reports/quality-audit-latest.json');
  const audit = readJsonOr(auditFile, null);
  if (!audit) return null;
  
  return {
    timestamp: audit.timestamp || audit.generatedAt,
    score: audit.score || audit.overallScore,
    issues: (audit.issues || []).slice(0, 5),
    summary: audit.summary
  };
}

function collectBadcases() {
  const dir = path.join(WORKSPACE, 'tests/benchmarks/badcases');
  if (!fs.existsSync(dir)) return { newFiles: [], count: 0 };
  const files = fs.readdirSync(dir).filter(f => {
    try {
      const stat = fs.statSync(path.join(dir, f));
      return stat.mtime.toISOString().startsWith(TODAY);
    } catch { return false; }
  });
  return { newFiles: files, count: files.length };
}

// ─── 2. Action Backlog Management ───

function getActionBacklogPath() {
  return path.join(WORKSPACE, 'reports/evolution/action-backlog.jsonl');
}

function loadPreviousActions() {
  const backlogFile = getActionBacklogPath();
  const actions = readJsonlOr(backlogFile);
  // Get actions from last 7 days
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  return actions.filter(a => (a.date || '') >= weekAgo);
}

function saveActionToBacklog(actions) {
  const backlogFile = getActionBacklogPath();
  fs.mkdirSync(path.dirname(backlogFile), { recursive: true });
  
  for (const action of actions) {
    const entry = {
      date: TODAY,
      action: action.text,
      priority: action.priority || 'medium',
      source: 'daily-report',
      status: 'pending'
    };
    fs.appendFileSync(backlogFile, JSON.stringify(entry) + '\n');
  }
}

function checkPreviousActionsStatus() {
  const previous = loadPreviousActions();
  const results = [];
  
  for (const action of previous) {
    // Simple heuristic: check if similar commit message exists
    const gitLog = execOr(`git log --since="${action.date}T00:00:00+08:00" --oneline 2>/dev/null`, '');
    const keywords = action.action.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const found = keywords.some(kw => gitLog.toLowerCase().includes(kw));
    
    results.push({
      action: action.action,
      date: action.date,
      likelyCompleted: found
    });
  }
  
  return results;
}

// ─── 3. Structured Report Generation ───

function generateStructuredReport(data) {
  const { gitData, skillChanges, tasks, pdca, qualityAudit, badcases, previousActions } = data;
  
  // Section 1: 今日变更摘要
  const commitAnalysis = analyzeCommits(gitData.commits);
  const skillChangeCount = skillChanges.newSkills.length + skillChanges.modifiedSkills.length;
  
  let summarySection = `## 今日变更摘要

- 代码提交: ${gitData.count} 个 (${commitAnalysis.stats.features} 新功能, ${commitAnalysis.stats.fixes} 修复, ${commitAnalysis.stats.refactors} 重构)
- 技能变更: ${skillChangeCount} 个 (新增 ${skillChanges.newSkills.length}, 修改 ${skillChanges.modifiedSkills.length})
- 任务完成: ${tasks.completed.length} / ${tasks.total} (失败 ${tasks.failed.length}, 超时 ${tasks.timeout.length})
- 新增Badcase: ${badcases.count} 条`;

  // Add notable commits
  if (commitAnalysis.details.features.length > 0) {
    summarySection += `\n\n新功能:\n${commitAnalysis.details.features.slice(0, 3).map(f => `- ${f}`).join('\n')}`;
  }
  if (commitAnalysis.details.fixes.length > 0) {
    summarySection += `\n\n修复:\n${commitAnalysis.details.fixes.slice(0, 3).map(f => `- ${f}`).join('\n')}`;
  }

  // Section 2: 收益/损失分析
  let benefitSection = `\n## 收益与损失分析`;

  // PDCA scores
  if (pdca.today.length > 0) {
    const latestPdca = pdca.today[pdca.today.length - 1];
    const prevPdca = pdca.yesterday.length > 0 ? pdca.yesterday[pdca.yesterday.length - 1] : null;
    
    benefitSection += `\n\nPDCA指标:`;
    if (latestPdca.scores) {
      for (const [key, val] of Object.entries(latestPdca.scores)) {
        const prevVal = prevPdca?.scores?.[key];
        const delta = prevVal !== undefined ? ` (${val >= prevVal ? '+' : ''}${(val - prevVal).toFixed(1)})` : '';
        benefitSection += `\n- ${key}: ${val}${delta}`;
      }
    }
  } else {
    benefitSection += `\n\nPDCA指标: 今日无检查数据`;
  }

  // Quality audit
  if (qualityAudit) {
    benefitSection += `\n\n质量审计 (最后更新: ${qualityAudit.timestamp || '未知'}):`;
    if (qualityAudit.score !== undefined) {
      benefitSection += `\n- 综合得分: ${qualityAudit.score}`;
    }
    if (qualityAudit.issues && qualityAudit.issues.length > 0) {
      benefitSection += `\n- 待处理问题: ${qualityAudit.issues.length} 条`;
    }
  }

  // Task success rate
  const taskSuccessRate = tasks.total > 0 ? ((tasks.completed.length / tasks.total) * 100).toFixed(1) : 'N/A';
  benefitSection += `\n\n任务成功率: ${taskSuccessRate}%`;

  // Losses
  if (badcases.count > 0 || tasks.failed.length > 0 || tasks.timeout.length > 0) {
    benefitSection += `\n\n损失项:`;
    if (badcases.count > 0) benefitSection += `\n- 新增Badcase ${badcases.count} 条需消化`;
    if (tasks.failed.length > 0) benefitSection += `\n- ${tasks.failed.length} 个任务失败`;
    if (tasks.timeout.length > 0) benefitSection += `\n- ${tasks.timeout.length} 个任务超时`;
  }

  // Section 3: 明日行动建议
  let actionSection = `\n## 明日行动建议`;

  // Check previous actions status first
  const pendingActions = previousActions.filter(a => !a.likelyCompleted).slice(0, 2);
  if (pendingActions.length > 0) {
    actionSection += `\n\n(上次未完成: ${pendingActions.map(a => a.action).join(', ')})`;
  }

  const suggestions = [];
  
  // Priority 1: Failed/timeout tasks
  if (tasks.failed.length > 0 || tasks.timeout.length > 0) {
    suggestions.push({
      text: `重试失败/超时任务 (${tasks.failed.length + tasks.timeout.length}个)`,
      priority: 'high'
    });
  }
  
  // Priority 2: Badcases
  if (badcases.count > 0) {
    suggestions.push({
      text: `消化新增badcase (${badcases.count}条)`,
      priority: 'high'
    });
  }
  
  // Priority 3: Quality issues
  if (qualityAudit?.issues?.length > 3) {
    suggestions.push({
      text: `处理质量审计问题 (${qualityAudit.issues.length}条)`,
      priority: 'medium'
    });
  }
  
  // Priority 4: PDCA improvement
  if (pdca.today.length > 0) {
    const latest = pdca.today[pdca.today.length - 1];
    if (latest.scores) {
      const lowest = Object.entries(latest.scores).sort((a, b) => a[1] - b[1])[0];
      if (lowest && lowest[1] < 80) {
        suggestions.push({
          text: `提升${lowest[0]}指标 (当前${lowest[1]})`,
          priority: 'medium'
        });
      }
    }
  }
  
  // Default suggestion
  if (suggestions.length === 0) {
    suggestions.push({
      text: '继续推进当前进化路线',
      priority: 'low'
    });
  }

  // Limit to 3 suggestions
  const topSuggestions = suggestions.slice(0, 3);
  actionSection += '\n\n' + topSuggestions.map((s, i) => `${i + 1}. [${s.priority.toUpperCase()}] ${s.text}`).join('\n');

  // Assemble report
  const report = `# 进化日报 ${TODAY}

${summarySection}

${benefitSection}

${actionSection}

---
生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
`;

  return { report, suggestions: topSuggestions };
}

// ─── Main ───

async function main() {
  if (IS_TEST) {
    await testFeishuConnectivity();
    return;
  }

  console.log(`[evolution-daily-report] 开始生成 ${TODAY} 日报 (Asia/Shanghai)...`);

  // Collect all data
  const gitData = collectGitLog();
  const skillChanges = collectSkillChanges();
  const tasks = collectTaskBoard();
  const pdca = collectPDCA();
  const qualityAudit = collectQualityAudit();
  const badcases = collectBadcases();
  const previousActions = checkPreviousActionsStatus();

  // Generate structured report
  const { report, suggestions } = generateStructuredReport({
    gitData,
    skillChanges,
    tasks,
    pdca,
    qualityAudit,
    badcases,
    previousActions
  });

  // Write report to new path
  const outDir = path.join(WORKSPACE, 'reports/evolution');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `daily-${TODAY}.md`);
  fs.writeFileSync(outFile, report);
  console.log(`[evolution-daily-report] 日报已写入: ${outFile}`);

  // Save action suggestions to backlog
  if (suggestions.length > 0) {
    saveActionToBacklog(suggestions);
    console.log(`[evolution-daily-report] ${suggestions.length} 条行动建议已写入 action-backlog.jsonl`);
  }

  // Publish to Feishu (plain text only to avoid error 1770001)
  try {
    const docUrl = await publishToFeishu(report, TODAY);
    fs.appendFileSync(outFile, `\n\n飞书文档: ${docUrl}\n`);
    console.log(`[evolution-daily-report] 飞书推送成功: ${docUrl}`);
  } catch (e) {
    console.error(`[evolution-daily-report] 飞书推送失败(非致命): ${e.message}`);
  }

  // Summary
  console.log(`[evolution-daily-report] 完成. 提交=${gitData.count} 任务=${tasks.total} 建议=${suggestions.length}`);
}

main().catch(e => {
  console.error('[evolution-daily-report] 致命错误:', e);
  process.exit(1);
});
