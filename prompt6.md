# VerumOS 重构计划 - Phase 6

## 问题描述

当前 Data Agent 混合了配置和业务逻辑：
- `DataAgentProcessor` 类包含大量业务逻辑（意图分析、上传处理、合并处理等）
- `createDataAgentConfig(context)` 动态创建工具，不符合声明式设计
- 意图处理逻辑在 `processMessage` 方法中，应该由 AgentLoop 统一处理

## 目标

按照 debug.md 的设计：
- Application 层 agent 是纯配置文件，导出一个 `AgentDef` 对象
- 没有 class，没有 import 自 core 内部模块，没有运行时状态
- 个性化行为通过 `hooks` 表达

## 修改步骤

### 1. 定义纯配置的 DataAgentDef

```typescript
// src/agents/data-agent.ts
export const DataAgentDef: AgentDef = {
  id: 'data-agent',
  name: 'Data Agent',
  description: '负责数据文件的上传、探索、清洗、转换和合并。处理 CSV、Excel、单细胞表达矩阵等格式。',
  
  systemPrompt: `你是一个数据分析助手...`,
  
  skills: ['csv-skill', 'bioinfo-skill'],
  
  routes: [
    { match: { intent: ['upload', 'explore', 'transform', 'merge'] }, priority: 10 },
    { match: { pattern: /上传|加载|读取|导入|file|csv|xlsx/i }, priority: 5 },
  ],
  
  memoryPolicy: {
    workingMemory: { maxTokens: 40000 },
    jobMemory: { includeDatasetMeta: true, includeRecentTraces: 5 },
  },
  
  hooks: {
    convertToLlm: (messages) => messages.filter(m => ['user', 'assistant', 'tool'].includes(m.role)),
    beforeTurn: async (ctx) => {
      if (ctx.activeDatasetId) {
        ctx.systemPromptSuffix = `\n当前数据集：${ctx.activeDatasetId}`;
      }
      return ctx;
    },
  },
};
```

### 2. 将业务逻辑迁移到 Tools

当前 `DataAgentProcessor` 的方法需要迁移：

| 方法 | 迁移到 |
|------|--------|
| `handleUpload` | `upload_file` Tool（csv-skill 已有 `read_file`） |
| `handleExplore` | `explore_data` Tool（csv-skill 已有） |
| `handleTransform` | `transform_data` Tool（csv-skill 已有） |
| `handleMerge` | `merge_data` Tool（csv-skill 已有） |
| `handleRequirementDiscuss` | `requirement` Tool（新增，或使用现有逻辑） |
| `handleExecute` | `execute_analysis` Tool（新增） |
| `handleQuestion` | 直接由 LLM 回答 |

### 3. 简化 data-agent.ts

保留向后兼容的导出：
- `dataAgentMeta` - 元数据
- `dataAgent` - 旧版 Agent 对象（兼容）
- `DataAgentDef` - 新版 AgentDef（推荐）

### 4. 更新 AgentLoop

确保 AgentLoop 能正确处理 AgentDef：
- 从 SkillRegistry 解析 skills
- 调用 hooks
- 发布事件到 EventBus

## 文件变更

- 重构 `src/agents/data-agent.ts`
- 修改 `src/runtime/agent-loop.ts`
- 可能需要修改 `src/skills/csv-skill.ts` 添加缺失的 Tools

## 测试验证

- [ ] 编译通过
- [ ] 现有功能运行正常
- [ ] 端到端测试通过
- [ ] 上传、探索、需求讨论、执行分析正常

## 收尾工作

- [ ] 更新 README.md
- [ ] Git commit
- [ ] push to remote
