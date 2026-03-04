#!/usr/bin/env node
/**
 * CRAS Insight Enhancer - 洞察复盘增强器
 * 修复版: 优化执行效率，增加超时时间和分批处理
 * 
 * @version 2.0.0
 * @description 每周执行一次的洞察复盘任务，分析过去7天的用户交互数据，
 *              生成深度洞察报告，并推送到飞书
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const { SKILLS_DIR, WORKSPACE, MEMORY_DIR } = require('../_shared/paths');

// ============================================
// 配置参数 - 可调整以优化性能
// ============================================
const CONFIG = {
  // 超时配置（毫秒）
  timeouts: {
    total: 600000,      // 总超时: 10分钟（原为隐式默认）
    analysis: 300000,   // 分析阶段: 5分钟
    report: 120000,     // 报告生成: 2分钟
    external: 60000     // 外部API调用: 1分钟
  },
  
  // 分批处理配置
  batch: {
    size: 5,            // 每批处理文件数
    concurrency: 2,     // 并发批次数
    delayMs: 100        // 批次间延迟（毫秒）
  },
  
  // 数据范围
  dataRange: {
    days: 7,            // 分析过去7天
    maxFiles: 21,       // 最多分析21个文件（每天3个会话文件）
    maxInteractions: 500 // 最多处理500条交互记录
  },
  
  // 路径配置
  paths: {
    memory: MEMORY_DIR,
    reports: path.join(WORKSPACE, 'cras/reports'),
    queue: path.join(SKILLS_DIR, 'cras/feishu_queue'),
    config: path.join(SKILLS_DIR, 'cras/config')
  },
  
  // 功能开关
  features: {
    enableAIEnhancement: true,  // 启用AI增强分析
    enableTrendAnalysis: true,  // 启用趋势分析
    enableBatchProcessing: true // 启用分批处理
  }
};

// ============================================
// 性能监控类
// ============================================
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      stages: {},
      memory: []
    };
  }
  
  startStage(name) {
    this.metrics.stages[name] = {
      start: Date.now(),
      status: 'running'
    };
    console.log(`[性能] 阶段开始: ${name}`);
  }
  
  endStage(name) {
    if (this.metrics.stages[name]) {
      this.metrics.stages[name].end = Date.now();
      this.metrics.stages[name].duration = 
        this.metrics.stages[name].end - this.metrics.stages[name].start;
      this.metrics.stages[name].status = 'completed';
      console.log(`[性能] 阶段完成: ${name}, 耗时: ${this.metrics.stages[name].duration}ms`);
    }
  }
  
  recordMemory() {
    const usage = process.memoryUsage();
    this.metrics.memory.push({
      time: Date.now(),
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024)
    });
  }
  
  getReport() {
    const totalDuration = Date.now() - this.metrics.startTime;
    return {
      totalDuration,
      stages: this.metrics.stages,
      memory: this.metrics.memory
    };
  }
}

// ============================================
// 分批处理器
// ============================================
class BatchProcessor {
  constructor(config) {
    this.config = config;
  }
  
  /**
   * 分批处理数组
   * @param {Array} items - 待处理项目
   * @param {Function} processor - 处理函数
   * @param {Function} onProgress - 进度回调
   */
  async process(items, processor, onProgress) {
    const { size, concurrency, delayMs } = this.config;
    const batches = this.createBatches(items, size);
    const results = [];
    
    console.log(`[分批处理] 总计: ${items.length}项, ${batches.length}批, 并发: ${concurrency}`);
    
    for (let i = 0; i < batches.length; i += concurrency) {
      const currentBatches = batches.slice(i, i + concurrency);
      
      // 并行处理当前批次
      const batchPromises = currentBatches.map(async (batch, idx) => {
        const batchIndex = i + idx;
        const batchResults = [];
        
        for (const item of batch) {
          try {
            const result = await processor(item);
            batchResults.push({ success: true, data: result, item });
          } catch (error) {
            batchResults.push({ success: false, error: error.message, item });
          }
        }
        
        return { batchIndex, results: batchResults };
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // 收集结果
      for (const { batchIndex, results: batchResult } of batchResults) {
        results.push(...batchResult);
        
        // 进度报告
        const processed = Math.min((batchIndex + 1) * size, items.length);
        const percent = ((processed / items.length) * 100).toFixed(1);
        const successCount = results.filter(r => r.success).length;
        
        console.log(`[分批处理] 进度: ${processed}/${items.length} (${percent}%) | 成功: ${successCount}`);
        
        if (onProgress) {
          onProgress({
            processed,
            total: items.length,
            percent,
            batchIndex
          });
        }
      }
      
      // 批次间延迟，避免阻塞事件循环
      if (i + concurrency < batches.length && delayMs > 0) {
        await this.delay(delayMs);
      }
    }
    
    return results;
  }
  
  createBatches(items, size) {
    const batches = [];
    for (let i = 0; i < items.length; i += size) {
      batches.push(items.slice(i, i + size));
    }
    return batches;
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================
// 数据收集器
// ============================================
class DataCollector {
  constructor(config) {
    this.config = config;
  }
  
  /**
   * 收集过去N天的会话数据
   */
  async collectHistoricalData() {
    console.log(`[数据收集] 开始收集过去${this.config.dataRange.days}天数据...`);
    
    const memoryPath = this.config.paths.memory;
    if (!fs.existsSync(memoryPath)) {
      console.warn(`[数据收集] 内存目录不存在: ${memoryPath}`);
      return [];
    }
    
    // 计算日期范围
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.dataRange.days);
    
    // 获取符合条件的文件
    const files = fs.readdirSync(memoryPath)
      .filter(f => f.endsWith('.md'))
      .filter(f => {
        const match = f.match(/^(\d{4}-\d{2}-\d{2})/);
        if (match) {
          const fileDate = new Date(match[1]);
          return fileDate >= cutoffDate;
        }
        return false;
      })
      .sort()
      .slice(-this.config.dataRange.maxFiles);
    
    console.log(`[数据收集] 找到 ${files.length} 个文件`);
    
    // 分批读取文件内容
    const processor = new BatchProcessor(this.config.batch);
    const results = await processor.process(
      files.map(f => path.join(memoryPath, f)),
      this.readFile.bind(this),
      (progress) => {
        // 进度回调
      }
    );
    
    // 过滤成功结果
    const validData = results
      .filter(r => r.success && r.data)
      .map(r => r.data);
    
    console.log(`[数据收集] 成功读取 ${validData.length} 个文件`);
    return validData;
  }
  
  /**
   * 读取单个文件
   */
  async readFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const stats = fs.statSync(filePath);
      
      return {
        path: filePath,
        filename: path.basename(filePath),
        content: content.substring(0, 50000), // 限制单文件大小50KB
        size: content.length,
        modifiedTime: stats.mtime,
        interactions: this.extractInteractions(content)
      };
    } catch (error) {
      throw new Error(`读取失败: ${error.message}`);
    }
  }
  
  /**
   * 提取交互记录
   */
  extractInteractions(content) {
    const interactions = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      // 匹配时间戳行
      const timeMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\]/);
      if (timeMatch) {
        interactions.push({
          timestamp: timeMatch[1],
          preview: line.substring(0, 200)
        });
      }
    }
    
    return interactions.slice(0, 100); // 每文件最多100条
  }
  
  /**
   * 收集系统指标
   */
  collectSystemMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };
    
    // 收集技能变更信息
    try {
      const skillsPath = SKILLS_DIR;
      const skills = fs.readdirSync(skillsPath)
        .filter(d => !d.startsWith('.') && fs.statSync(path.join(skillsPath, d)).isDirectory());
      metrics.skillCount = skills.length;
    } catch (e) {
      metrics.skillCount = 0;
    }
    
    // 收集报告数量
    try {
      const reportsPath = this.config.paths.reports;
      if (fs.existsSync(reportsPath)) {
        const reports = fs.readdirSync(reportsPath).filter(f => f.endsWith('.md'));
        metrics.reportCount = reports.length;
      }
    } catch (e) {
      metrics.reportCount = 0;
    }
    
    return metrics;
  }
}

