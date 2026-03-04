const { SKILLS_DIR, REPORTS_DIR } = require('../../../_shared/paths');
/**
 * SEEF Discoverer - 技能发现器
 * P1阶段实现：识别能力空白和冗余
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

/**
 * 发现技能生态问题
 * @param {Object} input - 输入参数
 * @param {Object} input.evaluationReport - Evaluator评估报告
 * @param {string} input.skillId - 技能ID
 * @param {string} input.skillPath - 技能路径
 * @returns {Promise<Object>} 发现结果
 */
async function discover(input) {
  const { evaluationReport, skillId, skillPath } = input;
  
  console.log(`[SEEF Discoverer] 开始发现分析: ${skillId}`);
  console.log(`[SEEF Discoverer] 评估得分: ${evaluationReport?.score ?? 'N/A'}`);
  
  try {
    // 1. 加载CRAS洞察（如果存在）
    const crasInsight = await loadCRASInsight(skillId);
    
    // 2. 扫描技能生态
    const ecosystem = await scanEcosystem();
    
    // 3. 发现能力空白
    const capabilityGaps = await findCapabilityGaps(evaluationReport, ecosystem, crasInsight);
    
    // 4. 识别冗余建设
    const redundancies = await findRedundancies(skillId, skillPath, ecosystem);
    
    // 5. 发现协同机会
    const synergies = await findSynergies(skillId, evaluationReport, ecosystem);
    
    // 6. 生成问题清单
    const issues = generateIssueList(capabilityGaps, redundancies, evaluationReport);
    
    // 7. 计算修复优先级
    const priorities = calculatePriorities(issues, crasInsight);
    
    // 8. 构建发现报告
    const report = {
      skillId,
      skillPath,
      timestamp: Date.now(),
      evaluationScore: evaluationReport.score,
      discovery: {
        capabilityGaps: {
          count: capabilityGaps.length,
          items: capabilityGaps
        },
        redundancies: {
          count: redundancies.length,
          items: redundancies
        },
        synergies: {
          count: synergies.length,
          items: synergies
        }
      },
      issues: {
        total: issues.length,
        critical: issues.filter(i => i.priority === 'critical').length,
        high: issues.filter(i => i.priority === 'high').length,
        medium: issues.filter(i => i.priority === 'medium').length,
        low: issues.filter(i => i.priority === 'low').length,
        items: issues
      },
      priorities,
      recommendations: generateRecommendations(issues, priorities, crasInsight),
      crasInjected: !!crasInsight,
      metadata: {
        discovererVersion: '1.0.0',
        ecosystemSize: ecosystem.skills.length,
        discoveryTime: Date.now()
      }
    };
    
    // 9. 保存发现报告
    await saveReport(report);
    
    console.log(`[SEEF Discoverer] 发现完成: 问题=${report.issues.total}, 空白=${capabilityGaps.length}, 冗余=${redundancies.length}`);
    
    return report;
    
  } catch (error) {
    console.error(`[SEEF Discoverer] 发现失败:`, error.message);
    
    return {
      success: false,
      error: error.message,
      skillId,
      timestamp: Date.now()
    };
  }
}

/**
 * 加载CRAS洞察
 */
async function loadCRASInsight(skillId) {
  const crasPath = path.join(SKILLS_DIR, 'cras/insights', `${skillId}.json`);
  
  if (fs.existsSync(crasPath)) {
    try {
      const insight = JSON.parse(fs.readFileSync(crasPath, 'utf-8'));
      console.log(`[SEEF Discoverer] 加载CRAS洞察: ${skillId}`);
      return insight;
    } catch (error) {
      console.warn(`[SEEF Discoverer] CRAS洞察加载失败: ${error.message}`);
      return null;
    }
  }
  
  return null;
}

/**
 * 扫描技能生态
 */
async function scanEcosystem() {
  const skillsDir = SKILLS_DIR;
  const skills = [];
  
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const skillPath = path.join(skillsDir, entry.name);
        const skillMdPath = path.join(skillPath, 'SKILL.md');
        const packageJsonPath = path.join(skillPath, 'package.json');
        
        const skillInfo = {
          id: entry.name,
          path: skillPath,
          hasSkillMd: fs.existsSync(skillMdPath),
          hasPackageJson: fs.existsSync(packageJsonPath),
          capabilities: [],
          tags: []
        };
        
        // 解析SKILL.md提取能力
        if (skillInfo.hasSkillMd) {
          const content = fs.readFileSync(skillMdPath, 'utf-8');
          skillInfo.capabilities = extractCapabilities(content);
          skillInfo.tags = extractTags(content);
        }
        
        // 解析package.json
        if (skillInfo.hasPackageJson) {
          try {
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            skillInfo.version = pkg.version;
            skillInfo.description = pkg.description;
            skillInfo.keywords = pkg.keywords || [];
          } catch (e) {
            // 忽略解析错误
          }
        }
        
        skills.push(skillInfo);
      }
    }
    
    console.log(`[SEEF Discoverer] 扫描到 ${skills.length} 个技能`);
    
  } catch (error) {
    console.warn(`[SEEF Discoverer] 生态扫描失败: ${error.message}`);
  }
  
  return {
    skills,
    totalCount: skills.length,
    scanTime: Date.now()
  };
}

