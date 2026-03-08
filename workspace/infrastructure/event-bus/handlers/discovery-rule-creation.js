const fs = require('fs');
const path = require('path');
const { exists, readText, readJson, walk, hasAny } = require('./p0-utils');

/**
 * Discovery Rule Creation Handler (三件套生成器)
 * 
 * 规则意图：发现问题时必须同时创建 规则+事件绑定+DTO执行链（三件套）
 * 感知：system.issue.discovered / architecture.gap.detected / aeo.methodology.upgraded
 * 执行：自动生成规则JSON + DTO任务定义 + 事件绑定，验证完整性
 */
module.exports = async function(event, rule, context) {
  const logger = context.logger || console;
  const bus = context.bus;
  const workspace = context.workspace || process.cwd();

  logger.info(`[discovery-rule-creation] Triggered by ${event.type}`, { eventId: event.id });

  try {
    const payload = event.payload || {};

    // === 感知：提取问题信息 ===
    const issueId = payload.issue_id || payload.id || `issue-${Date.now()}`;
    const issueDesc = payload.description || payload.issue || payload.gap || '';
    const severity = payload.severity || 'MEDIUM';
    const category = payload.category || 'general';
    const source = payload.source || event.type;
    const affectedFiles = payload.affected_files || payload.files || [];

    if (!issueDesc) {
      logger.warn('[discovery-rule-creation] No issue description provided');
      return {
        status: 'SKIPPED',
        reason: 'No issue description in payload',
        timestamp: new Date().toISOString()
      };
    }

    logger.info(`[discovery-rule-creation] Processing issue: ${issueId}`, { severity, category });

    // 生成规则名称
    const ruleName = generateRuleName(issueDesc, category);

    // === 执行1：创建规则JSON ===
    const rulesDir = path.join(workspace, 'rules');
    if (!fs.existsSync(rulesDir)) {
      fs.mkdirSync(rulesDir, { recursive: true });
    }

    const ruleDefinition = {
      id: ruleName,
      name: ruleName,
      description: issueDesc,
      category: category,
      severity: severity,
      source: source,
      created_at: new Date().toISOString(),
      auto_generated: true,
      trigger_events: determineTriggerEvents(category, event.type),
      conditions: {
        match_type: 'any',
        patterns: extractPatterns(issueDesc, affectedFiles)
      },
      actions: {
        handler: `${ruleName}.handler`,
        auto_fix_enabled: severity === 'HIGH' || severity === 'CRITICAL',
        notify: true
      },
      metadata: {
        issue_id: issueId,
        generator: 'discovery-rule-creation',
        generator_event: event.type
      }
    };

    const rulePath = path.join(rulesDir, `${ruleName}.json`);
    fs.writeFileSync(rulePath, JSON.stringify(ruleDefinition, null, 2), 'utf-8');
    logger.info(`[discovery-rule-creation] Rule created: ${rulePath}`);

    // === 执行2：创建DTO执行链定义 ===
    const dtoDir = path.join(workspace, 'dto');
    if (!fs.existsSync(dtoDir)) {
      fs.mkdirSync(dtoDir, { recursive: true });
    }

    const dtoDefinition = {
      id: `dto-${ruleName}`,
      name: `本地任务编排 Execution Chain for ${ruleName}`,
      description: `Execution chain for discovered issue: ${issueDesc}`,
      created_at: new Date().toISOString(),
      auto_generated: true,
      rule_ref: ruleName,
      steps: [
        {
          order: 1,
          name: 'detect',
          type: 'scan',
          description: `Detect: ${issueDesc}`,
          input: { patterns: extractPatterns(issueDesc, affectedFiles) },
          output: 'detection_result'
        },
        {
          order: 2,
          name: 'transform',
          type: 'fix',
          description: 'Apply remediation based on detection',
          input: { source: 'detection_result' },
          output: 'fix_result',
          condition: 'detection_result.found === true'
        },
        {
          order: 3,
          name: 'output',
          type: 'verify',
          description: 'Verify fix was applied correctly',
          input: { source: 'fix_result' },
          output: 'verification_result'
        }
      ],
      metadata: {
        issue_id: issueId,
        severity: severity,
        category: category
      }
    };

    const dtoPath = path.join(dtoDir, `${ruleName}.dto.json`);
    fs.writeFileSync(dtoPath, JSON.stringify(dtoDefinition, null, 2), 'utf-8');
    logger.info(`[discovery-rule-creation] 本地任务编排 created: ${dtoPath}`);

    // === 执行3：创建事件绑定 ===
    const bindingsDir = path.join(workspace, 'infrastructure/event-bus/bindings');
    if (!fs.existsSync(bindingsDir)) {
      fs.mkdirSync(bindingsDir, { recursive: true });
    }

    const bindingDefinition = {
      id: `binding-${ruleName}`,
      rule_id: ruleName,
      dto_id: `dto-${ruleName}`,
      created_at: new Date().toISOString(),
      auto_generated: true,
      events: determineTriggerEvents(category, event.type),
      handler: ruleName,
      enabled: true,
      metadata: {
        issue_id: issueId,
        generator: 'discovery-rule-creation'
      }
    };

    const bindingPath = path.join(bindingsDir, `${ruleName}.binding.json`);
    fs.writeFileSync(bindingPath, JSON.stringify(bindingDefinition, null, 2), 'utf-8');
    logger.info(`[discovery-rule-creation] Binding created: ${bindingPath}`);

    // === 验证：三件套完整性检查 ===
    const tripleCheck = {
      rule: await exists(rulePath),
      dto: await exists(dtoPath),
      binding: await exists(bindingPath)
    };

    const allComplete = tripleCheck.rule && tripleCheck.dto && tripleCheck.binding;
    logger.info(`[discovery-rule-creation] Triple check: ${JSON.stringify(tripleCheck)}, complete: ${allComplete}`);

    // === 闭环：emit结果 ===
    if (bus) {
      await bus.emit('isc.rule.auto_created', {
        source: 'discovery-rule-creation',
        ruleName,
        issueId,
        tripleCheck,
        complete: allComplete,
        files: {
          rule: path.relative(workspace, rulePath),
          dto: path.relative(workspace, dtoPath),
          binding: path.relative(workspace, bindingPath)
        },
        trigger: event.type,
        timestamp: new Date().toISOString()
      });
    }

    return {
      status: allComplete ? 'CREATED' : 'PARTIAL',
      ruleName,
      issueId,
      tripleCheck,
      files: {
        rule: path.relative(workspace, rulePath),
        dto: path.relative(workspace, dtoPath),
        binding: path.relative(workspace, bindingPath)
      },
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    logger.error('[discovery-rule-creation] Unexpected error', err);
    throw err;
  }
};

function generateRuleName(description, category) {
  // 从描述生成规则名
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 4);

  const slug = words.length > 0
    ? words.join('-')
    : `${category}-${Date.now()}`;

  return `rule-${category}-${slug}`.substring(0, 64);
}

function determineTriggerEvents(category, sourceEvent) {
  const eventMap = {
    'architecture': ['architecture.gap.detected', 'document.architecture.modified'],
    'quality': ['isc.rule.matched', 'isc.category.matched'],
    'security': ['system.security.alert', 'system.vulnerability.detected'],
    'performance': ['system.performance.degraded', 'system.threshold.exceeded'],
    'general': ['system.issue.discovered', 'isc.rule.matched']
  };

  const events = eventMap[category] || eventMap['general'];
  if (!events.includes(sourceEvent)) {
    events.push(sourceEvent);
  }
  return events;
}

function extractPatterns(description, files) {
  const patterns = [];

  // 从描述中提取关键词
  const keywords = description
    .split(/[\s,，。.!！?？]+/)
    .filter(w => w.length > 2)
    .slice(0, 5);

  if (keywords.length > 0) {
    patterns.push({ type: 'keyword', values: keywords });
  }

  // 从文件路径中提取模式
  if (files.length > 0) {
    patterns.push({ type: 'file_path', values: files });
  }

  return patterns;
}
