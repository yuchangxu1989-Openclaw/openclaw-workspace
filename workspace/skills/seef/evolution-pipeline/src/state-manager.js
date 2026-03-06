/**
 * 状态管理器 (State Manager)
 * 
 * 功能：管理技能生命周期状态的CRUD操作、状态流转、历史记录
 * 遵循：ISC规则 N036 - 记忆丢失自恢复
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 状态定义
const PIPELINE_STATES = {
  DEVELOP: 'DEVELOP',      // 开发中
  TEST: 'TEST',            // 测试中
  REVIEW: 'REVIEW',        // 审核中
  RELEASE: 'RELEASE',      // 已发布
  SYNC: 'SYNC',            // 同步中
  ONLINE: 'ONLINE',        // 已上线
  FAILED: 'FAILED'         // 失败
};

// 状态流转规则
const STATE_TRANSITIONS = {
  [PIPELINE_STATES.DEVELOP]: [PIPELINE_STATES.TEST],
  [PIPELINE_STATES.TEST]: [PIPELINE_STATES.REVIEW, PIPELINE_STATES.DEVELOP],
  [PIPELINE_STATES.REVIEW]: [PIPELINE_STATES.RELEASE, PIPELINE_STATES.DEVELOP],
  [PIPELINE_STATES.RELEASE]: [PIPELINE_STATES.SYNC],
  [PIPELINE_STATES.SYNC]: [PIPELINE_STATES.ONLINE, PIPELINE_STATES.FAILED],
  [PIPELINE_STATES.ONLINE]: [PIPELINE_STATES.DEVELOP],
  [PIPELINE_STATES.FAILED]: [PIPELINE_STATES.SYNC, PIPELINE_STATES.DEVELOP]
};

class StateManager {
  constructor(config = {}) {
    this.config = config;
    this.statePath = config.statePath || path.join(__dirname, '../.pipeline/state');
    this.ensureStateDirectory();
  }

  /**
   * 确保状态目录存在
   */
  ensureStateDirectory() {
    if (!fs.existsSync(this.statePath)) {
      fs.mkdirSync(this.statePath, { recursive: true });
    }
  }

  /**
   * 获取技能状态文件路径
   * @param {string} skillId - 技能ID
   * @returns {string} 状态文件路径
   */
  getStateFilePath(skillId) {
    return path.join(this.statePath, `${skillId}.json`);
  }

  /**
   * 检查状态文件是否存在
   * @param {string} skillId - 技能ID
   * @returns {boolean} 是否存在
   */
  stateExists(skillId) {
    return fs.existsSync(this.getStateFilePath(skillId));
  }

  /**
   * 从文件系统重建技能状态
   * 遵循ISC规则N036：不依赖MEMORY.md，从文件系统重建
   * @param {string} skillPath - 技能路径
   * @returns {Object} 技能状态
   */
  rebuildStateFromFilesystem(skillPath) {
    const skillId = path.basename(skillPath);
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    
    let skillName = skillId;
    let version = '0.0.1';
    let description = '';
    
    // 从SKILL.md解析元数据
    if (fs.existsSync(skillMdPath)) {
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const metadata = this.parseSkillMetadata(content);
      skillName = metadata.name || skillId;
      version = metadata.version || '0.0.1';
      description = metadata.description || '';
    }
    
    // 获取文件统计信息
    const stats = fs.statSync(skillPath);
    
    return {
      skillId,
      skillName,
      skillPath,
      description,
      currentState: PIPELINE_STATES.DEVELOP,
      previousState: null,
      stateHistory: [],
      version,
      targetVersion: version,
      createdAt: stats.birthtime.toISOString(),
      updatedAt: new Date().toISOString(),
      lastSyncAt: null,
      iscScore: null,
      iscReport: null,
      evomapGeneId: null,
      syncStatus: 'pending',
      syncError: null
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
          // 移除引号
          metadata[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    }
    
    return metadata;
  }

  /**
   * 获取或创建技能状态
   * @param {string} skillPath - 技能路径
   * @returns {Object} 技能状态
   */
  getOrCreateState(skillPath) {
    const skillId = path.basename(skillPath);
    const stateFilePath = this.getStateFilePath(skillId);
    
    // 如果状态文件存在，读取并返回
    if (fs.existsSync(stateFilePath)) {
      try {
        const content = fs.readFileSync(stateFilePath, 'utf-8');
        return JSON.parse(content);
      } catch (e) {
        console.error(`[StateManager] 读取状态文件失败: ${stateFilePath}`, e.message);
        // 重建状态
        return this.rebuildStateFromFilesystem(skillPath);
      }
    }
    
    // 创建新状态
    const state = this.rebuildStateFromFilesystem(skillPath);
    this.saveState(state);
    return state;
  }

  /**
   * 保存技能状态
   * @param {Object} state - 技能状态
   */
  saveState(state) {
    const stateFilePath = this.getStateFilePath(state.skillId);
    state.updatedAt = new Date().toISOString();
    
    try {
      fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
      console.error(`[StateManager] 保存状态失败: ${stateFilePath}`, e.message);
      throw e;
    }
  }

  /**
   * 更新技能状态
   * @param {string} skillId - 技能ID
   * @param {Object} updates - 更新内容
   * @returns {Object} 更新后的状态
   */
  updateState(skillId, updates) {
    const stateFilePath = this.getStateFilePath(skillId);
    
    if (!fs.existsSync(stateFilePath)) {
      throw new Error(`状态不存在: ${skillId}`);
    }
    
    const content = fs.readFileSync(stateFilePath, 'utf-8');
    const state = JSON.parse(content);
    
    // 应用更新
    Object.assign(state, updates);
    state.updatedAt = new Date().toISOString();
    
    this.saveState(state);
    return state;
  }

  /**
   * 执行状态流转
   * @param {string} skillId - 技能ID
   * @param {string} targetState - 目标状态
   * @param {string} reason - 流转原因
   * @param {string} triggeredBy - 触发者
   * @returns {Object} 更新后的状态
   */
  transitionState(skillId, targetState, reason = '', triggeredBy = 'system') {
    const state = this.getOrCreateState(this.getSkillPath(skillId));
    const currentState = state.currentState;
    
    // 检查流转是否合法
    const allowedTransitions = STATE_TRANSITIONS[currentState] || [];
    if (!allowedTransitions.includes(targetState)) {
      throw new Error(
        `非法状态流转: ${currentState} -> ${targetState}. ` +
        `允许的流转: ${allowedTransitions.join(', ')}`
      );
    }
    
    // 记录历史
    const transition = {
      from: currentState,
      to: targetState,
      timestamp: new Date().toISOString(),
      reason,
      triggeredBy
    };
    
    state.previousState = currentState;
    state.currentState = targetState;
    state.stateHistory.push(transition);
    
    this.saveState(state);
    
    console.log(`[StateManager] 状态流转: ${skillId} ${currentState} -> ${targetState}`);
    
    return state;
  }

  /**
   * 获取技能路径
   * @param {string} skillId - 技能ID
   * @returns {string} 技能路径
   */
  getSkillPath(skillId) {
    return path.join(require('../../../shared/paths').SKILLS_DIR, skillId);
  }

  /**
   * 获取所有技能状态
   * @returns {Array} 技能状态列表
   */
  getAllStates() {
    if (!fs.existsSync(this.statePath)) {
      return [];
    }
    
    const files = fs.readdirSync(this.statePath);
    const states = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = fs.readFileSync(path.join(this.statePath, file), 'utf-8');
          states.push(JSON.parse(content));
        } catch (e) {
          console.error(`[StateManager] 解析状态文件失败: ${file}`, e.message);
        }
      }
    }
    
    return states;
  }

  /**
   * 按状态筛选技能
   * @param {string} state - 目标状态
   * @returns {Array} 符合条件的技能状态列表
   */
  getStatesByStatus(state) {
    const allStates = this.getAllStates();
    return allStates.filter(s => s.currentState === state);
  }

  /**
   * 删除技能状态
   * @param {string} skillId - 技能ID
   */
  deleteState(skillId) {
    const stateFilePath = this.getStateFilePath(skillId);
    if (fs.existsSync(stateFilePath)) {
      fs.unlinkSync(stateFilePath);
    }
  }

  /**
   * 检查状态流转是否合法
   * @param {string} fromState - 当前状态
   * @param {string} toState - 目标状态
   * @returns {boolean} 是否合法
   */
  isValidTransition(fromState, toState) {
    const allowedTransitions = STATE_TRANSITIONS[fromState] || [];
    return allowedTransitions.includes(toState);
  }

  /**
   * 获取状态统计
   * @returns {Object} 状态统计
   */
  getStateStatistics() {
    const allStates = this.getAllStates();
    const stats = {};
    
    for (const state of Object.values(PIPELINE_STATES)) {
      stats[state] = allStates.filter(s => s.currentState === state).length;
    }
    
    return {
      total: allStates.length,
      byState: stats
    };
  }
}

// 导出
export { StateManager, PIPELINE_STATES, STATE_TRANSITIONS };
export default StateManager;