// ============================================
// 洞察分析器
// ============================================
class InsightAnalyzer {
  constructor(config) {
    this.config = config;
  }
  
  /**
   * 分析数据并生成洞察
   */
  async analyze(data, metrics) {
    console.log('[洞察分析] 开始分析...');
    
    const analysis = {
      timestamp: new Date().toISOString(),
      period: `${this.config.dataRange.days}天`,
      summary: this.generateSummary(data),
      intents: this.analyzeIntents(data),
      trends: this.analyzeTrends(data),
      patterns: this.identifyPatterns(data),
      recommendations: this.generateRecommendations(data)
    };
    
    return analysis;
  }
  
  /**
   * 生成汇总统计
   */
  generateSummary(data) {
    const totalFiles = data.length;
    const totalInteractions = data.reduce((sum, d) => sum + (d.interactions?.length || 0), 0);
    const totalSize = data.reduce((sum, d) => sum + (d.size || 0), 0);
    
    return {
      totalFiles,
      totalInteractions,
      totalSize: Math.round(totalSize / 1024), // KB
      dateRange: data.length > 0 ? {
        start: data[0].filename,
        end: data[data.length - 1].filename
      } : null
    };
  }
  
  /**
   * 分析意图分布
   */
  analyzeIntents(data) {
    const intents = {
      command: 0,      // 指令执行
      query: 0,        // 信息查询
      architecture: 0, // 架构设计
      feedback: 0,    // 反馈确认
      exploration: 0,  // 探索尝试
      other: 0
    };
    
    // 简单的关键词匹配
    const keywords = {
      command: ['执行', '运行', '启动', '停止', '创建', '删除', '更新'],
      query: ['查询', '搜索', '查找', '什么是', '怎么', '如何'],
      architecture: ['架构', '设计', '模块', '组件', '接口', '协议'],
      feedback: ['确认', '收到', '明白', '好的', '谢谢', '反馈'],
      exploration: ['尝试', '测试', '实验', '看看', '试试']
    };
    
    for (const file of data) {
      for (const interaction of (file.interactions || [])) {
        const preview = interaction.preview.toLowerCase();
        let matched = false;
        
        for (const [intent, words] of Object.entries(keywords)) {
          if (words.some(w => preview.includes(w))) {
            intents[intent]++;
            matched = true;
            break;
          }
        }
        
        if (!matched) {
          intents.other++;
        }
      }
    }
    
    // 排序并取TOP5
    const sorted = Object.entries(intents)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
    
    return { distribution: intents, topIntents: sorted };
  }
  
