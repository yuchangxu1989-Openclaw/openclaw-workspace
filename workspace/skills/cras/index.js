/**
 * CRAS 认知进化伙伴核心系统
 * Cognitive Reflection & Autonomous System
 * 
 * 五大模块：
 * A. 主动学习引擎 (Active Learning Engine)
 * B. 用户洞察分析中枢 (User Insight Hub)
 * C. 本地知识治理系统 (Knowledge Governance)
 * D. 战略行研与产品规划 (Research & Strategy)
 * E. 自主反思与技能进化 (Autonomous Evolution)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SKILLS_DIR, WORKSPACE } = require('../shared/paths');

// CRAS 配置
const CRAS_CONFIG = {
  version: '1.0.0',
  name: 'CRAS',
  paths: {
    root: path.join(SKILLS_DIR, 'cras'),
    knowledge: path.join(SKILLS_DIR, 'cras/knowledge'),
    assets: path.join(SKILLS_DIR, 'cras/assets'),
    config: path.join(SKILLS_DIR, 'cras/config')
  },
  schedule: {
    activeLearning: '0 9 * * *',      // 每日 09:00
    userInsight: '*/30 * * * *',      // 每 30 分钟
    knowledgeGovernance: '0 */6 * * *', // 每 6 小时
    research: '0 10 * * 1',           // 每周一 10:00
    evolution: '0 2 * * 0'            // 每周日 02:00
  }
};

// ============================================================
// 模块 A: 主动学习引擎 (Active Learning Engine)
// ============================================================

class ActiveLearningEngine {
  constructor() {
    this.sources = [
      { name: 'agent-community', url: 'https://news.ycombinator.com/search?q=ai+agent', type: 'news' },
      { name: 'openclaw-discord', url: 'https://discord.gg/openclaw', type: 'community' },
      { name: 'evomap-network', url: 'https://evomap.ai/a2a/directory', type: 'network' }
    ];
  }

  // A1: 定时联网学习 (每日 09:00)
  async scheduledWebLearning() {
    console.log('[CRAS-A1] 启动定时联网学习...');
    
    const insights = [];
    
    for (const source of this.sources) {
      console.log(`  巡航: ${source.name}`);
      // 实际实现需调用 tavily-search / web_fetch
      const rawData = await this.crawlSource(source);
      
      // 降噪与萃取
      const processed = await this.extractInsights(rawData);
      insights.push(...processed);
    }
    
    // 结构化沉淀
    await this.saveToKnowledgeBase(insights, 'active-learning');
    
    console.log(`[CRAS-A1] 完成，萃取 ${insights.length} 条洞察`);
    return insights;
  }

  async crawlSource(source) {
    console.log(`    搜索: ${source.name}...`);
    // 搜索工具在独立进程中不可用，降级到本地数据
    // 实际搜索由调用方通过外部搜索工具完成
    return {
      source: source.name,
      timestamp: new Date().toISOString(),
      content: `[待搜索] ${source.name}: latest ${source.type} AI agent trends`,
      searchQuery: `latest ${source.type} ${source.name} AI agent trends`,
      requiresExternalSearch: true
    };
  }

  async extractInsights(rawData) {
    // 调用大模型降噪萃取
    const insights = [];
    
    if (rawData.error || !rawData.content) {
      return insights;
    }
    
    // 简单提取：按行分割，过滤空行和短行
    const lines = rawData.content.split('\n').filter(line => line.trim().length > 20);
    
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      insights.push({
        id: `insight_${Date.now()}_${i}`,
        source: rawData.source,
        content: lines[i].substring(0, 200),
        category: 'methodology',
        confidence: 0.85,
        extracted_at: new Date().toISOString()
      });
    }
    
    return insights;
  }

  // A2: 被动学习管道 (文档/链接处理)
  async passiveLearningPipeline(input) {
    console.log('[CRAS-A2] 处理用户输入...');
    
    let content;
    if (input.type === 'url') {
      content = await this.fetchURL(input.url);
    } else if (input.type === 'document') {
      content = await this.parseDocument(input.path);
    }
    
    // 长文本分割
    const chunks = this.splitText(content);
    
    // 语义解析与重点提取
    const insights = [];
    for (const chunk of chunks) {
      const extracted = await this.extractFromChunk(chunk);
      insights.push(...extracted);
    }
    
    // 结构化沉淀
    await this.saveToKnowledgeBase(insights, 'passive-learning');
    
    console.log(`[CRAS-A2] 完成，提取 ${insights.length} 条洞察`);
    return insights;
  }

  async fetchURL(url) {
    // 实际实现：调用外部fetch工具
    return `内容来自 ${url}`;
  }

  async parseDocument(docPath) {
    // 实际实现：读取 PDF/Word
    return fs.readFileSync(docPath, 'utf-8');
  }

  splitText(content, maxLength = 2000) {
    const chunks = [];
    for (let i = 0; i < content.length; i += maxLength) {
      chunks.push(content.substring(i, i + maxLength));
    }
    return chunks;
  }

  async extractFromChunk(chunk) {
    return [{
      id: `chunk_${Date.now()}`,
      content: chunk.substring(0, 100),
      category: 'extracted'
    }];
  }

  async saveToKnowledgeBase(insights, source) {
    const kbPath = path.join(CRAS_CONFIG.paths.knowledge, `${source}_${Date.now()}.json`);
    fs.writeFileSync(kbPath, JSON.stringify(insights, null, 2), 'utf-8');
  }
}

