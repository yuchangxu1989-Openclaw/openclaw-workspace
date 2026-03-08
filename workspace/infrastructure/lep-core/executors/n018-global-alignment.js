/**
 * N018: Global Alignment Executor
 * 全局引用对齐执行器 - 技能重命名全局引用对齐
 * 
 * 规则定义: detection-skill-rename-global-alignment-018.json
 * @version 1.0.0
 */

const { BaseExecutor } = require('./base');
const fs = require('fs');
const path = require('path');
const glob = require('glob');

class N018GlobalAlignmentExecutor extends BaseExecutor {
  static RULE_ID = 'N018';
  static RULE_NAME = 'skill_rename_global_reference_alignment';

  async execute(context) {
    const rule = await this.loadRule(this.constructor.RULE_ID);
    const { phases, rollback_on_failure } = rule.execution;
    
    const { oldName, newName } = context;
    
    if (!oldName || !newName) {
      throw new Error('Missing required parameters: oldName and newName');
    }
    
    this.logger.info(`[N018] Starting global alignment: ${oldName} → ${newName}`);
    
    // 发送开始通知
    await this.notify('log', {
      level: 'info',
      content: `[N018] 检测到技能重命名: ${oldName} → ${newName}，开始全局引用对齐`
    });
    
    const executionLog = [];
    let backupPath = null;
    let affectedReferences = [];
    
    try {
      for (const phase of phases) {
        this.logger.info(`[N018] Executing phase: ${phase.name}`);
        
        const result = await this.executePhase(phase, {
          ...context,
          affectedReferences
        });
        
        executionLog.push({ phase: phase.name, result });
        
        // 保存关键数据供后续使用
        if (phase.phase === 1) { // scan_and_identify
          affectedReferences = result.references || [];
        }
        
        if (phase.phase === 2) { // backup
          backupPath = result.backupPath;
        }
        
        // 检查阶段执行结果
        if (!result.success) {
          this.logger.error(`[N018] Phase ${phase.name} failed`);
          
          if (rollback_on_failure && backupPath) {
            this.logger.info(`[N018] Initiating rollback`);
            await this.rollback(backupPath);
            
            await this.sendNotification(rule.notification.on_failure, {
              phase: phase.name,
              error: result.error
            });
            
            return {
              status: 'failed',
              failed_phase: phase.name,
              rolled_back: true,
              executionLog
            };
          }
          
          await this.sendNotification(rule.notification.on_failure, {
            phase: phase.name,
            error: result.error
          });
          
          return {
            status: 'failed',
            failed_phase: phase.name,
            rolled_back: false,
            executionLog
          };
        }
      }
      
      // 所有阶段成功
      const affectedCount = executionLog.find(l => l.phase === 'scan_and_identify')?.result?.affectedCount || 0;
      
      await this.sendNotification(rule.notification.on_complete, { affected_count: affectedCount });
      
      this.logger.info(`[N018] Global alignment completed successfully`);
      
      return {
        status: 'completed',
        oldName,
        newName,
        affected_count: affectedCount,
        executionLog
      };
      
    } catch (error) {
      this.logger.error(`[N018] Execution exception: ${error.message}`);
      
      if (rollback_on_failure && backupPath) {
        this.logger.info(`[N018] Initiating rollback due to exception`);
        await this.rollback(backupPath);
      }
      
      throw error;
    }
  }

  async executePhase(phase, context) {
    switch (phase.action) {
      case 'scan_all_targets':
        return await this.phaseScanAndIdentify(phase, context);
        
      case 'create_backup':
        return await this.phaseCreateBackup(phase, context);
        
      case 'batch_update':
        return await this.phaseBatchUpdate(phase, context);
        
      case 'run_integrity_checks':
        return await this.phaseVerifyIntegrity(phase, context);
        
      default:
        return { success: false, error: `Unknown phase action: ${phase.action}` };
    }
  }

  async phaseScanAndIdentify(phase, context) {
    const rule = await this.loadRule(this.constructor.RULE_ID);
    const { scan_targets } = rule;
    const { oldName } = context;
    
    const affectedReferences = [];
    
    for (const target of scan_targets) {
      this.logger.info(`[N018] Scanning target: ${target.type} at ${target.location}`);
      
      try {
        const references = await this.scanTarget(target, oldName);
        affectedReferences.push(...references);
        this.logger.info(`[N018] Found ${references.length} references in ${target.type}`);
      } catch (error) {
        this.logger.warn(`[N018] Failed to scan ${target.type}: ${error.message}`);
      }
    }
    
    // 去重
    const uniqueReferences = this.deduplicateReferences(affectedReferences);
    
    this.logger.info(`[N018] Total unique references found: ${uniqueReferences.length}`);
    
    return {
      success: true,
      affectedCount: uniqueReferences.length,
      references: uniqueReferences
    };
  }