  /**
   * 分析趋势
   */
  analyzeTrends(data) {
    const dailyStats = {};
    
    for (const file of data) {
      const date = file.filename.substring(0, 10);
      if (!dailyStats[date]) {
        dailyStats[date] = { date, interactions: 0, size: 0 };
      }
      dailyStats[date].interactions += file.interactions?.length || 0;
      dailyStats[date].size += file.size || 0;
    }
    
    const trend = Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date));
    
    // 计算趋势
    const recent3Days = trend.slice(-3).reduce((sum, d) => sum + d.interactions, 0);
    const previous4Days = trend.slice(-7, -3).reduce((sum, d) => sum + d.interactions, 0);
    
    let trendDirection = 'stable';
    if (recent3Days > previous4Days * 1.2) {
      trendDirection = 'increasing';
    } else if (recent3Days < previous4Days * 0.8) {
      trendDirection = 'decreasing';
    }
    
    return {
      daily: trend,
      direction: trendDirection,
      recent3Days,
      previous4Days
    };
  }
  
  /**
   * 识别模式
   */
  identifyPatterns(data) {
    const patterns = [];
    
    // 检查高频时段
    const hourDistribution = {};
    for (const file of data) {
      for (const inter of (file.interactions || [])) {
        const hour = inter.timestamp?.substring(11, 13);
        if (hour) {
          hourDistribution[hour] = (hourDistribution[hour] || 0) + 1;
        }
      }
    }
    
    const peakHours = Object.entries(hourDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour, count]) => `${hour}:00`);
    
    if (peakHours.length > 0) {
      patterns.push({
        type: 'time_preference',
        description: `活跃高峰时段: ${peakHours.join(', ')}`,
        confidence: 0.8
      });
    }
    
    // 检查连续工作模式
    const consecutiveDays = this.calculateConsecutiveDays(data);
    if (consecutiveDays >= 3) {
      patterns.push({
        type: 'consistency',
        description: `连续${consecutiveDays}天保持交互`,
        confidence: 0.9
      });
    }
    
    return patterns;
  }
  
  calculateConsecutiveDays(data) {
    const dates = data.map(d => d.filename.substring(0, 10)).sort();
    let maxConsecutive = 1;
    let currentConsecutive = 1;
    
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
      
      if (diffDays <= 1) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 1;
      }
    }
    
    return maxConsecutive;
  }
  
  /**
   * 生成建议
   */
  generateRecommendations(data) {
    const recommendations = [];
    const summary = this.generateSummary(data);
    
    // 基于交互量生成建议
    if (summary.totalInteractions > 100) {
      recommendations.push({
        priority: 'medium',
        category: 'performance',
        message: '交互量较大，建议优化会话存储策略'
      });
    }
    
    // 基于文件数量生成建议
    if (summary.totalFiles > 10) {
      recommendations.push({
        priority: 'low',
        category: 'organization',
        message: '会话文件较多，建议定期归档历史数据'
      });
    }
    
    return recommendations;
  }
}

