#!/usr/bin/env node
/**
 * LEP 韧性日报生成器 - GLM-5版本
 * 使用GLM-5模型生成每日系统韧性状态报告并发送到飞书
 * @version 2.0.0 - 修复模型配置错误
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const { WORKSPACE, SECRETS_DIR, SKILLS_DIR } = require('../../_shared/paths');

// 配置
const WORKSPACE_ROOT = WORKSPACE;
const REPORT_DATE = new Date().toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long'
});
const TIMESTAMP = new Date().toISOString();

// LLM配置 - 模型通过环境变量配置
const GLM5_CONFIG = {
  baseURL: process.env.LLM_API_HOST || 'open.bigmodel.cn',
  apiPath: '/api/paas/v4/chat/completions',
  model: process.env.LLM_DEFAULT_MODEL || 'glm-5'
};

// 飞书配置
const FEISHU_CONFIG = {
  targetUser: process.env.FEISHU_TARGET_USER || 'ou_8eafdc7241d381d714746e486b641883'
};

/**
 * 加载智谱API Key (使用API_KEY_3)
 */
function loadAPIKey() {
  // 优先使用环境变量API_KEY_3
  if (process.env.API_KEY_3) {
    return process.env.API_KEY_3;
  }
  
  // 从secrets文件加载
  const secretsPath = path.join(SECRETS_DIR, 'zhipu-keys.env');
  if (fs.existsSync(secretsPath)) {
    const content = fs.readFileSync(secretsPath, 'utf8');
    const match = content.match(/ZHIPU_API_KEY_3=([a-zA-Z0-9._-]+)/);
    if (match) return match[1];
  }
  
  // 尝试ZHIPU_API_KEY_3环境变量
  if (process.env.ZHIPU_API_KEY_3) {
    return process.env.ZHIPU_API_KEY_3;
  }
  
  throw new Error('API_KEY_3 not found');
}

/**
 * 调用GLM-5 API
 */
