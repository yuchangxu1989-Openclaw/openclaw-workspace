/**
 * Skill Registry Wrapper
 * 包装技能注册逻辑，自动触发事件发布
 */

const EventPublisher = require('./event-publisher');

class SkillRegistryWrapper {
  constructor(eventPublisher) {
    this.eventPublisher = eventPublisher;
    this.skills = new Map();
  }

  /**
   * 注册技能
   */
  async registerSkill(skillInfo) {
    const {
      skillId,
      skillName,
      skillPath,
      version = '1.0.0',
      metadata = {}
    } = skillInfo;

    // 存储技能信息
    this.skills.set(skillId, {
      ...skillInfo,
      registeredAt: new Date().toISOString()
    });

    console.log(`[SkillRegistry] 注册技能: ${skillName} v${version}`);

    // 发布 skill.registered 事件
    await this.eventPublisher.publishEvent('skill.registered', {
      skillId,
      skillName,
      skillPath,
      version,
      metadata,
      timestamp: new Date().toISOString()
    });

    return { success: true, skillId };
  }

  /**
   * 更新技能
   */
  async updateSkill(skillId, updates) {
    const existing = this.skills.get(skillId);
    
    if (!existing) {
      throw new Error(`技能不存在: ${skillId}`);
    }

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.skills.set(skillId, updated);

    console.log(`[SkillRegistry] 更新技能: ${updated.skillName} v${updated.version}`);

    // 发布 skill.updated 事件
    await this.eventPublisher.publishEvent('skill.updated', {
      skillId,
      skillName: updated.skillName,
      skillPath: updated.skillPath,
      version: updated.version,
      changes: updates,
      metadata: updated.metadata,
      timestamp: new Date().toISOString()
    });

    return { success: true, skillId };
  }

  /**
   * 获取技能信息
   */
  getSkill(skillId) {
    return this.skills.get(skillId);
  }

  /**
   * 列出所有技能
   */
  listSkills() {
    return Array.from(this.skills.values());
  }
}

module.exports = SkillRegistryWrapper;
