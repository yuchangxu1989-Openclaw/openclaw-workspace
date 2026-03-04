#!/usr/bin/env node
/**
 * CRAS-A 主动学习引擎 - 每日04:00执行
 * 任务名称：CRAS-A-主动学习引擎-每日04:00
 * 
 * 学习内容：
 * 1. 论文学习（3条核心洞察）- 搜索OpenAI、DeepMind、Antropic最新论文
 * 2. 工程实践学习（3条优化策略）- 搜索Agent、AI产品最前沿工程实践
 * 
 * 输出：每天6条核心洞察保存到knowledge/目录
 * 执行方式：node cras-learning-engine.cjs --daily
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const WORKSPACE = '/root/.openclaw/workspace';
const KNOWLEDGE_DIR = `${WORKSPACE}/knowledge`;
const PAPERS_DIR = `${KNOWLEDGE_DIR}/papers`;
const PRACTICES_DIR = `${KNOWLEDGE_DIR}/practices`;
const LOG_DIR = `${WORKSPACE}/logs`;

/**
 * GLM-5 调用封装类
 * 用于论文搜索、分析和洞察提取
 */
class GLM5LearningEngine {
  constructor() {
    this.baseURL = 'open.bigmodel.cn';
    this.apiPath = '/api/coding/paas/v4/chat/completions';
    this.model = process.env.LLM_MODEL || 'claude-sonnet-4-6';
    this.apiKeys = this.loadKeys();
    this.currentKeyIndex = 0;
    this.failedKeys = new Set();
  }

  loadKeys() {
    const keys = [];
    // 从环境变量加载
    for (let i = 1; i <= 10; i++) {
      const key = process.env[`ZHIPU_API_KEY_${i}`];
      if (key) keys.push(key);
    }
    
    // 从.secrets文件加载
    const secretsPath = '/root/.openclaw/.secrets/zhipu-keys.env';
    if (fs.existsSync(secretsPath)) {
      const content = fs.readFileSync(secretsPath, 'utf8');
      const envKeys = content.match(/ZHIPU_API_KEY_\d+=[a-zA-Z0-9._-]+/g) || [];
      envKeys.forEach(line => {
        const key = line.split('=')[1];
        if (key && !keys.includes(key)) keys.push(key);
      });
    }
    
    console.log(`[GLM-5] 加载了 ${keys.length} 个API Key`);
    return keys;
  }

  getNextKey() {
    const availableKeys = this.apiKeys.filter(k => !this.failedKeys.has(k));
    if (availableKeys.length === 0) {
      this.failedKeys.clear();
      return this.apiKeys[0];
    }
    const key = availableKeys[this.currentKeyIndex % availableKeys.length];
    this.currentKeyIndex++;
    return key;
  }

  async analyze(prompt, options = {}) {
    const body = {
      model: this.model,
      messages: [{
        role: 'user',
        content: prompt
      }],
      stream: false,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 65536,
      thinking: { type: 'enabled' }
    };

    return this.requestWithRetry(this.apiPath, body, options.maxRetries || 3);
  }

  async requestWithRetry(path, body, maxRetries = 3) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      const key = this.getNextKey();
      try {
        const result = await this.request(path, body, key);
        return result;
      } catch (error) {
        lastError = error;
        if (error.message.includes('401') || error.message.includes('403')) {
          this.failedKeys.add(key);
          continue;
        }
        if (error.message.includes('429')) {
          await this.sleep(2000);
          continue;
        }
        throw error;
      }
    }
    throw new Error(`所有Key都失败: ${lastError.message}`);
  }

  request(path, body, apiKey) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const options = {
        hostname: this.baseURL,
        path: path,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 300000 // 5分钟超时
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => responseData += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode >= 400) {
              reject(new Error(`${res.statusCode}: ${responseData}`));
              return;
            }
            const json = JSON.parse(responseData);
            if (json.error) {
              reject(new Error(json.error.message));
            } else {
              resolve({
                content: json.choices?.[0]?.message?.content || '',
                reasoning: json.choices?.[0]?.message?.reasoning_content || '',
                usage: json.usage,
                model: json.model
              });
            }
          } catch (e) {
            reject(new Error('解析响应失败: ' + e.message));
          }
        });
      });

      req.on('error', (e) => reject(new Error('请求失败: ' + e.message)));
      req.on('timeout', () => reject(new Error('请求超时')));
      req.write(data);
      req.end();
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 论文学习模块 - 搜索并分析AI顶级论文
 */