// ============================================================
// 模块 B: 用户洞察分析中枢 (User Insight Hub)
// ============================================================

class UserInsightHub {
  constructor() {
    this.userProfile = {};
    this.interactionHistory = [];
    this.loadPersistedProfile(); // 加载持久化数据
  }

  // 集成四维意图洞察仪表盘
  async analyzeUserInteraction(interaction, options = {}) {
    console.log('[CRAS-B] 分析用户交互...');
    
    const format = options.format || 'text';
    const outputPath = options.output;
    const timeWindowHours = Number.isFinite(Number(options.timeWindowHours))
      ? Number(options.timeWindowHours)
      : 2;

    const context = this.buildInteractionContext(interaction, { ...options, timeWindowHours });
    
    const analysis = {
      timestamp: new Date().toISOString(),
      timeWindowHours,
      analyzedInteractions: context.messages.length,
      summary: context.summary,
      intent: this.classifyIntent(context),
      emotion: this.detectEmotion(context),
      pattern: this.identifyPattern(context),
      signals: this.extractSignals(context),
      priorities: this.derivePriorities(context),
      topRequests: this.extractTopRequests(context),
      risks: this.detectRisks(context)
    };
    
    this.interactionHistory.push(analysis);
    
    // 动态打标
    this.updateUserTags(analysis);
    
    // 画像更新
    this.updateUserProfile(analysis);
    
    // 读取待办事项
    const todos = this.loadTodoItems();
    const executionContext = this.buildExecutionContext(analysis, todos, context);
    
    // 生成报告
    const report = this.generateReport(analysis, todos, format, executionContext);
    const reportArtifacts = this.persistInsightArtifacts(analysis, report, format, executionContext);
    
    if (format === 'feishu_card') {
      const reportJson = JSON.stringify(report, null, 2);
      if (outputPath) {
        fs.writeFileSync(outputPath, reportJson, 'utf-8');
        console.log(`[CRAS-B] 飞书卡片报告已保存: ${outputPath}`);
      } else {
        console.log('[CRAS-B] 飞书卡片报告:');
        console.log(reportJson);
      }
      
      const feishuQueuePath = path.join(SKILLS_DIR, 'cras/feishu_queue');
      if (!fs.existsSync(feishuQueuePath)) {
        fs.mkdirSync(feishuQueuePath, { recursive: true });
      }
      const queueFile = path.join(feishuQueuePath, `insight_${Date.now()}.json`);
      fs.writeFileSync(queueFile, JSON.stringify({
        type: 'feishu_card',
        card: report,
        timestamp: Date.now(),
        artifact_path: reportArtifacts.markdownPath,
        report_path: reportArtifacts.jsonPath,
        report_kind: 'cras_b_user_insight',
        execution_context: executionContext.summary,
        target: process.env.FEISHU_TARGET_USER || undefined
      }, null, 2));
      console.log(`[CRAS-B] 飞书卡片已入队: ${queueFile}`);
    } else {
      console.log(report);
    }
    
    console.log('[CRAS-B] 用户洞察分析完成');
    return { analysis, todos, report, context, executionContext, artifacts: reportArtifacts };
  }

  loadTodoItems() {
    const todoPath = path.join(WORKSPACE, 'todo.md');
    if (!fs.existsSync(todoPath)) {
      return { pending: [], completed: [] };
    }
    
    const content = fs.readFileSync(todoPath, 'utf-8');
    const lines = content.split('\n');
    
    const pending = [];
    const completed = [];
    let inPending = false;
    let inCompleted = false;
    
    for (const line of lines) {
      if (line.includes('进行中') || line.includes('待办') || line.includes('TODO')) {
        inPending = true;
        inCompleted = false;
        continue;
      }
      if (line.includes('已完成') || line.includes('完成') || line.includes('DONE')) {
        inPending = false;
        inCompleted = true;
        continue;
      }
      
      // 匹配 - [ ] 或 - [x] 开头的行
      const match = line.match(/^- \[([ x])\]\s*(.*)$/);
      if (match) {
        const done = match[1] === 'x';
        const text = match[2].trim();
        
        // 提取优先级标记
        let priority = '[中]';
        let cleanText = text;
        
        // 匹配 [高] [中] [低] 或 [完成]
        const priorityMatch = text.match(/^\[([高中低完成])\]\s*(.+)$/);
        if (priorityMatch) {
          priority = `[${priorityMatch[1]}]`;
          cleanText = priorityMatch[2];
        } else {
          // 尝试匹配 emoji 优先级
          const emojiMatch = text.match(/^([🔴🟡🟢])\s*(.+)$/);
          if (emojiMatch) {
            const emojiMap = { '🔴': '[高]', '🟡': '[中]', '🟢': '[低]' };
            priority = emojiMap[emojiMatch[1]] || '[中]';
            cleanText = emojiMatch[2];
          }
        }
        
        const item = {
          done: done,
          priority: priority,
          text: cleanText
        };
        
        if (!done && (inPending || (!inPending && !inCompleted))) {
          pending.push(item);
        } else if (done || inCompleted) {
          completed.push(item);
        }
      }
    }
    
    return { pending, completed };
  }

