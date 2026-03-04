#!/usr/bin/env node
/**
 * CRAS-B 用户洞察分析 - 修复版
 * 简化版定时任务入口，直接执行分析并投递飞书
 * 修复：模型配置错误、超时、飞书投递失败
 *
 * [FIX] 2026-03-04 — 清除硬编码伪造fallback值
 * 原代码在数据不足时使用伪造默认值(totalInteractions||12, topIntent='指令执行'等)伪装成真实分析结果。
 * 现改为：无数据时明确返回 null / "数据不可用"，不伪装。
 * 参见审计报告 reports/report-chain-audit-2026-03-04.md
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { SKILLS_DIR, WORKSPACE, MEMORY_DIR } = require('../_shared/paths');

// 配置
const CONFIG = {
  // 超时设置：分批处理，每批最多60秒
  batchTimeout: 60000,
  maxBatches: 3,
  // 飞书投递配置
  feishuQueuePath: path.join(SKILLS_DIR, 'cras/feishu_queue'),
  // 报告输出路径
  reportPath: path.join(WORKSPACE, 'cras/reports'),
  // 最大执行时间（毫秒）
  maxExecutionTime: 240000 // 4分钟
};

/**
 * 执行命令并返回结果（带超时控制）
 */
function execWithTimeout(cmd, timeoutMs = 30000) {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (e) {
    console.error(`[CRAS-B] 命令执行失败: ${e.message}`);
    return null;
  }
}

/**
 * 快速分析用户交互数据（简化版）
 */
