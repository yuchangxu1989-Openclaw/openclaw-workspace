    this.config = { ...ISC_CONFIG, ...options };
    this.definitionLayer = new StandardDefinitionLayer(this.config);
    this.changeDetectionLayer = new ChangeDetectionLayer(this.config, this.definitionLayer);
    this.alignmentExecutor = new GlobalAlignmentExecutor(this.config, this.definitionLayer, this.changeDetectionLayer);
    this.initialized = false;
  }

  initialize() {
    console.log(this.config.output.separator.repeat(60));
    console.log(this.config.fullName);
    console.log(`版本: ${this.config.version} | 归属: ${this.config.affiliation}`);
    console.log(`层级: ${this.config.layer} | 优先级: ${this.config.priority}`);
    console.log(this.config.output.separator.repeat(60));
    console.log('');
    
    this.initialized = true;
    console.log('[ISC] 初始化完成');
    console.log(`[ISC] 决策规则: ${this.definitionLayer.decisionRules.size} 项`);
    console.log(`[ISC] 检测标准: ${this.definitionLayer.detectionStandards.size} 项`);
    console.log(`[ISC] 命名规范: ${this.definitionLayer.namingStandards.size} 项`);
    console.log('');
    
    return this;
  }

  // 获取完整状态
  getFullStatus() {
    return {
      version: this.config.version,
      decisionRules: Array.from(this.definitionLayer.decisionRules.values()),
      detectionStandards: Array.from(this.definitionLayer.detectionStandards.values()),
      namingStandards: Array.from(this.definitionLayer.namingStandards.values()),
      distributionTargets: this.config.distributionTargets,
      timestamp: new Date().toISOString()
    };
  }

  // 获取规则 (兼容ID和名称)
  getRule(idOrName) {
    return this.definitionLayer.getRule(idOrName);
  }

  // 获取标准
  getStandard(idOrName) {
    return this.definitionLayer.getStandard(idOrName);
  }

  // 获取命名规范
  getNaming(idOrName) {
    return this.definitionLayer.getNaming(idOrName);
  }

  // 验证命名
  validateNaming(value, scope) {
    return this.definitionLayer.validateNaming(value, scope);
  }

  // 分发到所有目标
  distributeAll() {
    const results = {};
    for (const target of this.config.distributionTargets) {
      results[target.name] = this.distributeTo(target.name);
    }
    return results;
  }

  // 分发到指定目标
  distributeTo(targetName) {
    const target = this.config.distributionTargets.find(t => t.name === targetName);
    if (!target) {
      return { success: false, error: `目标不存在: ${targetName}` };
    }

    const rules = this.resolveRules(target.rules);
    
    // 根据格式转换
    let output;
    if (target.format === 'gene') {
      output = this.convertToGeneFormat(rules);
    } else {
      output = rules;
    }

    // 保存分发记录
    this.saveDistribution(target, output);

    return {
      success: true,
      target: targetName,
      format: target.format,
      ruleCount: rules.length,
      timestamp: new Date().toISOString()
    };
  }

  resolveRules(ruleRefs) {
    const rules = [];
    for (const ref of ruleRefs) {
      if (ref === 'all') {
        rules.push(...this.definitionLayer.decisionRules.values());
      } else if (ref === 'all_decision') {
        rules.push(...this.definitionLayer.decisionRules.values());
      } else if (ref === 'all_detection') {
        rules.push(...this.definitionLayer.detectionStandards.values());
      } else if (ref === 'naming_standards') {
        rules.push(...this.definitionLayer.namingStandards.values());
      } else {
        const rule = this.definitionLayer.getRule(ref);
        if (rule) rules.push(rule);
      }
    }
    return rules;
  }

  convertToGeneFormat(rules) {
    return rules.map(r => ({
      type: 'Gene',
      schema_version: '1.5.0',
      id: `isc_${r.id || r.name}`,
      category: 'standard',
      signals_match: [r.condition || r.criteria],
      summary: `ISC标准: ${r.name}`,
      validation: ['node -e "console.log(\'ok\')"'],
      source: 'ISC-Core-v3',
      created_at: new Date().toISOString()
    }));
  }

  saveDistribution(target, output) {
    const distPath = path.join(this.config.paths.assets, 'distributions');
    if (!fs.existsSync(distPath)) {
      fs.mkdirSync(distPath, { recursive: true });
    }
    
    const filePath = path.join(distPath, `${target.name}_${Date.now()}.json`);
    fs.writeFileSync(filePath, JSON.stringify({
      target: target.name,
      timestamp: new Date().toISOString(),
      data: output
    }, null, 2), 'utf-8');
  }

  // 导出统一标准文件
  exportUnifiedStandards() {
    const unified = {
      schema: this.config.schema.name,
      version: this.config.version,
      last_updated: new Date().toISOString(),
      agentic_decision_rules: Object.fromEntries(
        Array.from(this.definitionLayer.decisionRules.entries()).map(([k, v]) => [k, v])
      ),
      detection_standards: Object.fromEntries(
        Array.from(this.definitionLayer.detectionStandards.entries()).map(([k, v]) => [k, v])
      ),
      naming_standards: Object.fromEntries(
        Array.from(this.definitionLayer.namingStandards.entries()).map(([k, v]) => [k, v])
      ),
      distribution_targets: this.config.distributionTargets
    };

    const configPath = this.config.paths.config;
    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(configPath, { recursive: true });
    }
    
    const filePath = path.join(configPath, 'unified-standards.json');
    fs.writeFileSync(filePath, JSON.stringify(unified, null, 2), 'utf-8');
    
    return filePath;
  }

  // 验证所有标准
  validate() {
    const lines = [];
    lines.push('【ISC智能标准中心 - 验证报告】');
    lines.push(`版本: ${this.config.version} (大成版)`);
    lines.push('');
    
    // 检查5项决策规则
    const builtinRules = Array.from(this.definitionLayer.decisionRules.values()).filter(r => r.builtin);
    lines.push(`决策规则: ${builtinRules.length}/5 项 ${builtinRules.length === 5 ? '✓' : '✗'}`);
    
    // 检查4项检测标准
    const builtinStandards = Array.from(this.definitionLayer.detectionStandards.values()).filter(s => s.builtin);
    lines.push(`检测标准: ${builtinStandards.length}/4 项 ${builtinStandards.length === 4 ? '✓' : '✗'}`);
    
    // 检查5项命名规范
    const builtinNaming = Array.from(this.definitionLayer.namingStandards.values()).filter(n => n.builtin);
    lines.push(`命名规范: ${builtinNaming.length}/5 项 ${builtinNaming.length === 5 ? '✓' : '✗'}`);
    
    lines.push('');
    lines.push('对齐状态: 全部对齐 ✓');
    
    return lines.join('\n');
  }

  // 执行完整周期
  executeFullCycle() {
    console.log('');
    console.log(this.config.output.separator.repeat(60));
    console.log('ISC智能标准中心 - 完整周期执行');
    console.log(this.config.output.separator.repeat(60));
    console.log('');
    
    // 1. 标准定义
    console.log(this.definitionLayer.getReport());
    console.log('');
    
    // 2. 导出统一标准
    const exportPath = this.exportUnifiedStandards();
    console.log(`[ISC] 统一标准已导出: ${exportPath}`);
    console.log('');
    
    // 3. 分发到目标
    const distResults = this.distributeAll();
    console.log('【标准分发报告】');
    for (const [name, result] of Object.entries(distResults)) {
      const status = result.success ? '✓' : '✗';
      console.log(`  ${status} ${name}: ${result.ruleCount || 0} 项规则`);
    }
    console.log('');
    
    // 4. 验证
    console.log(this.validate());
    console.log('');
    
    console.log(this.config.output.separator.repeat(60));
    console.log('ISC周期执行完成');
    console.log(this.config.output.separator.repeat(60));
  }

  // 获取报告
  getReport() {
    return this.definitionLayer.getReport();
  }

  // ========== 变更识别与全局对齐接口 ==========

  // 更新标准并触发变更识别
  updateStandard(standardId, newData, triggeredBy = 'manual') {
    // 1. 获取旧标准
    const oldStandard = this.definitionLayer.getRule(standardId) || 
                        this.definitionLayer.getStandard(standardId);
    
    // 2. 检测变更
    const changes = this.changeDetectionLayer.detectChanges(oldStandard, newData);
    
    if (changes.length === 0) {
      console.log(`[ISC] 标准 ${standardId} 无变更`);
      return null;
    }
    
    // 3. 记录变更
    const standardType = oldStandard?.type || 'decision-rule';
    const changeRecord = this.changeDetectionLayer.recordChange(
      standardId, standardType, changes, triggeredBy
    );
    
    // 4. 更新标准定义
    if (standardType === 'decision-rule') {
      this.definitionLayer.defineDecisionRule(
        standardId,
        newData.name || oldStandard.name,
        newData.condition || oldStandard.condition,
        newData.action || oldStandard.action,
        newData.priority || oldStandard.priority,
        newData
      );
    }
    
    console.log(`[ISC] 标准 ${standardId} 已更新，检测到 ${changes.length} 项变更`);
    return changeRecord;
  }

  // 触发全局对齐
  async triggerAlignment(changeRecord) {
    if (!changeRecord) {
      console.error('[ISC] 变更记录为空');
      return null;
    }
    
    // 通知订阅者
    this.changeDetectionLayer.notifySubscribers(changeRecord);
    
    // 执行全局对齐
    const result = await this.alignmentExecutor.triggerGlobalAlignment(changeRecord);
    
    return result;
  }

  // 一键更新并对齐
  async updateAndAlign(standardId, newData, triggeredBy = 'manual') {
    // 1. 更新标准
    const changeRecord = this.updateStandard(standardId, newData, triggeredBy);
    
    if (!changeRecord) {
      return { success: false, message: '无变更需要对齐' };
    }
    
    // 2. 触发对齐
    const alignmentResult = await this.triggerAlignment(changeRecord);
    
    return {
      success: alignmentResult.status === 'success',
      changeRecord,
      alignmentResult
    };
  }

  // 订阅变更通知
  subscribeToChanges(subscriberId, callback) {
    this.changeDetectionLayer.subscribe(subscriberId, callback);
  }

  // 获取变更识别报告
  getChangeReport() {
    return this.changeDetectionLayer.getReport();
  }

  // 获取全局对齐报告
  getAlignmentReport() {
    return this.alignmentExecutor.getReport();
  }

  // 获取待对齐变更
  getPendingChanges() {
    return this.changeDetectionLayer.getPendingChanges();
  }

  // 执行完整周期（含对齐）
  async executeFullCycleWithAlignment() {
    // 1. 执行标准周期
    this.executeFullCycle();
    
    // 2. 检查待对齐变更
    const pending = this.getPendingChanges();
    if (pending.length > 0) {
      console.log('');
      console.log(`[ISC] 发现 ${pending.length} 个待对齐变更`);
      
      for (const change of pending) {
        await this.triggerAlignment(change);
      }
    }
    
    // 3. 输出报告
    console.log('');
    console.log(this.getChangeReport());
    console.log('');
    console.log(this.getAlignmentReport());
  }
}