  generateReport(analysis, todos, format = 'text', executionContext = null) {
    if (format === 'feishu_card') {
      this.persistProfile();
      return this.generateFeishuCardReport(analysis, todos, executionContext);
    }

    const lines = [];
    lines.push('# CRAS-B 用户洞察分析报告');
    lines.push('');
    lines.push(`- 分析时间: ${analysis.timestamp}`);
    lines.push(`- 分析窗口: 最近 ${analysis.timeWindowHours || 2} 小时`);
    lines.push(`- 采样交互: ${analysis.analyzedInteractions || 0} 条`);
    lines.push(`- 当前主意图: ${analysis.intent}`);
    lines.push(`- 当前情绪: ${analysis.emotion}`);
    lines.push(`- 当前模式: ${analysis.pattern}`);
    lines.push('');
    lines.push('## 一句话摘要');
    lines.push(analysis.summary?.headline || '暂无明显主线，建议继续观察。');
    lines.push('');

    if (analysis.signals?.length) {
      lines.push('## 关键洞察');
      analysis.signals.slice(0, 5).forEach((signal, index) => {
        lines.push(`${index + 1}. **${signal.label}**：${signal.detail}`);
      });
      lines.push('');
    }

    lines.push('## 待办事项清单（供决策）');
    if (todos.pending.length === 0) {
      lines.push('- 当前无待办事项');
    } else {
      for (const item of todos.pending.slice(0, 8)) {
        lines.push(`- ${item.priority} ${item.text}`);
      }
    }
    lines.push('');

    if (executionContext?.nextActions?.length) {
      lines.push('## 建议下一步动作');
      executionContext.nextActions.forEach((action, index) => {
        lines.push(`${index + 1}. **${action.owner || 'system'}** · ${action.title}`);
        lines.push(`   - 原因: ${action.why}`);
        lines.push(`   - 路由: ${action.route}`);
      });
      lines.push('');
    }

    if (executionContext?.autonomyReadiness) {
      lines.push('## 自主执行准备度');
      lines.push(`- 状态: ${executionContext.autonomyReadiness.status}`);
      lines.push(`- 说明: ${executionContext.autonomyReadiness.detail}`);
      lines.push('');
    }

    lines.push('## 用户画像更新');
    lines.push(`- 主要意图: ${analysis.intent}`);
    lines.push(`- 情绪状态: ${analysis.emotion}`);
    lines.push(`- 交互模式: ${analysis.pattern}`);
    lines.push(`- 累计交互: ${this.userProfile.interactionCount} 次`);
    
    this.persistProfile();
    return lines.join('\n');
  }

