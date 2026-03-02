/**
 * @file lib/evomap-client.js
 * @description EvoMap API客户端封装
 * @module EvoMapClient
 * @version 1.0.0
 * 
 * 功能：
 * 1. EvoMap Hub连接管理
 * 2. 技能上传接口封装
 * 3. 版本管理接口
 * 4. 错误处理和重试机制
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

/**
 * EvoMap API客户端
 * @class
 * @extends EventEmitter
 */
class EvoMapClient extends EventEmitter {
  /**
   * @constructor
   * @param {Object} config - 配置对象
   * @param {string} config.hubUrl - EvoMap Hub URL
   * @param {string} config.nodeId - 节点ID
   * @param {boolean} config.offlineMode - 离线模式
   * @param {number} config.maxRetries - 最大重试次数
   * @param {number} config.retryDelayMs - 重试延迟（毫秒）
   * @param {string} config.manifestPath - EvoMap清单路径
   */
  constructor(config = {}) {
    super();
    
    this.config = {
      hubUrl: config.hubUrl || process.env.EVOMAP_HUB_URL || 'wss://hub.evomap.network',
      nodeId: config.nodeId || `seef_node_${Date.now()}`,
      offlineMode: config.offlineMode !== false,
      maxRetries: config.maxRetries || 3,
      retryDelayMs: config.retryDelayMs || 5000,
      manifestPath: config.manifestPath || 
        '/root/.openclaw/workspace/skills/isc-core/config/evomap-upload-manifest.json',
      ...config
    };

    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.messageQueue = [];
    this.pendingRequests = new Map();
    this.requestId = 0;

    // 统计
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      reconnections: 0
    };
  }

  /**
   * 初始化客户端
   * @async
   * @returns {Promise<boolean>}
   */
  async initialize() {
    this._log('info', '初始化EvoMap客户端...');

    try {
      // 检查是否需要尝试真实连接
      if (this.config.offlineMode) {
        this._log('info', '离线模式运行');
        this.isConnected = false;
        return false;
      }

      // 尝试连接EvoMap Hub
      const connected = await this._connect();
      
      if (connected) {
        this._log('info', 'EvoMap客户端初始化完成');
      } else {
        this._log('warning', '无法连接到EvoMap Hub，切换到离线模式');
      }

      return connected;

    } catch (error) {
      this._log('error', '初始化失败:', error.message);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * 连接到EvoMap Hub
   * @private
   * @async
   * @returns {Promise<boolean>}
   */
  async _connect() {
    try {
      // 在浏览器环境中使用WebSocket
      if (typeof WebSocket !== 'undefined') {
        this.ws = new WebSocket(this.config.hubUrl);
      } else {
        // Node.js环境
        const { WebSocket } = await import('ws');
        this.ws = new WebSocket(this.config.hubUrl);
      }

      return new Promise((resolve) => {
        this.ws.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this._log('info', '已连接到EvoMap Hub');
          this.emit('connected');
          
          // 发送队列中的消息
          this._flushMessageQueue();
          
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          this._handleMessage(event.data);
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          this._log('warning', 'EvoMap连接已关闭');
          this.emit('disconnected');
          
          // 尝试重连
          if (!this.config.offlineMode) {
            this._scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          this._log('error', 'WebSocket错误:', error.message);
          this.stats.errors++;
          this.emit('error', error);
          resolve(false);
        };

        // 连接超时
        setTimeout(() => {
          if (!this.isConnected) {
            resolve(false);
          }
        }, 10000);
      });

    } catch (error) {
      this._log('error', '连接失败:', error.message);
      return false;
    }
  }

  /**
   * 断开连接
   * @async
   */
  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this._log('info', '已断开EvoMap连接');
  }

  /**
   * 调度重连
   * @private
   */
  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.config.maxRetries) {
      this._log('error', '重试次数耗尽，切换到离线模式');
      this.config.offlineMode = true;
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.retryDelayMs * Math.pow(2, this.reconnectAttempts - 1);
    
    this._log('info', `计划重连 (${this.reconnectAttempts}/${this.config.maxRetries})，${delay}ms后...`);
    
    setTimeout(() => {
      this.stats.reconnections++;
      this._connect();
    }, delay);
  }

  /**
   * 处理收到的消息
   * @private
   * @param {string} data - 消息数据
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data);
      this.stats.messagesReceived++;

      // 处理响应
      if (message.id && this.pendingRequests.has(message.id)) {
        const { resolve, reject } = this.pendingRequests.get(message.id);
        this.pendingRequests.delete(message.id);

        if (message.error) {
          reject(new Error(message.error));
        } else {
          resolve(message.result);
        }
      }

      this.emit('message', message);

    } catch (error) {
      this._log('error', '消息解析失败:', error.message);
    }
  }

  /**
   * 发送消息
   * @private
   * @param {Object} message - 消息对象
   * @returns {Promise<Object>}
   */
  _send(message) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const msgWithId = { ...message, id };

      // 如果已连接，直接发送
      if (this.isConnected && this.ws.readyState === 1) {
        try {
          this.ws.send(JSON.stringify(msgWithId));
          this.stats.messagesSent++;
          this.pendingRequests.set(id, { resolve, reject });
          
          // 设置超时
          setTimeout(() => {
            if (this.pendingRequests.has(id)) {
              this.pendingRequests.delete(id);
              reject(new Error('请求超时'));
            }
          }, 30000);
          
        } catch (error) {
          reject(error);
        }
      } else {
        // 离线模式或连接断开，加入队列
        this.messageQueue.push({ message: msgWithId, resolve, reject });
        
        if (this.config.offlineMode) {
          // 离线模式立即返回模拟响应
          resolve({ offline: true, queued: true });
        }
      }
    });
  }

  /**
   * 刷新消息队列
   * @private
   */
  _flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const { message, resolve, reject } = this.messageQueue.shift();
      
      try {
        this.ws.send(JSON.stringify(message));
        this.stats.messagesSent++;
        this.pendingRequests.set(message.id, { resolve, reject });
      } catch (error) {
        reject(error);
      }
    }
  }

  // ===== 公开API方法 =====

  /**
   * 发布Gene到EvoMap
   * @async
   * @param {Object} gene - Gene对象
   * @returns {Promise<Object>} 发布结果
   */
  async publishGene(gene) {
    return this._withRetry(async () => {
      const result = await this._send({
        type: 'publish',
        payload: gene
      });

      this._log('info', `Gene发布成功: ${gene.id}`);
      this.emit('gene.published', { geneId: gene.id, result });
      
      return result;
    }, 'publishGene');
  }

  /**
   * 查询Gene
   * @async
   * @param {string} geneId - Gene ID
   * @returns {Promise<Object>} Gene对象
   */
  async queryGene(geneId) {
    return this._withRetry(async () => {
      const result = await this._send({
        type: 'query',
        payload: { geneId }
      });

      return result;
    }, 'queryGene');
  }

  /**
   * 更新Gene
   * @async
   * @param {string} geneId - Gene ID
   * @param {Object} updates - 更新内容
   * @returns {Promise<Object>} 更新结果
   */
  async updateGene(geneId, updates) {
    return this._withRetry(async () => {
      const result = await this._send({
        type: 'update',
        payload: { geneId, updates }
      });

      this._log('info', `Gene更新成功: ${geneId}`);
      this.emit('gene.updated', { geneId, result });
      
      return result;
    }, 'updateGene');
  }

  /**
   * 删除Gene
   * @async
   * @param {string} geneId - Gene ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteGene(geneId) {
    return this._withRetry(async () => {
      const result = await this._send({
        type: 'delete',
        payload: { geneId }
      });

      this._log('info', `Gene删除成功: ${geneId}`);
      this.emit('gene.deleted', { geneId });
      
      return result;
    }, 'deleteGene');
  }

  /**
   * 搜索Genes
   * @async
   * @param {Object} criteria - 搜索条件
   * @returns {Promise<Array>} Gene列表
   */
  async searchGenes(criteria = {}) {
    return this._withRetry(async () => {
      const result = await this._send({
        type: 'search',
        payload: criteria
      });

      return result.genes || [];
    }, 'searchGenes');
  }

  /**
   * 获取Gene版本历史
   * @async
   * @param {string} geneId - Gene ID
   * @returns {Promise<Array>} 版本历史
   */
  async getGeneVersions(geneId) {
    return this._withRetry(async () => {
      const result = await this._send({
        type: 'versions',
        payload: { geneId }
      });

      return result.versions || [];
    }, 'getGeneVersions');
  }

  /**
   * 回滚Gene到指定版本
   * @async
   * @param {string} geneId - Gene ID
   * @param {string} version - 目标版本
   * @returns {Promise<Object>} 回滚结果
   */
  async rollbackGene(geneId, version) {
    return this._withRetry(async () => {
      const result = await this._send({
        type: 'rollback',
        payload: { geneId, version }
      });

      this._log('info', `Gene回滚成功: ${geneId} -> ${version}`);
      this.emit('gene.rollback', { geneId, version, result });
      
      return result;
    }, 'rollbackGene');
  }

  /**
   * 批量上传技能
   * @async
   * @param {Array<Object>} skills - 技能列表
   * @returns {Promise<Array>} 上传结果
   */
  async uploadBatch(skills) {
    const results = [];
    
    for (const skill of skills) {
      try {
        const gene = this._buildGeneFromSkill(skill);
        const result = await this.publishGene(gene);
        results.push({ skillId: skill.skillId, success: true, result });
      } catch (error) {
        results.push({ 
          skillId: skill.skillId, 
          success: false, 
          error: error.message 
        });
      }
    }

    return results;
  }

  // ===== 辅助方法 =====

  /**
   * 带重试的操作包装器
   * @private
   * @param {Function} operation - 操作函数
   * @param {string} operationName - 操作名称
   * @returns {Promise<any>}
   */
  async _withRetry(operation, operationName) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // 检查是否是可重试错误
        if (!this._isRetryableError(error)) {
          throw error;
        }

        this._log('warning', `${operationName} 失败 (尝试 ${attempt}/${this.config.maxRetries}):`, error.message);
        
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
          this._log('info', `${delay}ms后重试...`);
          await this._sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * 检查错误是否可重试
   * @private
   * @param {Error} error - 错误对象
   * @returns {boolean}
   */
  _isRetryableError(error) {
    const retryableCodes = [
      'ETIMEDOUT',
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'EPIPE',
      'EAI_AGAIN'
    ];

    return retryableCodes.some(code => 
      error.message?.includes(code) || 
      error.code === code
    );
  }

  /**
   * 从技能构建Gene
   * @private
   * @param {Object} skill - 技能对象
   * @returns {Object} Gene对象
   */
  _buildGeneFromSkill(skill) {
    const geneId = `gene_${skill.skillId}_${Date.now()}`;
    
    return {
      id: geneId,
      type: 'Gene',
      version: '1.0',
      
      summary: skill.description || `${skill.skillName} 技能`,
      content: skill.content || '',
      readme: skill.readme || '',
      
      metadata: {
        skillId: skill.skillId,
        skillName: skill.skillName,
        version: skill.version,
        author: skill.author || 'OpenClaw',
        createdAt: skill.createdAt,
        updatedAt: skill.updatedAt,
        iscScore: skill.iscScore,
        tags: skill.tags || [],
        layer: skill.layer || 'application'
      },
      
      source: {
        type: 'seef_pipeline',
        nodeId: this.config.nodeId,
        path: skill.skillPath || '',
        repository: 'openclaw-workspace'
      },
      
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 解析SKILL.md元数据
   * @param {string} content - SKILL.md内容
   * @returns {Object} 元数据
   */
  parseSkillMetadata(content) {
    const metadata = {};
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    
    if (match) {
      const yamlContent = match[1];
      const lines = yamlContent.split('\n');
      
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          metadata[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    }
    
    return metadata;
  }

  /**
   * 睡眠函数
   * @private
   * @param {number} ms - 毫秒
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 日志记录
   * @private
   */
  _log(level, ...args) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [EvoMapClient] [${level.toUpperCase()}]`, ...args);
  }

  /**
   * 获取客户端统计
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      isConnected: this.isConnected,
      isOfflineMode: this.config.offlineMode,
      messageQueueSize: this.messageQueue.length,
      pendingRequests: this.pendingRequests.size
    };
  }
}

/**
 * 创建EvoMap客户端的工厂函数
 * @param {Object} config - 配置对象
 * @returns {EvoMapClient}
 */
export function createEvoMapClient(config = {}) {
  return new EvoMapClient(config);
}

export { EvoMapClient };
export default EvoMapClient;
