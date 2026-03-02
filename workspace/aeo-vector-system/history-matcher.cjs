/** @format */
/**
 * AEO History Matcher
 * 历史问题匹配模块 - 匹配当前问题与历史问题，发现重复/相似问题
 * 
 * Usage:
 *   node history-matcher.cjs --issue "问题描述" --history ./issues.json
 *   node history-matcher.cjs --check-regression --current ./current.json --baseline ./baseline.json
 */

const fs = require('fs');
const path = require('path');
const { VectorCore } = require('./vector-core.cjs');

class HistoryMatcher {
  constructor(options = {}) {
    this.vectorCore = new VectorCore();
    this.similarityThreshold = options.similarityThreshold || 0.75;
    this.duplicateThreshold = options.duplicateThreshold || 0.90;
    this.historyData = [];
    this.indexed = false;
  }

  /**
   * 从历史文件加载问题数据
   */
  loadHistory(historyPath) {
    let data;
    if (typeof historyPath === 'string') {
      const content = fs.readFileSync(historyPath, 'utf-8');
      data = JSON.parse(content);
    } else {
      data = historyPath;
    }
    
    this.historyData = Array.isArray(data) ? data : [data];
    console.log(`[HistoryMatcher] Loaded ${this.historyData.length} historical issues`);
    return this.historyData.length;
  }

  /**
   * 提取问题的文本表示
   */
  extractIssueText(issue) {
    const parts = [];
    
    // 标题
    if (issue.title) parts.push(issue.title);
    if (issue.summary) parts.push(issue.summary);
    if (issue.name) parts.push(issue.name);
    
    // 描述
    if (issue.description) parts.push(issue.description);
    if (issue.details) parts.push(issue.details);
    
    // 错误信息
    if (issue.error) {
      const errText = typeof issue.error === 'string' 
        ? issue.error 
        : (issue.error.message || issue.error.stack || JSON.stringify(issue.error));
      parts.push('错误: ' + errText);
    }
    if (issue.errorMessage) parts.push('错误: ' + issue.errorMessage);
    if (issue.stackTrace) parts.push('堆栈: ' + issue.stackTrace);
    
    // 上下文
    if (issue.context) {
      parts.push('上下文: ' + (typeof issue.context === 'string' 
        ? issue.context 
        : JSON.stringify(issue.context)));
    }
    
    // 复现步骤
    if (issue.reproduceSteps?.length) {
      parts.push('复现步骤: ' + issue.reproduceSteps.join(' '));
    }
    if (issue.steps?.length) {
      parts.push('步骤: ' + issue.steps.join(' '));
    }
    
    // 组件/模块
    if (issue.component) parts.push('组件: ' + issue.component);
    if (issue.module) parts.push('模块: ' + issue.module);
    if (issue.service) parts.push('服务: ' + issue.service);
    
    // 标签
    if (issue.labels?.length) parts.push('标签: ' + issue.labels.join(' '));
    if (issue.tags?.length) parts.push('标签: ' + issue.tags.join(' '));
    
    // 根因
    if (issue.rootCause) parts.push('根因: ' + issue.rootCause);
    if (issue.cause) parts.push('原因: ' + issue.cause);
    
    return parts.join(' | ');
  }

  /**
   * 构建历史问题的向量索引
   */
  buildIndex() {
    if (this.historyData.length === 0) {
      throw new Error('No history data loaded');
    }

    // 构建词汇表
    const issueTexts = this.historyData.map(i => this.extractIssueText(i));
    console.log(`[HistoryMatcher] Building index for ${issueTexts.length} issues...`);
    const vocabSize = this.vectorCore.buildVocabulary(issueTexts);
    console.log(`[HistoryMatcher] Vocabulary size: ${vocabSize}`);

    // 向量化
    this.historyVectors = this.vectorCore.vectorizeBatch(
      this.historyData.map((issue, i) => ({
        ...issue,
        text: issueTexts[i],
        issueId: issue.id || issue.issueId || `issue_${i}`
      }))
    );

    this.indexed = true;
    console.log(`[HistoryMatcher] Index built`);
    return vocabSize;
  }