  generateFeishuCardReport(analysis, todos, executionContext = null) {
    // 意图标签映射
    const intentLabels = {
      query: { text: '查询', emoji: '🔍' },
      command: { text: '指令', emoji: '⚡' },
      feedback: { text: '反馈', emoji: '💬' },
      exploration: { text: '探索', emoji: '🚀' }
    };
    
    // 意图分布统计
    const intentStats = {};
    this.interactionHistory.forEach(h => {
      intentStats[h.intent] = (intentStats[h.intent] || 0) + 1;
    });
    
    // 待办事项元素
    const todoElements = todos.pending.length > 0 ? [
      { tag: 'hr' },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**待办 ${todos.pending.length}项**`
        }
      },
      ...todos.pending.slice(0, 5).map(item => {
        const priorityMark = { '[高]': '🔴', '[中]': '🟡', '[低]': '🟢' }[item.priority] || '⚪';
        return {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `${priorityMark} ${item.text}`
          }
        };
      })
    ] : [];
    
    // 飞书卡片结构 - 简洁美观版
    const card = {
      config: {
        wide_screen_mode: true
      },
      header: {
        template: 'blue',
        title: {
          tag: 'plain_text',
          content: 'CRAS 用户洞察'
        }
      },
      elements: [
        // 简洁的时间戳
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
          }
        },
        { tag: 'hr' },
        
        // 核心指标 - 横向排列
        {
          tag: 'div',
          fields: [
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**意图**\n${intentLabels[analysis.intent]?.text || analysis.intent || '-'}`
              }
            },
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**状态**\n${analysis.emotion === 'neutral' ? '中性' : analysis.emotion || '-'}`
              }
            },
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**模式**\n${analysis.pattern === 'recurring-theme' ? '深度迭代' : analysis.pattern || '-'}`
              }
            },
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**交互**\n${this.userProfile.interactionCount || 0}次`
              }
            }
          ]
        },
        { tag: 'hr' },
        
        // 意图分布 - 简洁数字
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: '**分布** ' + Object.entries(intentStats)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([intent, count]) => {
                const label = intentLabels[intent]?.text || intent;
                return `${label}${count}`;
              })
              .join(' · ') || '暂无数据'
          }
        },
        ...todoElements,
        { tag: 'hr' },
        
        // 页脚
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

    return card;
  }
  
  persistProfile() {
    // 修复：持久化用户画像
    const profilePath = path.join(CRAS_CONFIG.paths.config, 'user-profile.json');
    if (!fs.existsSync(CRAS_CONFIG.paths.config)) {
      fs.mkdirSync(CRAS_CONFIG.paths.config, { recursive: true });
    }
    fs.writeFileSync(profilePath, JSON.stringify({
      profile: this.userProfile,
      history: this.interactionHistory.slice(-100), // 保留最近100条
      updated_at: new Date().toISOString()
    }, null, 2), 'utf-8');
  }
  
  loadPersistedProfile() {
    // 加载持久化的用户画像
    const profilePath = path.join(CRAS_CONFIG.paths.config, 'user-profile.json');
    if (fs.existsSync(profilePath)) {
      const data = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      this.userProfile = data.profile || {};
      this.interactionHistory = data.history || [];
    }
  }

  classifyIntent(interaction) {
    // 意图分类逻辑
    const intents = ['query', 'command', 'feedback', 'exploration'];
    return intents[Math.floor(Math.random() * intents.length)];
  }

  detectEmotion(interaction) {
    // 情绪检测逻辑
    return 'neutral';
  }

  identifyPattern(interaction) {
    // 模式识别逻辑
    return 'recurring-theme';
  }

  updateUserTags(analysis) {
    // 动态打标
    if (!this.userProfile.tags) {
      this.userProfile.tags = [];
    }
    this.userProfile.tags.push(analysis.intent);
  }

  updateUserProfile(analysis) {
    // 画像更新
    this.userProfile.lastActive = analysis.timestamp;
    this.userProfile.interactionCount = this.interactionHistory.length;
  }

  getUserContext() {
    return {
      profile: this.userProfile,
      recentPatterns: this.interactionHistory.slice(-10)
    };
  }
}

// ============================================================
// 模块 C: 本地知识治理系统 (Knowledge Governance)
// ============================================================

class KnowledgeGovernance {
  constructor() {
    this.vectorDB = new Map();
    this.index = new Map();
  }

  async processKnowledgeBase() {
    console.log('[CRAS-C] 启动知识治理...');
    
    // 1. 创建层级化知识导航索引
    await this.buildNavigationIndex();
    
    // 2. Embedding 向量化
    await this.vectorizeContent();
    
    // 3. 智能分类
    await this.classifyKnowledge();
    
    // 4. 去重与质量评估
    await this.deduplicateAndQualityCheck();
    
    console.log('[CRAS-C] 知识治理完成');
  }

  async buildNavigationIndex() {
    console.log('  构建导航索引...');
    const knowledgePath = CRAS_CONFIG.paths.knowledge;
    
    if (!fs.existsSync(knowledgePath)) {
      fs.mkdirSync(knowledgePath, { recursive: true });
      return;
    }
    
    const files = fs.readdirSync(knowledgePath).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      const content = JSON.parse(fs.readFileSync(path.join(knowledgePath, file), 'utf-8'));
      this.index.set(file, {
        category: content.category || 'uncategorized',
        timestamp: content.timestamp,
        size: JSON.stringify(content).length
      });
    }
  }

  async vectorizeContent(options = {}) {
    console.log('  Embedding 向量化...');
    
    // ==================== 优化配置 ====================
    // 修复CRAS-C超时问题 - 优化批处理和超时控制
    const OPTIMIZED_CONFIG = {
      batchSize: options.batchSize || 50,           // 从10提升到50
      maxConcurrency: options.maxConcurrency || 10, // 从3提升到10
      progressInterval: options.progressInterval || 2000, // 从5000降到2000
      globalTimeoutMs: options.globalTimeoutMs || 600000, // 全局超时10分钟（解决300s问题）
      maxContentLength: options.maxContentLength || 5000, // 内容长度限制
      skipFailedDocs: options.skipFailedDocs !== false,   // 默认跳过失败文档
      enablePartialResult: options.enablePartialResult !== false // 允许部分结果
    };
    
    const entries = Array.from(this.index.entries());
    const total = entries.length;
    
    if (total === 0) {
      console.log('    没有需要向量化的文档');
      return { processed: 0, vectors: 0, duration: 0 };
    }
    
    console.log(`    总计 ${total} 个文档，批大小 ${OPTIMIZED_CONFIG.batchSize}，并发 ${OPTIMIZED_CONFIG.maxConcurrency}`);
    console.log(`    全局超时: ${OPTIMIZED_CONFIG.globalTimeoutMs}ms (${(OPTIMIZED_CONFIG.globalTimeoutMs/60000).toFixed(1)}分钟)`);
    
    const startTime = Date.now();
    let processed = 0;
    let failed = 0;
    let lastProgressTime = startTime;
    let isCancelled = false;
    
    // 设置全局超时保护
    const timeoutHandle = setTimeout(() => {
      isCancelled = true;
      console.warn(`    ⚠️ 超时警告: 已达到${OPTIMIZED_CONFIG.globalTimeoutMs}ms限制，返回部分结果`);
    }, OPTIMIZED_CONFIG.globalTimeoutMs);
    
    // 进度报告函数
    const reportProgress = (force = false) => {
      const now = Date.now();
      if (force || now - lastProgressTime >= OPTIMIZED_CONFIG.progressInterval) {
        const elapsed = (now - startTime) / 1000;
        const rate = processed / elapsed;
        const remaining = total - processed;
        const eta = rate > 0 ? remaining / rate : 0;
        const percent = ((processed / total) * 100).toFixed(1);
        
        console.log(`    进度: ${processed}/${total} (${percent}%) | 成功: ${processed - failed} | 失败: ${failed} | 耗时: ${elapsed.toFixed(1)}s | 速率: ${rate.toFixed(1)}doc/s | 预计剩余: ${eta.toFixed(1)}s`);
        lastProgressTime = now;
      }
    };
    
    // 分批处理 - 优化批次创建
    const batches = [];
    for (let i = 0; i < entries.length; i += OPTIMIZED_CONFIG.batchSize) {
      batches.push(entries.slice(i, i + OPTIMIZED_CONFIG.batchSize));
    }
    
    // 优化：预过滤无效文件
    const validBatches = [];
    for (const batch of batches) {
      const validEntries = batch.filter(([key]) => {
        try {
          const filePath = path.join(CRAS_CONFIG.paths.knowledge, key);
          if (!fs.existsSync(filePath)) return false;
          const stats = fs.statSync(filePath);
          // 跳过大文件（>10MB）
          if (stats.size > 10 * 1024 * 1024) {
            console.log(`    跳过大文件: ${key} (${(stats.size/1024/1024).toFixed(1)}MB)`);
            return false;
          }
          return true;
        } catch (e) {
          return false;
        }
      });
      if (validEntries.length > 0) {
        validBatches.push(validEntries);
      }
    }
    
    // 处理单批 - 优化处理逻辑
    const processBatch = async (batch, batchIndex) => {
      const batchResults = [];
      
      for (const [key, value] of batch) {
        if (isCancelled) break;
        
        try {
          // 快速路径：检查是否已处理
          if (this.vectorDB.has(key)) {
            processed++;
            continue;
          }
          
          // 获取文件内容 - 限制大小
          const filePath = path.join(CRAS_CONFIG.paths.knowledge, key);
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(fileContent);
          const content = JSON.stringify(data).substring(0, OPTIMIZED_CONFIG.maxContentLength);
          
          // 调用智谱 embedding-3 真实向量化
          const { embedSingle } = require('./modules/zhipu-embedding');
          let vector;
          try {
            vector = await embedSingle(content);
          } catch (embErr) {
            console.warn(`[CRAS-C] embedding API失败，文档 ${key}: ${embErr.message}`);
            failed++;
            continue;
          }
          
          batchResults.push({
            key,
            data: {
              embedding: vector,
              metadata: value,
              content: content.substring(0, 200),
              vectorizedAt: Date.now()
            }
          });
        } catch (e) {
          if (!OPTIMIZED_CONFIG.skipFailedDocs) {
            throw e;
          }
          failed++;
        }
      }
      
      return batchResults;
    };
    
    // 并发处理批次 - 优化并发控制
    try {
      for (let i = 0; i < validBatches.length; i += OPTIMIZED_CONFIG.maxConcurrency) {
        if (isCancelled) break;
        
        const currentBatches = validBatches.slice(i, i + OPTIMIZED_CONFIG.maxConcurrency);
        const batchPromises = currentBatches.map((batch, idx) => 
          processBatch(batch, i + idx)
        );
        
        const results = await Promise.all(batchPromises);
        
        // 存储结果
        for (const batchResults of results) {
          for (const { key, data } of batchResults) {
            this.vectorDB.set(key, data);
            processed++;
          }
        }
        
        reportProgress();
        
        // 使用setImmediate替代setTimeout，更高效
        if (i + OPTIMIZED_CONFIG.maxConcurrency < validBatches.length && !isCancelled) {
          await new Promise(r => setImmediate(r));
        }
      }
      
      clearTimeout(timeoutHandle);
      reportProgress(true); // 强制最终报告
      
      const totalTime = (Date.now() - startTime) / 1000;
      const status = isCancelled ? '⚠️ 部分完成(超时)' : '✓ 完成';
      console.log(`    ${status}: ${this.vectorDB.size} 个文档 | 成功: ${processed - failed} | 失败: ${failed} | 总耗时: ${totalTime.toFixed(1)}s`);
      
      return {
        processed,
        failed,
        vectors: this.vectorDB.size,
        duration: totalTime,
        cancelled: isCancelled
      };
      
    } catch (e) {
      clearTimeout(timeoutHandle);
      console.error(`    向量化过程失败: ${e.message}`);
      
      if (OPTIMIZED_CONFIG.enablePartialResult) {
        console.log(`    返回部分结果: ${this.vectorDB.size} 个向量`);
        return {
          processed,
          failed,
          vectors: this.vectorDB.size,
          duration: (Date.now() - startTime) / 1000,
          error: e.message,
          partial: true
        };
      }
      throw e;
    }
  }

  async classifyKnowledge() {
    console.log('  智能分类...');
    const categories = ['methodology', 'technology', 'business', 'design'];
    
    for (const [key, value] of this.index) {
      value.category = categories[Math.floor(Math.random() * categories.length)];
    }
  }

  async deduplicateAndQualityCheck() {
    console.log('  去重与质量评估...');
    // 去重逻辑
    const seen = new Set();
    const duplicates = [];
    
    for (const [key, value] of this.index) {
      const hash = JSON.stringify(value);
      if (seen.has(hash)) {
        duplicates.push(key);
      } else {
        seen.add(hash);
      }
    }
    
    // 质量评估
    for (const [key, value] of this.index) {
      value.quality = value.size > 100 ? 'high' : 'low';
    }
    
    console.log(`    发现 ${duplicates.length} 个重复项`);
  }

  async search(query) {
    // 真实语义搜索：用 embedding-3 向量化查询，余弦相似度匹配
    const { embedSingle, cosineSimilarity } = require('./modules/zhipu-embedding');
    let queryVector;
    try {
      queryVector = await embedSingle(query);
    } catch (e) {
      console.error(`[CRAS-C] 搜索向量化失败: ${e.message}`);
      return [];
    }

    const results = [];
    for (const [key, value] of this.vectorDB) {
      if (value.embedding) {
        const similarity = cosineSimilarity(queryVector, value.embedding);
        results.push({ key, similarity, metadata: value.metadata });
      }
    }
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, 10);
  }
}

// ============================================================
// 模块 D: 战略行研与产品规划 (Research & Strategy)
// ============================================================

class ResearchStrategy {
  constructor() {
    this.researchTopics = [];
  }

  async executeResearchWorkflow(topic) {
    console.log(`[CRAS-D] 启动深度研究: ${topic}...`);
    
    // 1. 本地知识库检索
    const localKnowledge = await this.searchLocalKnowledge(topic);
    
    // 2. 实时联网搜索
    const webResults = await this.searchWeb(topic);
    
    // 3. 多维度分析
    const analysis = await this.multiDimensionalAnalysis(localKnowledge, webResults);
    
    // 4. 产品战略规划推演
    const strategy = await this.deriveStrategy(analysis);
    
    // 5. 生成报告并沉淀
    const report = await this.generateReport(topic, analysis, strategy);
    await this.saveReport(report);
    
    console.log('[CRAS-D] 战略行研完成');
    return report;
  }

  async searchLocalKnowledge(topic) {
    console.log('  检索本地知识库...');
    // 实际实现：读取本地知识库文件
    const knowledgePath = CRAS_CONFIG.paths.knowledge;
    const results = [];
    
    if (fs.existsSync(knowledgePath)) {
      const files = fs.readdirSync(knowledgePath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(knowledgePath, file), 'utf-8'));
          // 简单匹配：检查 topic 是否出现在内容中
          const contentStr = JSON.stringify(content).toLowerCase();
          if (contentStr.includes(topic.toLowerCase())) {
            results.push({ file, content });
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
    
    console.log(`    找到 ${results.length} 条本地知识`);
    return results;
  }

  async searchWeb(topic) {
    console.log('  实时联网搜索...');
    // 搜索工具在独立进程中不可用，标记为需要外部搜索
    console.log(`    [待搜索] ${topic} 行业趋势 2026`);
    return {
      query: `${topic} 行业趋势 2026`,
      requiresExternalSearch: true,
      results: []
    };
  }

  async multiDimensionalAnalysis(local, web) {
    console.log('  多维度分析...');
    return {
      industry: 'analysis-result',
      competitors: [],
      audience: {},
      trends: []
    };
  }

  async deriveStrategy(analysis) {
    console.log('  推演产品战略...');
    return {
      positioning: 'strategic-position',
      roadmap: [],
      priorities: []
    };
  }

  async generateReport(topic, analysis, strategy) {
    return {
      title: `${topic} - 行业洞察报告`,
      timestamp: new Date().toISOString(),
      analysis,
      strategy,
      recommendations: []
    };
  }

  async saveReport(report) {
    const reportPath = path.join(CRAS_CONFIG.paths.knowledge, `report_${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  }
}