/**
 * 提取能力关键词
 */
function extractCapabilities(content) {
  const capabilities = [];
  const lines = content.split('\n');
  
  // 简单的关键词提取
  const keywords = ['analyze', 'generate', 'optimize', 'validate', 'transform', 'monitor', 'deploy', 'test', 'debug', 'refactor'];
  
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        capabilities.push(keyword);
      }
    }
  }
  
  return [...new Set(capabilities)];
}

/**
 * 提取标签
 */
function extractTags(content) {
  const tags = [];
  
  // 提取标签行
  const tagMatch = content.match(/tags?:\s*(.+)/i);
  if (tagMatch) {
    const tagStr = tagMatch[1];
    tags.push(...tagStr.split(/[,\s]+/).filter(t => t.length > 0));
  }
  
  return tags;
}

/**
 * 发现能力空白
 */
async function findCapabilityGaps(evaluationReport, ecosystem, crasInsight) {
  const gaps = [];
  
  // 1. 从评估报告中识别缺失能力
  if (evaluationReport.issues?.issueDetails) {
    for (const issue of evaluationReport.issues.issueDetails) {
      if (issue.type === 'missing_skill_md' || issue.type === 'missing_entry_point') {
        gaps.push({
          type: 'missing_core_file',
          severity: 'critical',
          description: issue.description,
          suggestedAction: issue.suggestedFix,
          source: 'evaluation'
        });
      }
    }
  }
  
  // 2. 从CRAS洞察中识别能力空白
  if (crasInsight?.capabilityGaps) {
    for (const gap of crasInsight.capabilityGaps) {
      gaps.push({
        type: 'capability_gap',
        severity: 'high',
        description: `能力空白: ${gap}`,
        suggestedAction: 'extend_capability',
        source: 'cras'
      });
    }
  }
  
  // 3. 检查文档完整性
  if (evaluationReport.score < 70 && evaluationReport.dimensions?.documentation < 50) {
    gaps.push({
      type: 'documentation_gap',
      severity: 'high',
      description: '文档严重不足，缺少使用说明和示例',
      suggestedAction: 'create_comprehensive_docs',
      source: 'evaluation'
    });
  }
  
  // 4. 检查功能完整性
  if (evaluationReport.dimensions?.functionality < 50) {
    gaps.push({
      type: 'functionality_gap',
      severity: 'high',
      description: '功能实现不完整',
      suggestedAction: 'implement_core_features',
      source: 'evaluation'
    });
  }
  
  return gaps;
}

/**
 * 识别冗余建设
 */
async function findRedundancies(skillId, skillPath, ecosystem) {
  const redundancies = [];
  
  // 获取当前技能信息
  const currentSkill = ecosystem.skills.find(s => s.id === skillId);
  if (!currentSkill) {
    return redundancies;
  }
  
  // 检查相似技能
  for (const skill of ecosystem.skills) {
    if (skill.id === skillId) continue;
    
    // 检查能力重叠
    const capabilityOverlap = currentSkill.capabilities.filter(c => 
      skill.capabilities.includes(c)
    );
    
    if (capabilityOverlap.length > 0) {
      const overlapRatio = capabilityOverlap.length / Math.max(currentSkill.capabilities.length, 1);
      
      if (overlapRatio > 0.5) {
        redundancies.push({
          type: 'capability_overlap',
          severity: overlapRatio > 0.8 ? 'high' : 'medium',
          description: `与技能 ${skill.id} 存在 ${Math.round(overlapRatio * 100)}% 能力重叠`,
          overlappingCapabilities: capabilityOverlap,
          targetSkill: skill.id,
          suggestedAction: overlapRatio > 0.8 ? 'consider_merge' : 'clarify_boundaries'
        });
      }
    }
    
    // 检查标签重叠
    if (currentSkill.tags && skill.tags) {
      const tagOverlap = currentSkill.tags.filter(t => skill.tags.includes(t));
      if (tagOverlap.length >= 3) {
        redundancies.push({
          type: 'tag_overlap',
          severity: 'low',
          description: `与技能 ${skill.id} 标签高度相似`,
          overlappingTags: tagOverlap,
          targetSkill: skill.id,
          suggestedAction: 'review_positioning'
        });
      }
    }
  }
  
  return redundancies;
}

/**
 * 发现协同机会
 */
