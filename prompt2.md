# VerumOS 重构计划 - Phase 2

## 问题描述

当前 SkillRegistry 功能不完整：
- 只有简单的 `register`、`getSkill`、`getAllSkills` 方法
- 缺少 `resolve` 方法将 skill id 列表解析为 tools + SKILL.md 内容
- csv-skill 和 bioinfo-skill 直接被 data-agent.ts import，没有通过注册表管理

## 目标

按照 debug.md 的设计：
- Skill 是工具包，Tool 是原子操作
- SkillRegistry 根据 AgentDef 声明的 skills 列表，返回对应的 Tool 集合和 SKILL.md 内容
- SKILL.md 由 AgentLoop 追加到 system prompt

## 修改步骤

### 1. 修改 SkillRegistry

添加 `resolve` 方法：

```typescript
interface SkillRegistry {
  register(skill: SkillDef): void;
  resolve(skillIds: string[]): { tools: ToolDef[]; skillDocs: string[] };
}
```

### 2. 重构 csv-skill 和 bioinfo-skill

改为导出 SkillDef 格式：

```typescript
// src/skills/csv-skill.ts
export const csvSkillDef: SkillDef = {
  id: 'csv-skill',
  name: 'csv-skill',
  description: 'CSV/TSV/Excel 文件处理',
  skillMdPath: './skills/csv-skill/SKILL.md',
  tools: [readFileTool, exploreDataTool, transformDataTool, mergeDataTool, transposeTool],
};
```

### 3. 新建 ToolRegistry

管理所有 Tool 的执行函数：

```typescript
interface ToolRegistry {
  register(tool: ToolDef): void;
  getTool(name: string): ToolDef | undefined;
  execute(toolCall: ToolCall, ctx: ToolContext): Promise<ToolResult>;
}
```

### 4. 修改 data-agent.ts

- 从直接 import skill 改为声明 `skills: ['csv-skill', 'bioinfo-skill']`
- 工具创建从 `createDataAgentTools(context)` 改为从 SkillRegistry 解析

## 文件变更

- 修改 `src/registry/skill-registry.ts`
- 新建 `src/core/registry/tool-registry.ts`
- 修改 `src/skills/csv-skill.ts`
- 修改 `src/skills/bioinfo-skill.ts`
- 修改 `src/agents/data-agent.ts`
- 修改 `src/skills/index.ts`

## 测试验证

- [ ] 编译通过
- [ ] 现有功能运行正常
- [ ] Skill 注册和解析正确
- [ ] Tool 执行正确

## 收尾工作

- [ ] 更新 README.md
- [ ] Git commit
