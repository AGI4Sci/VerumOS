# VerumOS 重构计划 - Phase 1

## 问题描述

当前代码与 debug.md 描述的目标架构存在以下差距：

1. **Agent 混合配置与业务逻辑**：`data-agent.ts` 中 `DataAgentProcessor` 类包含大量业务逻辑（意图分析、上传处理、合并处理等），不符合"应用层 agent 零执行逻辑"原则
2. **缺少核心类型定义**：没有统一的 `AgentDef` 类型作为跨层合同
3. **SkillRegistry 功能不完整**：缺少 `resolve` 方法将 skill 解析为 tools + SKILL.md
4. **缺少 Router**：意图路由逻辑散落在 DataAgentProcessor 中
5. **缺少 Memory 层**：消息截断、job 上下文注入等逻辑分散
6. **缺少 EventBus**：事件发布/订阅机制未实现

## 目标架构（来自 debug.md）

```
┌──────────────────────────────────────────────────────────────┐
│                      Application Layer                        │
│   DataAgentDef     ModelAgentDef     AnalysisAgentDef  ...   │
│            每个 agent 只是一个 AgentDef 配置对象              │
└───────────────────────────┬──────────────────────────────────┘
                            │ AgentDef（唯一跨层接口）
┌───────────────────────────▼──────────────────────────────────┐
│                         Core Layer                            │
│  Router → AgentLoop → Memory, ToolRegistry, SkillRegistry    │
│  JobManager, EventBus, LLMClient                              │
└──────────────────────────────────────────────────────────────┘
```

## 分阶段计划

### Prompt 1（本阶段）：类型定义先行

**目标**：在 `src/core/types.ts` 中建立核心类型基础，不动现有逻辑。

**新增类型**：
- `AgentDef`：唯一跨层合同
- `MemoryPolicy`：记忆策略
- `AgentContext`：运行时上下文
- `AgentEvent`：事件类型
- `RouteRule`：路由规则
- `ToolDef`：工具定义

**文件变更**：
- 新建 `src/core/types.ts`

### Prompt 2：提取 SkillRegistry

**目标**：把 `csv-skill` 和 `bioinfo-skill` 改为注册到 SkillRegistry，添加 `resolve` 方法。

**文件变更**：
- 修改 `src/registry/skill-registry.ts`
- 修改 `src/skills/csv-skill.ts`、`src/skills/bioinfo-skill.ts`
- 新建 `src/core/registry/tool-registry.ts`

### Prompt 3：抽象 Memory 层

**目标**：把消息历史、job 状态封装进 `MemoryManager`。

**文件变更**：
- 新建 `src/core/memory/index.ts`
- 新建 `src/core/memory/working-memory.ts`
- 新建 `src/core/memory/job-memory.ts`

### Prompt 4：重构 Router

**目标**：实现两级路由（规则路由 + LLM 语义路由）。

**文件变更**：
- 新建 `src/core/router.ts`
- 修改 `src/runtime/intent-classifier.ts`

### Prompt 5：EventBus 接入

**目标**：实现事件发布/订阅机制，把 WebSocket 推送、快照触发改为订阅模式。

**文件变更**：
- 新建 `src/core/event-bus.ts`
- 修改 `src/runtime/agent-loop.ts`
- 修改 `src/ws/` 目录

### Prompt 6：应用层 Agent 纯化

**目标**：把 `DataAgentDef` 改为纯配置对象，业务逻辑移入 Core 模块。

**文件变更**：
- 重构 `src/agents/data-agent.ts`
- 修改 `src/runtime/agent-loop.ts`

---

## Prompt 1 详细设计

### 1. 核心类型定义

```typescript
// src/core/types.ts

/**
 * Agent 定义 - 唯一跨层合同
 */
export interface AgentDef {
  // 身份
  id: string;
  name: string;
  description: string;          // Router 语义匹配用

  // 行为
  systemPrompt: string;
  skills: string[];             // skill id 列表
  tools?: ToolDef[];            // agent 私有工具（可选）

  // 路由
  routes?: RouteRule[];         // 应用层固定路由规则

  // 记忆策略
  memoryPolicy?: MemoryPolicy;

  // 生命周期钩子
  hooks?: AgentHooks;
}

/**
 * 路由规则
 */
export interface RouteRule {
  match: {
    intent?: string[];          // 精确意图匹配
    pattern?: RegExp;           // 正则匹配
    condition?: (msg: string, ctx: SessionContext) => boolean;
  };
  priority?: number;            // 数值越大优先级越高，默认 0
}

/**
 * 记忆策略
 */
export interface MemoryPolicy {
  workingMemory?: {
    maxMessages?: number;       // 保留最近 N 条消息
    maxTokens?: number;         // token 预算上限
  };
  jobMemory?: {
    includeDatasetMeta?: boolean;
    includeRequirementDoc?: boolean;
    includeRecentTraces?: number;
  };
  longTermMemory?: {
    enabled?: boolean;
    topK?: number;
  };
}

/**
 * Agent 钩子
 */
export interface AgentHooks {
  beforeTurn?: (ctx: AgentContext) => Promise<AgentContext>;
  afterToolCall?: (result: ToolResult, ctx: AgentContext) => Promise<void>;
  convertToLlm?: (messages: Message[]) => Message[];
}

/**
 * 工具定义
 */
export interface ToolDef {
  name: string;
  description: string;
  parameters: JSONSchema;       // JSON Schema
  execute: (params: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

/**
 * 工具上下文
 */
export interface ToolContext {
  jobId: string;
  sessionId: string;
  datasets: Map<string, Dataset>;
  activeDatasetId?: string;
}

/**
 * Agent 运行时上下文
 */
export interface AgentContext {
  jobId: string;
  sessionId: string;
  messages: Message[];
  datasets: Map<string, Dataset>;
  activeDatasetId?: string;
  systemPromptSuffix?: string;
}

/**
 * 消息
 */
export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

/**
 * 工具调用
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * 工具结果
 */
export interface ToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  error?: string;
}

/**
 * Agent 事件类型
 */
export type AgentEventType =
  | 'agent_start' | 'agent_end'
  | 'turn_start' | 'turn_end'
  | 'message_start' | 'message_update' | 'message_end'
  | 'tool_execution_start' | 'tool_execution_end' | 'tool_result'
  | 'requirement.saved'
  | 'analysis.before_execute' | 'analysis.after_execute'
  | 'file.uploaded'
  | 'error';

/**
 * Agent 事件
 */
export interface AgentEvent<T = unknown> {
  type: AgentEventType;
  timestamp: string;
  jobId?: string;
  sessionId?: string;
  data?: T;
}

/**
 * 路由结果
 */
export interface RouterResult {
  agentId: string;
  matchedBy: 'rule' | 'llm' | 'default';
  confidence?: number;
}

/**
 * 会话上下文
 */
export interface SessionContext {
  sessionId: string;
  jobId?: string;
  messages: Message[];
  datasets: Map<string, Dataset>;
  activeDatasetId?: string;
}
```

### 2. 文件结构

```
src/
├── core/
│   └── types.ts        # 新建：核心类型定义
├── agents/
│   └── data-agent.ts   # 保持不变（后续阶段重构）
└── runtime/
    └── agent-loop.ts   # 保持不变
```

### 3. 测试验证

- [ ] 类型定义无语法错误
- [ ] 现有代码编译通过
- [ ] 现有功能运行正常

### 4. 收尾工作

- [ ] 更新 README.md 说明新增的类型定义
- [ ] Git commit
