#!/usr/bin/env node
/**
 * ISC规则文件系统监听器 v1.0
 * 自动检测rules/和standards/目录新文件，通知DTO
 */

const fs = require('fs');
const path = require('path');
const { SKILLS_DIR } = require('../../shared/paths');

const ISC_CORE_DIR = path.join(__dirname, '..');

const WATCHER_CONFIG = {
  watchPaths: [
    path.join(ISC_CORE_DIR, 'rules'),
    path.join(ISC_CORE_DIR, 'standards')
  ],
  dtoEventPath: path.join(SKILLS_DIR, 'lto-core/events/isc-rule-created.jsonl'),
  statePath: path.join(ISC_CORE_DIR, '.watch-state.json'),
  checkInterval: 30 * 1000 // 30秒检查一次
};

class ISCFileWatcher {
  constructor() {
    this.knownFiles = new Set();
    this.loadState();
  }

  loadState() {
    if (fs.existsSync(WATCHER_CONFIG.statePath)) {
      const state = JSON.parse(fs.readFileSync(WATCHER_CONFIG.statePath, 'utf8'));
      this.knownFiles = new Set(state.knownFiles || []);
    }
  }

  saveState() {
    fs.writeFileSync(WATCHER_CONFIG.statePath, JSON.stringify({
      knownFiles: Array.from(this.knownFiles),
      lastCheck: new Date().toISOString()
    }));
  }

  /**
   * 扫描目录获取当前文件
   */
  scanDirectories() {
    const currentFiles = new Map();
    
    for (const watchPath of WATCHER_CONFIG.watchPaths) {
      if (!fs.existsSync(watchPath)) continue;
      
      const files = fs.readdirSync(watchPath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const fullPath = path.join(watchPath, file);
        const stat = fs.statSync(fullPath);
        currentFiles.set(fullPath, {
          path: fullPath,
          file: file,
          mtime: stat.mtime.getTime(),
          size: stat.size
        });
      }
    }
    
    return currentFiles;
  }

  /**
   * 检测新文件
   */
  detectNewFiles(currentFiles) {
    const newFiles = [];
    
    for (const [fullPath, info] of currentFiles) {
      if (!this.knownFiles.has(fullPath)) {
        newFiles.push(info);
        this.knownFiles.add(fullPath);
      }
    }
    
    return newFiles;
  }

  /**
   * 检测删除的文件
   */
  detectDeletedFiles(currentFiles) {
    const deleted = [];
    
    for (const knownPath of this.knownFiles) {
      if (!currentFiles.has(knownPath)) {
        deleted.push(knownPath);
      }
    }
    
    // 从已知列表中移除
    for (const del of deleted) {
      this.knownFiles.delete(del);
    }
    
    return deleted;
  }

  /**
   * 解析规则文件
   */
  parseRule(filePath) {
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        id: content.id,
        name: content.name,
        domain: content.domain,
        valid: !!content.id
      };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  /**
   * 通知DTO
   */
  notifyDTO(fileInfo, rule) {
    const relativePath = fileInfo.path.replace(ISC_CORE_DIR + '/', '');
    
    const notification = {
      source: 'isc-file-watcher',
      timestamp: new Date().toISOString(),
      event: 'rule_created',
      data: {
        ruleId: rule.id,
        ruleName: rule.name,
        filePath: fileInfo.path,
        relativePath: relativePath,
        domain: rule.domain,
        detectedBy: 'filesystem_watcher'
      }
    };
    
    // 确保目录存在
    const dir = path.dirname(WATCHER_CONFIG.dtoEventPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 追加到事件队列
    fs.appendFileSync(WATCHER_CONFIG.dtoEventPath, JSON.stringify(notification) + '\n');
    
    console.log(`[ISC→本地任务编排] 文件监听通知: ${rule.id}`);
    console.log(`  📍 位置: ${relativePath}`);
  }

  /**
   * 处理新文件
   */
  async processNewFiles(newFiles) {
    for (const fileInfo of newFiles) {
      console.log(`[文件监听] 新规则文件: ${fileInfo.file}`);
      
      const rule = this.parseRule(fileInfo.path);
      if (rule.valid) {
        this.notifyDTO(fileInfo, rule);
      } else {
        console.log(`  ⚠️ 无法解析规则: ${rule.error}`);
      }
    }
  }

  /**
   * 单次检查
   */
  async check() {
    const currentFiles = this.scanDirectories();
    const newFiles = this.detectNewFiles(currentFiles);
    const deletedFiles = this.detectDeletedFiles(currentFiles);
    
    if (newFiles.length > 0) {
      await this.processNewFiles(newFiles);
    }
    
    if (deletedFiles.length > 0) {
      console.log(`[文件监听] 删除规则文件: ${deletedFiles.length} 个`);
    }
    
    this.saveState();
    
    return {
      scanned: currentFiles.size,
      new: newFiles.length,
      deleted: deletedFiles.length
    };
  }

  /**
   * 持续监听
   */
  async watch() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     ISC规则文件系统监听器 - 自动检测新规则并通知DTO        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`监听路径:`);
    WATCHER_CONFIG.watchPaths.forEach(p => console.log(`  - ${p}`));
    console.log(`检查间隔: ${WATCHER_CONFIG.checkInterval / 1000}秒`);
    console.log('');
    
    // 首次扫描（不通知，只建立基线）
    console.log('[初始化] 首次扫描建立基线...');
    const initial = await this.check();
    console.log(`  已知规则: ${initial.scanned} 个`);
    console.log('');
    
    // 持续监听
    console.log('[监听中] 等待新规则文件...');
    setInterval(async () => {
      const result = await this.check();
      if (result.new > 0 || result.deleted > 0) {
        console.log(`[${new Date().toLocaleTimeString()}] 扫描: ${result.scanned}, 新增: ${result.new}, 删除: ${result.deleted}`);
      }
    }, WATCHER_CONFIG.checkInterval);
  }

  /**
   * 主运行（单次检查模式）
   */
  async run() {
    const result = await this.check();
    console.log('[文件监听] 检查结果:');
    console.log(`  扫描: ${result.scanned} 个规则文件`);
    console.log(`  新增: ${result.new} 个`);
    console.log(`  删除: ${result.deleted} 个`);
    return result;
  }
}

// 运行
if (require.main === module) {
  const watcher = new ISCFileWatcher();
  
  // 如果带--watch参数，持续监听
  if (process.argv.includes('--watch')) {
    watcher.watch();
  } else {
    watcher.run();
  }
}

module.exports = ISCFileWatcher;