// ============================================
// 报告生成器
// ============================================
class ReportGenerator {
  constructor(config) {
    this.config = config;
  }
  
  /**
   * 生成飞书卡片报告
   */
  generateFeishuCard(analysis) {
    const { summary, intents, trends, patterns, recommendations } = analysis;
    
    // 意图分布文本
    const intentText = intents.topIntents
      .map((intent, idx) => {
        const emoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][idx] || '•';
        const percentage = summary.totalInteractions > 0 
          ? Math.round((intent.count / summary.totalInteractions) * 100) 
          : 0;
        return `${emoji} ${intent.name}: ${intent.count}次 (${percentage}%)`;
      })
      .join('\n');
    
    // 模式识别文本
    const patternText = patterns.length > 0
      ? patterns.map(p => `• ${p.description}`).join('\n')
      : '暂无明显模式识别';
    
    // 趋势图标
    const trendEmoji = {
      increasing: '📈',
      decreasing: '📉',
      stable: '➡️'
    }[trends.direction] || '➡️';
    
    return {
      config: { wide_screen_mode: true },
      header: {
        template: 'indigo',
        title: {
          tag: 'plain_text',
          content: '📊 CRAS 每周洞察复盘'
        }
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'plain_text',
            content: `📅 复盘周期: 过去${analysis.period} | ${new Date().toLocaleString('zh-CN')}`
          }
        },
        { tag: 'hr' },
        {
          tag: 'div',
          text: { tag: 'plain_text', content: '📈 核心指标' }
        },
        {
          tag: 'div',
          fields: [
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**文件数**\n${summary.totalFiles}个`
              }
            },
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**交互数**\n${summary.totalInteractions}次`
              }
            },
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**数据量**\n${summary.totalSize}KB`
              }
            },
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**趋势**\n${trendEmoji} ${trends.direction === 'increasing' ? '上升' : trends.direction === 'decreasing' ? '下降' : '稳定'}`
              }
            }
          ]
        },
        { tag: 'hr' },
        {
          tag: 'div',
          text: { tag: 'plain_text', content: '🎯 TOP5 意图分布' }
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: intentText
          }
        },
        { tag: 'hr' },
        {
          tag: 'div',
          text: { tag: 'plain_text', content: '🔮 模式识别' }
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: patternText
          }
        },
        { tag: 'hr' },
        {
          tag: 'div',
          text: { tag: 'plain_text', content: '💡 优化建议' }
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: recommendations.length > 0
              ? recommendations.map(r => `• [${r.priority === 'high' ? '高' : r.priority === 'medium' ? '中' : '低'}] ${r.message}`).join('\n')
              : '暂无特别建议'
          }
        },
        { tag: 'hr' },
        {
          tag: 'note',
          elements: [
            {
              tag: 'plain_text',
              content: '🤖 CRAS Insight Enhancer v2.0 | 分批处理优化版'
            }
          ]
        }
      ]
    };
  }
  
  /**
   * 生成Markdown详细报告
   */
  generateMarkdownReport(analysis, performance) {
    const { summary, intents, trends, patterns, recommendations } = analysis;
    
    return `# CRAS 每周洞察复盘报告

**生成时间**: ${new Date().toLocaleString('zh-CN')}
**分析周期**: 过去${analysis.period}
**执行耗时**: ${performance.totalDuration}ms

## 📊 核心指标

| 指标 | 数值 |
|:---|---:|
| 分析文件数 | ${summary.totalFiles} 个 |
| 交互记录数 | ${summary.totalInteractions} 次 |
| 数据总量 | ${summary.totalSize} KB |
| 趋势方向 | ${trends.direction} |

## 🎯 意图分布 (TOP5)

| 排名 | 意图类型 | 次数 | 占比 |
|:---:|:---|---:|---:|
${intents.topIntents.map((intent, idx) => {
  const percentage = summary.totalInteractions > 0 
    ? Math.round((intent.count / summary.totalInteractions) * 100) 
    : 0;
  return `| ${idx + 1} | ${intent.name} | ${intent.count} | ${percentage}% |`;
}).join('\n')}

## 📈 趋势分析

- **趋势方向**: ${trends.direction}
- **近3天交互**: ${trends.recent3Days} 次
- **前4天交互**: ${trends.previous4Days} 次

### 每日详情

| 日期 | 交互数 | 数据量 |
|:---|---:|---:|
${trends.daily.map(d => `| ${d.date} | ${d.interactions} | ${Math.round(d.size / 1024)}KB |`).join('\n')}

## 🔮 模式识别

${patterns.map(p => `- **${p.type}**: ${p.description} (置信度: ${p.confidence})`).join('\n') || '- 暂无模式识别'}

## 💡 优化建议

${recommendations.map(r => `- **[${r.priority.toUpperCase()}]** ${r.category}: ${r.message}`).join('\n') || '- 暂无建议'}

## ⚙️ 执行性能

| 阶段 | 耗时(ms) | 状态 |
|:---|---:|:---|
${Object.entries(performance.stages).map(([name, data]) => `| ${name} | ${data.duration || '-'} | ${data.status} |`).join('\n')}

---
*报告由 CRAS Insight Enhancer v2.0 自动生成*
`;
  }
}