  async scanTarget(target, oldName) {
    const { type, location, scan_pattern } = target;
    const references = [];
    
    // 根据类型确定搜索范围
    let searchPaths = [];
    
    switch (type) {
      case 'cron_jobs':
        searchPaths = [path.join(process.cwd(), location)];
        break;
        
      case 'dto_subscriptions':
        searchPaths = glob.sync(path.join(process.cwd(), location, '*.json'));
        break;
        
      case 'isc_rules':
        searchPaths = glob.sync(path.join(process.cwd(), location, '*.json'));
        break;
        
      case 'skill_imports':
        searchPaths = glob.sync(path.join(process.cwd(), location));
        break;
        
      case 'documentation':
        searchPaths = glob.sync(path.join(process.cwd(), location), { nodir: true });
        break;
        
      case 'capability_anchor':
        searchPaths = [path.join(process.cwd(), location)];
        break;
        
      default:
        searchPaths = glob.sync(path.join(process.cwd(), location));
    }
    
    // 过滤存在的文件
    searchPaths = searchPaths.filter(p => fs.existsSync(p));
    
    for (const filePath of searchPaths) {
      try {
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
          // 递归搜索目录
          const files = glob.sync('**/*', { cwd: filePath, nodir: true });
          for (const file of files) {
            const fullPath = path.join(filePath, file);
            const refs = await this.findReferencesInFile(fullPath, oldName, type);
            references.push(...refs);
          }
        } else {
          // 搜索单个文件
          const refs = await this.findReferencesInFile(filePath, oldName, type);
          references.push(...refs);
        }
      } catch (error) {
        this.logger.warn(`[N018] Error scanning ${filePath}: ${error.message}`);
      }
    }
    
