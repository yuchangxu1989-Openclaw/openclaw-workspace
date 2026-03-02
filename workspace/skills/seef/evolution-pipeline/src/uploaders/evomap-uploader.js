/**
 * EvoMap上传器 (EvoMap Uploader)
 * 
 * 功能：将技能发布为Gene到EvoMap Hub
 * 调用：evomap-a2a连接器
 */

import fs from 'fs';
import path from 'path';

class EvoMapUploader {
  constructor(config = {}) {
    this.config = config;
    this.hubUrl = config.hubUrl || process.env.EVOMAP_HUB_URL || 'wss://hub.evomap.network';
    this.autoSync = config.autoSync !== false;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelayMs = config.retryDelayMs || 5000;
    this.offlineMode = config.offlineMode !== false;
    
    // EvoMap A2A路径
    this.evomapA2APath = config.evomapA2APath || 
      '/root/.openclaw/workspace/skills/evomap-a2a/index.js';
    
    // EvoMap清单路径
    this.manifestPath = config.manifestPath || 
      '/root/.openclaw/workspace/skills/isc-core/config/evomap-upload-manifest.json';
    
    this.client = null;
    this.isConnected = false;
  }

  /**
   * 初始化连接
   */
  async initialize() {
    // 检查evomap-a2a是否存在
    if (!fs.existsSync(this.evomapA2APath)) {
      console.warn('[EvoMapUploader] evomap-a2a未找到，启用离线模式');
      return false;
    }
    
    try {
      // ESM动态导入
      const { default: EvoMapA2A } = await import(this.evomapA2APath);
      this.client = new EvoMapA2A({
        hubUrl: this.hubUrl,
        nodeId: `seef_pipeline_${Date.now()}`
      });
      
      // 连接Hub
      this.isConnected = await this.client.connect();
      
      if (this.isConnected) {
        console.log('[EvoMapUploader] 已连接到EvoMap Hub');
      } else {
        console.log('[EvoMapUploader] 离线模式运行');
      }
      
      return this.isConnected;
      
    } catch (e) {
      console.error(`[EvoMapUploader] 初始化失败: ${e.message}`);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * 上传技能到EvoMap
   * @param {Object} skillState - 技能状态
   * @returns {Object} 上传结果
   */
  async upload(skillState) {
    console.log(`[EvoMapUploader] 开始上传: ${skillState.skillId}`);
    
    try {
      // 检查是否在允许列表中
      if (!this.isSkillAllowed(skillState.skillId)) {
        console.log(`[EvoMapUploader] 技能 ${skillState.skillId} 不在允许列表中，跳过`);
        return {
          success: false,
          skipped: true,
          reason: 'not_in_allowlist',
          geneId: null
        };
      }
      
      // 构建Gene
      const gene = this.buildGene(skillState);
      
      // 发布Gene
      let geneId = null;
      let retries = 0;
      
      while (retries < this.maxRetries) {
        try {
          geneId = await this.publishGene(gene);
          break;
        } catch (e) {
          retries++;
          console.warn(`[EvoMapUploader] 发布失败，重试 ${retries}/${this.maxRetries}: ${e.message}`);
          if (retries < this.maxRetries) {
            await this.sleep(this.retryDelayMs);
          }
        }
      }
      
      if (geneId) {
        console.log(`[EvoMapUploader] 上传成功: ${skillState.skillId} -> Gene ${geneId}`);
        return {
          success: true,
          skipped: false,
          geneId,
          gene,
          timestamp: new Date().toISOString()
        };
      } else {
        throw new Error('发布失败，重试次数耗尽');
      }
      
    } catch (e) {
      console.error(`[EvoMapUploader] 上传失败: ${e.message}`);
      return {
        success: false,
        skipped: false,
        error: e.message,
        geneId: null
      };
    }
  }

  /**
   * 发布Gene到EvoMap
   * @param {Object} gene - Gene对象
   * @returns {string} Gene ID
   */
  async publishGene(gene) {
    // 离线模式：模拟发布
    if (!this.isConnected || this.offlineMode) {
      console.log('[EvoMapUploader] 离线模式：模拟发布Gene');
      return `gene_offline_${gene.id}`;
    }
    
    // 在线模式：通过A2A发布
    if (this.client) {
      this.client.publishGene(gene);
      return gene.id;
    }
    
    throw new Error('EvoMap客户端未初始化');
  }

  /**
   * 从技能状态构建Gene
   * @param {Object} skillState - 技能状态
   * @returns {Object} Gene对象
   */
  buildGene(skillState) {
    const skillPath = skillState.skillPath || 
      path.join('/root/.openclaw/workspace/skills', skillState.skillId);
    
    // 读取SKILL.md内容
    let skillContent = '';
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    if (fs.existsSync(skillMdPath)) {
      skillContent = fs.readFileSync(skillMdPath, 'utf-8');
    }
    
    // 读取README.md内容
    let readmeContent = '';
    const readmePath = path.join(skillPath, 'README.md');
    if (fs.existsSync(readmePath)) {
      readmeContent = fs.readFileSync(readmePath, 'utf-8');
    }
    
    // 提取元数据
    const metadata = this.parseMetadata(skillContent);
    
    // 构建Gene
    const geneId = `gene_${skillState.skillId}_${Date.now()}`;
    
    return {
      id: geneId,
      type: 'Gene',
      version: '1.0',
      
      // 核心属性
      summary: metadata.description || skillState.description || `${skillState.skillName} 技能`,
      content: skillContent,
      readme: readmeContent,
      
      // 元数据
      metadata: {
        skillId: skillState.skillId,
        skillName: skillState.skillName,
        version: skillState.version,
        author: metadata.author || 'OpenClaw',
        createdAt: skillState.createdAt,
        updatedAt: skillState.updatedAt,
        iscScore: skillState.iscScore,
        tags: metadata.tags ? metadata.tags.split(',').map(t => t.trim()) : [],
        layer: metadata.layer || 'application'
      },
      
      // 来源信息
      source: {
        type: 'seef_pipeline',
        nodeId: `seef_pipeline_${skillState.skillId}`,
        path: skillPath,
        repository: 'openclaw-workspace'
      },
      
      // 时间戳
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 解析SKILL.md元数据
   * @param {string} content - SKILL.md内容
   * @returns {Object} 元数据
   */
  parseMetadata(content) {
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
   * 检查技能是否在允许列表中
   * @param {string} skillId - 技能ID
   * @returns {boolean} 是否允许
   */
  isSkillAllowed(skillId) {
    try {
      if (!fs.existsSync(this.manifestPath)) {
        console.warn('[EvoMapUploader] EvoMap清单不存在，允许所有技能');
        return true;
      }
      
      const manifest = JSON.parse(fs.readFileSync(this.manifestPath, 'utf-8'));
      
      // 检查allowed_skills
      if (manifest.allowed_skills && manifest.allowed_skills.includes(skillId)) {
        return true;
      }
      
      // 检查auto_discover
      if (manifest.auto_discover === true) {
        // 检查blocked_skills
        if (manifest.blocked_skills && manifest.blocked_skills.includes(skillId)) {
          return false;
        }
        return true;
      }
      
      return false;
      
    } catch (e) {
      console.error(`[EvoMapUploader] 检查允许列表失败: ${e.message}`);
      return true; // 失败时默认允许
    }
  }

  /**
   * 批量上传技能
   * @param {Array} skillStates - 技能状态列表
   * @returns {Array} 上传结果列表
   */
  async uploadBatch(skillStates) {
    const results = [];
    
    for (const skillState of skillStates) {
      const result = await this.upload(skillState);
      results.push({
        skillId: skillState.skillId,
        ...result
      });
    }
    
    return results;
  }

  /**
   * 获取上传统计
   * @param {Array} results - 上传结果列表
   * @returns {Object} 统计信息
   */
  getUploadStats(results) {
    const total = results.length;
    const successful = results.filter(r => r.success).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = total - successful - skipped;
    
    return {
      total,
      successful,
      skipped,
      failed,
      successRate: total > 0 ? (successful / total * 100).toFixed(2) : 0
    };
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.client) {
      this.client.disconnect();
      this.isConnected = false;
      console.log('[EvoMapUploader] 已断开连接');
    }
  }

  /**
   * 睡眠函数
   * @param {number} ms - 毫秒
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export { EvoMapUploader };
export default EvoMapUploader;
