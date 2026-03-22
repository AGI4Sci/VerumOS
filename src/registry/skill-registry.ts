/**
 * Skill Registry - Skill 注册表
 *
 * 职责：
 * - 注册 Skill
 * - 查找 Skill
 * - 列出所有可用 Skill
 */

import type { Skill } from '../skills/types.js';

export class SkillRegistry {
  private skills = new Map<string, Skill>();

  /**
   * 注册 Skill
   */
  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  /**
   * 获取 Skill
   */
  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * 检查 Skill 是否存在
   */
  hasSkill(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * 获取所有 Skill
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * 获取所有 Skill 名称
   */
  getSkillNames(): string[] {
    return Array.from(this.skills.keys());
  }
}