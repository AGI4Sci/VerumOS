/**
 * Skill Registry - Skill 注册表
 *
 * 职责：
 * - 注册 Skill
 * - 查找 Skill
 * - 列出所有可用 Skill
 * - 解析 Skill 到 Tools + SKILL.md 文档
 *
 * Skill 是工具包，Tool 是原子操作。
 * SkillRegistry 根据 AgentDef 声明的 skills 列表，返回对应的 Tool 集合和 SKILL.md 内容。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Skill } from '../skills/types.js';
import type { ToolDef, SkillDef } from '../core/types.js';

export class SkillRegistry {
  private skills = new Map<string, Skill>();
  private skillDefs = new Map<string, SkillDef>();
  private skillMdCache = new Map<string, string>();

  /**
   * 注册 Skill（旧版接口，兼容现有代码）
   */
  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
    // 同时转换为 SkillDef 格式
    this.skillDefs.set(skill.name, this.skillToDef(skill));
  }

  /**
   * 注册 SkillDef（新版接口）
   */
  registerDef(skillDef: SkillDef): void {
    this.skillDefs.set(skillDef.id, skillDef);
  }

  /**
   * 获取 Skill
   */
  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * 获取 SkillDef
   */
  getSkillDef(id: string): SkillDef | undefined {
    return this.skillDefs.get(id);
  }

  /**
   * 检查 Skill 是否存在
   */
  hasSkill(name: string): boolean {
    return this.skills.has(name) || this.skillDefs.has(name);
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
    return Array.from(new Set([...this.skills.keys(), ...this.skillDefs.keys()]));
  }

  /**
   * 解析 Skill ID 列表为 Tools + SKILL.md 文档
   *
   * 这是 SkillRegistry 的核心方法：
   * - 根据 AgentDef.skills 声明，返回对应的 Tool 集合
   * - 读取 SKILL.md 内容，由 AgentLoop 追加到 system prompt
   */
  async resolve(skillIds: string[]): Promise<{ tools: ToolDef[]; skillDocs: string[] }> {
    const tools: ToolDef[] = [];
    const skillDocs: string[] = [];

    for (const skillId of skillIds) {
      // 优先使用 SkillDef
      const skillDef = this.skillDefs.get(skillId);
      if (skillDef) {
        tools.push(...skillDef.tools);

        // 读取 SKILL.md
        if (skillDef.skillMdPath) {
          const doc = await this.loadSkillMd(skillDef.skillMdPath);
          if (doc) {
            skillDocs.push(doc);
          }
        }
        continue;
      }

      // 回退到旧版 Skill
      const skill = this.skills.get(skillId);
      if (skill) {
        const toolDefs = this.skillToolsToDefs(skill);
        tools.push(...toolDefs);
      }
    }

    return { tools, skillDocs };
  }

  /**
   * 将 Skill 转换为 SkillDef
   */
  private skillToDef(skill: Skill): SkillDef {
    return {
      id: skill.name,
      name: skill.name,
      description: skill.description,
      skillMdPath: `./skills/${skill.name}/SKILL.md`,
      tools: this.skillToolsToDefs(skill),
    };
  }

  /**
   * 将 Skill.tools 转换为 ToolDef[]
   */
  private skillToolsToDefs(skill: Skill): ToolDef[] {
    return skill.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      execute: async (params: Record<string, unknown>) => {
        return skill.execute(tool.name, params);
      },
    }));
  }

  /**
   * 加载 SKILL.md 文件
   */
  private async loadSkillMd(skillMdPath: string): Promise<string | null> {
    // 检查缓存
    if (this.skillMdCache.has(skillMdPath)) {
      return this.skillMdCache.get(skillMdPath)!;
    }

    try {
      const absolutePath = path.isAbsolute(skillMdPath)
        ? skillMdPath
        : path.resolve(skillMdPath);

      const content = await fs.readFile(absolutePath, 'utf-8');
      this.skillMdCache.set(skillMdPath, content);
      return content;
    } catch {
      return null;
    }
  }

  /**
   * 清除 SKILL.md 缓存
   */
  clearCache(): void {
    this.skillMdCache.clear();
  }
}