function quickAnalyzeInteractions() {
  console.log('[CRAS-B] 执行快速用户洞察分析...');
  
  const now = new Date();
  const timestamp = now.toISOString();
  const dateStr = now.toLocaleString('zh-CN', { 
    timeZone: 'Asia/Shanghai',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  // 读取最近的会话文件进行分析
  const memoryPath = MEMORY_DIR;
  let recentInteractions = [];
  
  try {
    const files = fs.readdirSync(memoryPath)
      .filter(f => f.endsWith('.md') && f.match(/^\d{4}-\d{2}-\d{2}/))
      .sort()
      .slice(-3); // 只取最近3天的文件
    
    for (const file of files.slice(-1)) { // 只分析最新的1个文件
      const content = fs.readFileSync(path.join(memoryPath, file), 'utf-8');
      // 简单统计交互次数（找时间戳模式）
      const matches = content.match(/\[\d{4}-\d{2}-\d{2}/g);
      if (matches) {
        recentInteractions.push({
          date: file.replace('.md', ''),
          count: matches.length
        });
      }
    }
  } catch (e) {
    console.log('[CRAS-B] 会话文件读取失败，无可用数据');
  }
  
  // [FIX] 无数据时返回 null，不使用伪造默认值
  const rawTotal = recentInteractions.reduce((sum, i) => sum + i.count, 0);
  const totalInteractions = rawTotal > 0 ? rawTotal : null;
  
  // 读取待办事项
  const todos = loadTodoItems();
  
  // [FIX] 无真实数据时，意图/情绪/模式返回"数据不可用"而非伪造值
  const analysis = {
    timestamp: timestamp,
    dateStr: dateStr,
    totalInteractions: totalInteractions,
    topIntent: totalInteractions ? '待真实分析' : '数据不可用',
    emotion: totalInteractions ? '待真实分析' : '数据不可用',
    pattern: totalInteractions ? '待真实分析' : '数据不可用',
    pendingTodos: todos.pending.length,
    todos: todos.pending.slice(0, 5) // 最多5条
  };
  
  return analysis;
}

/**
 * 读取待办事项（简化版）
 */
function loadTodoItems() {
  const todoPath = path.join(WORKSPACE, 'todo.md');
  if (!fs.existsSync(todoPath)) {
    return { pending: [], completed: [] };
  }
  
  try {
    const content = fs.readFileSync(todoPath, 'utf-8');
    const lines = content.split('\n');
    
    const pending = [];
    
    for (const line of lines) {
      // 匹配 - [ ] 开头的待办事项
      const match = line.match(/^- \[ \]\s*(.*)$/);
      if (match) {
        const text = match[1].trim();
        // 提取优先级
        let priority = '中';
        let cleanText = text;
        
        const priorityMatch = text.match(/^\[([高中低])\]\s*(.+)$/);
        if (priorityMatch) {
          priority = priorityMatch[1];
          cleanText = priorityMatch[2];
        }
        
        pending.push({
          priority: priority,
          text: cleanText
        });
      }
    }
    
    return { pending, completed: [] };
  } catch (e) {
    return { pending: [], completed: [] };
  }
}

/**
 * 生成飞书卡片
 */
function generateFeishuCard(analysis) {
  const priorityEmoji = {
    '高': '🔴',
    '中': '🟡',
    '低': '🟢'
  };
  
  // 待办事项元素
  const todoElements = analysis.todos.length > 0 ? [
    { tag: 'hr' },
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**待办 ${analysis.pendingTodos}项**`
      }
    },
    ...analysis.todos.map(item => ({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `${priorityEmoji[item.priority] || '⚪'} ${item.text.substring(0, 50)}`
      }
    }))
  ] : [];
  
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: {
        tag: 'plain_text',
        content: '🧠 CRAS 用户洞察'
      }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `${analysis.dateStr}`
        }
      },
      { tag: 'hr' },
      {
        tag: 'div',
        fields: [
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**意图**\n${analysis.topIntent}`
            }
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**状态**\n${analysis.emotion}`
            }
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**模式**\n${analysis.pattern}`
            }
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**交互**\n${analysis.totalInteractions !== null ? analysis.totalInteractions + '次' : '数据不可用'}`
            }
          }
        ]
      },
      ...todoElements,
      { tag: 'hr' },
      {
        tag: 'note',
        elements: [
          {
            tag: 'plain_text',
            content: '🤖 由 CRAS-B 用户洞察分析中枢自动生成'
          }
        ]
      }
    ]
  };
}

/**
 * 保存到飞书投递队列
 */
function saveToFeishuQueue(card, analysis) {
  try {
    // 确保队列目录存在
    if (!fs.existsSync(CONFIG.feishuQueuePath)) {
      fs.mkdirSync(CONFIG.feishuQueuePath, { recursive: true });
    }
    
    const queueFile = path.join(
      CONFIG.feishuQueuePath,
      `insight_${Date.now()}.json`
    );
    
    const queueContent = {
      type: 'feishu_card',
      card: card,
      timestamp: Date.now(),
      source: 'cras-b-fixed',
      generated_at: analysis.timestamp
    };
    
    fs.writeFileSync(queueFile, JSON.stringify(queueContent, null, 2), 'utf-8');
    console.log(`[CRAS-B] 飞书卡片已保存: ${queueFile}`);
    return queueFile;
    
  } catch (e) {
    console.error(`[CRAS-B] 保存飞书队列失败: ${e.message}`);
    return null;
  }
}

/**
 * 保存文本报告
 */
function saveTextReport(analysis) {
  try {
    if (!fs.existsSync(CONFIG.reportPath)) {
      fs.mkdirSync(CONFIG.reportPath, { recursive: true });
    }
    
    const reportFile = path.join(
      CONFIG.reportPath,
      `insight_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`
    );
    
    const report = `# CRAS-B 用户洞察分析报告

**生成时间**: ${analysis.timestamp}

## 核心指标

- 累计交互: ${analysis.totalInteractions} 次
- 主要意图: ${analysis.topIntent}
- 情绪状态: ${analysis.emotion}
- 交互模式: ${analysis.pattern}
- 待办事项: ${analysis.pendingTodos} 项

## 待办清单

${analysis.todos.map(t => `- [${t.priority}] ${t.text}`).join('\n') || '暂无待办事项'}

---
CRAS-B 用户洞察分析中枢 | 自动生成
`;
    
    fs.writeFileSync(reportFile, report, 'utf-8');
    console.log(`[CRAS-B] 文本报告已保存: ${reportFile}`);
    return reportFile;
    
  } catch (e) {
    console.error(`[CRAS-B] 保存文本报告失败: ${e.message}`);
    return null;
  }
}

/**
 * 主函数
 */
async function main() {
  const startTime = Date.now();
  console.log('='.repeat(60));
  console.log('[CRAS-B] 用户洞察分析启动');
  console.log(`开始时间: ${new Date().toISOString()}`);
  console.log('='.repeat(60));
  
  try {
    // 1. 快速分析（60秒内完成）
    const analysis = quickAnalyzeInteractions();
    console.log(`[CRAS-B] 分析完成: ${analysis.totalInteractions}次交互, ${analysis.pendingTodos}项待办`);
    
    // 2. 生成飞书卡片
    const card = generateFeishuCard(analysis);
    console.log('[CRAS-B] 飞书卡片生成完成');
    
    // 3. 保存到投递队列
    const queueFile = saveToFeishuQueue(card, analysis);
    
    // 4. 保存文本报告
    const reportFile = saveTextReport(analysis);
    
    const duration = Date.now() - startTime;
    console.log('='.repeat(60));
    console.log('[CRAS-B] 执行完成');
    console.log(`耗时: ${duration}ms`);
    console.log(`队列文件: ${queueFile}`);
    console.log(`报告文件: ${reportFile}`);
    console.log('='.repeat(60));
    
    // 输出JSON结果（供调用方解析）
    console.log('\n---RESULT---');
    console.log(JSON.stringify({
      status: 'success',
      duration: duration,
      queue_file: queueFile,
      report_file: reportFile,
      summary: `CRAS-B分析完成: ${analysis.totalInteractions}次交互, ${analysis.pendingTodos}项待办`
    }, null, 2));
    
    process.exit(0);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[CRAS-B] 执行失败:', error.message);
    console.error('='.repeat(60));
    
    console.log('\n---RESULT---');
    console.log(JSON.stringify({
      status: 'error',
      duration: duration,
      error: error.message
    }, null, 2));
    
    process.exit(1);
  }
}

// 超时保护
const timeoutId = setTimeout(() => {
  console.error('[CRAS-B] 执行超时(4分钟)，强制退出');
  process.exit(1);
}, CONFIG.maxExecutionTime);

// 清理超时定时器
process.on('exit', () => {
  clearTimeout(timeoutId);
});

// 运行主函数
main();