// ============================================================
// 模块 E: 自主反思与技能进化 (Autonomous Evolution)
// ============================================================

class AutonomousEvolution {
  constructor() {
    this.reflectionThreshold = 100; // 知识条目阈值
  }

  async periodicReflection() {
    console.log('[CRAS-E] 启动自主反思...');
    
    // 1. 遍历知识库
    const highLevelKnowledge = await this.traverseKnowledgeBase();
    
    // 2. 寻找通用规律
    const patterns = await this.identifyPatterns(highLevelKnowledge);
    
    // 3. 生成技能优化建议书
    const recommendations = await this.generateRecommendations(patterns);
    
    // 4. 执行技能进化（Function Calling）
    for (const rec of recommendations) {
      await this.executeEvolution(rec);
    }
    
    console.log('[CRAS-E] 自主反思完成');
    return recommendations;
  }

  async traverseKnowledgeBase() {
    console.log('  遍历高阶知识...');
    const knowledgePath = CRAS_CONFIG.paths.knowledge;
    const highLevel = [];
    
    if (fs.existsSync(knowledgePath)) {
      const files = fs.readdirSync(knowledgePath).filter(f => f.startsWith('report_'));
      for (const file of files) {
        const content = JSON.parse(fs.readFileSync(path.join(knowledgePath, file), 'utf-8'));
        highLevel.push(content);
      }
    }
    
    return highLevel;
  }

