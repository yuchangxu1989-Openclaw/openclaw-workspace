/**
 * AEO (Agent Effectiveness Operations) - 智能体效果运营系统
 * Phase 2: 集成评测执行引擎
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');
const { EvaluationEngine, Dimensions } = require('./src/evaluation/index.cjs');

class AEO {
  constructor(configPath = './config/checklist.json') {
    this.checklist = JSON.parse(fs.readFileSync(path.join(__dirname, configPath), 'utf8'));
    this.feedbacks = [];
    this.results = [];
    
    // 初始化评测引擎
    this.evaluationEngine = null;
    this.evaluationReports = [];
  }
  
  /**
   * 初始化评测引擎
   */
  async initEvaluation(options = {}) {
    this.evaluationEngine = new EvaluationEngine({
      maxConcurrent: options.maxConcurrent || 3,
      batchSize: options.batchSize || 5,
      timeout: options.timeout || 300000,
      ...options
    });
    await this.evaluationEngine.init();
    return this;
  }
  
  /**
   * 关闭评测引擎
   */
  async shutdown() {
    if (this.evaluationEngine) {
      await this.evaluationEngine.shutdown();
    }
  }

  // ============ Phase 1: 准入检查 ============
  
  /**
   * 执行准入检查
   */
  check(skillPath) {
    const results = { passed: true, checks: [], timestamp: new Date().toISOString() };
    
    for (const item of this.checklist.items) {
      const result = this._runCheck(item, skillPath);
      results.checks.push(result);
      if (item.required && !result.passed) results.passed = false;
    }
    
    this.results.push(results);
    return results;
  }

  // ============ Phase 2: 评测执行 ============
  
  /**
   * 执行技能评测
   * @param {string} skillPath - 技能路径
   * @param {Array} testCases - 测试用例
   * @param {Object} options - 评测选项
   */
  async evaluate(skillPath, testCases, options = {}) {
    if (!this.evaluationEngine) {
      await this.initEvaluation();
    }
    
    const skillName = options.name || path.basename(skillPath);
    
    const result = await this.evaluationEngine.quickEvaluate(
      skillPath,
      testCases,
      {
        name: `Evaluation - ${skillName}`,
        dimensions: options.dimensions || Object.values(Dimensions),
        tracks: options.tracks || ['aiEffect', 'functionalQuality'],
        ...options
      }
    );
    
    if (result.finalResult?.report) {
      this.evaluationReports.push(result.finalResult.report);
    }
    
    return result;
  }
  
  /**
   * 使用配置文件执行评测
   * @param {string} configPath - 评测配置文件路径
   */
  async evaluateWithConfig(configPath) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    if (!this.evaluationEngine) {
      await this.initEvaluation(config.engineOptions);
    }
    
    const result = await this.evaluationEngine.evaluate(config);
    
    if (result.finalResult?.report) {
      this.evaluationReports.push(result.finalResult.report);
    }
    
    return result;
  }
  
  /**
   * 获取最新评测报告
   */
  getLatestReport() {
    return this.evaluationReports[this.evaluationReports.length - 1] || null;
  }
  
  /**
   * 获取所有评测报告
   */
  getAllReports() {
    return this.evaluationReports;
  }

  // ============ 反馈管理 ============
  
  /**
   * 手动收录反馈
   */
  feedback(skillName, content, type = 'general') {
    const fb = { 
      id: Date.now(), 
      skillName, 
      content, 
      type, 
      timestamp: new Date().toISOString() 
    };
    this.feedbacks.push(fb);
    return fb;
  }

  // ============ 报告生成 ============
  
  /**
   * 生成综合运营报告
   */
  report() {
    const lines = [
      '# AEO 运营报告', 
      `生成时间: ${new Date().toLocaleString()}`, 
      ''
    ];
    
    // 准入检查
    lines.push('## 最近检查结果');
    this.results.slice(-5).forEach((r, i) => {
      lines.push(`${i + 1}. ${r.passed ? '✅' : '❌'} ${r.timestamp}`);
      r.checks.forEach(c => lines.push(`   - ${c.name}: ${c.passed ? '通过' : '失败'}`));
    });
    
    // 评测结果
    if (this.evaluationReports.length > 0) {
      lines.push('', '## 最近评测结果', '');
      const latest = this.evaluationReports[this.evaluationReports.length - 1];
      const summary = latest.summary;
      
      lines.push(`### ${latest.taskName}`);
      lines.push(`- 综合得分: ${(summary.overallScore.score * 100).toFixed(1)}% ${summary.overallScore.passed ? '✅' : '❌'}`);
      lines.push(`- 等级: ${summary.overallScore.grade.label} (${summary.overallScore.grade.grade})`);
      lines.push('');
      
      lines.push('轨道得分:');
      for (const [track, score] of Object.entries(summary.trackScores)) {
        lines.push(`- ${track}: ${(score.score * 100).toFixed(1)}% ${score.passed ? '✅' : '❌'}`);
      }
      
      lines.push('');
      lines.push(`详细报告: ${latest.reportId}`);
    }
    
    // 反馈记录
    lines.push('', '## 反馈记录', `总计: ${this.feedbacks.length} 条`);
    this.feedbacks.slice(-10).forEach(f => {
      lines.push(`- [${f.type}] ${f.skillName}: ${f.content.slice(0, 50)}...`);
    });
    
    return lines.join('\n');
  }
  
  /**
   * 生成详细评测报告（文本格式）
   */
  generateTextReport(reportIndex = -1) {
    const idx = reportIndex < 0 ? this.evaluationReports.length + reportIndex : reportIndex;
    const report = this.evaluationReports[idx];
    
    if (!report) return 'No report available';
    
    const { EvaluationScorer } = require('./src/evaluation/index.cjs');
    const scorer = new EvaluationScorer();
    return scorer.generateTextReport(report);
  }

  // ============ 私有方法 ============
  
  _runCheck(item, skillPath) {
    try {
      switch (item.type) {
        case 'file':
          return { 
            name: item.name, 
            passed: fs.existsSync(path.join(skillPath, item.target)) 
          };
        case 'content':
          const content = fs.readFileSync(path.join(skillPath, item.target), 'utf8');
          return { 
            name: item.name, 
            passed: item.pattern 
              ? new RegExp(item.pattern).test(content) 
              : content.length > item.minLength 
          };
        case 'json':
          const json = JSON.parse(fs.readFileSync(path.join(skillPath, item.target), 'utf8'));
          return { 
            name: item.name, 
            passed: item.field ? json[item.field] : true 
          };
        default:
          return { name: item.name, passed: true };
      }
    } catch (e) {
      return { name: item.name, passed: false, error: e.message };
    }
  }
}

// 导出维度常量供外部使用
AEO.Dimensions = Dimensions;

module.exports = AEO;