  /**
   * 匹配问题
   */
  match(issue, options = {}) {
    if (!this.indexed) {
      this.buildIndex();
    }

    const issueText = typeof issue === 'string' ? issue : this.extractIssueText(issue);
    const { k = 5, includeDuplicates = true } = options;
    
    // 查找相似
    const results = this.vectorCore.findTopK(issueText, this.historyVectors, k * 2, 'cosine');
    
    const matches = results.map(r => {
      const isDuplicate = r.score >= this.duplicateThreshold;
      const isSimilar = r.score >= this.similarityThreshold;
      
      return {
        issueId: r.issueId,
        title: r.title || r.summary || r.name,
        similarity: Math.round(r.score * 1000) / 1000,
        matchType: isDuplicate ? 'duplicate' : (isSimilar ? 'similar' : 'related'),
        isDuplicate,
        isSimilar,
        status: r.status,
        resolution: r.resolution,
        component: r.component || r.module,
        labels: r.labels || r.tags,
        createdAt: r.createdAt || r.timestamp,
        text: r.text?.substring(0, 150) + (r.text?.length > 150 ? '...' : '')
      };
    });

    if (!includeDuplicates) {
      return matches.filter(m => !m.isDuplicate);
    }

    return matches;
  }

  /**
   * 检测重复问题
   */
  detectDuplicate(issue) {
    const matches = this.match(issue, { k: 3 });
    const duplicate = matches.find(m => m.isDuplicate);
    
    if (duplicate) {
      return {
        isDuplicate: true,
        duplicateOf: duplicate.issueId,
        confidence: duplicate.similarity,
        suggestion: `This issue appears to be a duplicate of ${duplicate.issueId}. Please check if the same issue exists.`
      };
    }

    return { isDuplicate: false };
  }

  /**
   * 批量匹配
   */
  matchBatch(issues, options = {}) {
    const results = [];
    for (const issue of issues) {
      const matches = this.match(issue, options);
      results.push({
        issue: issue.id || issue.title,
        matches
      });
    }
    return results;
  }

  /**
   * 回归检测 - 比较当前问题与基线
   */
  detectRegression(currentIssues, baselineIssues, options = {}) {
    const { threshold = 0.70 } = options;
    
    // 临时保存当前状态
    const originalHistory = this.historyData;
    const originalIndexed = this.indexed;
    
    // 使用基线作为历史
    this.historyData = baselineIssues;
    this.indexed = false;
    this.buildIndex();

    const regressions = [];
    
    for (const issue of currentIssues) {
      const matches = this.match(issue, { k: 1 });
      if (matches.length > 0) {
        const bestMatch = matches[0];
        // 如果当前是open状态而基线是closed，可能是回归
        if (bestMatch.similarity >= threshold && 
            issue.status?.toLowerCase() === 'open' &&
            bestMatch.status?.toLowerCase() === 'closed') {
          regressions.push({
            currentIssue: issue.id || issue.title,
            baselineIssue: bestMatch.issueId,
            similarity: bestMatch.similarity,
            previousResolution: bestMatch.resolution,
            confidence: 'high'
          });
        }
      }
    }

    // 恢复状态
    this.historyData = originalHistory;
    this.indexed = originalIndexed;

    return {
      totalCurrent: currentIssues.length,
      totalBaseline: baselineIssues.length,
      regressionsFound: regressions.length,
      regressions
    };
  }

