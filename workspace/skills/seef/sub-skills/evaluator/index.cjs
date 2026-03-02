/**
 * SEEF Evaluator - 技能质量评估器
 * P0阶段实现：基础评估 + CRAS洞察注入
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

/**
 * 评估技能质量
 * @param {Object} input - 输入参数
 * @param {string} input.skillId - 技能ID
 * @param {string} input.skillPath - 技能路径
 * @param {string} input.skillName - 技能名称
 * @param {string} input.trigger - 触发来源 (dto/manual)
 * @returns {Promise<Object>} 评估结果
 */
async function evaluate(input) {
  const { skillId, skillPath, skillName, trigger } = input;
  
  console.log(`[SEEF Evaluator] 开始评估技能: ${skillName} (${skillId})`);
  console.log(`[SEEF Evaluator] 触发来源: ${trigger}`);
  
  try {
    // 1. 加载技能包
    const skillPackage = await loadSkillPackage(skillPath);
    
    // 2. 加载CRAS洞察（如果存在）
    const crasInsight = await loadCRASInsight(skillId);
    
    // 3. 执行基础评估
    const baseScore = await calculateBaseScore(skillPackage);
    
    // 4. CRAS洞察调整权重
    const adjustedScore = adjustScoreWithCRAS(baseScore, crasInsight);
    
    // 5. 识别问题
    const issues = identifyIssues(skillPackage, adjustedScore);
    
    // 6. 生成决策建议
    const suggestions = generateSuggestions(adjustedScore, issues);
    
    // 7. 决定下一步子技能
    const nextSteps = decideNextSteps(adjustedScore, issues);
    
    // 8. 构建评估报告
    const report = {
      skillId,
      skillName,
      skillPath,
      timestamp: Date.now(),
      trigger,
      score: adjustedScore.overallScore,
      dimensions: adjustedScore.dimensions,
      issues: {
        critical: issues.filter(i => i.severity === 'critical').length,
        high: issues.filter(i => i.severity === 'high').length,
        medium: issues.filter(i => i.severity === 'medium').length,
        low: issues.filter(i => i.severity === 'low').length,
        fixable: issues.filter(i => i.fixable).length,
        total: issues.length
      },
      issueDetails: issues,
      suggestions,
      nextSteps,
      crasInjected: !!crasInsight,
      metadata: {
        evaluatorVersion: '1.0.0',
        evaluationTime: Date.now()
      }
    };
    
    // 9. 保存评估报告
    await saveReport(report);
    
    console.log(`[SEEF Evaluator] 评估完成: 得分=${report.score}, 问题=${report.issues.total}`);
    
    return report;
    
  } catch (error) {
    console.error(`[SEEF Evaluator] 评估失败:`, error.message);
    
    return {
      success: false,
      error: error.message,
      skillId,
      skillName,
      timestamp: Date.now()
    };
  }
}

/**
 * 加载技能包
 */
async function loadSkillPackage(skillPath) {
  const fullPath = path.resolve('/root/.openclaw/workspace', skillPath);
  
  // 检查SKILL.md
  const skillMdPath = path.join(fullPath, 'SKILL.md');
  const hasSkillMd = fs.existsSync(skillMdPath);
  
  // 检查package.json
  const packageJsonPath = path.join(fullPath, 'package.json');
  const hasPackageJson = fs.existsSync(packageJsonPath);
  
  // 检查index.js或main文件
  const indexJsPath = path.join(fullPath, 'index.js');
  const hasIndexJs = fs.existsSync(indexJsPath);
  
  // 统计文件数量
  let fileCount = 0;
  let totalSize = 0;
  
  if (fs.existsSync(fullPath)) {
    const files = fs.readdirSync(fullPath, { recursive: true });
    fileCount = files.length;
    
    files.forEach(file => {
      const filePath = path.join(fullPath, file);
      if (fs.statSync(filePath).isFile()) {
        totalSize += fs.statSync(filePath).size;
      }
    });
  }
  
  return {
    path: fullPath,
    exists: fs.existsSync(fullPath),
    hasSkillMd,
    hasPackageJson,
    hasIndexJs,
    fileCount,
    totalSize,
    skillMdContent: hasSkillMd ? fs.readFileSync(skillMdPath, 'utf-8') : null,
    packageJson: hasPackageJson ? JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) : null
  };
}

/**
 * 加载CRAS洞察 — 扫描 insights 目录，取最新的 user-insight-*.json
 * 同时加载 config/user-profile.json 作为补充数据
 */
