const { SKILLS_DIR, REPORTS_DIR, WORKSPACE } = require('../../../_shared/paths');
/**
 * SEEF Recorder - 技能进化记录器
 * P1阶段实现：记录进化事件，构建可追溯的进化历史
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 记录进化事件
 * @param {Object} input - 输入参数
 * @param {string} input.skillId - 技能ID
 * @param {string} input.skillName - 技能名称
 * @param {string} input.evolutionId - 进化任务ID
 * @param {Object} input.evaluationResult - 评估结果
 * @param {Object} input.optimizationResult - 优化结果（可选）
 * @param {Object} input.validationResult - 验证结果（可选）
 * @param {string} input.trigger - 触发来源
 * @returns {Promise<Object>} 记录结果
 */
async function record(input) {
  const {
    skillId,
    skillName,
    evolutionId,
    evaluationResult,
    optimizationResult,
    validationResult,
    trigger
  } = input;

  console.log(`[SEEF Recorder] 开始记录进化事件: ${skillName} (${evolutionId})`);

  try {
    // 1. 生成记录ID
    const recordId = generateRecordId(skillId, evolutionId);

    // 2. 构建进化记录
    const evolutionRecord = buildEvolutionRecord({
      recordId,
      skillId,
      skillName,
      evolutionId,
      evaluationResult,
      optimizationResult,
      validationResult,
      trigger,
      timestamp: Date.now()
    });

    // 3. 保存到进化历史
    await saveToHistory(evolutionRecord);

    // 4. 更新技能元数据
    await updateSkillMetadata(skillId, evolutionRecord);

    // 5. 关联CRAS知识图谱
    await linkToCRAS(skillId, evolutionRecord);

    // 6. 生成进化报告
    const report = await generateEvolutionReport(evolutionRecord);

    // 7. 保存报告
    await saveReport(report);

    console.log(`[SEEF Recorder] 记录完成: ${recordId}`);

    return {
      success: true,
      recordId,
      reportPath: report.path,
      historyPath: evolutionRecord.historyPath,
      metadata: {
        timestamp: Date.now(),
        recordedBy: 'seef-recorder-v1.0.0'
      }
    };

  } catch (error) {
    console.error(`[SEEF Recorder] 记录失败:`, error.message);

    return {
      success: false,
      error: error.message,
      skillId,
      evolutionId,
      timestamp: Date.now()
    };
  }
}

/**
 * 生成记录ID
 */
function generateRecordId(skillId, evolutionId) {
  const hash = crypto
    .createHash('sha256')
    .update(`${skillId}-${evolutionId}-${Date.now()}`)
    .digest('hex')
    .substring(0, 12);

  return `evo-${hash}`;
}

/**
 * 构建进化记录
 */
function buildEvolutionRecord(data) {
  const {
    recordId,
    skillId,
    skillName,
    evolutionId,
    evaluationResult,
    optimizationResult,
    validationResult,
    trigger,
    timestamp
  } = data;

  // 提取关键指标
  const metrics = extractMetrics({
    evaluationResult,
    optimizationResult,
    validationResult
  });

  // 确定进化状态
  const status = determineEvolutionStatus({
    evaluationResult,
    optimizationResult,
    validationResult
  });

  // 构建变更摘要
  const changes = buildChangeSummary({
    optimizationResult,
    validationResult
  });

  return {
    recordId,
    skillId,
    skillName,
    evolutionId,
    timestamp,
    trigger,
    status,
    metrics,
    changes,
    stages: {
      evaluation: {
        completed: !!evaluationResult,
        timestamp: evaluationResult?.timestamp,
        score: evaluationResult?.score,
        issues: evaluationResult?.issues
      },
      optimization: {
        completed: !!optimizationResult,
        timestamp: optimizationResult?.timestamp,
        filesModified: optimizationResult?.summary?.filesModified,
        issuesFixed: optimizationResult?.summary?.issuesFixed
      },
      validation: {
        completed: !!validationResult,
        timestamp: validationResult?.timestamp,
        passed: validationResult?.passed,
        testResults: validationResult?.testResults
      }
    },
    metadata: {
      recorderVersion: '1.0.0',
      recordedAt: Date.now()
    }
  };
}

/**
 * 提取关键指标
 */
function extractMetrics(data) {
  const { evaluationResult, optimizationResult, validationResult } = data;

  return {
    evaluation: {
      score: evaluationResult?.score || 0,
      issuesFound: evaluationResult?.issues?.total || 0,
      criticalIssues: evaluationResult?.issues?.critical || 0
    },
    optimization: {
      filesModified: optimizationResult?.summary?.filesModified || 0,
      issuesFixed: optimizationResult?.summary?.issuesFixed || 0,
      operationsCompleted: optimizationResult?.summary?.successfulOperations || 0
    },
    validation: {
      passed: validationResult?.passed || false,
      testsRun: validationResult?.testResults?.total || 0,
      testsPassed: validationResult?.testResults?.passed || 0
    }
  };
}