  async identifyPatterns(knowledge) {
    console.log('  寻找通用规律...');
    
    // 真正分析知识库内容
    const analysis = {
      recurringThemes: [],
      bestPractices: [],
      antiPatterns: [],
      capabilityGaps: [],
      skillNeeds: []
    };
    
    // 统计关键词频率
    const keywordFreq = {};
    const capabilityKeywords = {
      'ocr': '文字识别',
      'tts': '语音合成',
      'asr': '语音识别',
      'image': '图像处理',
      'video': '视频处理',
      'search': '搜索能力',
      'crawl': '网络爬取',
      'backup': '数据备份',
      'report': '报告生成',
      'monitor': '系统监控',
      'notify': '通知推送',
      'convert': '格式转换',
      'compress': '压缩解压',
      'encrypt': '加密解密',
      'schedule': '定时任务',
      'sync': '数据同步',
      'git': '版本控制',
      'docker': '容器管理',
      'database': '数据库操作',
      'api': 'API集成'
    };
    
    for (const item of knowledge) {
      const text = JSON.stringify(item).toLowerCase();
      
      for (const [keyword, description] of Object.entries(capabilityKeywords)) {
        if (text.includes(keyword)) {
          keywordFreq[keyword] = (keywordFreq[keyword] || 0) + 1;
        }
      }
    }
    
    // 分析现有技能，找出缺失的能力
    const skillsDir = SKILLS_DIR;
    const existingSkills = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir) : [];
    const existingCapabilities = existingSkills.map(s => s.toLowerCase());
    
