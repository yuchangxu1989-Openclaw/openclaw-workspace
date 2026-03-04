/**
 * CRAS 规则建议器 - 从洞察中自动提取 ISC 规则建议
 * 
 * 工作流：
 * 1. 分析 CRAS 洞察和报告
 * 2. 识别模式和改进机会
 * 3. 生成 ISC 规则建议（草稿）
 * 4. 写入建议队列等待人工审核
 */
const fs = require('fs');
const path = require('path');
const bus = require(path.join(__dirname, '..', '..', 'infrastructure', 'event-bus', 'bus.js'));

const INSIGHTS_DIR = path.join(__dirname, 'insights');
const SUGGESTIONS_DIR = path.join(__dirname, 'rule-suggestions');
const ISC_RULES_DIR = path.join(__dirname, '..', 'isc-core', 'rules');

if (!fs.existsSync(SUGGESTIONS_DIR)) fs.mkdirSync(SUGGESTIONS_DIR, { recursive: true });

/**
 * 分析洞察，提取规则建议
 */
function analyzeInsights() {
  if (!fs.existsSync(INSIGHTS_DIR)) return { suggestions: 0 };
  
  const insightFiles = fs.readdirSync(INSIGHTS_DIR).filter(f => f.endsWith('.json'));
  const suggestions = [];
  
  for (const file of insightFiles) {
    const insight = JSON.parse(fs.readFileSync(path.join(INSIGHTS_DIR, file), 'utf8'));
    const suggestion = extractRuleSuggestion(insight);
    if (suggestion) suggestions.push(suggestion);
  }
  
  // 去重（同一技能+同一类型只保留一个）
  const unique = dedup(suggestions);
  
  // 写入建议
  for (const s of unique) {
    const sugFile = path.join(SUGGESTIONS_DIR, `${s.id}.json`);
    if (!fs.existsSync(sugFile)) {
      fs.writeFileSync(sugFile, JSON.stringify(s, null, 2));
      console.log(`[RuleSuggester] 新建议: ${s.id} - ${s.title}`);
      
      // 发布事件
      bus.emit('cras.rule.suggested', {
        suggestion_id: s.id,
        title: s.title,
        target_rule: s.target_rule,
        action: s.action
      }, 'cras');
    }
  }
  
  return { analyzed: insightFiles.length, suggestions: unique.length };
}

function extractRuleSuggestion(insight) {
  if (!insight || insight.severity === 'info') return null;
  
  const id = `sug_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  
  if (insight.type === 'assessment_analysis' && insight.severity === 'warning') {
    // 评测失败 → 建议加强该维度的规则
    const existingRules = findRelatedRules(insight.skill);
    return {
      id,
      title: `加强 ${insight.skill} 的质量规则`,
      description: insight.finding,
      action: existingRules.length > 0 ? 'update' : 'create',
      target_rule: existingRules[0] || null,
      suggested_rule: {
        type: 'quality_standard',
        target: insight.skill,
        condition: `skill.quality_score >= 0.8`,
        severity: 'warning',
        auto_generated: true,
        source_insight: insight.id
      },
      priority: 'medium',
      status: 'pending_review',
      created_at: new Date().toISOString()
    };
  }
  
  if (insight.type === 'error_pattern') {
    return {
      id,
      title: `错误防护规则: ${insight.finding.substring(0, 50)}`,
      description: insight.finding,
      action: 'create',
      target_rule: null,
      suggested_rule: {
        type: 'system_level',
        condition: 'error_rate < 0.01',
        severity: 'error',
        auto_generated: true,
        source_insight: insight.id
      },
      priority: 'high',
      status: 'pending_review',
      created_at: new Date().toISOString()
    };
  }
  
  return null;
}

function findRelatedRules(skillName) {
  if (!fs.existsSync(ISC_RULES_DIR)) return [];
  const rules = fs.readdirSync(ISC_RULES_DIR).filter(f => f.endsWith('.json'));
  const related = [];
  
  for (const ruleFile of rules) {
    try {
      const rule = JSON.parse(fs.readFileSync(path.join(ISC_RULES_DIR, ruleFile), 'utf8'));
      if (JSON.stringify(rule).includes(skillName)) {
        related.push(ruleFile.replace('.json', ''));
      }
    } catch(e) {}
  }
  
  return related;
}

function dedup(suggestions) {
  const seen = new Set();
  return suggestions.filter(s => {
    const key = `${s.suggested_rule?.target || ''}_${s.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 列出待审核的建议
 */
function listPending() {
  if (!fs.existsSync(SUGGESTIONS_DIR)) return [];
  return fs.readdirSync(SUGGESTIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(SUGGESTIONS_DIR, f), 'utf8')))
    .filter(s => s.status === 'pending_review');
}

/**
 * 审批建议并应用到 ISC
 */
function approve(suggestionId) {
  const filePath = path.join(SUGGESTIONS_DIR, `${suggestionId}.json`);
  if (!fs.existsSync(filePath)) return { error: 'not found' };
  
  const suggestion = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  suggestion.status = 'approved';
  suggestion.approved_at = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(suggestion, null, 2));
  
  console.log(`[RuleSuggester] 已批准: ${suggestionId}`);
  
  bus.emit('cras.rule.approved', {
    suggestion_id: suggestionId,
    title: suggestion.title,
    rule: suggestion.suggested_rule
  }, 'cras');
  
  return { approved: suggestionId };
}

if (require.main === module) {
  const result = analyzeInsights();
  console.log(`[RuleSuggester] 完成: ${JSON.stringify(result)}`);
  
  const pending = listPending();
  console.log(`待审核建议: ${pending.length} 条`);
  pending.forEach(p => console.log(`  ${p.id}: ${p.title} (${p.priority})`));
}

module.exports = { analyzeInsights, listPending, approve };
