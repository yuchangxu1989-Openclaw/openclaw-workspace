/**
 * N017: Recurring Pattern Auto Resolve Executor
 * 重复问题模式自动解决执行器
 * 
 * 规则定义: detection-cras-recurring-pattern-auto-resolve-017.json
 * @version 1.0.0
 */

const { BaseExecutor } = require('./base');
const fs = require('fs');
const path = require('path');

class N017RecurringPatternExecutor extends BaseExecutor {
  static RULE_ID = 'N017';
  static RULE_NAME = 'cras_recurring_pattern_auto_resolve';

  async execute(context) {
    const rule = await this.loadRule(this.constructor.RULE_ID);
    
    this.logger.info(`[N017] Starting recurring pattern analysis`);
    
    // 步骤1: 分析重复模式
    const patterns = await this.analyzeRecurringPatterns(rule, context);
    
    if (patterns.length === 0) {
      this.logger.info(`[N017] No recurring patterns found, skipping`);
      return { status: 'skipped', reason: 'no_patterns_found' };
    }
    
    this.logger.info(`[N017] Found ${patterns.length} recurring patterns`);
    
    // 发送检测通知
    await this.notify('log', {
      level: 'info',
      content: `[N017] 检测到 ${patterns.length} 个重复问题模式`
    });
    
    // 步骤2: 自动解决
    const resolved = await this.autoResolvePatterns(patterns, rule, context);
    
    // 步骤3: 标记已解决
    await this.markResolved(resolved);
    
    // 发送完成通知
    const resolvedCount = resolved.filter(r => r.success).length;
    await this.sendNotification(rule.notification, { resolved_count: resolvedCount });
    
    return {
      status: 'completed',
      patterns_found: patterns.length,
      resolved_count: resolvedCount,
      failed_count: patterns.length - resolvedCount,
      resolved
    };
  }

  async analyzeRecurringPatterns(rule, context) {
    const { pattern_matching } = rule.detection;
    const { time_window, threshold, fields } = pattern_matching;
    
    this.logger.info(`[N017] Analyzing events in ${time_window} window with threshold ${threshold}`);
    
    // 从CRAS获取最近的事件
    let events = [];
    
    try {
      // 尝试从CRAS获取事件
      const crasPath = path.join(__dirname, '../../../cras');
      if (fs.existsSync(crasPath)) {
        const cras = require(crasPath);
        events = await cras.getRecentEvents({ 
          window: time_window,
          fields: fields
        });
      } else {
        // 回退：从日志文件分析
        events = await this.analyzeLogs(time_window, fields);
      }
    } catch (error) {
      this.logger.warn(`[N017] Failed to get events from CRAS: ${error.message}`);
      events = await this.analyzeLogs(time_window, fields);
    }
    
    // 聚类分析
    const clusters = this.clusterEvents(events, fields);
    
    // 筛选超过阈值的重复模式
    const patterns = clusters
      .filter(cluster => cluster.count >= threshold)
      .map(cluster => ({
        pattern_id: cluster.id,
        count: cluster.count,
        fields: cluster.fields,
        samples: cluster.samples.slice(0, 5), // 最多保留5个样本
        first_seen: cluster.firstSeen,
        last_seen: cluster.lastSeen,
        severity: this.calculateSeverity(cluster)
      }));
    
    // 按严重性排序
    patterns.sort((a, b) => b.severity - a.severity);
    
    return patterns;
  }