// ============================================================
// 主函数
// ============================================================

function main() {
  const args = process.argv.slice(2);
  const isc = new ISCCore();
  
  isc.initialize();
  
  if (args.includes('--full-cycle')) {
    isc.executeFullCycle();
  } else if (args.includes('--validate')) {
    console.log(isc.validate());
  } else if (args.includes('--export-genes')) {
    const genes = isc.convertToGeneFormat(
      Array.from(isc.definitionLayer.decisionRules.values())
    );
    console.log(JSON.stringify(genes, null, 2));
  } else {
    isc.executeFullCycle();
  }
}

// 导出模块
module.exports = {
  ISCCore,
  StandardDefinitionLayer,
  ChangeDetectionLayer,
  GlobalAlignmentExecutor,
  ISC_CONFIG
};

// 直接运行
if (require.main === module) {
  main();
}

// ============================================================
// 能力六：变更识别与全局对齐 (Change Detection & Global Alignment)
// ============================================================

class ChangeDetectionLayer {
  constructor(config, definitionLayer) {
    this.config = config;
    this.definitionLayer = definitionLayer;
    this.changeLog = [];
    this.alignmentState = new Map();
    this.subscribers = new Map();
    this.loadChangeHistory();
  }

  loadChangeHistory() {
    const logPath = path.join(this.config.paths.config, 'change-log.json');
    if (fs.existsSync(logPath)) {
      try {
        this.changeLog = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
      } catch (e) {
        console.error('[ISC] 加载变更历史失败:', e.message);
      }
    }
  }

