/**
 * DTO v2.0 - 离线任务管理器 (P2)
 * 网络中断时的任务缓存与补执行
 */

const fs = require('fs');
const path = require('path');

class OfflineTaskManager {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.join(__dirname, '../.offline-cache');
    this.maxCacheAge = options.maxCacheAge || 7 * 24 * 60 * 60 * 1000; // 7天
    this.ensureCacheDir();
  }

  ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * 缓存任务意图
   * @param {Object} task - 任务意图
   */
  async cacheTask(task) {
    const cacheFile = path.join(this.cacheDir, `${task.id}.json`);
    
    const cacheEntry = {
      task,
      cachedAt: Date.now(),
      status: 'pending',
      offlineMarker: true,
      retryCount: 0
    };
    
    fs.writeFileSync(cacheFile, JSON.stringify(cacheEntry, null, 2));
    
    console.log(`[OfflineManager] 任务已缓存: ${task.id}`);
    
    return cacheEntry;
  }

  /**
   * 检查网络状态
   */
  async checkConnectivity() {
    try {
      // 简单检查：尝试访问 EvoMap 或 ISC
      const dns = require('dns').promises;
      await dns.lookup('evomap.ai');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 执行离线任务
   * @param {string} taskId - 任务ID
   */
  async executeOffline(taskId, executor) {
    const cacheFile = path.join(this.cacheDir, `${taskId}.json`);
    
    if (!fs.existsSync(cacheFile)) {
      throw new Error(`离线任务不存在: ${taskId}`);
    }
    
    const cacheEntry = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    
    console.log(`[OfflineManager] 执行离线任务: ${taskId}`);
    
    try {
      // 标记执行中
      cacheEntry.status = 'executing';
      fs.writeFileSync(cacheFile, JSON.stringify(cacheEntry, null, 2));
      
      // 执行（使用本地资源）
      const result = await this.executeWithLocalResources(cacheEntry.task, executor);
      
      // 标记完成
      cacheEntry.status = 'completed';
      cacheEntry.result = result;
      cacheEntry.completedAt = Date.now();
      fs.writeFileSync(cacheFile, JSON.stringify(cacheEntry, null, 2));
      
      console.log(`[OfflineManager] ✓ 离线任务完成: ${taskId}`);
      
      return result;
      
    } catch (e) {
      // 标记失败
      cacheEntry.status = 'failed';
      cacheEntry.error = e.message;
      cacheEntry.retryCount++;
      fs.writeFileSync(cacheFile, JSON.stringify(cacheEntry, null, 2));
      
      console.error(`[OfflineManager] ✗ 离线任务失败: ${taskId}`, e.message);
      
      throw e;
    }
  }

  /**
   * 使用本地资源执行任务
   */
  async executeWithLocalResources(task, executor) {
    // 修改任务：使用本地缓存的标准和技能
    const localTask = {
      ...task,
      offline: true,
      actions: task.actions.map(action => {
        if (action.type === 'module') {
          // 使用本地路径
          return {
            ...action,
            offline: true,
            localPath: this.getLocalPath(action.module)
          };
        }
        return action;
      })
    };
    
    return executor.executeSequence(localTask.actions);
  }

  /**
   * 获取本地路径
   */
  getLocalPath(module) {
    const paths = {
      'cras': '/root/.openclaw/workspace/skills/cras',
      'isc': '/root/.openclaw/workspace/skills/isc-core',
      'seef': '/root/.openclaw/workspace/skills/seef'
    };
    return paths[module] || module;
  }

  /**
   * 网络恢复后补执行
   */
  async replayAfterRecovery(executor, eventBus) {
    console.log('[OfflineManager] 网络恢复，检查待补执行任务');
    
    const pending = this.getPendingTasks();
    
    if (pending.length === 0) {
      console.log('[OfflineManager] 无待补执行任务');
      return [];
    }
    
    console.log(`[OfflineManager] 发现 ${pending.length} 个待补执行任务`);
    
    const results = [];
    
    for (const task of pending) {
      try {
        // 重新执行（在线模式）
        const result = await executor.executeSequence(task.task.actions);
        
        // 标记已补执行
        this.markReplayed(task.task.id, result);
        
        // 发布补执行事件
        eventBus.publish('offline.replayed', {
          taskId: task.task.id,
          result,
          offlineMarker: true,
          timestamp: new Date().toISOString()
        });
        
        results.push({ taskId: task.task.id, status: 'success', result });
        
      } catch (e) {
        results.push({ taskId: task.task.id, status: 'failed', error: e.message });
      }
    }
    
    return results;
  }

  /**
   * 获取待执行任务
   */
  getPendingTasks() {
    const tasks = [];
    
    const files = fs.readdirSync(this.cacheDir);
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const cacheFile = path.join(this.cacheDir, file);
      const entry = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      
      // 检查是否过期
      if (Date.now() - entry.cachedAt > this.maxCacheAge) {
        console.log(`[OfflineManager] 清理过期缓存: ${entry.task.id}`);
        fs.unlinkSync(cacheFile);
        continue;
      }
      
      // 待执行或失败可重试
      if (entry.status === 'pending' || 
          (entry.status === 'failed' && entry.retryCount < 3)) {
        tasks.push(entry);
      }
    }
    
    return tasks.sort((a, b) => a.cachedAt - b.cachedAt);
  }

  /**
   * 标记已补执行
   */
  markReplayed(taskId, result) {
    const cacheFile = path.join(this.cacheDir, `${taskId}.json`);
    
    if (fs.existsSync(cacheFile)) {
      const entry = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      entry.status = 'replayed';
      entry.replayedAt = Date.now();
      entry.replayResult = result;
      fs.writeFileSync(cacheFile, JSON.stringify(entry, null, 2));
    }
  }

  /**
   * 清理已完成任务
   */
  cleanup() {
    const files = fs.readdirSync(this.cacheDir);
    let cleaned = 0;
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const cacheFile = path.join(this.cacheDir, file);
      const entry = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      
      // 清理已完成且超过保留期的
      const retention = 24 * 60 * 60 * 1000; // 1天
      const lastActivity = entry.completedAt || entry.replayedAt || entry.cachedAt;
      
      if ((entry.status === 'completed' || entry.status === 'replayed') &&
          Date.now() - lastActivity > retention) {
        fs.unlinkSync(cacheFile);
        cleaned++;
      }
    }
    
    console.log(`[OfflineManager] 清理完成: ${cleaned} 个缓存文件`);
    return cleaned;
  }

  /**
   * 获取状态
   */
  getStatus() {
    const pending = this.getPendingTasks();
    
    return {
      pending: pending.length,
      cacheDir: this.cacheDir,
      tasks: pending.map(t => ({
        id: t.task.id,
        status: t.status,
        cachedAt: t.cachedAt,
        retryCount: t.retryCount
      }))
    };
  }
}

module.exports = OfflineTaskManager;