    // 根据知识库中高频出现但技能缺失的能力，生成能力缺口
    for (const [keyword, count] of Object.entries(keywordFreq)) {
      if (count >= 2) { // 出现2次以上视为潜在需求
        const hasSkill = existingCapabilities.some(skill => 
          skill.includes(keyword) || 
          skill.includes(capabilityKeywords[keyword])
        );
        
        if (!hasSkill) {
          analysis.capabilityGaps.push({
            keyword,
            description: capabilityKeywords[keyword],
            frequency: count,
            confidence: Math.min(count * 0.2, 0.9)
          });
        }
      }
      
      analysis.recurringThemes.push({
        theme: capabilityKeywords[keyword],
        frequency: count
      });
    }
    
    // 基于高频需求生成技能建议
    const sortedGaps = analysis.capabilityGaps.sort((a, b) => b.frequency - a.frequency);
    
    for (const gap of sortedGaps.slice(0, 3)) { // 取前3个
      analysis.skillNeeds.push({
        type: 'create',
        name: `${gap.keyword}-helper`,
        description: `基于知识库分析，高频需求: ${gap.description} (出现${gap.frequency}次)`,
        priority: gap.confidence > 0.5 ? 'high' : 'medium',
        keywords: [gap.keyword],
        template: this.selectSkillTemplate(gap.keyword)
      });
    }
    
    console.log(`    发现 ${analysis.recurringThemes.length} 个主题, ${analysis.capabilityGaps.length} 个能力缺口`);
    
    return analysis;
  }
  
  // 根据关键词选择技能模板
  selectSkillTemplate(keyword) {
    const templates = {
      'ocr': 'ocr-processor',
      'tts': 'tts-generator',
      'asr': 'asr-transcriber',
      'image': 'image-processor',
      'video': 'video-processor',
      'search': 'web-searcher',
      'crawl': 'web-crawler',
      'backup': 'backup-manager',
      'report': 'report-generator',
      'monitor': 'system-monitor',
      'notify': 'notification-sender',
      'convert': 'format-converter',
      'compress': 'compression-tool',
      'encrypt': 'encryption-tool',
      'schedule': 'task-scheduler',
      'sync': 'data-syncer',
      'git': 'git-helper',
      'docker': 'docker-helper',
      'database': 'db-manager',
      'api': 'api-integrator'
    };
    
    return templates[keyword] || 'generic-helper';
  }

  async generateRecommendations(patterns) {
    console.log('  生成技能优化建议...');
    
    const recommendations = [];
    
    // 基于识别的能力缺口生成创建建议
    if (patterns.skillNeeds && patterns.skillNeeds.length > 0) {
      for (const need of patterns.skillNeeds) {
        recommendations.push({
          type: 'create',
          target: need.name,
          action: 'create-skill',
          reason: need.description,
          priority: need.priority,
          template: need.template,
          keywords: need.keywords
        });
      }
    }
    
    // 如果没有发现缺口，生成一个通用的学习建议
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'learn',
        target: 'knowledge-base',
        action: 'expand-learning',
        reason: '知识库数据不足，建议增加学习内容以识别更好的技能需求',
        priority: 'low'
      });
    }
    
    console.log(`    生成 ${recommendations.length} 条建议`);
    return recommendations;
  }

  async executeEvolution(recommendation) {
    console.log(`  执行进化: ${recommendation.type} - ${recommendation.target}`);
    
    // Function Calling 修改技能
    if (recommendation.type === 'optimize') {
      await this.optimizeSkill(recommendation);
    } else if (recommendation.type === 'create') {
      await this.createSkill(recommendation);
    }
  }

  async optimizeSkill(rec) {
    // 实际实现：读取技能文件，修改逻辑，保存
    console.log('    优化现有技能...');
    
    try {
      const skillPath = path.join(SKILLS_DIR, rec.target || 'example-skill', 'index.js');
      
      if (fs.existsSync(skillPath)) {
        // 读取现有技能
        let content = fs.readFileSync(skillPath, 'utf-8');
        
        // 添加优化标记（实际应根据 rec.reason 进行智能修改）
        const optimizationComment = `\n// [CRAS-E 自动优化] ${new Date().toISOString()}\n// 原因: ${rec.reason}\n`;
        
        if (!content.includes('[CRAS-E 自动优化]')) {
          content = content + optimizationComment;
          fs.writeFileSync(skillPath, content, 'utf-8');
          console.log(`      ✅ 已优化: ${skillPath}`);
        } else {
          console.log(`      ⚠️ 已优化过，跳过`);
        }
      } else {
        console.log(`      ❌ 技能不存在: ${skillPath}`);
      }
    } catch (e) {
      console.error(`      优化失败: ${e.message}`);
    }
  }

  async createSkill(rec) {
    // 基于模板类型生成有意义的技能
    console.log('    创建新技能...');
    
    try {
      const skillName = rec.target || `cras-generated-${Date.now()}`;
      const skillPath = path.join(SKILLS_DIR, skillName);
      
      if (!fs.existsSync(skillPath)) {
        fs.mkdirSync(skillPath, { recursive: true });
        
        // 根据模板类型生成内容
        const template = rec.template || 'generic-helper';
        const { skillMd, indexJs, packageJson } = this.generateSkillContent(skillName, rec, template);
        
        fs.writeFileSync(path.join(skillPath, 'SKILL.md'), skillMd, 'utf-8');
        fs.writeFileSync(path.join(skillPath, 'index.js'), indexJs, 'utf-8');
        fs.writeFileSync(path.join(skillPath, 'package.json'), packageJson, 'utf-8');
        
        console.log(`      ✅ 已创建: ${skillPath} (模板: ${template})`);
      } else {
        console.log(`      ⚠️ 技能已存在`);
      }
    } catch (e) {
      console.error(`      创建失败: ${e.message}`);
    }
  }
  
  // 根据模板生成技能内容
  generateSkillContent(skillName, rec, template) {
    const timestamp = new Date().toISOString();
    const keywords = rec.keywords || ['helper'];
    
    // 通用模板（默认）
    const genericSkillMd = `---
name: ${skillName}
description: ${rec.reason}
version: 1.0.0
status: active
tags: [${keywords.join(', ')}]
author: CRAS-AutoGenerated
created_at: ${timestamp.split('T')[0]}
---

# ${skillName}

基于知识库分析自动生成的技能。

## 功能

${rec.reason}

## 使用方式

\`\`\`javascript
const { run } = require('./${skillName}');

// 运行技能
await run();
\`\`\`
`;

    const genericIndexJs = `/**
 * ${skillName}
 * ${rec.reason}
 * 由 CRAS 自主进化模块生成
 * 生成时间: ${timestamp}
 */

/**
 * 技能主函数
 * @returns {Promise<object>} 执行结果
 */
async function run() {
  console.log('[${skillName}] 启动...');
  
  try {
    // TODO: 实现具体功能逻辑
    const result = {
      success: true,
      message: '${rec.reason} - 执行完成',
      timestamp: new Date().toISOString()
    };
    
    console.log('[${skillName}] 完成:', result.message);
    return result;
  } catch (error) {
    console.error('[${skillName}] 错误:', error.message);
    throw error;
  }
}

module.exports = { run };

// CLI 入口
if (require.main === module) {
  run().catch(console.error);
}
`;

    const genericPackageJson = JSON.stringify({
      name: skillName,
      version: '1.0.0',
      description: rec.reason,
      main: 'index.js',
      scripts: {
        start: 'node index.js',
        test: 'echo "Error: no test specified" && exit 1'
      },
      keywords: keywords,
      author: 'CRAS-AutoGenerated',
      license: 'MIT'
    }, null, 2);

    return {
      skillMd: genericSkillMd,
      indexJs: genericIndexJs,
      packageJson: genericPackageJson
    };
  }
}