async function loadCRASInsight(skillId) {
  const insightsDir = '/root/.openclaw/workspace/skills/cras/insights';
  const profilePath = '/root/.openclaw/workspace/skills/cras/config/user-profile.json';

  let insight = null;

  // --- 1. 从 insights 目录加载最新洞察文件 ---
  try {
    if (fs.existsSync(insightsDir)) {
      const files = fs.readdirSync(insightsDir)
        .filter(f => f.startsWith('user-insight-') && f.endsWith('.json'))
        .sort()          // 字典序 → 日期最新的排最后
        .reverse();

      if (files.length > 0) {
        const latestFile = path.join(insightsDir, files[0]);
        insight = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));
        console.log(`[SEEF Evaluator] ✅ 加载CRAS洞察: ${files[0]} (共 ${files.length} 个洞察文件)`);
      } else {
        console.log(`[SEEF Evaluator] ⚠️  insights 目录存在但无 user-insight-*.json 文件`);
      }
    } else {
      console.log(`[SEEF Evaluator] ⚠️  insights 目录不存在: ${insightsDir}`);
    }
  } catch (error) {
    console.warn(`[SEEF Evaluator] CRAS洞察加载失败: ${error.message}`);
  }

  // --- 2. 补充加载用户画像 ---
  try {
    if (fs.existsSync(profilePath)) {
      const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      if (insight) {
        insight._userProfile = profile;
        console.log(`[SEEF Evaluator] ✅ 补充加载用户画像 (interactions: ${profile.profile?.interactionCount || 'N/A'})`);
      } else {
        // 没有洞察文件时，用画像构建最小洞察
        insight = {
          _userProfile: profile,
          user_profile: {
            primary_intent: _inferPrimaryIntent(profile),
            total_interactions: profile.profile?.interactionCount || 0
          },
          capability_gaps: [],
          high_frequency_operations: [],
          intent_distribution: _buildIntentDistribution(profile),
          _syntheticFromProfile: true
        };
        console.log(`[SEEF Evaluator] ✅ 从用户画像合成最小洞察`);
      }
    }
  } catch (error) {
    console.warn(`[SEEF Evaluator] 用户画像加载失败: ${error.message}`);
  }

  if (!insight) {
    console.log(`[SEEF Evaluator] ❌ 无可用CRAS数据，将使用默认权重`);
  }

  return insight;
}

/**
 * 从用户画像推断主要意图
 */