// ============================================
// 主控制器
// ============================================
class InsightEnhancer {
  constructor() {
    this.config = CONFIG;
    this.monitor = new PerformanceMonitor();
    this.collector = new DataCollector(this.config);
    this.analyzer = new InsightAnalyzer(this.config);
    this.generator = new ReportGenerator(this.config);
    this.processor = new BatchProcessor(this.config.batch);
  }
  
  async run() {
    const startTime = Date.now();
    console.log('='.repeat(70));
    console.log('CRAS Insight Enhancer v2.0 - 洞察复盘增强器');
    console.log('优化特性: 分批处理 | 超时保护 | 性能监控');
    console.log('='.repeat(70));
    
    try {
      // 阶段1: 数据收集
      this.monitor.startStage('data_collection');
      const historicalData = await this.collector.collectHistoricalData();
      const systemMetrics = this.collector.collectSystemMetrics();
      this.monitor.endStage('data_collection');
      
      if (historicalData.length === 0) {
        console.warn('[警告] 未收集到历史数据，生成空报告');
      }
      
      // 阶段2: 洞察分析
      this.monitor.startStage('analysis');
      const analysis = await this.analyzer.analyze(historicalData, systemMetrics);
      this.monitor.endStage('analysis');
      
      // 阶段3: 报告生成
      this.monitor.startStage('report_generation');
      const performance = this.monitor.getReport();
      const feishuCard = this.generator.generateFeishuCard(analysis);
      const markdownReport = this.generator.generateMarkdownReport(analysis, performance);
      this.monitor.endStage('report_generation');
      
      // 阶段4: 保存输出
      this.monitor.startStage('output');
      const outputs = await this.saveOutputs(feishuCard, markdownReport, analysis);
      this.monitor.endStage('output');
      
      // 最终结果
      const totalDuration = Date.now() - startTime;
      const result = {
        status: 'success',
        duration: totalDuration,
        summary: {
          files: analysis.summary.totalFiles,
          interactions: analysis.summary.totalInteractions,
          topIntent: analysis.intents.topIntents[0]?.name || 'unknown'
        },
        outputs
      };
      
      console.log('='.repeat(70));
      console.log('✅ 洞察复盘完成');
      console.log(`总耗时: ${totalDuration}ms`);
      console.log(`分析文件: ${result.summary.files}个`);
      console.log(`交互记录: ${result.summary.interactions}次`);
      console.log(`主要意图: ${result.summary.topIntent}`);
      console.log('='.repeat(70));
      
      // 输出JSON结果
      console.log('\n---RESULT---');
      console.log(JSON.stringify(result, null, 2));
      
      return result;
      
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      console.error('='.repeat(70));
      console.error('❌ 洞察复盘失败:', error.message);
      console.error('='.repeat(70));
      
      const errorResult = {
        status: 'error',
        duration: totalDuration,
        error: error.message,
        stack: error.stack
      };
      
      console.log('\n---RESULT---');
      console.log(JSON.stringify(errorResult, null, 2));
      
      throw error;
    }
  }
  