    return references;
  }

  async findReferencesInFile(filePath, oldName, type) {
    const references = [];
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // 检查是否包含旧名称
      if (!content.includes(oldName)) {
        return references;
      }
      
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.includes(oldName)) {
          // 验证是否是真正的引用（而非注释或字符串中的巧合）
          if (this.isValidReference(line, oldName, type)) {
            references.push({
              file: filePath,
              line: i + 1,
              column: line.indexOf(oldName) + 1,
              content: line.trim(),
              type: type
            });
          }
        }
      }
    } catch (error) {
      // 忽略读取错误（可能是二进制文件等）
    }
    
    return references;
  }

  isValidReference(line, oldName, type) {
    // 检查是否是注释
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
      // 即使是注释中的引用也可能需要更新（如文档）
      // 这里我们仍然返回true，让后续逻辑决定是否更新
      return true;
    }
    
    // 检查是否是字符串中的引用
    const stringPatterns = [
      new RegExp(`['"]${this.escapeRegExp(oldName)}['"]`),
      new RegExp(`\\`${this.escapeRegExp(oldName)}\\``)
    ];
    
    for (const pattern of stringPatterns) {
      if (pattern.test(line)) {
        return true;
      }
    }
    
    // 检查是否是代码中的引用
    const codePatterns = [
      new RegExp(`require\\(['"]${this.escapeRegExp(oldName)}`),
      new RegExp(`import.*from\\s+['"]${this.escapeRegExp(oldName)}`),
      new RegExp(`\\b${this.escapeRegExp(oldName)}\\.`),
      new RegExp(`\\b${this.escapeRegExp(oldName)}\\b`)
    ];
    
    for (const pattern of codePatterns) {
      if (pattern.test(line)) {
        return true;
      }
    }
    
    return false;
  }

  async phaseCreateBackup(phase, context) {
    const { affectedReferences } = context;
    
    if (!affectedReferences || affectedReferences.length === 0) {
      return { success: true, backupPath: null, message: 'No files to backup' };
    }
    
    // 创建备份目录
    const timestamp = Date.now();
    const backupDir = path.join(process.cwd(), '.backups', `n018_${timestamp}`);
    
    try {
      fs.mkdirSync(backupDir, { recursive: true });
      
      // 获取唯一文件列表
      const uniqueFiles = [...new Set(affectedReferences.map(r => r.file))];
      
      for (const file of uniqueFiles) {
        try {
          const relativePath = path.relative(process.cwd(), file);
          const backupPath = path.join(backupDir, relativePath);
          
          // 确保目录存在
          fs.mkdirSync(path.dirname(backupPath), { recursive: true });
          
          // 复制文件
          fs.copyFileSync(file, backupPath);
        } catch (error) {
          this.logger.warn(`[N018] Failed to backup ${file}: ${error.message}`);
        }
      }
      
      // 保存备份清单
      const manifest = {
        timestamp,
        ruleId: 'N018',
        files: uniqueFiles,
        context: {
          oldName: context.oldName,
          newName: context.newName
        }
      };
      
      fs.writeFileSync(
        path.join(backupDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
      );
      
      this.logger.info(`[N018] Backup created at: ${backupDir}`);
      
      return {
        success: true,
        backupPath: backupDir,
        fileCount: uniqueFiles.length
      };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async phaseBatchUpdate(phase, context) {
    const { affectedReferences, oldName, newName } = context;
    const { order, verification_each } = phase;
    
    if (!affectedReferences || affectedReferences.length === 0) {
      return { success: true, message: 'No references to update' };
    }
    
    const results = [];
    
    // 按类型分组
    const refsByType = {};
    for (const ref of affectedReferences) {
      if (!refsByType[ref.type]) {
        refsByType[ref.type] = [];
      }
      refsByType[ref.type].push(ref);
    }
    
    // 按指定顺序处理
    for (const type of order) {
      const refsOfType = refsByType[type];
      if (!refsOfType || refsOfType.length === 0) continue;
      
      this.logger.info(`[N018] Updating type: ${type}, count: ${refsOfType.length}`);
      
      // 按文件分组
      const filesToUpdate = {};
      for (const ref of refsOfType) {
        if (!filesToUpdate[ref.file]) {
          filesToUpdate[ref.file] = [];
        }
        filesToUpdate[ref.file].push(ref);
      }
      
      // 更新每个文件
      for (const [filePath, refs] of Object.entries(filesToUpdate)) {
        try {
          let content = fs.readFileSync(filePath, 'utf8');
          let updated = content;
          
          // 替换所有引用
          // 使用正则确保替换完整的单词或路径
          const patterns = [
            new RegExp(`\\b${this.escapeRegExp(oldName)}\\b`, 'g'),
            new RegExp(this.escapeRegExp(oldName), 'g')
          ];
          
          for (const pattern of patterns) {
            updated = updated.replace(pattern, newName);
          }
          
          if (content !== updated) {
            fs.writeFileSync(filePath, updated, 'utf8');
            
            results.push({ file: filePath, type, success: true, updated: true });
            this.logger.info(`[N018] Updated: ${filePath}`);
            
            // 如果需要每个都验证
            if (verification_each) {
              const verifyResult = await this.verifyFile(filePath, type);
              if (!verifyResult.valid) {
                return {
                  success: false,
                  error: `Verification failed: ${filePath}, ${verifyResult.error}`,
                  results
                };
              }
            }
          } else {
            results.push({ file: filePath, type, success: true, updated: false });
          }
        } catch (error) {
          this.logger.error(`[N018] Failed to update ${filePath}: ${error.message}`);
          results.push({ file: filePath, type, success: false, error: error.message });
        }
      }
    }
    
    const success = results.every(r => r.success);
    const updatedCount = results.filter(r => r.updated).length;
    
    return {
      success,
      updatedCount,
      results
    };
  }

  async phaseVerifyIntegrity(phase, context) {
    const { checks } = phase;
    const results = [];
    
    for (const check of checks) {
      this.logger.info(`[N018] Running check: ${check}`);
      
      try {
        const result = await this.runIntegrityCheck(check, context);
        results.push({ check, ...result });
        
        if (!result.passed) {
          this.logger.warn(`[N018] Check failed: ${check}`);
        }
      } catch (error) {
        this.logger.error(`[N018] Check error: ${check}, ${error.message}`);
        results.push({ check, passed: false, error: error.message });
      }
    }
    
    const success = results.every(r => r.passed);
    
    return {
      success,
      results
    };
  }

  async runIntegrityCheck(check, context) {
    switch (check) {
      case 'no_broken_cron_references':
        return await this.checkCronReferences();
        
      case 'no_import_errors':
        return await this.checkImportErrors();
        
      case 'dto_subscriptions_aligned':
        return await this.checkDTOSubscriptions();
        
      case 'isc_dto_handshake_pass':
        return await this.checkISCDTOHandshake();
        
      default:
        return { passed: false, error: `Unknown check: ${check}` };
    }
  }

  async checkCronReferences() {
    try {
      const cronPath = path.join(process.cwd(), '.openclaw/cron/jobs.json');
      if (!fs.existsSync(cronPath)) {
        return { passed: true, note: 'No cron config found' };
      }
      
      const cronConfig = this.safeParseJSON(fs.readFileSync(cronPath, 'utf8'), {});
      
      for (const job of cronConfig.jobs || []) {
        if (job.script_path && !fs.existsSync(job.script_path)) {
          return {
            passed: false,
            error: `Cron job references non-existent file: ${job.script_path}`
          };
        }
      }
      
      return { passed: true };
    } catch (error) {
      return { passed: false, error: error.message };
    }
  }

  async checkImportErrors() {
    const errors = [];
    const skillsDir = path.join(process.cwd(), 'skills');
    
    try {
      const skills = fs.readdirSync(skillsDir);
      
      for (const skill of skills) {
        const indexPath = path.join(skillsDir, skill, 'index.js');
        if (!fs.existsSync(indexPath)) continue;
        
        try {
          // 清除缓存重新加载
          delete require.cache[require.resolve(indexPath)];
          require(indexPath);
        } catch (error) {
          errors.push(`${skill}: ${error.message}`);
        }
      }
      
      if (errors.length > 0) {
        return {
          passed: false,
          error: `Import errors found:\n${errors.join('\n')}`
        };
      }
      
      return { passed: true };
    } catch (error) {
      return { passed: false, error: error.message };
    }
  }

  async checkDTOSubscriptions() {
    try {
      const subscriptionsDir = path.join(process.cwd(), 'skills/dto-core/subscriptions');
      if (!fs.existsSync(subscriptionsDir)) {
        return { passed: true, note: 'No subscriptions dir found' };
      }
      
      const files = fs.readdirSync(subscriptionsDir).filter(f => f.endsWith('.json'));
      const errors = [];
      
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(subscriptionsDir, file), 'utf8');
          const sub = JSON.parse(content);
          
          // 验证基本结构
          if (!sub.subscription_id || !sub.rule_id) {
            errors.push(`${file}: Missing required fields`);
          }
        } catch (error) {
          errors.push(`${file}: ${error.message}`);
        }
      }
      
      if (errors.length > 0) {
        return {
          passed: false,
          error: `Subscription errors:\n${errors.join('\n')}`
        };
      }
      
      return { passed: true };
    } catch (error) {
      return { passed: false, error: error.message };
    }
  }

  async checkISCDTOHandshake() {
    try {
      const handshakePath = path.join(process.cwd(), 'skills/isc-core/handshake.js');
      if (!fs.existsSync(handshakePath)) {
        return { passed: true, note: 'No handshake module found' };
      }
      
      const handshake = require(handshakePath);
      const result = await handshake.performCheck();
      
      if (!result.success) {
        return {
          passed: false,
          error: `ISC-本地任务编排 handshake failed: ${result.error}`
        };
      }
      
      return { passed: true };
    } catch (error) {
      return { passed: false, error: error.message };
    }
  }

  async rollback(backupPath) {
    this.logger.info(`[N018] Starting rollback from: ${backupPath}`);
    
    try {
      const manifestPath = path.join(backupPath, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        throw new Error('Backup manifest not found');
      }
      
      const manifest = this.safeParseJSON(fs.readFileSync(manifestPath, 'utf8'), {});
      
      for (const file of manifest.files || []) {
        const backupFile = path.join(backupPath, path.relative(process.cwd(), file));
        
        if (fs.existsSync(backupFile)) {
          fs.copyFileSync(backupFile, file);
          this.logger.info(`[N018] Restored: ${file}`);
        } else {
          this.logger.warn(`[N018] Backup file not found: ${backupFile}`);
        }
      }
      
      this.logger.info(`[N018] Rollback completed`);
      return { success: true };
    } catch (error) {
      this.logger.error(`[N018] Rollback failed: ${error.message}`);
      throw error;
    }
  }

  async sendNotification(config, context) {
    if (!config) return;
    
    let content;
    let level = 'info';
    
    if (context.error) {
      // 失败通知
      content = config.content
        .replace('{phase}', context.phase)
        .replace('{error}', context.error);
      level = config.level || 'error';
    } else {
      // 成功通知
      content = config.content
        .replace('{affected_count}', context.affected_count);
    }
    
    await this.notify(config.channel || 'log', { level, content });
  }

  deduplicateReferences(references) {
    const seen = new Set();
    return references.filter(r => {
      const key = `${r.file}:${r.line}:${r.column}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = { N018GlobalAlignmentExecutor };