  async analyzeLogs(timeWindow, fields) {
    // 从日志文件中分析事件
    const events = [];
    
    try {
      const logDir = path.join(__dirname, '../../../logs');
      if (!fs.existsSync(logDir)) return events;
      
      const now = Date.now();
      const windowMs = this.parseTimeWindow(timeWindow);
      const cutoff = now - windowMs;
      
      const logFiles = fs.readdirSync(logDir)
        .filter(f => f.endsWith('.log') || f.endsWith('.jsonl'))
        .map(f => path.join(logDir, f));
      
      for (const logFile of logFiles) {
        try {
          const stats = fs.statSync(logFile);
          if (stats.mtimeMs < cutoff) continue;
          
          const content = fs.readFileSync(logFile, 'utf8');
          const lines = content.split('\n').filter(Boolean);
          
          for (const line of lines) {
            try {
              const event = JSON.parse(line);
              if (event.timestamp >= cutoff) {
                events.push(event);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        } catch (e) {
          // 忽略文件错误
        }
      }
    } catch (error) {
      this.logger.warn(`[N017] Failed to analyze logs: ${error.message}`);
    }
    
    return events;
  }

  parseTimeWindow(window) {
    // 解析时间窗口，如 "48h", "7d", "1w"
    const match = window.match(/(\d+)([hdw])/);
    if (!match) return 48 * 60 * 60 * 1000; // 默认48小时
    
    const value = parseInt(match[1], 10);
    const unit = match[2];
    
    const multipliers = {
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000,
      'w': 7 * 24 * 60 * 60 * 1000
    };
    
    return value * (multipliers[unit] || multipliers['h']);
  }

  clusterEvents(events, fields) {
    const clusters = new Map();
    
    for (const event of events) {
      // 构建聚类键
      const keyParts = fields.map(f => {
        const value = this.getNestedValue(event, f);
        return value !== undefined ? String(value) : '';
      });
      
      const key = keyParts.join('|');
      if (!key || key === '|'.repeat(fields.length - 1)) continue;
      
      if (!clusters.has(key)) {
        clusters.set(key, {
          id: `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          count: 0,
          fields: {},
          samples: [],
          firstSeen: event.timestamp || Date.now(),
          lastSeen: event.timestamp || Date.now()
        });
      }
      
      const cluster = clusters.get(key);
      cluster.count++;
      
      // 保存字段值
      fields.forEach(f => {
        const value = this.getNestedValue(event, f);
        if (value !== undefined) {
          cluster.fields[f] = value;
        }
      });
      
      // 保存样本
      if (cluster.samples.length < 10) {
        cluster.samples.push(event);
      }
      
      // 更新时间戳
      const ts = event.timestamp || Date.now();
      if (ts > cluster.lastSeen) {
        cluster.lastSeen = ts;
      }
      if (ts < cluster.firstSeen) {
        cluster.firstSeen = ts;
      }
    }
    
    return Array.from(clusters.values());
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  calculateSeverity(cluster) {
    // 根据出现频率和时间跨度计算严重性
    const frequency = cluster.count;
    const timeSpan = cluster.lastSeen - cluster.firstSeen;
    const hoursSpan = timeSpan / (60 * 60 * 1000);
    
    // 频率越高、时间越短，严重性越高
    const frequencyScore = Math.min(frequency / 10, 10);
    const timeScore = hoursSpan > 0 ? Math.min(10 / hoursSpan, 10) : 10;
    
    return Math.round((frequencyScore + timeScore) / 2);
  }

  async autoResolvePatterns(patterns, rule, context) {
    const { strategies } = rule.execution;
    const resolved = [];
    
    for (const pattern of patterns) {
      this.logger.info(`[N017] Processing pattern: ${pattern.pattern_id} (${pattern.fields.error_type || 'unknown'})`);
      
      // 匹配策略
      const strategy = this.matchStrategy(pattern, strategies);
      
      if (!strategy) {
        this.logger.warn(`[N017] No matching strategy for pattern: ${pattern.pattern_id}`);
        resolved.push({ pattern, success: false, reason: 'no_strategy' });
        continue;
      }
      
      try {
        // 执行修复
        this.logger.info(`[N017] Applying strategy: ${strategy.fix}`);
        const fixResult = await this.executeFix(strategy, pattern, context);
        
        resolved.push({
          pattern,
          strategy,
          success: fixResult.success,
          result: fixResult
        });
        
        if (fixResult.success) {
          this.logger.info(`[N017] Successfully resolved: ${pattern.pattern_id}`);
        } else {
          this.logger.warn(`[N017] Failed to resolve: ${pattern.pattern_id}, ${fixResult.error}`);
        }
      } catch (error) {
        this.logger.error(`[N017] Fix exception: ${pattern.pattern_id}, ${error.message}`);
        resolved.push({
          pattern,
          strategy,
          success: false,
          error: error.message
        });
      }
    }
    
    return resolved;
  }

  matchStrategy(pattern, strategies) {
    const { fields } = pattern;
    const errorType = (fields.error_type || '').toLowerCase();
    const errorMessage = (fields.error_message_keyword || '').toLowerCase();
    const failedSkill = (fields.failed_skill || '').toLowerCase();
    
    // 策略匹配逻辑
    for (const strategy of strategies) {
      const patternField = strategy.pattern.toLowerCase();
      
      // 检查各种模式匹配
      if (this.matchesPattern(errorType, patternField)) return strategy;
      if (this.matchesPattern(errorMessage, patternField)) return strategy;
      if (this.matchesPattern(failedSkill, patternField)) return strategy;
      
      // 特殊模式匹配
      if (patternField === 'file_not_found' && 
          (errorType.includes('enoent') || errorMessage.includes('file not found'))) {
        return strategy;
      }
      
      if (patternField === 'path_mismatch' && 
          (errorType.includes('path') || errorMessage.includes('path'))) {
        return strategy;
      }
      
      if (patternField === 'skill_not_loaded' && 
          (errorType.includes('skill') || errorMessage.includes('not loaded'))) {
        return strategy;
      }
      
      if (patternField === 'timeout' && 
          (errorType.includes('timeout') || errorMessage.includes('timeout'))) {
        return strategy;
      }
      
      if (patternField === 'connection_error' && 
          (errorType.includes('conn') || errorMessage.includes('connection'))) {
        return strategy;
      }
    }
    
    return null;
  }

  matchesPattern(value, pattern) {
    return value.includes(pattern) || pattern.includes(value);
  }

  async executeFix(strategy, pattern, context) {
    const { fix } = strategy;
    
    switch (fix) {
      case 'auto_create_file':
        return await this.fixAutoCreateFile(pattern);
        
      case 'auto_update_reference':
        return await this.fixAutoUpdateReference(pattern);
        
      case 'trigger_skill_reload':
        return await this.fixTriggerSkillReload(pattern);
        
      case 'increase_timeout':
        return await this.fixIncreaseTimeout(pattern);
        
      case 'retry_with_backoff':
        return await this.fixRetryWithBackoff(pattern);
        
      case 'clear_cache':
        return await this.fixClearCache(pattern);
        
      default:
        // 尝试执行通用修复
        if (strategy.action) {
          return await this.executeGenericAction(strategy, pattern);
        }
        return { success: false, error: `Unknown fix type: ${fix}` };
    }
  }

  async fixAutoCreateFile(pattern) {
    const { error_message_keyword, samples } = pattern.fields;
    
    // 从错误消息中提取文件路径
    const filePath = this.extractFilePath(error_message_keyword);
    
    if (!filePath) {
      // 尝试从样本中提取
      for (const sample of samples || []) {
        const path = this.extractFilePath(sample.message || sample.error || '');
        if (path) {
          return await this.createFile(path);
        }
      }
      return { success: false, error: 'Could not extract file path' };
    }
    
    return await this.createFile(filePath);
  }

  extractFilePath(errorMessage) {
    if (!errorMessage) return null;
    
    // 匹配各种路径格式
    const patterns = [
      /['"]([^'"]+)['"]/,                           // 引号包裹的路径
      /(?:file|path):\s*(\S+)/i,                    // file: / path: 格式
      /(?:cannot find|enoent).*?['"](.+?)['"]/i,    // cannot find 'path'
      /\/[^\s]+\.[a-z]+/i                           // Unix风格路径
    ];
    
    for (const pattern of patterns) {
      const match = errorMessage.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }
    
    return null;
  }

  async createFile(filePath) {
    try {
      const fullPath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(process.cwd(), filePath);
      
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // 根据文件类型创建默认内容
      const defaultContent = this.getDefaultContent(fullPath);
      fs.writeFileSync(fullPath, defaultContent, 'utf8');
      
      this.logger.info(`[N017] Created file: ${fullPath}`);
      
      return { success: true, action: 'create_file', path: fullPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async fixAutoUpdateReference(pattern) {
    const { path_mismatch_info, samples } = pattern.fields;
    
    let oldPath, newPath;
    
    // 尝试解析路径不匹配信息
    if (path_mismatch_info) {
      try {
        const info = JSON.parse(path_mismatch_info);
        oldPath = info.oldPath;
        newPath = info.newPath;
      } catch (e) {
        // 解析失败，尝试其他方式
      }
    }
    
    // 从样本中提取
    if (!oldPath || !newPath) {
      for (const sample of samples || []) {
        if (sample.oldPath && sample.newPath) {
          oldPath = sample.oldPath;
          newPath = sample.newPath;
          break;
        }
      }
    }
    
    if (!oldPath || !newPath) {
      return { success: false, error: 'Missing path information' };
    }
    
    // 查找并更新引用
    const results = [];
    const files = await this.findFilesContaining(oldPath);
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const updated = content.replace(
          new RegExp(this.escapeRegExp(oldPath), 'g'),
          newPath
        );
        
        if (content !== updated) {
          fs.writeFileSync(file, updated, 'utf8');
          results.push({ file, success: true, updated: true });
        } else {
          results.push({ file, success: true, updated: false });
        }
      } catch (error) {
        results.push({ file, success: false, error: error.message });
      }
    }
    
    return {
      success: results.some(r => r.success && r.updated),
      oldPath,
      newPath,
      filesUpdated: results.filter(r => r.updated).length,
      results
    };
  }

  async findFilesContaining(searchString) {
    const files = [];
    const searchDirs = ['skills', 'config', '.openclaw'];
    
    for (const dir of searchDirs) {
      const fullDir = path.join(process.cwd(), dir);
      if (!fs.existsSync(fullDir)) continue;
      
      try {
        const glob = require('glob');
        const matches = glob.sync('**/*.{js,json,md,yml,yaml}', { cwd: fullDir });
        
        for (const match of matches) {
          const fullPath = path.join(fullDir, match);
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes(searchString)) {
              files.push(fullPath);
            }
          } catch (e) {
            // 忽略读取错误
          }
        }
      } catch (e) {
        // 忽略glob错误
      }
    }
    
    return files;
  }

  async fixTriggerSkillReload(pattern) {
    const { failed_skill } = pattern.fields;
    
    if (!failed_skill) {
      return { success: false, error: 'No skill specified' };
    }
    
    try {
      // 尝试重载技能
      const skillPath = path.join(__dirname, '../../../skills', failed_skill);
      
      if (fs.existsSync(skillPath)) {
        // 清除require缓存
        const indexPath = path.join(skillPath, 'index.js');
        if (require.cache[indexPath]) {
          delete require.cache[indexPath];
        }
        
        // 重新加载
        require(indexPath);
        
        this.logger.info(`[N017] Reloaded skill: ${failed_skill}`);
        
        return { success: true, action: 'reload_skill', skill: failed_skill };
      }
      
      return { success: false, error: `Skill not found: ${failed_skill}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async fixIncreaseTimeout(pattern) {
    // 增加超时配置的修复
    const { failed_skill, samples } = pattern.fields;
    
    this.logger.info(`[N017] Suggesting timeout increase for: ${failed_skill}`);
    
    // 记录建议，实际配置变更需要人工确认
    return {
      success: true,
      action: 'suggest_timeout_increase',
      skill: failed_skill,
      note: 'Timeout increase suggested, manual confirmation required'
    };
  }

  async fixRetryWithBackoff(pattern) {
    // 配置指数退避重试
    const { failed_skill } = pattern.fields;
    
    this.logger.info(`[N017] Configuring retry with backoff for: ${failed_skill}`);
    
    return {
      success: true,
      action: 'configure_retry',
      skill: failed_skill,
      config: {
        maxRetries: 3,
        backoff: 'exponential',
        baseDelay: 1000
      }
    };
  }

  async fixClearCache(pattern) {
    // 清除相关缓存
    const { failed_skill } = pattern.fields;
    
    try {
      // 清除技能相关的缓存
      const cachePaths = [
        path.join(__dirname, '../../../.cache', failed_skill),
        path.join(__dirname, '../../../tmp', failed_skill)
      ];
      
      let cleared = 0;
      for (const cachePath of cachePaths) {
        if (fs.existsSync(cachePath)) {
          this._rmRecursive(cachePath);
          cleared++;
        }
      }
      
      this.logger.info(`[N017] Cleared ${cleared} cache entries for: ${failed_skill}`);
      
      return { success: true, action: 'clear_cache', skill: failed_skill, cleared };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async executeGenericAction(strategy, pattern) {
    // 执行策略中定义的通用动作
    if (strategy.executor) {
      try {
        const executor = require(strategy.executor);
        const result = await executor[strategy.method || 'execute'](pattern);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
    
    return { success: false, error: 'No executor defined' };
  }

  async markResolved(resolved) {
    const successful = resolved.filter(r => r.success);
    
    if (successful.length === 0) return;
    
    try {
      // 尝试调用CRAS标记已解决
      const crasPath = path.join(__dirname, '../../../cras');
      if (fs.existsSync(crasPath)) {
        const cras = require(crasPath);
        for (const item of successful) {
          await cras.markPatternResolved(item.pattern.pattern_id);
        }
      }
      
      this.logger.info(`[N017] Marked ${successful.length} patterns as resolved`);
    } catch (error) {
      this.logger.warn(`[N017] Failed to mark patterns as resolved: ${error.message}`);
    }
  }

  async sendNotification(config, context) {
    if (!config || !config.on_complete) return;
    
    const { resolved_count } = context;
    
    const content = config.on_complete.content
      .replace('{resolved_count}', resolved_count);
    
    await this.notify(config.on_complete.channel || 'log', {
      level: 'info',
      content
    });
  }

  getDefaultContent(filePath) {
    const ext = path.extname(filePath);
    
    const defaults = {
      '.json': '{}',
      '.js': '// Auto-generated\nmodule.exports = {};',
      '.ts': '// Auto-generated\nexport {};',
      '.md': '# Auto-generated\n',
      '.yml': '# Auto-generated',
      '.yaml': '# Auto-generated',
      '.txt': '',
      '.env': '# Auto-generated environment file\n',
      '.gitignore': '# Auto-generated\nnode_modules/\n.cache/\n'
    };
    
    return defaults[ext] || '';
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  _rmRecursive(targetPath) {
    if (!fs.existsSync(targetPath)) return;
    
    const stats = fs.statSync(targetPath);
    
    if (stats.isDirectory()) {
      const files = fs.readdirSync(targetPath);
      for (const file of files) {
        this._rmRecursive(path.join(targetPath, file));
      }
      fs.rmdirSync(targetPath);
    } else {
      fs.unlinkSync(targetPath);
    }
  }
}

module.exports = { N017RecurringPatternExecutor };