  /**
   * 保存输出文件
   */
  async saveOutputs(feishuCard, markdownReport, analysis) {
    const outputs = {};
    const timestamp = Date.now();
    const dateStr = new Date().toISOString().split('T')[0];
    
    // 确保目录存在
    [this.config.paths.reports, this.config.paths.queue, this.config.paths.config].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    // 1. 保存飞书卡片到队列
    try {
      const queueFile = path.join(this.config.paths.queue, `insight_${timestamp}.json`);
      fs.writeFileSync(queueFile, JSON.stringify({
        type: 'feishu_card',
        card: feishuCard,
        timestamp,
        source: 'insight-enhancer-v2'
      }, null, 2), 'utf-8');
      outputs.queueFile = queueFile;
      console.log(`[输出] 飞书卡片已保存: ${queueFile}`);
    } catch (e) {
      console.error(`[输出] 飞书卡片保存失败: ${e.message}`);
    }
    
    // 2. 保存Markdown报告
    try {
      const reportFile = path.join(this.config.paths.reports, `insight_${dateStr}_weekly.md`);
      fs.writeFileSync(reportFile, markdownReport, 'utf-8');
      outputs.reportFile = reportFile;
      console.log(`[输出] 报告已保存: ${reportFile}`);
    } catch (e) {
      console.error(`[输出] 报告保存失败: ${e.message}`);
    }
    
    // 3. 保存原始分析数据
    try {
      const analysisFile = path.join(this.config.paths.config, `insight-analysis-${dateStr}.json`);
      fs.writeFileSync(analysisFile, JSON.stringify(analysis, null, 2), 'utf-8');
      outputs.analysisFile = analysisFile;
      console.log(`[输出] 分析数据已保存: ${analysisFile}`);
    } catch (e) {
      console.error(`[输出] 分析数据保存失败: ${e.message}`);
    }
    
    return outputs;
  }
}

// ============================================
// 超时保护与主入口
// ============================================

// 总超时保护（10分钟）
const globalTimeout = setTimeout(() => {
  console.error('[致命错误] 全局执行超时(10分钟)，强制退出');
  process.exit(1);
}, CONFIG.timeouts.total);

// 清理函数
function cleanup() {
  clearTimeout(globalTimeout);
  console.log('[清理] 释放资源完成');
}

process.on('exit', cleanup);
process.on('SIGINT', () => {
  console.log('\n[信号] 收到中断信号，正在退出...');
  cleanup();
  process.exit(0);
});
process.on('uncaughtException', (err) => {
  console.error('[未捕获异常]', err);
  cleanup();
  process.exit(1);
});

// 主入口
async function main() {
  const enhancer = new InsightEnhancer();
  
  try {
    const result = await enhancer.run();
    cleanup();
    process.exit(0);
  } catch (error) {
    cleanup();
    process.exit(1);
  }
}

// 模块导出
module.exports = {
  InsightEnhancer,
  PerformanceMonitor,
  BatchProcessor,
  DataCollector,
  InsightAnalyzer,
  ReportGenerator,
  CONFIG
};

// CLI入口
if (require.main === module) {
  main();
}
