const fs = require('fs');
const path = require('path');
const { exists, readText, readJson, walk } = require('./_p0_utils');

/**
 * ISC规则创建闸门
 * 感知：isc.rule.matched / isc.category.matched
 * 执行：创建时强制验证格式/命名/字段完整性，不符合→自动修复，无法修复→reject+throw
 */
module.exports = async function(event, rule, context) {
  const workspace = (context && context.workspace) || '/root/.openclaw/workspace';
  const logger = context.logger;
  const bus = context.bus;

  logger.info('[isc-creation-gate] 启动规则创建闸门检查');

  try {
    // 感知：获取待验证的规则文件路径
    const rulePath = event.rulePath || event.payload?.rulePath || event.path;
    if (!rulePath) {
      // 如果没有指定路径，扫描rules/目录所有规则
      const rulesDir = path.join(workspace, 'infrastructure', 'isc', 'rules');
      if (!exists(rulesDir)) {
        logger.warn('[isc-creation-gate] 规则目录不存在:', rulesDir);
        return { status: 'skipped', reason: 'rules_dir_not_found' };
      }
      const ruleFiles = walk(rulesDir, ['.json']);
      const results = { checked: 0, passed: 0, fixed: 0, rejected: 0, details: [] };

      for (const file of ruleFiles) {
        const result = validateAndFixRule(file, logger);
        results.checked++;
        results.details.push(result);
        if (result.status === 'passed') results.passed++;
        else if (result.status === 'fixed') results.fixed++;
        else if (result.status === 'rejected') results.rejected++;
      }

      logger.info('[isc-creation-gate] 批量检查完成', results);
      bus.emit('isc.creation.gate.completed', { results });

      if (results.rejected > 0) {
        const msg = `❌ ISC创建闸门：${results.rejected} 条规则无法修复`;
        if (context.notify) context.notify(msg);
        throw new Error(msg);
      }

      return { status: 'completed', ...results };
    }

    // 单文件验证
    const result = validateAndFixRule(rulePath, logger);
    logger.info('[isc-creation-gate] 单文件检查完成', result);
    bus.emit('isc.creation.gate.completed', { rulePath, result });

    if (result.status === 'rejected') {
      const msg = `❌ ISC创建闸门拒绝：${rulePath} - ${result.reason}`;
      if (context.notify) context.notify(msg);
      throw new Error(msg);
    }

    return { status: 'completed', result };
  } catch (err) {
    logger.error('[isc-creation-gate] 执行失败:', err.message);
    bus.emit('isc.creation.gate.failed', { error: err.message });
    throw err;
  }
};

function validateAndFixRule(filePath, logger) {
  const fileName = path.basename(filePath);
  const detail = { file: filePath, issues: [], fixes: [] };

  // 检查文件是否存在且可读
  if (!exists(filePath)) {
    return { ...detail, status: 'rejected', reason: 'file_not_found' };
  }

  let ruleData;
  try {
    const content = readText(filePath);
    ruleData = JSON.parse(content);
  } catch (e) {
    return { ...detail, status: 'rejected', reason: 'invalid_json: ' + e.message };
  }

  let modified = false;

  // 1. 验证命名格式：rule.{domain}-{name}-{version}.json
  const namingPattern = /^rule\.[a-z]+-[a-z0-9-]+-\d{3}\.json$/;
  if (!namingPattern.test(fileName)) {
    detail.issues.push(`命名不符合规范: ${fileName}, 期望 rule.{domain}-{name}-{version}.json`);
    // 命名无法自动修复（涉及重命名文件），标记但不reject
  }

  // 2. 必需字段检查
  const requiredFields = ['id', 'name', 'domain', 'type', 'scope', 'description', 'governance'];
  for (const field of requiredFields) {
    if (!ruleData[field]) {
      detail.issues.push(`缺少必需字段: ${field}`);
      // 自动补全
      if (field === 'id') {
        ruleData.id = fileName.replace('.json', '');
        detail.fixes.push(`自动补全 id: ${ruleData.id}`);
      } else if (field === 'name') {
        ruleData.name = fileName.replace('rule.', '').replace('.json', '');
        detail.fixes.push(`自动补全 name: ${ruleData.name}`);
      } else if (field === 'domain') {
        ruleData.domain = 'general';
        detail.fixes.push('自动补全 domain: general');
      } else if (field === 'type') {
        ruleData.type = 'enforcement';
        detail.fixes.push('自动补全 type: enforcement');
      } else if (field === 'scope') {
        ruleData.scope = 'workspace';
        detail.fixes.push('自动补全 scope: workspace');
      } else if (field === 'description') {
        ruleData.description = `Rule: ${ruleData.name || fileName}`;
        detail.fixes.push('自动补全 description');
      } else if (field === 'governance') {
        ruleData.governance = { auto_execute: false, councilRequired: false };
        detail.fixes.push('自动补全 governance');
      }
      modified = true;
    }
  }

  // 3. id与文件名一致性
  const expectedId = fileName.replace('.json', '');
  if (ruleData.id && ruleData.id !== expectedId) {
    detail.issues.push(`id(${ruleData.id})与文件名(${expectedId})不一致`);
    ruleData.id = expectedId;
    detail.fixes.push(`修正 id 为: ${expectedId}`);
    modified = true;
  }

  // 4. governance必须包含auto_execute和councilRequired
  if (ruleData.governance) {
    if (ruleData.governance.auto_execute === undefined) {
      ruleData.governance.auto_execute = false;
      detail.issues.push('governance缺少auto_execute');
      detail.fixes.push('自动补全 governance.auto_execute: false');
      modified = true;
    }
    if (ruleData.governance.councilRequired === undefined) {
      ruleData.governance.councilRequired = false;
      detail.issues.push('governance缺少councilRequired');
      detail.fixes.push('自动补全 governance.councilRequired: false');
      modified = true;
    }
  }

  // 写回修复
  if (modified) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(ruleData, null, 2), 'utf-8');
      logger.info(`[isc-creation-gate] 已修复: ${filePath}`, detail.fixes);
      return { ...detail, status: 'fixed' };
    } catch (e) {
      return { ...detail, status: 'rejected', reason: 'write_failed: ' + e.message };
    }
  }

  return { ...detail, status: 'passed' };
}
