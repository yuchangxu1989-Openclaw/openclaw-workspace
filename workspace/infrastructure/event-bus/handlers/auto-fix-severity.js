const fs = require('fs');
const path = require('path');
const { exists, readText, readJson, walk, hasAny } = require('./_p0_utils');

/**
 * Auto-Fix Severity Handler
 * 
 * 规则意图：严重度高且允许自动修复时执行自动修复
 * 感知：isc.rule.matched / isc.category.matched，条件 severity==HIGH && auto_fix_enabled
 * 执行：根据问题类型执行修复（JSON格式化、缺失字段补全、命名修正）
 */
module.exports = async function(event, rule, context) {
  const logger = context.logger || console;
  const bus = context.bus;
  const workspace = context.workspace || process.cwd();

  logger.info(`[auto-fix-severity] Triggered by ${event.type}`, { eventId: event.id });

  try {
    const payload = event.payload || {};
    const severity = (payload.severity || '').toUpperCase();
    const autoFixEnabled = payload.auto_fix_enabled !== false && payload.autoFixEnabled !== false;

    // === 判断：是否满足自动修复条件 ===
    if (severity !== 'HIGH' && severity !== 'CRITICAL') {
      logger.info(`[auto-fix-severity] Skipping: severity=${severity} (not HIGH/CRITICAL)`);
      return {
        status: 'SKIPPED',
        reason: `Severity ${severity} does not meet threshold`,
        timestamp: new Date().toISOString()
      };
    }

    if (!autoFixEnabled) {
      logger.info('[auto-fix-severity] Skipping: auto_fix not enabled');
      return {
        status: 'SKIPPED',
        reason: 'Auto-fix is disabled for this rule',
        timestamp: new Date().toISOString()
      };
    }

    // === 执行：根据问题类型修复 ===
    const issueType = payload.issue_type || payload.issueType || payload.type || 'unknown';
    const targetFile = payload.file_path || payload.filePath || payload.target || '';
    const fixes = [];
    let fixApplied = false;

    if (targetFile) {
      const fullPath = path.resolve(workspace, targetFile);

      if (await exists(fullPath)) {
        const content = await readText(fullPath);
        let fixedContent = content;

        switch (issueType) {
          case 'json_format':
          case 'json_formatting':
          case 'malformed_json': {
            // JSON格式化修复
            try {
              const parsed = JSON.parse(content);
              fixedContent = JSON.stringify(parsed, null, 2) + '\n';
              if (fixedContent !== content) {
                fixes.push({ type: 'json_format', file: targetFile, description: 'Reformatted JSON' });
                fixApplied = true;
              }
            } catch (e) {
              // 尝试宽松修复：移除尾逗号、修复常见问题
              fixedContent = content
                .replace(/,\s*([}\]])/g, '$1')  // 移除尾逗号
                .replace(/'/g, '"');               // 单引号→双引号
              try {
                const parsed = JSON.parse(fixedContent);
                fixedContent = JSON.stringify(parsed, null, 2) + '\n';
                fixes.push({ type: 'json_repair', file: targetFile, description: 'Repaired and reformatted JSON' });
                fixApplied = true;
              } catch (e2) {
                fixes.push({ type: 'json_repair_failed', file: targetFile, description: `Cannot auto-repair: ${e2.message}` });
              }
            }
            break;
          }

          case 'missing_field':
          case 'missing_fields': {
            // 缺失字段补全
            const requiredFields = payload.required_fields || payload.requiredFields || [];
            if (targetFile.endsWith('.json')) {
              try {
                const obj = JSON.parse(content);
                for (const field of requiredFields) {
                  if (!(field in obj)) {
                    obj[field] = getDefaultValue(field);
                    fixes.push({ type: 'field_added', file: targetFile, field, description: `Added missing field: ${field}` });
                    fixApplied = true;
                  }
                }
                fixedContent = JSON.stringify(obj, null, 2) + '\n';
              } catch (e) {
                fixes.push({ type: 'parse_error', file: targetFile, description: `Cannot parse to add fields: ${e.message}` });
              }
            }
            break;
          }

          case 'naming':
          case 'naming_convention': {
            // 命名修正（文件名或内容中的命名）
            const namingFixes = payload.naming_fixes || payload.namingFixes || [];
            for (const fix of namingFixes) {
              if (fix.from && fix.to) {
                const regex = new RegExp(escapeRegex(fix.from), 'g');
                const newContent = fixedContent.replace(regex, fix.to);
                if (newContent !== fixedContent) {
                  fixedContent = newContent;
                  fixes.push({ type: 'naming_fix', file: targetFile, from: fix.from, to: fix.to });
                  fixApplied = true;
                }
              }
            }
            break;
          }

          default: {
            logger.warn(`[auto-fix-severity] Unknown issue type: ${issueType}`);
            fixes.push({ type: 'unknown_issue', issueType, description: 'No auto-fix strategy for this issue type' });
          }
        }

        // 写回修复后的内容
        if (fixApplied && fixedContent !== content) {
          fs.writeFileSync(fullPath, fixedContent, 'utf-8');
          logger.info(`[auto-fix-severity] Fixed file: ${targetFile}`, { fixCount: fixes.length });
        }
      } else {
        logger.warn(`[auto-fix-severity] Target file not found: ${targetFile}`);
        fixes.push({ type: 'file_not_found', file: targetFile });
      }
    }

    // === 写修复日志 ===
    const logDir = path.join(workspace, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      eventType: event.type,
      eventId: event.id,
      severity,
      issueType,
      targetFile,
      fixApplied,
      fixes,
      trigger: event.type
    };

    const logPath = path.join(logDir, 'auto-fix-severity.jsonl');
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n', 'utf-8');
    logger.info(`[auto-fix-severity] Log written to: ${logPath}`);

    // === 闭环：emit完成事件 ===
    if (bus) {
      await bus.emit('remediation.completed', {
        source: 'auto-fix-severity',
        fixApplied,
        fixes,
        severity,
        issueType,
        targetFile,
        trigger: event.type,
        timestamp: new Date().toISOString()
      });
    }

    return {
      status: fixApplied ? 'FIXED' : 'NO_FIX_APPLIED',
      severity,
      issueType,
      targetFile,
      fixes,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    logger.error('[auto-fix-severity] Unexpected error', err);
    throw err;
  }
};

function getDefaultValue(field) {
  const defaults = {
    'name': '',
    'description': '',
    'version': '1.0.0',
    'type': 'unknown',
    'status': 'draft',
    'tags': [],
    'dependencies': [],
    'created_at': new Date().toISOString(),
    'updated_at': new Date().toISOString(),
    'author': 'system',
    'enabled': true
  };
  return defaults[field] !== undefined ? defaults[field] : null;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