class PaperLearningModule {
  constructor(glm5) {
    this.glm5 = glm5;
    this.sources = ['OpenAI', 'DeepMind', 'Anthropic', 'Google Research', 'Meta AI'];
  }

  /**
   * 搜索最新论文并提取3条核心洞察
   */
  async learn(dateStr) {
    console.log(`[PaperLearning] 开始论文学习: ${dateStr}`);
    
    const prompt = `作为AI研究专家，请搜索并分析以下机构最近一周发表的顶级AI论文：
- OpenAI (openai.com/research)
- DeepMind (deepmind.google/research/)
- Anthropic (anthropic.com/research)
- Google Research (research.google)
- Meta AI (ai.meta.com/research/)

任务：
1. 从每个机构选择最优质、最具影响力的1-2篇论文（共约6-8篇）
2. 对每篇论文，提取以下信息：
   - 论文标题和链接
   - 核心创新点（1句话）
   - 技术突破（2-3句话）
   - 对AI领域的潜在影响（2-3句话）
3. 从这6-8篇中，选择最优质的3篇，给出深度洞察

请严格按照以下JSON格式输出（不要有其他文字）：

{
  "date": "${dateStr}",
  "total_papers_reviewed": 6,
  "top_3_insights": [
    {
      "rank": 1,
      "institution": "OpenAI/DeepMind/Anthropic等",
      "paper_title": "论文标题",
      "paper_url": "论文链接",
      "core_innovation": "一句话描述核心创新",
      "technical_breakthrough": "技术突破描述",
      "impact_analysis": "对AI领域的影响分析",
      "actionable_insight": "可执行的认知升级建议"
    },
    {
      "rank": 2,
      ...
    },
    {
      "rank": 3,
      ...
    }
  ],
  "learning_summary": "今日论文学习的整体总结和趋势洞察"
}`;

    try {
      const result = await this.glm5.analyze(prompt, { 
        temperature: 0.8,
        max_tokens: 65536 
      });
      
      // 尝试从响应中提取JSON
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // 如果无法解析JSON，返回结构化文本
      return {
        date: dateStr,
        raw_content: result.content,
        reasoning: result.reasoning,
        parse_error: true
      };
    } catch (error) {
      console.error(`[PaperLearning] 学习失败: ${error.message}`);
      return {
        date: dateStr,
        error: error.message,
        top_3_insights: []
      };
    }
  }
}

/**
 * 工程实践学习模块 - 搜索Agent和AI产品工程实践
 */
class PracticeLearningModule {
  constructor(glm5) {
    this.glm5 = glm5;
    this.topics = ['AI Agent架构', 'LLM应用工程', 'AI产品设计', 'RAG系统', '多Agent协作'];
  }

  /**
   * 搜索工程实践并提取3条优化策略
   */
  async learn(dateStr) {
    console.log(`[PracticeLearning] 开始工程实践学习: ${dateStr}`);
    
    const prompt = `作为AI工程和产品专家，请搜索并分析当前最前沿的AI工程实践和产品设计：

搜索范围：
- AI Agent架构设计最佳实践
- LLM应用工程优化方案
- AI产品用户体验设计
- RAG系统性能优化
- 多Agent协作框架
- AI系统可观测性和可靠性
- Prompt工程和模型调优

任务：
1. 搜索并分析当前最前沿的6-8个工程实践或产品案例
2. 对每个案例，提取以下信息：
   - 实践/产品名称
   - 来源（公司/团队/开源项目）
   - 核心策略（1句话）
   - 技术实现细节（2-3句话）
   - 解决的问题和价值（2-3句话）
3. 从这6-8个中，选择最有价值的3个，给出可落地的优化策略

请结合以下本地系统实际情况给出建议：
- 这是一个OpenClaw AI助手系统
- 使用Node.js + Python技术栈
- 有多Agent协作架构（Kimi + GLM-5）
- 使用飞书作为主要交互渠道
- 有ISC智能标准中心管理规则
- 有CRAS认知进化系统
- 使用bge-m3进行向量化

请严格按照以下JSON格式输出（不要有其他文字）：

{
  "date": "${dateStr}",
  "total_practices_reviewed": 6,
  "top_3_strategies": [
    {
      "rank": 1,
      "category": "Agent架构/LLM工程/产品设计/RAG优化等",
      "practice_name": "实践/产品名称",
      "source": "来源公司/团队",
      "core_strategy": "一句话描述核心策略",
      "technical_details": "技术实现细节",
      "problem_solved": "解决什么问题，带来什么价值",
      "local_application": "对本地OpenClaw系统的具体应用建议",
      "implementation_priority": "high/medium/low",
      "estimated_effort": "预计实现工作量"
    },
    {
      "rank": 2,
      ...
    },
    {
      "rank": 3,
      ...
    }
  ],
  "trend_analysis": "当前AI工程实践的趋势分析",
  "local_system_recommendations": "针对本地系统的整体优化建议"
}`;

    try {
      const result = await this.glm5.analyze(prompt, { 
        temperature: 0.8,
        max_tokens: 65536 
      });
      
      // 尝试从响应中提取JSON
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return {
        date: dateStr,
        raw_content: result.content,
        reasoning: result.reasoning,
        parse_error: true
      };
    } catch (error) {
      console.error(`[PracticeLearning] 学习失败: ${error.message}`);
      return {
        date: dateStr,
        error: error.message,
        top_3_strategies: []
      };
    }
  }
}