/**
 * 确定进化状态
 */
function determineEvolutionStatus(data) {
  const { evaluationResult, optimizationResult, validationResult } = data;

  // 如果有验证结果，以验证为准
  if (validationResult) {
    return validationResult.passed ? 'success' : 'failed';
  }

  // 如果有优化结果
  if (optimizationResult) {
    if (optimizationResult.status === 'success') {
      return 'optimized';
    }
    return 'partial';
  }

  // 仅评估
  if (evaluationResult) {
    if (evaluationResult.score >= 90) {
      return 'excellent';
    }
    if (evaluationResult.score >= 70) {
      return 'good';
    }
    return 'needs_improvement';
  }

  return 'unknown';
}

/**
 * 构建变更摘要
 */
function buildChangeSummary(data) {
  const { optimizationResult, validationResult } = data;

  const changes = [];

  if (optimizationResult?.results) {
    optimizationResult.results.forEach(result => {
      if (result.status === 'success' && result.changes) {
        result.changes.forEach(change => {
          changes.push({
            type: change.changeType,
            file: change.filePath,
            operation: result.operationId,
            timestamp: result.completedAt
          });
        });
      }
    });
  }

  return {
    total: changes.length,
    byType: {
      added: changes.filter(c => c.type === 'added').length,
      modified: changes.filter(c => c.type === 'modified').length,
      deleted: changes.filter(c => c.type === 'deleted').length
    },
    details: changes
  };
}

/**
 * 保存到进化历史
 */
async function saveToHistory(record) {
  const historyDir = path.join(
    path.join(REPORTS_DIR, 'seef-evolution-history'),
    record.skillId
  );

  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${record.recordId}-${timestamp}.json`;
  const filepath = path.join(historyDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(record, null, 2));

  record.historyPath = filepath;

  console.log(`[SEEF Recorder] 历史记录已保存: ${filepath}`);

  // 更新索引
  await updateHistoryIndex(record.skillId, record);
}

/**
 * 更新历史索引
 */
async function updateHistoryIndex(skillId, record) {
  const indexPath = path.join(
    path.join(REPORTS_DIR, 'seef-evolution-history'),
    skillId,
    'index.json'
  );

  let index = { skillId, records: [] };

  if (fs.existsSync(indexPath)) {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  }

  index.records.push({
    recordId: record.recordId,
    evolutionId: record.evolutionId,
    timestamp: record.timestamp,
    status: record.status,
    trigger: record.trigger,
    score: record.metrics.evaluation.score,
    path: record.historyPath
  });

  index.lastUpdated = Date.now();
  index.totalRecords = index.records.length;

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

  console.log(`[SEEF Recorder] 索引已更新: ${indexPath}`);
}

/**
 * 更新技能元数据
 */
async function updateSkillMetadata(skillId, record) {
  const metadataPath = path.join(
    SKILLS_DIR,
    skillId,
    '.seef-metadata.json'
  );

  let metadata = {
    skillId,
    evolutionHistory: [],
    statistics: {
      totalEvolutions: 0,
      successfulEvolutions: 0,
      lastEvolutionAt: null,
      averageScore: 0
    }
  };

  // 确保技能目录存在
  const skillDir = path.dirname(metadataPath);
  if (!fs.existsSync(skillDir)) {
    console.log(`[SEEF Recorder] 技能目录不存在，跳过元数据更新: ${skillDir}`);
    return;
  }

  if (fs.existsSync(metadataPath)) {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  }

  // 添加进化记录
  metadata.evolutionHistory.push({
    recordId: record.recordId,
    evolutionId: record.evolutionId,
    timestamp: record.timestamp,
    status: record.status,
    score: record.metrics.evaluation.score
  });

  // 更新统计
  metadata.statistics.totalEvolutions++;
  if (record.status === 'success' || record.status === 'excellent') {
    metadata.statistics.successfulEvolutions++;
  }
  metadata.statistics.lastEvolutionAt = record.timestamp;

  const scores = metadata.evolutionHistory.map(e => e.score).filter(s => s > 0);
  metadata.statistics.averageScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  metadata.lastUpdated = Date.now();

  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  console.log(`[SEEF Recorder] 技能元数据已更新: ${metadataPath}`);
}

/**
 * 关联CRAS知识图谱
 */
async function linkToCRAS(skillId, record) {
  const crasLinkPath = path.join(
    path.join(SKILLS_DIR, 'cras/evolution-links'),
    `${skillId}.json`
  );

  const linkDir = path.dirname(crasLinkPath);
  if (!fs.existsSync(linkDir)) {
    fs.mkdirSync(linkDir, { recursive: true });
  }

  let links = { skillId, evolutionLinks: [] };

  if (fs.existsSync(crasLinkPath)) {
    links = JSON.parse(fs.readFileSync(crasLinkPath, 'utf-8'));
  }

  links.evolutionLinks.push({
    recordId: record.recordId,
    evolutionId: record.evolutionId,
    timestamp: record.timestamp,
    status: record.status,
    trigger: record.trigger,
    crasInsightUsed: record.stages.evaluation?.crasInjected || false
  });

  links.lastUpdated = Date.now();

  fs.writeFileSync(crasLinkPath, JSON.stringify(links, null, 2));

  console.log(`[SEEF Recorder] CRAS关联已建立: ${crasLinkPath}`);
}

/**
 * 生成进化报告
 */
async function generateEvolutionReport(record) {
  const reportContent = buildReportMarkdown(record);

  const reportsDir = path.join(
    path.join(REPORTS_DIR, 'seef-evolution-history'),
    record.skillId
  );

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${record.recordId}-report-${timestamp}.md`;
  const filepath = path.join(reportsDir, filename);

  fs.writeFileSync(filepath, reportContent);

  console.log(`[SEEF Recorder] 进化报告已生成: ${filepath}`);

  return {
    path: filepath,
    content: reportContent
  };
}