  /**
   * 查找已知问题（Flaky Test检测）
   */
  findKnownFlaky(testCase, historyIssues) {
    // 临时加载历史
    const originalHistory = this.historyData;
    const originalIndexed = this.indexed;
    
    this.historyData = historyIssues;
    this.indexed = false;
    this.buildIndex();

    const matches = this.match(testCase, { k: 3 });
    
    // 恢复
    this.historyData = originalHistory;
    this.indexed = originalIndexed;

    const flakyIndicators = matches.filter(m => {
      const labels = (m.labels || []).map(l => l.toLowerCase());
      return labels.includes('flaky') || 
             labels.includes('intermittent') ||
             labels.includes('unstable');
    });

    if (flakyIndicators.length > 0) {
      return {
        isPotentiallyFlaky: true,
        confidence: Math.max(...flakyIndicators.map(f => f.similarity)),
        similarFlakyIssues: flakyIndicators.map(f => f.issueId),
        recommendation: 'This test case shows patterns similar to known flaky tests. Consider adding retries or investigating timing issues.'
      };
    }

    return { isPotentiallyFlaky: false };
  }

  /**
   * 问题趋势分析
   */
  analyzeTrends() {
    const byComponent = {};
    const byLabel = {};
    const byMonth = {};
    const resolutionTime = [];

    for (const issue of this.historyData) {
      // 按组件统计
      const comp = issue.component || issue.module || 'unknown';
      byComponent[comp] = byComponent[comp] || { count: 0, open: 0, closed: 0 };
      byComponent[comp].count++;
      if (issue.status?.toLowerCase() === 'open') {
        byComponent[comp].open++;
      } else {
        byComponent[comp].closed++;
      }

      // 按标签统计
      for (const label of (issue.labels || issue.tags || [])) {
        byLabel[label] = (byLabel[label] || 0) + 1;
      }

      // 按月统计
      const date = issue.createdAt || issue.timestamp;
      if (date) {
        const month = date.substring(0, 7); // YYYY-MM
        byMonth[month] = (byMonth[month] || 0) + 1;
      }
    }

    return {
      totalIssues: this.historyData.length,
      byComponent: Object.entries(byComponent)
        .sort((a, b) => b[1].count - a[1].count),
      byLabel: Object.entries(byLabel)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      byMonth: Object.entries(byMonth)
        .sort((a, b) => a[0].localeCompare(b[0]))
    };
  }

  /**
   * 导出匹配报告
   */
  exportReport(matches, outputPath) {
    const report = {
      generatedAt: new Date().toISOString(),
      totalMatches: matches.length,
      duplicates: matches.filter(m => m.matchType === 'duplicate').length,
      similar: matches.filter(m => m.matchType === 'similar').length,
      related: matches.filter(m => m.matchType === 'related').length,
      matches
    };

    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    return report;
  }
}