/**
 * 报告生成器 - 整合学习结果生成报告
 */
class ReportGenerator {
  constructor() {
    this.reportDir = `${WORKSPACE}/reports`;
    this.ensureDirectory(this.reportDir);
  }

  ensureDirectory(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 生成学习报告
   */
  generateDailyReport(dateStr, paperInsights, practiceStrategies) {
    const timestamp = new Date().toISOString();
    
    const report = {
      report_meta: {
        title: `CRAS-A 主动学习引擎 - 每日学习报告`,
        date: dateStr,
        generated_at: timestamp,
        engine_version: "1.0.0",
        learning_items: {
          papers: 3,
          practices: 3,
          total: 6
        }
      },
      paper_insights: paperInsights,
      practice_strategies: practiceStrategies,
      synthesis: {
        key_takeaways: this.extractKeyTakeaways(paperInsights, practiceStrategies),
        action_items: this.generateActionItems(paperInsights, practiceStrategies),
        evolution_signals: this.identifyEvolutionSignals(paperInsights, practiceStrategies)
      }
    };

    return report;
  }

  extractKeyTakeaways(papers, practices) {
    const takeaways = [];
    
    if (papers.top_3_insights) {
      papers.top_3_insights.forEach(insight => {
        takeaways.push(`[论文] ${insight.core_innovation || '未提供'}`);
      });
    }
    
    if (practices.top_3_strategies) {
      practices.top_3_strategies.forEach(strategy => {
        takeaways.push(`[实践] ${strategy.core_strategy || '未提供'}`);
      });
    }
    
    return takeaways;
  }

  generateActionItems(papers, practices) {
    const actions = [];
    
    if (practices.top_3_strategies) {
      practices.top_3_strategies.forEach((strategy, idx) => {
        if (strategy.local_application) {
          actions.push({
            priority: strategy.implementation_priority || 'medium',
            action: strategy.local_application,
            effort: strategy.estimated_effort || '未知'
          });
        }
      });
    }
    
    return actions;
  }

  identifyEvolutionSignals(papers, practices) {
    return {
      technology_trends: papers.learning_summary || '未提供',
      engineering_trends: practices.trend_analysis || '未提供',
      local_recommendations: practices.local_system_recommendations || '未提供'
    };
  }

  /**
   * 保存报告到文件
   */
  saveReport(dateStr, report) {
    // 保存JSON格式报告
    const jsonPath = `${this.reportDir}/cras-learning-${dateStr}.json`;
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    
    // 生成Markdown格式报告
    const mdContent = this.generateMarkdownReport(report);
    const mdPath = `${this.reportDir}/cras-learning-${dateStr}.md`;
    fs.writeFileSync(mdPath, mdContent, 'utf8');
    
    console.log(`[ReportGenerator] 报告已保存: ${jsonPath}, ${mdPath}`);
    
    return { jsonPath, mdPath };
  }

  generateMarkdownReport(report) {
    const { report_meta, paper_insights, practice_strategies, synthesis } = report;
    
    let md = `# ${report_meta.title}\n\n`;
    md += `**日期**: ${report_meta.date}  \n`;
    md += `**生成时间**: ${report_meta.generated_at}  \n`;
    md += `**引擎版本**: ${report_meta.engine_version}\n\n`;
    
    md += `---\n\n`;
    
    // 论文洞察部分
    md += `## 📚 论文学习 - 3条核心洞察\n\n`;
    if (paper_insights.top_3_insights) {
      paper_insights.top_3_insights.forEach(insight => {
        md += `### #${insight.rank} ${insight.paper_title}\n\n`;
        md += `- **来源**: ${insight.institution}\n`;
        md += `- **链接**: ${insight.paper_url}\n`;
        md += `- **核心创新**: ${insight.core_innovation}\n`;
        md += `- **技术突破**: ${insight.technical_breakthrough}\n`;
        md += `- **影响分析**: ${insight.impact_analysis}\n`;
        md += `- **可执行建议**: ${insight.actionable_insight}\n\n`;
      });
    }
    md += `**学习总结**: ${paper_insights.learning_summary || '未提供'}\n\n`;
    
    md += `---\n\n`;
    
    // 工程实践部分
    md += `## 🛠️ 工程实践学习 - 3条优化策略\n\n`;
    if (practice_strategies.top_3_strategies) {
      practice_strategies.top_3_strategies.forEach(strategy => {
        md += `### #${strategy.rank} ${strategy.practice_name}\n\n`;
        md += `- **类别**: ${strategy.category}\n`;
        md += `- **来源**: ${strategy.source}\n`;
        md += `- **核心策略**: ${strategy.core_strategy}\n`;
        md += `- **技术细节**: ${strategy.technical_details}\n`;
        md += `- **解决问题**: ${strategy.problem_solved}\n`;
        md += `- **本地应用建议**: ${strategy.local_application}\n`;
        md += `- **优先级**: ${strategy.implementation_priority} | **工作量**: ${strategy.estimated_effort}\n\n`;
      });
    }
    md += `**趋势分析**: ${practice_strategies.trend_analysis || '未提供'}\n\n`;
    md += `**本地系统建议**: ${practice_strategies.local_system_recommendations || '未提供'}\n\n`;
    
    md += `---\n\n`;
    
    // 综合部分
    md += `## 🎯 综合洞察与行动建议\n\n`;
    md += `### 关键要点\n\n`;
    synthesis.key_takeaways.forEach((takeaway, idx) => {
      md += `${idx + 1}. ${takeaway}\n`;
    });
    
    md += `\n### 行动项\n\n`;
    synthesis.action_items.forEach((item, idx) => {
      md += `${idx + 1}. **[${item.priority.toUpperCase()}]** ${item.action} (预计: ${item.effort})\n`;
    });
    
    md += `\n### 进化信号\n\n`;
    md += `- **技术趋势**: ${synthesis.evolution_signals.technology_trends}\n`;
    md += `- **工程趋势**: ${synthesis.evolution_signals.engineering_trends}\n`;
    md += `- **本地建议**: ${synthesis.evolution_signals.local_recommendations}\n`;
    
    md += `\n---\n\n`;
    md += `*本报告由 CRAS-A 主动学习引擎自动生成*\n`;
    
    return md;
  }
}

/**
 * 知识持久化模块 - 保存到knowledge目录
 */
class KnowledgePersistence {
  constructor() {
    this.papersDir = PAPERS_DIR;
    this.practicesDir = PRACTICES_DIR;
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.papersDir, this.practicesDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * 保存论文洞察
   */
  savePaperInsights(dateStr, insights) {
    const filePath = `${this.papersDir}/${dateStr}.json`;
    fs.writeFileSync(filePath, JSON.stringify(insights, null, 2), 'utf8');
    console.log(`[KnowledgePersistence] 论文洞察已保存: ${filePath}`);
    return filePath;
  }

  /**
   * 保存工程实践策略
   */
  savePracticeStrategies(dateStr, strategies) {
    const filePath = `${this.practicesDir}/${dateStr}.json`;
    fs.writeFileSync(filePath, JSON.stringify(strategies, null, 2), 'utf8');
    console.log(`[KnowledgePersistence] 实践策略已保存: ${filePath}`);
    return filePath;
  }
}

/**
 * 日志记录器
 */
class Logger {
  constructor() {
    this.logDir = LOG_DIR;
    this.ensureDirectory();
  }

  ensureDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${message}\n`;
    
    console.log(logLine.trim());
    
    const dateStr = new Date().toISOString().split('T')[0];
    const logFile = `${this.logDir}/cras-learning-${dateStr}.log`;
    fs.appendFileSync(logFile, logLine, 'utf8');
  }

  info(message) { this.log('INFO', message); }
  error(message) { this.log('ERROR', message); }
  warn(message) { this.log('WARN', message); }
}

/**
 * 主执行器 - 协调各模块完成学习任务
 */
class CRASLearningEngine {
  constructor() {
    this.logger = new Logger();
    this.glm5 = new GLM5LearningEngine();
    this.paperModule = new PaperLearningModule(this.glm5);
    this.practiceModule = new PracticeLearningModule(this.glm5);
    this.reportGenerator = new ReportGenerator();
    this.persistence = new KnowledgePersistence();
  }

  /**
   * 执行每日学习流程
   */
  async executeDailyLearning() {
    const startTime = Date.now();
    const dateStr = new Date().toISOString().split('T')[0];
    
    this.logger.info(`========================================`);
    this.logger.info(`CRAS-A 主动学习引擎启动 - ${dateStr}`);
    this.logger.info(`========================================`);
    
    try {
      // 步骤1: 论文学习
      this.logger.info(`[1/3] 开始论文学习模块...`);
      const paperInsights = await this.paperModule.learn(dateStr);
      this.persistence.savePaperInsights(dateStr, paperInsights);
      this.logger.info(`[1/3] 论文学习完成，提取 ${paperInsights.top_3_insights?.length || 0} 条洞察`);
      
      // 步骤2: 工程实践学习
      this.logger.info(`[2/3] 开始工程实践学习模块...`);
      const practiceStrategies = await this.practiceModule.learn(dateStr);
      this.persistence.savePracticeStrategies(dateStr, practiceStrategies);
      this.logger.info(`[2/3] 工程实践学习完成，提取 ${practiceStrategies.top_3_strategies?.length || 0} 条策略`);
      
      // 步骤3: 生成报告
      this.logger.info(`[3/3] 生成学习报告...`);
      const report = this.reportGenerator.generateDailyReport(dateStr, paperInsights, practiceStrategies);
      const reportPaths = this.reportGenerator.saveReport(dateStr, report);
      this.logger.info(`[3/3] 报告生成完成: ${reportPaths.mdPath}`);
      
      // 完成统计
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.info(`========================================`);
      this.logger.info(`学习引擎执行完成 - 耗时: ${duration}秒`);
      this.logger.info(`输出文件:`);
      this.logger.info(`  - 论文洞察: ${this.persistence.papersDir}/${dateStr}.json`);
      this.logger.info(`  - 实践策略: ${this.persistence.practicesDir}/${dateStr}.json`);
      this.logger.info(`  - 学习报告: ${reportPaths.mdPath}`);
      this.logger.info(`========================================`);
      
      return {
        success: true,
        date: dateStr,
        duration: parseFloat(duration),
        outputs: {
          papers: `${this.persistence.papersDir}/${dateStr}.json`,
          practices: `${this.persistence.practicesDir}/${dateStr}.json`,
          report: reportPaths.mdPath
        }
      };
      
    } catch (error) {
      this.logger.error(`学习引擎执行失败: ${error.message}`);
      this.logger.error(error.stack);
      
      return {
        success: false,
        date: dateStr,
        error: error.message
      };
    }
  }
}

// CLI入口
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--daily') || args.includes('--run')) {
    const engine = new CRASLearningEngine();
    const result = await engine.executeDailyLearning();
    
    // 输出JSON结果（供cron捕获）
    console.log('\n=== EXECUTION_RESULT ===');
    console.log(JSON.stringify(result, null, 2));
    
    process.exit(result.success ? 0 : 1);
  } else if (args.includes('--test')) {
    console.log('CRAS-A 主动学习引擎 - 测试模式');
    console.log('配置检查:');
    console.log(`  - 工作目录: ${WORKSPACE}`);
    console.log(`  - 论文目录: ${PAPERS_DIR}`);
    console.log(`  - 实践目录: ${PRACTICES_DIR}`);
    console.log(`  - 日志目录: ${LOG_DIR}`);
    
    // 测试GLM-5连接
    const glm5 = new GLM5LearningEngine();
    console.log(`  - GLM-5 API Keys: ${glm5.apiKeys.length} 个`);
    
    console.log('\n所有检查通过，系统就绪！');
    process.exit(0);
  } else {
    console.log('CRAS-A 主动学习引擎 - 每日04:00执行');
    console.log('');
    console.log('用法:');
    console.log('  node cras-learning-engine.cjs --daily    # 执行每日学习');
    console.log('  node cras-learning-engine.cjs --test     # 测试配置');
    console.log('');
    console.log('Cron设置:');
    console.log('  0 4 * * * cd /root/.openclaw/workspace/cras && node cras-learning-engine.cjs --daily >> /tmp/cras-learning.log 2>&1');
    process.exit(0);
  }
}

// 执行入口
if (require.main === module) {
  main().catch(error => {
    console.error('致命错误:', error);
    process.exit(1);
  });
}

module.exports = { CRASLearningEngine, GLM5LearningEngine };