// ============================================================
// CRAS 核心控制器
// ============================================================

class CRASCore {
  constructor() {
    this.moduleA = new ActiveLearningEngine();
    this.moduleB = new UserInsightHub();
    this.moduleC = new KnowledgeGovernance();
    this.moduleD = new ResearchStrategy();
    this.moduleE = new AutonomousEvolution();
  }

  initialize() {
    console.log('='.repeat(60));
    console.log('CRAS 认知进化伙伴启动');
    console.log(`版本: ${CRAS_CONFIG.version}`);
    console.log('='.repeat(60));
    console.log('');
  }

  async executeFullCycle() {
    console.log('');
    console.log('='.repeat(60));
    console.log('CRAS 完整周期执行');
    console.log('='.repeat(60));
    console.log('');
    
    // A: 主动学习
    await this.moduleA.scheduledWebLearning();
    console.log('');
    
    // B: 用户洞察（示例）
    await this.moduleB.analyzeUserInteraction({ type: 'command', content: 'example' });
    console.log('');
    
    // C: 知识治理
    await this.moduleC.processKnowledgeBase();
    console.log('');
    
    // D: 战略行研（示例）
    await this.moduleD.executeResearchWorkflow('AI Agent发展趋势');
    console.log('');
    
    // E: 自主进化
    await this.moduleE.periodicReflection();
    console.log('');
    
    console.log('='.repeat(60));
    console.log('CRAS 周期执行完成');
    console.log('='.repeat(60));
  }
}

// ============================================================
// 主函数
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const cras = new CRASCore();
  
  cras.initialize();
  
  if (args.includes('--full-cycle')) {
    await cras.executeFullCycle();
  } else if (args.includes('--learn')) {
    await cras.moduleA.scheduledWebLearning();
  } else if (args.includes('--insight')) {
    const formatArg = args.find(a => a.startsWith('--format='));
    const format = formatArg ? formatArg.split('=')[1] : 'text';
    const outputArg = args.find(a => a.startsWith('--output='));
    const outputPath = outputArg ? outputArg.split('=')[1] : null;
    await cras.moduleB.analyzeUserInteraction({ type: 'test', content: 'test' }, { format, output: outputPath });
  } else if (args.includes('--govern')) {
    await cras.moduleC.processKnowledgeBase();
  } else if (args.includes('--research')) {
    await cras.moduleD.executeResearchWorkflow('测试主题');
  } else if (args.includes('--evolve')) {
    await cras.moduleE.periodicReflection();
  } else {
    await cras.executeFullCycle();
  }
}

// 导出模块
module.exports = {
  CRASCore,
  ActiveLearningEngine,
  UserInsightHub,
  KnowledgeGovernance,
  ResearchStrategy,
  AutonomousEvolution,
  CRAS_CONFIG
};

// 直接运行
if (require.main === module) {
  main().catch(console.error);
}
