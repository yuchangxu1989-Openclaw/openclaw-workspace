#!/usr/bin/env node
/**
 * EvoMap极简发布器 v1.0.0
 * 
 * 核心职责：只干一件事 - 把SEEF+DTO生成的技能发布到EvoMap网络
 * 极简状态机：IDLE → PUBLISHING → PUBLISHED/FAILED
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const { SKILLS_DIR } = require('../shared/paths');

// 尝试加载evomap-a2a
let EvoMapA2A;
try {
  EvoMapA2A = require('../evomap-a2a/index.js');
} catch (e) {
  // 备用：如果找不到，创建一个模拟类
  EvoMapA2A = class MockA2A {
    constructor() { this.isConnected = false; }
    async connect() { console.log('[Mock] A2A连接'); return true; }
    publishGene(gene) { console.log('[Mock] 发布Gene:', gene.id); }
    publishCapsule(capsule) { console.log('[Mock] 发布Capsule:', capsule.id); }
  };
}

/**
 * 发布器状态枚举
 */
const State = {
  IDLE: 'IDLE',
  PUBLISHING: 'PUBLISHING',
  PUBLISHED: 'PUBLISHED',
  FAILED: 'FAILED'
};

/**
 * EvoMap极简发布器
 */
class EvoMapPublisher extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // 配置
    this.config = {
      hubUrl: config.hubUrl || process.env.EVOMAP_HUB_URL || 'wss://hub.evomap.network',
      maxRetries: config.maxRetries || parseInt(process.env.EP_MAX_RETRIES) || 3,
      backoffBase: config.backoffBase || parseInt(process.env.EP_BACKOFF_BASE) || 1000,
      timeout: config.timeout || parseInt(process.env.EP_TIMEOUT) || 30000,
      queueSize: config.queueSize || parseInt(process.env.EP_QUEUE_SIZE) || 100,
      skillsDir: config.skillsDir || SKILLS_DIR
    };
    
    // 状态
    this.state = State.IDLE;
    this.queue = [];  // 待发布队列
    this.processing = null;  // 当前处理的任务
    this.stats = {
      published: 0,
      failed: 0,
      total: 0
    };
    
    // A2A客户端
    this.a2a = new EvoMapA2A({
      hubUrl: this.config.hubUrl,
      nodeId: `node_ep_${Date.now()}`
    });
    
    // 初始化
    this._init();
  }
  
  /**
   * 初始化
   */
  async _init() {
    try {
      await this.a2a.connect();
      this._log('info', 'EvoMap发布器初始化完成');
    } catch (e) {
      this._log('warn', 'A2A连接失败，将使用离线模式:', e.message);
    }
  }
  
  /**
   * 日志
   */
  _log(level, ...args) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [EP] [${level.toUpperCase()}]`, ...args);
  }
  
  /**
   * 获取当前状态
   */
  getState() {
    return {
      state: this.state,
      queueLength: this.queue.length,
      processing: this.processing,
      stats: this.stats
    };
  }
  
  /**
   * 接收DTO发布指令
   * @param {Object} request - 发布请求
   * @returns {Promise<Object>} 发布结果
   */
  async publish(request) {
    const { skillId, version, priority = 'normal', retryPolicy } = request;
    
    this._log('info', `收到发布请求: ${skillId}@${version}`);
    
    // 检查队列容量
    if (this.queue.length >= this.config.queueSize) {
      throw new Error(`发布队列已满 (${this.config.queueSize})`);
    }
    
    // 创建任务
    const task = {
      id: `publish_${skillId}_${Date.now()}`,
      skillId,
      version,
      priority,
      retryPolicy: retryPolicy || {
        maxRetries: this.config.maxRetries,
        backoff: [1000, 2000, 4000]
      },
      retryCount: 0,
      createdAt: Date.now(),
      status: 'queued'
    };
    
    // 根据优先级插入队列
    if (priority === 'high') {
      this.queue.unshift(task);
    } else {
      this.queue.push(task);
    }
    
    this._log('info', `任务入队: ${task.id}, 队列长度: ${this.queue.length}`);
    
    // 如果处于IDLE状态，立即处理
    if (this.state === State.IDLE) {
      this._processQueue();
    }
    
    // 返回任务引用
    return { taskId: task.id, status: 'queued' };
  }
  
  /**
   * 处理队列
   */
  async _processQueue() {
    if (this.state !== State.IDLE || this.queue.length === 0) {
      return;
    }
    
    // 取出下一个任务
    const task = this.queue.shift();
    this.processing = task;
    this.state = State.PUBLISHING;
    
    this._log('info', `开始处理: ${task.skillId}@${task.version}`);
    
    try {
      const result = await this._executePublish(task);
      
      if (result.status === 'PUBLISHED') {
        this.state = State.PUBLISHED;
        this.stats.published++;
        this._onPublishSuccess(result);
      } else {
        throw new Error(result.error?.message || '发布失败');
      }
    } catch (error) {
      this.state = State.FAILED;
      this.stats.failed++;
      await this._handleFailure(task, error);
    } finally {
      this.stats.total++;
      this.processing = null;
      
      // 短暂延迟后回到IDLE，继续处理队列
      setTimeout(() => {
        this.state = State.IDLE;
        this._processQueue();
      }, 100);
    }
  }
  
  /**
   * 执行发布流程
   * 1. ISC最终检查
   * 2. 打包
   * 3. WebSocket上传
   */
  async _executePublish(task) {
    const { skillId, version } = task;
    
    try {
      // 1. ISC最终检查
      this._log('info', `[${skillId}] 阶段1: ISC最终检查`);
      const validation = await this._iscFinalCheck(skillId);
      
      if (!validation.passed) {
        return {
          status: 'FAILED',
          skillId,
          version,
          error: {
            code: 'ISC_CHECK_FAILED',
            message: validation.error,
            stage: 'ISC_CHECK'
          }
        };
      }
      
      // 2. 打包
      this._log('info', `[${skillId}] 阶段2: 打包`);
      const package_ = await this._packageSkill(skillId, version, validation);
      
      // 3. WebSocket上传
      this._log('info', `[${skillId}] 阶段3: WebSocket上传`);
      const uploadResult = await this._uploadToHub(package_, task);
      
      if (uploadResult.success) {
        return {
          status: 'PUBLISHED',
          skillId,
          version,
          geneId: package_.gene.id,
          capsuleId: package_.capsule.id,
          timestamp: new Date().toISOString(),
          hubResponse: uploadResult.response
        };
      } else {
        throw new Error(uploadResult.error);
      }
      
    } catch (error) {
      return {
        status: 'FAILED',
        skillId,
        version,
        error: {
          code: error.code || 'UNKNOWN_ERROR',
          message: error.message,
          stage: error.stage || 'UNKNOWN'
        }
      };
    }
  }
  
  /**
   * ISC最终检查
   * 快速验证，确保SEEF验证结果仍然有效
   */
  async _iscFinalCheck(skillId) {
    const skillPath = path.join(this.config.skillsDir, skillId);
    
    try {
      // 检查目录存在
      const stats = await fs.stat(skillPath);
      if (!stats.isDirectory()) {
        return { passed: false, error: '技能目录不存在' };
      }
      
      // 检查SKILL.md可读
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      const skillMd = await fs.readFile(skillMdPath, 'utf8');
      
      // 解析版本
      const versionMatch = skillMd.match(/version:\s*["']?([^"'\n]+)["']?/);
      const detectedVersion = versionMatch ? versionMatch[1] : 'unknown';
      
      // 检查关键字段
      const hasName = skillMd.includes('name:');
      const hasDescription = skillMd.includes('description:');
      
      if (!hasName || !hasDescription) {
        return { passed: false, error: 'SKILL.md缺少必要字段' };
      }
      
      return {
        passed: true,
        skillPath,
        skillMd,
        detectedVersion
      };
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { passed: false, error: 'SKILL.md不存在' };
      }
      return { passed: false, error: error.message };
    }
  }
  
  /**
   * 打包技能
   * 生成Gene和Capsule格式
   */
  async _packageSkill(skillId, version, validation) {
    const timestamp = Date.now();
    const geneId = `gene_${skillId}_${version}_${timestamp}`;
    const capsuleId = `capsule_${skillId}_${version}_${timestamp}`;
    
    // 构建Gene
    const gene = {
      type: 'Gene',
      id: geneId,
      summary: skillId,
      content: {
        skillId,
        version,
        metadata: {
          publishedBy: 'evomap-publisher',
          publishedAt: new Date().toISOString()
        },
        documents: {
          skill_md: validation.skillMd
        }
      },
      timestamp: new Date().toISOString()
    };
    
    // 构建Capsule（轻量级）
    const capsule = {
      type: 'Capsule',
      id: capsuleId,
      summary: `${skillId}@${version}`,
      content: {
        skillId,
        version,
        status: 'active',
        publisher: 'evomap-publisher'
      },
      timestamp: new Date().toISOString()
    };
    
    return { gene, capsule };
  }
  
  /**
   * 上传到EvoMap Hub
   * 带重试机制
   */
  async _uploadToHub(package_, task) {
    const { gene, capsule } = package_;
    const maxRetries = task.retryPolicy.maxRetries;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        this._log('info', `[${task.skillId}] 上传尝试 ${attempt + 1}/${maxRetries}`);
        
        // 发布Gene
        this.a2a.publishGene(gene);
        
        // 发布Capsule
        this.a2a.publishCapsule(capsule);
        
        this._log('info', `[${task.skillId}] 上传成功`);
        
        return {
          success: true,
          response: { geneId: gene.id, capsuleId: capsule.id }
        };
        
      } catch (error) {
        this._log('warn', `[${task.skillId}] 上传失败: ${error.message}`);
        
        if (attempt < maxRetries - 1) {
          const delay = task.retryPolicy.backoff[attempt] || 1000;
          this._log('info', `[${task.skillId}] ${delay}ms后重试...`);
          await this._sleep(delay);
        } else {
          return {
            success: false,
            error: `上传失败(重试${maxRetries}次): ${error.message}`
          };
        }
      }
    }
  }
  
  /**
   * 处理失败
   */
  async _handleFailure(task, error) {
    task.retryCount++;
    
    const failureResult = {
      status: 'FAILED',
      skillId: task.skillId,
      version: task.version,
      error: {
        code: error.code || 'PUBLISH_FAILED',
        message: error.message,
        stage: error.stage || 'PUBLISHING',
        retries: task.retryCount
      },
      timestamp: new Date().toISOString()
    };
    
    this._log('error', `[${task.skillId}] 发布失败:`, error.message);
    
    // 回调DTO
    this._onPublishFailed(failureResult);
  }
  
  /**
   * 发布成功回调
   */
  _onPublishSuccess(result) {
    this._log('info', `发布成功: ${result.skillId}@${result.version}, Gene: ${result.geneId}`);
    this.emit('published', result);
  }
  
  /**
   * 发布失败回调
   */
  _onPublishFailed(error) {
    this._log('error', `发布失败: ${error.skillId}@${error.version}, 错误: ${error.error.message}`);
    this.emit('failed', error);
  }
  
  /**
   * 睡眠
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 清空失败任务
   */
  clearFailed() {
    this.stats.failed = 0;
    this._log('info', '已清空失败计数');
  }
  
  /**
   * 优雅关闭
   */
  async shutdown() {
    this._log('info', '正在关闭EvoMap发布器...');
    
    // 等待当前任务完成
    while (this.state !== State.IDLE) {
      await this._sleep(100);
    }
    
    if (this.a2a.disconnect) {
      this.a2a.disconnect();
    }
    
    this._log('info', 'EvoMap发布器已关闭');
  }
}

// CLI入口
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const publisher = new EvoMapPublisher();
  
  switch (command) {
    case 'publish': {
      const skillId = args[1];
      const versionFlag = args.indexOf('--version');
      const version = versionFlag > -1 ? args[versionFlag + 1] : 'latest';
      const priorityFlag = args.indexOf('--priority');
      const priority = priorityFlag > -1 ? args[priorityFlag + 1] : 'normal';
      
      if (!skillId) {
        console.error('用法: node index.js publish <skill-id> --version <version>');
        process.exit(1);
      }
      
      try {
        const result = await publisher.publish({ skillId, version, priority });
        console.log('任务已创建:', result);
        
        // 等待结果
        publisher.on('published', (r) => {
          console.log('✓ 发布成功:', r.geneId);
          process.exit(0);
        });
        
        publisher.on('failed', (e) => {
          console.error('✗ 发布失败:', e.error.message);
          process.exit(1);
        });
        
      } catch (e) {
        console.error('错误:', e.message);
        process.exit(1);
      }
      break;
    }
      
    case 'status': {
      const state = publisher.getState();
      console.log('当前状态:', state.state);
      console.log('队列长度:', state.queueLength);
      console.log('正在处理:', state.processing?.skillId || '无');
      console.log('统计:', state.stats);
      process.exit(0);
      break;
    }
      
    case 'clear-failed': {
      publisher.clearFailed();
      console.log('已清空失败计数');
      process.exit(0);
      break;
    }
      
    default:
      console.log('EvoMap极简发布器 v1.0.0');
      console.log('');
      console.log('用法:');
      console.log('  node index.js publish <skill-id> --version <version> [--priority high|normal|low]');
      console.log('  node index.js status');
      console.log('  node index.js clear-failed');
      console.log('');
      console.log('环境变量:');
      console.log('  EVOMAP_HUB_URL    - EvoMap Hub地址');
      console.log('  EP_MAX_RETRIES    - 最大重试次数 (默认: 3)');
      console.log('  EP_BACKOFF_BASE   - 退避基数毫秒 (默认: 1000)');
      process.exit(0);
  }
}

// 导出类
module.exports = EvoMapPublisher;

// 如果是直接运行
if (require.main === module) {
  main().catch(console.error);
}