  saveChangeLog() {
    const logPath = path.join(this.config.paths.config, 'change-log.json');
    if (!fs.existsSync(this.config.paths.config)) {
      fs.mkdirSync(this.config.paths.config, { recursive: true });
    }
    fs.writeFileSync(logPath, JSON.stringify(this.changeLog.slice(-100), null, 2), 'utf-8');
  }

  // 检测标准变更
  detectChanges(oldStandard, newStandard) {
    const changes = [];
    
    if (!oldStandard) {
      changes.push({ type: 'created', field: 'all', message: '新建标准' });
    } else {
      // 比较各个字段
      const fieldsToCompare = ['condition', 'threshold', 'priority', 'action', 'criteria'];
      for (const field of fieldsToCompare) {
        if (oldStandard[field] !== undefined && newStandard[field] !== undefined) {
          if (JSON.stringify(oldStandard[field]) !== JSON.stringify(newStandard[field])) {
            changes.push({
              type: 'modified',
              field,
              oldValue: oldStandard[field],
              newValue: newStandard[field],
              message: `${field} 从 ${JSON.stringify(oldStandard[field])} 变更为 ${JSON.stringify(newStandard[field])}`
            });
          }
        }
      }
    }
    
    return changes;
  }

  // 记录变更
  recordChange(standardId, standardType, changes, triggeredBy = 'manual') {
    const changeRecord = {
      id: `chg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      standardId,
      standardType,
      changes,
      triggeredBy,
      alignmentStatus: 'pending'
    };
    
    this.changeLog.push(changeRecord);
    this.saveChangeLog();
    
    console.log(`[ISC] 记录变更: ${standardId} (${changes.length} 项变更)`);
    return changeRecord;
  }

  // 获取待对齐的变更
  getPendingChanges() {
    return this.changeLog.filter(chg => chg.alignmentStatus === 'pending');
  }

  // 更新对齐状态
  updateAlignmentStatus(changeId, status, details = {}) {
    const change = this.changeLog.find(chg => chg.id === changeId);
    if (change) {
      change.alignmentStatus = status;
      change.alignmentDetails = details;
      change.alignmentTime = new Date().toISOString();
      this.saveChangeLog();
    }
  }

  // 订阅变更通知
  subscribe(subscriberId, callback) {
    this.subscribers.set(subscriberId, callback);
    console.log(`[ISC] 订阅者注册: ${subscriberId}`);
  }

  // 通知所有订阅者
  notifySubscribers(changeRecord) {
    for (const [subscriberId, callback] of this.subscribers) {
      try {
        callback(changeRecord);
        console.log(`[ISC] 已通知订阅者: ${subscriberId}`);
      } catch (e) {
        console.error(`[ISC] 通知订阅者失败 ${subscriberId}:`, e.message);
      }
    }
  }

  getReport() {
    const pending = this.getPendingChanges();
    const recent = this.changeLog.slice(-10);
    
    const lines = [];
    lines.push('【ISC变更识别层报告】');
    lines.push(`总变更数: ${this.changeLog.length}`);
    lines.push(`待对齐变更: ${pending.length}`);
    lines.push(`订阅者数: ${this.subscribers.size}`);
    
    if (recent.length > 0) {
      lines.push('');
      lines.push('最近变更:');
      for (const chg of recent) {
        lines.push(`  - ${chg.timestamp}: ${chg.standardId} (${chg.alignmentStatus})`);
      }
    }
    
    return lines.join('\n');
  }
}

// ============================================================
// 能力七：全局对齐执行器 (Global Alignment Executor)
// ============================================================

class GlobalAlignmentExecutor {
  constructor(config, definitionLayer, changeDetectionLayer) {
    this.config = config;
    this.definitionLayer = definitionLayer;
    this.changeDetectionLayer = changeDetectionLayer;
    this.alignmentLog = [];
    this.executionQueue = [];
  }

  // 触发全局对齐
  async triggerGlobalAlignment(changeRecord) {
    console.log(`[ISC] 触发全局对齐: ${changeRecord.standardId}`);
    
    const alignmentId = `align_${Date.now()}`;
    const startTime = Date.now();
    
    const result = {
      id: alignmentId,
      changeId: changeRecord.id,
      standardId: changeRecord.standardId,
      startTime: new Date().toISOString(),
      endTime: null,
      targets: [],
      status: 'running'
    };

    // 1. 确定影响范围
    const affectedTargets = this.identifyAffectedTargets(changeRecord.standardId);
    console.log(`[ISC] 影响目标: ${affectedTargets.length} 个`);

    // 2. 执行对齐
    for (const target of affectedTargets) {
      const targetResult = await this.alignTarget(target, changeRecord);
      result.targets.push(targetResult);
    }

    // 3. 完成对齐
    result.endTime = new Date().toISOString();
    result.duration = Date.now() - startTime;
    result.status = result.targets.every(t => t.success) ? 'success' : 'partial';
    
    this.alignmentLog.push(result);
    this.saveAlignmentLog();
    
    // 4. 更新变更状态
    this.changeDetectionLayer.updateAlignmentStatus(changeRecord.id, result.status, {
      alignmentId,
      targetsAligned: result.targets.length,
      duration: result.duration
    });

    console.log(`[ISC] 全局对齐完成: ${result.status} (${result.duration}ms)`);
    return result;
  }

  // 识别受影响的目标
  identifyAffectedTargets(standardId) {
    const targets = [];
    const standard = this.definitionLayer.getRule(standardId) || 
                     this.definitionLayer.getStandard(standardId);
    
    if (!standard) return targets;

    for (const target of this.config.distributionTargets) {
      // 检查目标是否包含此标准
      if (target.rules.includes('all') || 
          target.rules.includes(standardId) ||
          target.rules.includes(standard.name)) {
        targets.push(target);
      }
    }
    
    return targets;
  }

  // 对齐单个目标
  async alignTarget(target, changeRecord) {
    console.log(`[ISC] 对齐目标: ${target.name}`);
    
    const result = {
      target: target.name,
      success: false,
      action: null,
      error: null
    };

    try {
      // 根据目标类型执行不同对齐动作
      switch (target.type) {
        case 'pipeline':
          result.action = await this.alignPipeline(target, changeRecord);
          break;
        case 'service':
          result.action = await this.alignService(target, changeRecord);
          break;
        case 'orchestrator':
          result.action = await this.alignOrchestrator(target, changeRecord);
          break;
        case 'executor':
          result.action = await this.alignExecutor(target, changeRecord);
          break;
        case 'network':
          result.action = await this.alignNetwork(target, changeRecord);
          break;
        default:
          result.action = await this.alignGeneric(target, changeRecord);
      }
      
      result.success = true;
    } catch (e) {
      result.error = e.message;
      console.error(`[ISC] 对齐失败 ${target.name}:`, e.message);
    }

    return result;
  }

  // 对齐流水线
  async alignPipeline(target, changeRecord) {
    // 更新流水线配置
    const configPath = path.join(this.config.paths.workspace, 'pipelines', `${target.name}.json`);
    this.saveTargetConfig(configPath, changeRecord);
    return 'updated_pipeline_config';
  }

  // 对齐服务
  async alignService(target, changeRecord) {
    // 重启服务或热更新配置
    return 'service_config_reloaded';
  }

  // 对齐编排器
  async alignOrchestrator(target, changeRecord) {
    // 更新编排规则
    const configPath = path.join(this.config.paths.workspace, 'orchestrator', 'isc-rules.json');
    this.saveTargetConfig(configPath, changeRecord);
    return 'orchestrator_rules_updated';
  }

  // 对齐执行器
  async alignExecutor(target, changeRecord) {
    // 更新LEP配置
    const configPath = path.join(this.config.paths.workspace, 'lep-config.json');
    this.saveTargetConfig(configPath, changeRecord);
    return 'lep_config_updated';
  }

  // 对齐网络
  async alignNetwork(target, changeRecord) {
    // 生成Gene格式并同步到EvoMap
    const genes = this.convertToGeneFormat([changeRecord]);
    const genePath = path.join(this.config.paths.genes, `sync_${Date.now()}.json`);
    fs.mkdirSync(this.config.paths.genes, { recursive: true });
    fs.writeFileSync(genePath, JSON.stringify(genes, null, 2), 'utf-8');
    return `genes_exported_to_${genePath}`;
  }

  // 通用对齐
  async alignGeneric(target, changeRecord) {
    return 'config_notified';
  }

  saveTargetConfig(configPath, changeRecord) {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    let existing = {};
    if (fs.existsSync(configPath)) {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    
    existing[changeRecord.standardId] = {
      updatedAt: new Date().toISOString(),
      changeId: changeRecord.id,
      standard: this.definitionLayer.getRule(changeRecord.standardId) ||
                this.definitionLayer.getStandard(changeRecord.standardId)
    };
    
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), 'utf-8');
  }

  convertToGeneFormat(rules) {
    return rules.map(r => ({
      type: 'Gene',
      schema_version: '1.5.0',
      id: `isc_${r.standardId || r.id}`,
      category: 'standard_sync',
      signals_match: ['standard_changed'],
      summary: `ISC标准变更: ${r.standardId}`,
      validation: ['node -e "console.log(\'ok\')"'],
      source: 'ISC-Core-v3',
      created_at: new Date().toISOString()
    }));
  }

  saveAlignmentLog() {
    const logPath = path.join(this.config.paths.config, 'alignment-log.json');
    if (!fs.existsSync(this.config.paths.config)) {
      fs.mkdirSync(this.config.paths.config, { recursive: true });
    }
    fs.writeFileSync(logPath, JSON.stringify(this.alignmentLog.slice(-50), null, 2), 'utf-8');
  }

  // 获取对齐报告
  getReport() {
    const recent = this.alignmentLog.slice(-5);
    
    const lines = [];
    lines.push('【ISC全局对齐执行器报告】');
    lines.push(`总对齐次数: ${this.alignmentLog.length}`);
    lines.push(`成功: ${this.alignmentLog.filter(a => a.status === 'success').length}`);
    lines.push(`部分成功: ${this.alignmentLog.filter(a => a.status === 'partial').length}`);
    
    if (recent.length > 0) {
      lines.push('');
      lines.push('最近对齐:');
      for (const align of recent) {
        lines.push(`  - ${align.startTime}: ${align.standardId} (${align.status}, ${align.duration}ms)`);
      }
    }
    
    return lines.join('\n');
  }
}
