import fs from 'node:fs/promises';
import path from 'node:path';
import { csvSkill } from './csv-skill.js';
import { bioinfoSkill } from './bioinfo-skill.js';
import type { Skill, SkillCategory, SkillManifest } from './types.js';

const builtInSkills = new Map<string, Skill>([
  ['csv-skill', csvSkill],
  ['bioinfo-skill', bioinfoSkill],
]);

class SkillRegistry {
  private readonly skills = new Map<string, Skill>();
  private readonly manifests = new Map<string, SkillManifest>();
  private readonly categories = new Map<SkillCategory, string[]>();

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
    const group = this.categories.get(skill.category) || [];
    if (!group.includes(skill.name)) {
      group.push(skill.name);
      this.categories.set(skill.category, group);
    }
  }

  registerManifest(manifest: SkillManifest): void {
    this.manifests.set(manifest.name, manifest);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  getManifest(name: string): SkillManifest | undefined {
    return this.manifests.get(name);
  }
}

export const skillRegistry = new SkillRegistry();

export async function initializeSkills(skillsDir = path.resolve('skills')): Promise<SkillManifest[]> {
  const manifests = await loadSkillsFromDir(skillsDir);

  for (const manifest of manifests) {
    skillRegistry.registerManifest(manifest);
    const runtimeSkill = builtInSkills.get(manifest.name);
    if (runtimeSkill) {
      runtimeSkill.setManifest?.(manifest);
      skillRegistry.register(runtimeSkill);
    }
  }

  if (!skillRegistry.get(csvSkill.name)) {
    skillRegistry.register(csvSkill);
  }

  return manifests;
}

export async function loadSkillsFromDir(skillsDir: string): Promise<SkillManifest[]> {
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    const manifests: SkillManifest[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
      try {
        const content = await fs.readFile(skillFile, 'utf8');
        const manifest = parseManifest(content);
        if (manifest?.name) {
          manifests.push(manifest);
        }
      } catch {
        // ignore missing or invalid manifests
      }
    }

    return manifests;
  } catch {
    return [];
  }
}

function parseManifest(content: string): SkillManifest | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return null;
  }

  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; target: Record<string, unknown> }> = [{ indent: -1, target: root }];

  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }

    const parsed = line.match(/^(\s*)([A-Za-z0-9_]+):\s*(.*)$/);
    if (!parsed) {
      continue;
    }

    const indent = parsed[1].length;
    const key = parsed[2];
    const rawValue = parsed[3];

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].target;
    if (!rawValue) {
      const target: Record<string, unknown> = {};
      parent[key] = target;
      stack.push({ indent, target });
      continue;
    }

    parent[key] = parseScalar(rawValue);
  }

  return root as SkillManifest;
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.replace(/^['"]|['"]$/g, ''));
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  const numberValue = Number(trimmed);
  if (!Number.isNaN(numberValue) && trimmed !== '') {
    return numberValue;
  }

  return trimmed;
}

export * from './types.js';
export * from './base.js';