async function findSynergies(skillId, evaluationReport, ecosystem) {
  const synergies = [];
  
  const currentSkill = ecosystem.skills.find(s => s.id === skillId);
  if (!currentSkill) {
    return synergies;
  }
  
  // 1. 寻找互补技能
  for (const skill of ecosystem.skills) {
    if (skill.id === skillId) continue;
    
    // 检查能力互补
    const complementaryCapabilities = skill.capabilities.filter(c => 
      !currentSkill.capabilities.includes(c)
    );
    
    if (complementaryCapabilities.length > 0 && currentSkill.capabilities.length > 0) {
      synergies.push({
        type: 'complementary_capability',
        targetSkill: skill.id,
        description: `可与 ${skill.id} 协同，获得 ${complementaryCapabilities.join(', ')} 能力`,
        potentialBenefit: 'capability_extension',
        suggestedAction: 'explore_integration'
      });
    }
  }
  
  // 2. 识别依赖机会
  if (evaluationReport.score < 70) {
    // 寻找可能帮助提升的技能
    const helperSkills = ecosystem.skills.filter(s => 
      s.capabilities.includes('optimize') || 
      s.capabilities.includes('validate') ||
      s.capabilities.includes('test')
    );
    
    for (const helper of helperSkills) {
      synergies.push({
        type: 'improvement_dependency',
        targetSkill: helper.id,
        description: `可利用 ${helper.id} 提升质量`,
        potentialBenefit: 'quality_improvement',
        suggestedAction: 'apply_helper_skill'
      });
    }
  }
  
  return synergies;
}

/**
 * 生成问题清单
 */
function generateIssueList(capabilityGaps, redundancies, evaluationReport) {
  const issues = [];
  
  // 添加能力空白问题
  for (const gap of capabilityGaps) {
    issues.push({
      id: `gap-${issues.length + 1}`,
      category: 'capability_gap',
      priority: gap.severity,
      description: gap.description,
      suggestedAction: gap.suggestedAction,
      source: gap.source,
      fixable: true
    });
  }
  
  // 添加冗余问题
  for (const redundancy of redundancies) {
    issues.push({
      id: `redundancy-${issues.length + 1}`,
      category: 'redundancy',
      priority: redundancy.severity,
      description: redundancy.description,
      suggestedAction: redundancy.suggestedAction,
      targetSkill: redundancy.targetSkill,
      fixable: false // 冗余问题需要人工决策
    });
  }
  
  // 添加评估报告中的问题
  if (evaluationReport.issues?.issueDetails) {
    for (const issue of evaluationReport.issues.issueDetails) {
      issues.push({
        id: `eval-${issues.length + 1}`,
        category: 'evaluation_issue',
        priority: issue.severity,
        description: issue.description,
        suggestedAction: issue.suggestedFix,
        source: 'evaluator',
        fixable: issue.fixable
      });
    }
  }
  
  return issues;
}

/**
 * 计算修复优先级
 */
function calculatePriorities(issues, crasInsight) {
  const priorities = {
    immediate: [],
    high: [],
    medium: [],
    low: []
  };
  
  for (const issue of issues) {
    // CRAS洞察提升优先级
    if (crasInsight && issue.source === 'cras') {
      priorities.immediate.push(issue.id);
      continue;
    }
    
    // 按严重程度分类
    switch (issue.priority) {
      case 'critical':
        priorities.immediate.push(issue.id);
        break;
      case 'high':
        priorities.high.push(issue.id);
        break;
      case 'medium':
        priorities.medium.push(issue.id);
        break;
      case 'low':
        priorities.low.push(issue.id);
        break;
    }
  }
  
  return priorities;
}

/**
 * 生成建议
 */
function generateRecommendations(issues, priorities, crasInsight) {
  const recommendations = [];
  
  // 立即修复建议
  if (priorities.immediate.length > 0) {
    recommendations.push({
      type: 'immediate_action',
      priority: 'critical',
      description: `立即修复 ${priorities.immediate.length} 个关键问题`,
      actions: priorities.immediate.map(id => {
        const issue = issues.find(i => i.id === id);
        return issue?.suggestedAction;
      }).filter(Boolean)
    });
  }
  
  // 高优先级建议
  if (priorities.high.length > 0) {
    recommendations.push({
      type: 'high_priority',
      priority: 'high',
      description: `优先处理 ${priorities.high.length} 个高优先级问题`,
      actions: ['run_optimizer', 'enhance_documentation']
    });
  }
  
  // CRAS驱动建议
  if (crasInsight) {
    recommendations.push({
      type: 'cras_driven',
      priority: 'high',
      description: 'CRAS洞察建议调整发现策略',
      actions: ['apply_cras_insights', 'adjust_discovery_strategy']
    });
  }
  
  // 协同建议
  const synergies = issues.filter(i => i.category === 'synergy');
  if (synergies.length > 0) {
    recommendations.push({
      type: 'synergy_opportunity',
      priority: 'medium',
      description: `发现 ${synergies.length} 个协同机会`,
      actions: ['explore_integrations']
    });
  }
  
  return recommendations;
}

/**
 * 保存发现报告
 */
async function saveReport(report) {
  const reportsDir = path.join(REPORTS_DIR, 'seef-discoveries');
  
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${report.skillId}-${timestamp}.json`;
  const filepath = path.join(reportsDir, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  
  console.log(`[SEEF Discoverer] 报告已保存: ${filepath}`);
}

// CLI支持
if (require.main === module) {
  const args = process.argv.slice(2);
  const inputJson = args[0];
  
  if (!inputJson) {
    console.error('Usage: node index.cjs <input-json>');
    process.exit(1);
  }
  
  const input = JSON.parse(inputJson);
  
  discover(input)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Discovery failed:', error);
      process.exit(1);
    });
}

module.exports = {
  discover
};