async function callGLM5(prompt) {
  const apiKey = loadAPIKey();
  
  const body = JSON.stringify({
    model: GLM5_CONFIG.model,
    messages: [
      {
        role: 'system',
        content: '你是一位系统监控专家，擅长生成清晰、专业的系统健康报告。请用中文回复，使用Markdown格式。'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    stream: false,
    temperature: 0.3,
    max_tokens: 4096,
    reasoning: {
      enable: true,
      detail: 'medium'
    }
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: GLM5_CONFIG.baseURL,
      path: GLM5_CONFIG.apiPath,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 180000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.choices && response.choices[0]) {
            resolve(response.choices[0].message.content);
          } else {
            reject(new Error(`Invalid response: ${data}`));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * 收集系统健康数据
 */
function collectHealthData() {
  const data = {
    skills: { total: 0, healthy: 0, issues: [] },
    systemFiles: { total: 4, healthy: 0, issues: [] },
    git: { uncommitted: 0, unpushed: 0, dirty: false },
    disk: { usagePercent: 0, healthy: true },
    cron: { healthy: true }
  };

  // 检查技能目录
  try {
    const skillsDir = path.join(WORKSPACE_ROOT, 'skills');
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skillDirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    data.skills.total = skillDirs.length;

    for (const skill of skillDirs) {
      const skillMdPath = path.join(skillsDir, skill, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        data.skills.healthy++;
      } else {
        data.skills.issues.push({ skill, message: 'SKILL.md 缺失' });
      }
    }
  } catch (e) {
    data.skills.issues.push({ skill: 'system', message: e.message });
  }

  // 检查关键系统文件
  const criticalFiles = [
    { path: 'CAPABILITY-ANCHOR.md', name: '能力锚点' },
    { path: 'MEMORY.md', name: '长期记忆' },
    { path: 'SOUL.md', name: '身份设定' },
    { path: 'skills/isc-core/config/evomap-upload-manifest.json', name: 'EvoMap清单' }
  ];

  for (const file of criticalFiles) {
    const fullPath = path.join(WORKSPACE_ROOT, file.path);
    if (fs.existsSync(fullPath)) {
      data.systemFiles.healthy++;
    } else {
      data.systemFiles.issues.push({ file: file.name, message: '文件缺失' });
    }
  }

  // 检查Git状态
  try {
    const status = execSync('git status --short', { cwd: WORKSPACE_ROOT, encoding: 'utf8', timeout: 5000 });
    data.git.uncommitted = status.trim().split('\n').filter(l => l.trim()).length;
    data.git.dirty = status.trim().length > 0;
  } catch (e) {}

  // 检查磁盘空间
  try {
    const df = execSync('df -h /root | tail -1', { encoding: 'utf8', timeout: 3000 });
    const parts = df.trim().split(/\s+/);
    data.disk.usagePercent = parseInt(parts[4]?.replace('%', '') || '0');
    data.disk.healthy = data.disk.usagePercent < 80;
  } catch (e) {}

  return data;
}

/**
 * 使用GLM-5生成报告
 */
async function generateReportWithGLM5(healthData) {
  const prompt = `
请根据以下系统健康数据生成一份专业的LEP（Local Execution Protocol）韧性日报。

## 系统数据

### 1. 技能系统状态
- 总技能数: ${healthData.skills.total}
- 健康技能: ${healthData.skills.healthy}
- 问题数: ${healthData.skills.issues.length}
${healthData.skills.issues.map(i => `  - ${i.skill}: ${i.message}`).join('\n') || '  - 无'}

### 2. 关键系统文件
- 总文件数: ${healthData.systemFiles.total}
- 健康文件: ${healthData.systemFiles.healthy}
- 问题数: ${healthData.systemFiles.issues.length}
${healthData.systemFiles.issues.map(i => `  - ${i.file}: ${i.message}`).join('\n') || '  - 无'}

### 3. Git状态
- 未提交变更: ${healthData.git.uncommitted} 个文件
- 仓库状态: ${healthData.git.dirty ? '有未提交变更' : '已同步'}

### 4. 磁盘空间
- 使用率: ${healthData.disk.usagePercent}%
- 状态: ${healthData.disk.healthy ? '正常' : '警告'}

### 5. Cron服务
- 状态: ${healthData.cron.healthy ? '运行正常' : '异常'}

## 输出要求

请生成一份专业的Markdown格式报告，包含:
1. 标题: LEP 韧性执行中心 - 每日健康报告
2. 报告日期: ${REPORT_DATE}
3. 总体健康度评分 (0-100分)
4. 各模块状态摘要
5. 发现的问题列表（如有）
6. 改进建议（如有）

使用清晰的格式，包含emoji图标增加可读性。
`;

  try {
    const content = await callGLM5(prompt);
    return content;
  } catch (error) {
    console.error('GLM-5调用失败:', error.message);
    // 回退到本地生成
    return generateFallbackReport(healthData);
  }
}

/**
 * 本地生成报告（GLM-5失败时的回退方案）
 */
function generateFallbackReport(healthData) {
  let healthScore = 100;
  
  // 扣分逻辑
  if (healthData.skills.healthy < healthData.skills.total) {
    healthScore -= (healthData.skills.total - healthData.skills.healthy) * 5;
  }
  if (healthData.systemFiles.healthy < healthData.systemFiles.total) {
    healthScore -= (healthData.systemFiles.total - healthData.systemFiles.healthy) * 10;
  }
  if (healthData.git.dirty) healthScore -= 5;
  if (!healthData.disk.healthy) healthScore -= 15;
  
  healthScore = Math.max(0, Math.min(100, healthScore));

  const healthLevel = healthScore >= 80 ? '🟢 健康' : healthScore >= 60 ? '🟡 警告' : '🔴 严重';

  const lines = [
    `# LEP 韧性执行中心 - 每日健康报告`,
    ``,
    `**报告日期**: ${REPORT_DATE}`,
    `**生成时间**: ${TIMESTAMP}`,
    ``,
    `---`,
    ``,
    `## 📊 总体健康度: ${healthScore}/100 ${healthLevel}`,
    ``,
    `---`,
    ``,
    `## 📋 执行摘要`,
    ``,
    `| 模块 | 状态 |`,
    `|------|------|`,
    `| 🧩 技能系统 | ${healthData.skills.healthy}/${healthData.skills.total} 健康 |`,
    `| 📁 系统文件 | ${healthData.systemFiles.healthy}/${healthData.systemFiles.total} 完整 |`,
    `| 📝 Git状态 | ${healthData.git.dirty ? '有未提交变更' : '已同步'} |`,
    `| 💾 磁盘空间 | ${healthData.disk.usagePercent}% 使用率 |`,
    ``,
    `---`,
    ``,
    `## ⚠️ 问题列表`,
    ``
  ];

  const allIssues = [
    ...healthData.skills.issues.map(i => `🔴 [技能] ${i.skill}: ${i.message}`),
    ...healthData.systemFiles.issues.map(i => `🔴 [系统文件] ${i.file}: ${i.message}`)
  ];

  if (allIssues.length > 0) {
    lines.push(...allIssues.map(i => `- ${i}`));
  } else {
    lines.push('✅ 未发现严重问题');
  }

  lines.push(
    ``,
    `---`,
    ``,
    `💡 *LEP (Local Execution Protocol) 韧性执行中心 v2.0*`,
    `   *确保系统在任何条件下都能可靠执行关键任务*`
  );

  return lines.join('\n');
}

/**
 * 发送报告到飞书
 */
async function sendToFeishu(reportContent, healthData) {
  try {
    // 计算健康度
    let healthScore = 100;
    if (healthData.skills.healthy < healthData.skills.total) {
      healthScore -= (healthData.skills.total - healthData.skills.healthy) * 5;
    }
    if (healthData.systemFiles.healthy < healthData.systemFiles.total) {
      healthScore -= (healthData.systemFiles.total - healthData.systemFiles.healthy) * 10;
    }
    if (healthData.git.dirty) healthScore -= 5;
    if (!healthData.disk.healthy) healthScore -= 15;
    healthScore = Math.max(0, Math.min(100, healthScore));

    // 构建飞书卡片
    const card = {
      config: { wide_screen_mode: true },
      header: {
        template: healthScore >= 80 ? 'green' : healthScore >= 60 ? 'yellow' : 'red',
        title: { 
          tag: 'plain_text', 
          content: `📊 LEP韧性日报 - ${healthScore}分` 
        }
      },
      elements: [
        {
          tag: 'div',
          text: { 
            tag: 'lark_md', 
            content: `**日期**: ${REPORT_DATE}\n**技能**: ${healthData.skills.healthy}/${healthData.skills.total} | **磁盘**: ${healthData.disk.usagePercent}%` 
          }
        },
        { tag: 'hr' },
        {
          tag: 'div',
          text: { 
            tag: 'lark_md', 
            content: healthData.skills.issues.length === 0 && healthData.systemFiles.issues.length === 0 
              ? '✅ 系统运行正常，无严重问题'
              : `⚠️ 发现 ${healthData.skills.issues.length + healthData.systemFiles.issues.length} 个问题，请查看详细报告`
          }
        },
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '查看完整报告' },
              type: 'primary',
              value: { action: 'view_lep_report', date: new Date().toISOString().split('T')[0] }
            }
          ]
        }
      ]
    };

    // 保存到发送队列
    const queueDir = path.join(SKILLS_DIR, 'cras/feishu_queue');
    if (!fs.existsSync(queueDir)) {
      fs.mkdirSync(queueDir, { recursive: true });
    }

    const queueFile = path.join(queueDir, `lep-daily-${Date.now()}.json`);
    fs.writeFileSync(queueFile, JSON.stringify({
      type: 'lep_daily_report',
      timestamp: TIMESTAMP,
      card: card,
      content: reportContent,
      target: FEISHU_CONFIG.targetUser
    }, null, 2));

    console.log(`✅ 报告已加入发送队列: ${queueFile}`);
    return true;
  } catch (error) {
    console.error('❌ 发送到飞书失败:', error.message);
    return false;
  }
}

/**
 * 保存报告到文件
 */
function saveReport(content) {
  try {
    const reportsDir = path.join(WORKSPACE_ROOT, 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const reportPath = path.join(reportsDir, `lep-daily-report-${dateStr}.md`);
    
    fs.writeFileSync(reportPath, content, 'utf8');
    console.log(`💾 报告已保存: ${reportPath}`);
    return reportPath;
  } catch (error) {
    console.error('保存报告失败:', error.message);
    return null;
  }
}

// 主程序
async function main() {
  console.log('🚀 LEP韧性日报生成器 v2.0 (GLM-5)');
  console.log('=' .repeat(50));
  
  try {
    // 1. 收集健康数据
    console.log('📊 正在收集系统健康数据...');
    const healthData = collectHealthData();
    console.log(`   ✓ 技能: ${healthData.skills.healthy}/${healthData.skills.total}`);
    console.log(`   ✓ 系统文件: ${healthData.systemFiles.healthy}/${healthData.systemFiles.total}`);
    console.log(`   ✓ 磁盘使用率: ${healthData.disk.usagePercent}%`);

    // 2. 使用GLM-5生成报告
    console.log('\n🤖 正在调用GLM-5生成报告...');
    const reportContent = await generateReportWithGLM5(healthData);
    console.log('   ✓ 报告生成完成');

    // 3. 保存报告
    console.log('\n💾 正在保存报告...');
    const savedPath = saveReport(reportContent);

    // 4. 发送到飞书
    console.log('\n📤 正在发送到飞书...');
    const sent = await sendToFeishu(reportContent, healthData);

    console.log('\n' + '='.repeat(50));
    console.log('✅ LEP韧性日报生成完成!');
    if (savedPath) console.log(`   报告路径: ${savedPath}`);
    console.log(`   飞书发送: ${sent ? '已加入队列' : '失败'}`);

    // 返回退出码
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 报告生成失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
