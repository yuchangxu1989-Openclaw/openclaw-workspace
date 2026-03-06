const fs = require('fs');
const path = require('path');
const { exists, readText, readJson, walk, hasAny } = require('./_p0_utils');

/**
 * ISC Change Alignment Handler
 * 
 * 规则意图：ISC规则变更自动触发对齐检查
 * 感知：isc.rule.matched / isc.category.matched（文件变更触发）
 * 执行：执行对齐检查器（如存在），否则自行扫描rules和DTO做对齐
 */
module.exports = async function(event, rule, context) {
  const logger = context.logger || console;
  const bus = context.bus;
  const workspace = context.workspace || process.cwd();

  logger.info(`[isc-change-alignment] Triggered by ${event.type}`, { eventId: event.id });

  try {
    const payload = event.payload || {};

    // === 感知：尝试使用专用对齐检查器 ===
    const checkerPath = path.join(workspace, 'skills/isc-core/bin/isc-dto-alignment-checker.js');
    let alignmentResult = null;

    if (await exists(checkerPath)) {
      logger.info('[isc-change-alignment] Found alignment checker, executing...');
      try {
        const checker = require(checkerPath);
        if (typeof checker === 'function') {
          alignmentResult = await checker({
            workspace,
            event,
            logger
          });
          logger.info('[isc-change-alignment] Checker executed successfully');
        }
      } catch (checkerErr) {
        logger.warn(`[isc-change-alignment] Checker execution failed: ${checkerErr.message}`);
        logger.info('[isc-change-alignment] Falling back to built-in alignment check');
      }
    }

    // === 执行：内置对齐检查（如果checker不存在或失败） ===
    if (!alignmentResult) {
      alignmentResult = await performBuiltInAlignmentCheck(workspace, logger);
    }

    // === 闭环：emit完成事件 ===
    if (bus) {
      await bus.emit('isc.dto.alignment.completed', {
        source: 'isc-change-alignment',
        ...alignmentResult,
        trigger: event.type,
        timestamp: new Date().toISOString()
      });
    }

    return {
      status: 'COMPLETED',
      ...alignmentResult,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    logger.error('[isc-change-alignment] Unexpected error', err);
    throw err;
  }
};

/**
 * 内置对齐检查：扫描rules目录和DTO定义，检查匹配度
 */
async function performBuiltInAlignmentCheck(workspace, logger) {
  const rulesDir = path.join(workspace, 'rules');
  const dtoDir = path.join(workspace, 'dto');
  const bindingsDir = path.join(workspace, 'infrastructure/event-bus/bindings');
  const handlersDir = path.join(workspace, 'infrastructure/event-bus/handlers');

  // === 收集所有规则 ===
  const rules = [];
  if (await exists(rulesDir)) {
    const ruleFiles = await walk(rulesDir);
    for (const f of ruleFiles) {
      if (f.endsWith('.json')) {
        try {
          const ruleData = await readJson(f);
          rules.push({
            id: ruleData.id || ruleData.name || path.basename(f, '.json'),
            file: path.relative(workspace, f),
            hasHandler: !!ruleData.actions?.handler,
            handlerRef: ruleData.actions?.handler || null,
            triggerEvents: ruleData.trigger_events || []
          });
        } catch (e) {
          logger.warn(`[isc-change-alignment] Failed to parse rule: ${f}`);
        }
      }
    }
  }

  logger.info(`[isc-change-alignment] Found ${rules.length} rule(s)`);

  // === 收集所有DTO ===
  const dtos = [];
  if (await exists(dtoDir)) {
    const dtoFiles = await walk(dtoDir);
    for (const f of dtoFiles) {
      if (f.endsWith('.json')) {
        try {
          const dtoData = await readJson(f);
          dtos.push({
            id: dtoData.id || path.basename(f, '.json'),
            file: path.relative(workspace, f),
            ruleRef: dtoData.rule_ref || null,
            steps: (dtoData.steps || []).length
          });
        } catch (e) {
          logger.warn(`[isc-change-alignment] Failed to parse DTO: ${f}`);
        }
      }
    }
  }

  logger.info(`[isc-change-alignment] Found ${dtos.length} DTO(s)`);

  // === 收集所有bindings ===
  const bindings = [];
  if (await exists(bindingsDir)) {
    const bindingFiles = await walk(bindingsDir);
    for (const f of bindingFiles) {
      if (f.endsWith('.json')) {
        try {
          const bindingData = await readJson(f);
          bindings.push({
            id: bindingData.id || path.basename(f, '.json'),
            file: path.relative(workspace, f),
            ruleId: bindingData.rule_id || null,
            dtoId: bindingData.dto_id || null,
            handler: bindingData.handler || null
          });
        } catch (e) {
          logger.warn(`[isc-change-alignment] Failed to parse binding: ${f}`);
        }
      }
    }
  }

  // === 收集所有handlers ===
  const handlers = [];
  if (await exists(handlersDir)) {
    const handlerFiles = await walk(handlersDir);
    for (const f of handlerFiles) {
      if (f.endsWith('.js') && !f.includes('_p0_utils') && !f.includes('node_modules')) {
        handlers.push(path.basename(f, '.js'));
      }
    }
  }

  // === 对齐检查 ===
  const alignment = {
    rulesWithDTO: 0,
    rulesWithoutDTO: [],
    rulesWithBinding: 0,
    rulesWithoutBinding: [],
    rulesWithHandler: 0,
    rulesWithoutHandler: [],
    orphanDTOs: [],
    orphanBindings: [],
    totalRules: rules.length,
    totalDTOs: dtos.length,
    totalBindings: bindings.length,
    totalHandlers: handlers.length
  };

  for (const r of rules) {
    // 检查是否有对应DTO
    const hasDTO = dtos.some(d => d.ruleRef === r.id || d.id.includes(r.id));
    if (hasDTO) {
      alignment.rulesWithDTO++;
    } else {
      alignment.rulesWithoutDTO.push(r.id);
    }

    // 检查是否有对应binding
    const hasBinding = bindings.some(b => b.ruleId === r.id || b.handler === r.id);
    if (hasBinding) {
      alignment.rulesWithBinding++;
    } else {
      alignment.rulesWithoutBinding.push(r.id);
    }

    // 检查是否有对应handler
    const handlerName = (r.handlerRef || r.id).replace('.handler', '');
    const hasHandler = handlers.includes(handlerName);
    if (hasHandler) {
      alignment.rulesWithHandler++;
    } else {
      alignment.rulesWithoutHandler.push(r.id);
    }
  }

  // 检查孤立DTO
  for (const d of dtos) {
    if (d.ruleRef && !rules.some(r => r.id === d.ruleRef)) {
      alignment.orphanDTOs.push(d.id);
    }
  }

  // 检查孤立binding
  for (const b of bindings) {
    if (b.ruleId && !rules.some(r => r.id === b.ruleId)) {
      alignment.orphanBindings.push(b.id);
    }
  }

  // === 计算对齐率 ===
  const totalChecks = rules.length * 3; // 每个规则检查3项：DTO、binding、handler
  const passedChecks = alignment.rulesWithDTO + alignment.rulesWithBinding + alignment.rulesWithHandler;
  const alignmentRate = totalChecks > 0
    ? Math.round((passedChecks / totalChecks) * 100)
    : 100; // 没有规则时默认100%

  logger.info(`[isc-change-alignment] Alignment rate: ${alignmentRate}%`, {
    totalRules: rules.length,
    withDTO: alignment.rulesWithDTO,
    withBinding: alignment.rulesWithBinding,
    withHandler: alignment.rulesWithHandler
  });

  return {
    alignmentRate: `${alignmentRate}%`,
    alignmentRateNumeric: alignmentRate,
    alignment,
    summary: {
      rules: rules.length,
      dtos: dtos.length,
      bindings: bindings.length,
      handlers: handlers.length
    },
    issues: [
      ...alignment.rulesWithoutDTO.map(id => `Rule "${id}" has no DTO`),
      ...alignment.rulesWithoutBinding.map(id => `Rule "${id}" has no binding`),
      ...alignment.rulesWithoutHandler.map(id => `Rule "${id}" has no handler`),
      ...alignment.orphanDTOs.map(id => `Orphan DTO "${id}" references missing rule`),
      ...alignment.orphanBindings.map(id => `Orphan binding "${id}" references missing rule`)
    ]
  };
}