function _inferPrimaryIntent(profile) {
  if (!profile?.profile?.tags || profile.profile.tags.length === 0) return 'unknown';
  const counts = {};
  for (const tag of profile.profile.tags) {
    counts[tag] = (counts[tag] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * 从画像 tags 构建意图分布
 */
function _buildIntentDistribution(profile) {
  const dist = {};
  if (!profile?.profile?.tags) return dist;
  for (const tag of profile.profile.tags) {
    dist[tag] = (dist[tag] || 0) + 1;
  }
  return dist;
}

/**
 * 计算基础得分
 */
async function calculateBaseScore(skillPackage) {
  const dimensions = {
    completeness: 0,    // 完整性
    documentation: 0,   // 文档质量
    structure: 0,       // 结构规范
    functionality: 0    // 功能性
  };
  
  // 完整性评分
  if (skillPackage.exists) dimensions.completeness += 25;
  if (skillPackage.hasSkillMd) dimensions.completeness += 25;
  if (skillPackage.hasPackageJson) dimensions.completeness += 25;
  if (skillPackage.hasIndexJs) dimensions.completeness += 25;
  
  // 文档质量评分
  if (skillPackage.skillMdContent) {
    const lines = skillPackage.skillMdContent.split('\n').length;
    if (lines > 10) dimensions.documentation += 30;
    if (lines > 50) dimensions.documentation += 30;
    if (skillPackage.skillMdContent.includes('## Usage')) dimensions.documentation += 20;
    if (skillPackage.skillMdContent.includes('## Examples')) dimensions.documentation += 20;
  }
  
  // 结构规范评分
  if (skillPackage.fileCount > 0) dimensions.structure += 30;
  if (skillPackage.fileCount > 5) dimensions.structure += 30;
  if (skillPackage.packageJson?.version) dimensions.structure += 20;
  if (skillPackage.packageJson?.description) dimensions.structure += 20;
  
  // 功能性评分（简化版）
  if (skillPackage.hasIndexJs) dimensions.functionality += 50;
  if (skillPackage.totalSize > 1000) dimensions.functionality += 25;
  if (skillPackage.totalSize > 10000) dimensions.functionality += 25;
  
  // 计算总分
  const overallScore = Math.round(
    (dimensions.completeness + dimensions.documentation + 
     dimensions.structure + dimensions.functionality) / 4
  );
  
  return {
    overallScore,
    dimensions
  };
}

/**
 * CRAS洞察调整权重
 *
 * 策略矩阵 — 根据用户 primary_intent 与 高频操作
 * 动态放大/缩小各维度得分：
 *
 *   意图/操作              维度影响
 *   ─────────────────────────────────────────
 *   command / execution    functionality ×1.5
 *   exploration / learning documentation ×1.4
 *   query / verification   completeness  ×1.3
 *   feedback / monitoring  structure     ×1.2
 *
 * capability_gaps → completeness 衰减 0.85
 * high_frequency_operations → 匹配特定 pattern 额外微调
 */
function adjustScoreWithCRAS(baseScore, crasInsight) {
  if (!crasInsight) {
    console.log(`[SEEF Evaluator] CRAS注入: 跳过（无洞察数据）`);
    return baseScore;
  }

  // Deep-clone，避免修改原始对象
  const adjusted = {
    overallScore: baseScore.overallScore,
    dimensions: { ...baseScore.dimensions }
  };

  const primaryIntent = crasInsight.user_profile?.primary_intent || '';
  const intentDist = crasInsight.intent_distribution || {};
  const gaps = crasInsight.capability_gaps || [];
  const highFreqOps = crasInsight.high_frequency_operations || [];

  console.log(`[SEEF Evaluator] CRAS注入: primary_intent=${primaryIntent}, gaps=${gaps.length}, highFreqOps=${highFreqOps.length}`);
  console.log(`[SEEF Evaluator] CRAS注入: intent_distribution=${JSON.stringify(intentDist)}`);

  // --- 1. 按主要意图调整 ---
  const intentMultipliers = {
    command:      { functionality: 1.5 },
    execution:    { functionality: 1.5 },
    exploration:  { documentation: 1.4 },
    learning:     { documentation: 1.4 },
    query:        { completeness: 1.3 },
    verification: { completeness: 1.3 },
    feedback:     { structure: 1.2 },
    monitoring:   { structure: 1.2 }
  };

  const multiplier = intentMultipliers[primaryIntent];
  if (multiplier) {
    for (const [dim, factor] of Object.entries(multiplier)) {
      if (adjusted.dimensions[dim] !== undefined) {
        const before = adjusted.dimensions[dim];
        adjusted.dimensions[dim] = Math.min(100, Math.round(before * factor));
        console.log(`[SEEF Evaluator] CRAS注入: ${dim} ${before} → ${adjusted.dimensions[dim]} (intent:${primaryIntent}, ×${factor})`);
      }
    }
  }

  // --- 2. 按意图分布次要调整 ---
  // 如果 command 占比 > 30%，额外提升 functionality
  const totalIntents = Object.values(intentDist).reduce((s, v) => s + v, 0) || 1;
  if ((intentDist.command || 0) / totalIntents > 0.3) {
    const before = adjusted.dimensions.functionality;
    adjusted.dimensions.functionality = Math.min(100, Math.round(before * 1.1));
    console.log(`[SEEF Evaluator] CRAS注入: functionality 额外 ×1.1 (command占比>${30}%)`);
  }

  // --- 3. 能力缺口衰减 ---
  if (gaps.length > 0) {
    const before = adjusted.dimensions.completeness;
    const factor = gaps.length >= 3 ? 0.75 : 0.85;
    adjusted.dimensions.completeness = Math.round(before * factor);
    console.log(`[SEEF Evaluator] CRAS注入: completeness ${before} → ${adjusted.dimensions.completeness} (${gaps.length} gaps, ×${factor})`);

    // 严重缺口额外影响 functionality
    const criticalGaps = gaps.filter(g => g.severity === 'high' || g.severity === 'critical');
    if (criticalGaps.length > 0) {
      const fBefore = adjusted.dimensions.functionality;
      adjusted.dimensions.functionality = Math.round(fBefore * 0.9);
      console.log(`[SEEF Evaluator] CRAS注入: functionality ${fBefore} → ${adjusted.dimensions.functionality} (${criticalGaps.length} critical gaps)`);
    }
  }

  // --- 4. 高频操作模式微调 ---
  for (const op of highFreqOps) {
    const pattern = (op.operation || '').toLowerCase();
    if (pattern.includes('architecture') || pattern.includes('structure')) {
      adjusted.dimensions.structure = Math.min(100, Math.round(adjusted.dimensions.structure * 1.15));
      console.log(`[SEEF Evaluator] CRAS注入: structure ×1.15 (高频操作: ${op.operation})`);
    }
    if (pattern.includes('verification') || pattern.includes('capability')) {
      adjusted.dimensions.completeness = Math.min(100, Math.round(adjusted.dimensions.completeness * 1.1));
      console.log(`[SEEF Evaluator] CRAS注入: completeness ×1.1 (高频操作: ${op.operation})`);
    }
    if (pattern.includes('pipeline') || pattern.includes('execution') || pattern.includes('monitoring')) {
      adjusted.dimensions.functionality = Math.min(100, Math.round(adjusted.dimensions.functionality * 1.1));
      console.log(`[SEEF Evaluator] CRAS注入: functionality ×1.1 (高频操作: ${op.operation})`);
    }
  }

  // --- 5. 重新计算总分 ---
  adjusted.overallScore = Math.round(
    (adjusted.dimensions.completeness + adjusted.dimensions.documentation +
     adjusted.dimensions.structure + adjusted.dimensions.functionality) / 4
  );

  console.log(`[SEEF Evaluator] CRAS注入完成: 基础总分=${baseScore.overallScore} → 调整后=${adjusted.overallScore}`);

  return adjusted;
}

/**
 * 识别问题
 */
function identifyIssues(skillPackage, score) {
  const issues = [];
  
  // 关键文件缺失
  if (!skillPackage.hasSkillMd) {
    issues.push({
      type: 'missing_skill_md',
      severity: 'critical',
      description: 'SKILL.md文件缺失',
      fixable: true,
      suggestedFix: 'create_skill_md_template'
    });
  }
  
  if (!skillPackage.hasIndexJs) {
    issues.push({
      type: 'missing_entry_point',
      severity: 'critical',
      description: '入口文件(index.js)缺失',
      fixable: true,
      suggestedFix: 'create_index_js'
    });
  }
  
  // 文档质量问题
  if (score.dimensions.documentation < 50) {
    issues.push({
      type: 'poor_documentation',
      severity: 'high',
      description: '文档质量不足',
      fixable: true,
      suggestedFix: 'enhance_documentation'
    });
  }
  
  // 结构问题
  if (score.dimensions.structure < 50) {
    issues.push({
      type: 'poor_structure',
      severity: 'medium',
      description: '项目结构不规范',
      fixable: true,
      suggestedFix: 'refactor_structure'
    });
  }
  
  return issues;
}

/**
 * 生成建议
 */
function generateSuggestions(score, issues) {
  const suggestions = [];
  
  if (score.overallScore < 70) {
    suggestions.push('trigger_full_pipeline');
  }
  
  if (issues.filter(i => i.severity === 'critical').length > 0) {
    suggestions.push('immediate_fix_required');
  }
  
  if (issues.filter(i => i.fixable).length > 0) {
    suggestions.push('run_optimizer');
  }
  
  if (score.dimensions.documentation < 60) {
    suggestions.push('improve_documentation');
  }
  
  return suggestions;
}

/**
 * 决定下一步子技能
 */
function decideNextSteps(score, issues) {
  const nextSteps = [];
  
  // 高分通过，仅记录
  if (score.overallScore >= 90 && issues.filter(i => i.severity === 'critical').length === 0) {
    nextSteps.push('recorder');
    return nextSteps;
  }
  
  // 中等分数，需优化
  if (score.overallScore >= 70 && issues.filter(i => i.fixable).length > 0) {
    nextSteps.push('optimizer', 'validator', 'recorder');
    return nextSteps;
  }
  
  // 低分或严重问题，全流程
  if (score.overallScore < 70 || issues.filter(i => i.severity === 'critical').length > 0) {
    nextSteps.push('discoverer', 'optimizer', 'validator', 'recorder');
    return nextSteps;
  }
  
  // 默认：仅记录
  nextSteps.push('recorder');
  return nextSteps;
}

/**
 * 保存评估报告
 */
async function saveReport(report) {
  const reportsDir = path.join('/root/.openclaw/workspace/reports/seef-evaluations');
  
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${report.skillId}-${timestamp}.json`;
  const filepath = path.join(reportsDir, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  
  console.log(`[SEEF Evaluator] 报告已保存: ${filepath}`);
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
  
  evaluate(input)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Evaluation failed:', error);
      process.exit(1);
    });
}

module.exports = {
  evaluate
};
