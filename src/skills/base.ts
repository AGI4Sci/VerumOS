import type { Skill, SkillCapabilities, SkillDependencies, SkillManifest, ToolDefinition, SkillCategory } from './types.js';

export abstract class BaseSkill implements Skill {
  abstract name: string;
  abstract displayName: string;
  abstract description: string;
  abstract version: string;
  abstract category: SkillCategory;
  abstract capabilities: SkillCapabilities;
  abstract dependencies: SkillDependencies;
  abstract tools: ToolDefinition[];

  manifest?: SkillManifest;

  setManifest(manifest: SkillManifest): void {
    this.manifest = manifest;
  }

  async checkDependencies(): Promise<boolean> {
    return true;
  }

  abstract execute(toolName: string, params: Record<string, unknown>): Promise<unknown>;
}
