export type SkillCategory =
  | 'data-io'
  | 'data-process'
  | 'ml'
  | 'bioinfo'
  | 'visualization'
  | 'analysis'
  | 'integration';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface SkillCapabilities {
  formats: string[];
  operations: string[];
}

export interface SkillDependencies {
  python?: string[];
  node?: string[];
  system?: string[];
}

export interface SkillManifest {
  name: string;
  displayName?: string;
  description?: string;
  version?: string;
  category?: SkillCategory;
  metadata?: {
    formats?: string[];
    operations?: string[];
  };
}

export interface Skill {
  name: string;
  displayName: string;
  description: string;
  version: string;
  category: SkillCategory;
  capabilities: SkillCapabilities;
  dependencies: SkillDependencies;
  tools: ToolDefinition[];
  manifest?: SkillManifest;
  setManifest?(manifest: SkillManifest): void;
  checkDependencies?(): Promise<boolean>;
  execute(toolName: string, params: Record<string, unknown>): Promise<unknown>;
}