/**
 * 构建报告Markdown
 */
function buildReportMarkdown(record) {
  const date = new Date(record.timestamp).toISOString();

  return `# SEEF 进化报告

## 基本信息

- **记录ID**: ${record.recordId}
- **技能ID**: ${record.skillId}
- **技能名称**: ${record.skillName}
- **进化ID**: ${record.evolutionId}
- **时间**: ${date}
- **触发来源**: ${record.trigger}
- **状态**: ${record.status}

## 进化指标

### 评估阶段
- **得分**: ${record.metrics.evaluation.score}/100
- **发现问题**: ${record.metrics.evaluation.issuesFound}
- **严重问题**: ${record.metrics.evaluation.criticalIssues}

### 优化阶段
- **修改文件**: ${record.metrics.optimization.filesModified}
- **修复问题**: ${record.metrics.optimization.issuesFixed}
- **完成操作**: ${record.metrics.optimization.operationsCompleted}

### 验证阶段
- **通过**: ${record.metrics.validation.passed ? '✅' : '❌'}
- **测试总数**: ${record.metrics.validation.testsRun}
- **通过测试**: ${record.metrics.validation.testsPassed}

## 变更摘要

- **总变更**: ${record.changes.total}
- **新增**: ${record.changes.byType.added}
- **修改**: ${record.changes.byType.modified}
- **删除**: ${record.changes.byType.deleted}

## 阶段详情

### 评估
- **完成**: ${record.stages.evaluation.completed ? '✅' : '❌'}
- **时间**: ${record.stages.evaluation.timestamp ? new Date(record.stages.evaluation.timestamp).toISOString() : 'N/A'}
- **得分**: ${record.stages.evaluation.score || 'N/A'}

### 优化
- **完成**: ${record.stages.optimization.completed ? '✅' : '❌'}
- **时间**: ${record.stages.optimization.timestamp ? new Date(record.stages.optimization.timestamp).toISOString() : 'N/A'}
- **修改文件**: ${record.stages.optimization.filesModified || 0}

### 验证
- **完成**: ${record.stages.validation.completed ? '✅' : '❌'}
- **时间**: ${record.stages.validation.timestamp ? new Date(record.stages.validation.timestamp).toISOString() : 'N/A'}
- **通过**: ${record.stages.validation.passed ? '✅' : '❌'}

## 元数据

- **记录器版本**: ${record.metadata.recorderVersion}
- **记录时间**: ${new Date(record.metadata.recordedAt).toISOString()}
- **历史路径**: ${record.historyPath}

---

*此报告由 SEEF Recorder 自动生成*
`;
}

/**
 * 保存报告
 */
async function saveReport(report) {
  // 报告已在 generateEvolutionReport 中保存
  return report;
}

// CLI支持
if (require.main === module) {
  const args = process.argv.slice(2);
  const inputJson = args[0];

  if (!inputJson) {
    console.error('Usage: node index.js <input-json>');
    process.exit(1);
  }

  const input = JSON.parse(inputJson);

  record(input)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Recording failed:', error);
      process.exit(1);
    });
}

module.exports = {
  record
};