// CLI 支持
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // 解析参数
  const params = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    params[key] = args[i + 1];
  }

  if (!params.issue && !params['check-regression'] && !params.trends) {
    console.log(`
AEO History Matcher - 历史问题匹配工具

Usage:
  node history-matcher.cjs --issue "问题描述" --history ./issues.json
  node history-matcher.cjs --check-regression --current ./current.json --baseline ./baseline.json
  node history-matcher.cjs --trends --history ./issues.json

Options:
  --issue <text>         当前问题描述
  --history <file>       历史问题JSON文件
  --k <n>                返回匹配数量（默认: 5）
  --threshold <n>        相似度阈值（默认: 0.75）
  --duplicate <n>        重复判定阈值（默认: 0.90）
  
  --check-regression      回归检测模式
  --current <file>       当前问题文件
  --baseline <file>      基线问题文件
  
  --trends                趋势分析模式
  --export <file>        导出报告文件

Examples:
  node history-matcher.cjs --issue "登录失败错误" --history ./bugs.json
  node history-matcher.cjs --issue ./new-issue.json --history ./issues.json
  node history-matcher.cjs --check-regression --current ./v2-bugs.json --baseline ./v1-bugs.json
  node history-matcher.cjs --trends --history ./issues.json --export ./trends.json
`);
    process.exit(0);
  }

  const matcher = new HistoryMatcher({
    similarityThreshold: parseFloat(params.threshold) || 0.75,
    duplicateThreshold: parseFloat(params.duplicate) || 0.90
  });

  try {
    // 趋势分析模式
    if (params.trends) {
      matcher.loadHistory(params.history || params.h);
      const trends = matcher.analyzeTrends();
      
      console.log('\n📊 Issue Trends Analysis');
      console.log('═══════════════════════════');
      console.log(`Total Issues: ${trends.totalIssues}\n`);
      
      console.log('By Component:');
      trends.byComponent.slice(0, 10).forEach(([comp, stats]) => {
        console.log(`  ${comp}: ${stats.count} (${stats.open} open, ${stats.closed} closed)`);
      });
      
      console.log('\nTop Labels:');
      trends.byLabel.forEach(([label, count]) => {
        console.log(`  ${label}: ${count}`);
      });

      if (params.export) {
        fs.writeFileSync(params.export, JSON.stringify(trends, null, 2));
        console.log(`\n💾 Trends exported to: ${params.export}`);
      }
      process.exit(0);
    }

    // 回归检测模式
    if (params['check-regression']) {
      const current = JSON.parse(fs.readFileSync(params.current, 'utf-8'));
      const baseline = JSON.parse(fs.readFileSync(params.baseline, 'utf-8'));
      
      const currentIssues = Array.isArray(current) ? current : [current];
      const baselineIssues = Array.isArray(baseline) ? baseline : [baseline];
      
      const result = matcher.detectRegression(currentIssues, baselineIssues);
      
      console.log('\n🔄 Regression Detection Report');
      console.log('═══════════════════════════════');
      console.log(`Current Issues: ${result.totalCurrent}`);
      console.log(`Baseline Issues: ${result.totalBaseline}`);
      console.log(`Regressions Found: ${result.regressionsFound}\n`);
      
      if (result.regressions.length > 0) {
        console.log('Potential Regressions:');
        result.regressions.forEach((r, i) => {
          console.log(`  ${i + 1}. ${r.currentIssue}`);
          console.log(`     Similar to: ${r.baselineIssue} (similarity: ${r.similarity})`);
          console.log(`     Previous resolution: ${r.previousResolution || 'N/A'}`);
        });
      } else {
        console.log('✅ No regressions detected');
      }
      process.exit(0);
    }

    // 正常匹配模式
    matcher.loadHistory(params.history);
    matcher.buildIndex();

    let issue;
    if (fs.existsSync(params.issue)) {
      issue = JSON.parse(fs.readFileSync(params.issue, 'utf-8'));
    } else {
      issue = { title: params.issue, description: params.issue };
    }

    const k = parseInt(params.k) || 5;
    const matches = matcher.match(issue, { k });
    
    console.log('\n🔍 History Matching Results');
    console.log('═══════════════════════════');
    console.log(`Query: ${params.issue}\n`);
    
    const duplicates = matches.filter(m => m.matchType === 'duplicate');
    const similar = matches.filter(m => m.matchType === 'similar');
    const related = matches.filter(m => m.matchType === 'related');

    if (duplicates.length > 0) {
      console.log(`⚠️  ${duplicates.length} Potential Duplicate(s):`);
      duplicates.forEach(m => {
        console.log(`   [${m.similarity}] ${m.title || m.issueId}`);
        console.log(`       Status: ${m.status || 'N/A'} | Resolution: ${m.resolution || 'N/A'}`);
      });
      console.log();
    }

    if (similar.length > 0) {
      console.log(`🔶 ${similar.length} Similar Issue(s):`);
      similar.forEach(m => {
        console.log(`   [${m.similarity}] ${m.title || m.issueId}`);
      });
      console.log();
    }

    if (related.length > 0) {
      console.log(`🔹 ${related.length} Related Issue(s):`);
      related.slice(0, 3).forEach(m => {
        console.log(`   [${m.similarity}] ${m.title || m.issueId}`);
      });
    }

    if (params.export) {
      matcher.exportReport(matches, params.export);
      console.log(`\n💾 Report saved to: ${params.export}`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

module.exports = { HistoryMatcher };
