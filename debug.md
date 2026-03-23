# VerumOS · Architecture Design

> 本文档描述 VerumOS 的目标架构设计，作为后续重构和新功能开发的参考基准。

---

## 一、设计原则

在讨论具体模块之前，先确立几条贯穿整个架构的原则。所有模块级决策都应回归到这些原则来判断。

**1. 纵向分层，单向依赖**
架构分为 Core 层和 Application 层。Application 层依赖 Core 层，Core 层对 Application 层一无所知。任何反向 import 都是架构违规。

**2. `AgentDef` 是唯一跨层合同**
Application 层 agent 只输出一个 `AgentDef` 配置对象。Core 层只消费 `AgentDef`。两层之间除此之外没有任何共享代码或直接调用。

**3. 应用层 agent 零执行逻辑、零状态**
Agent 文件只是配置声明，不含 class，不含 import 自 Core 内部模块，不持有运行时状态。个性化行为通过 `hooks` 表达。

**4. Core 模块横向独立**
`Memory`、`ToolRegistry`、`SkillRegistry`、`JobManager`、`EventBus`、`LLMClient` 彼此不互相 import。它们只被 `AgentLoop` 组合调用。可以单独替换任意一个而不影响其他模块。

**5. EventBus 是观测旁路，不是控制流**
核心状态变更走直接调用，EventBus 是这些调用完成后的"影子发布"。扩展点订阅 Bus，主路径不依赖 Bus。

**6. Skill 是工具包，Tool 是原子操作**
Tool 是 LLM 可 `function_call` 的最小单元。Skill 是一组相关 Tool 的集合 + `SKILL.md` 使用说明文档，由 `SkillRegistry` 统一管理，不私有于某个 agent。

---

## 二、整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                      Application Layer                        │
│                                                               │
│   DataAgentDef     ModelAgentDef     AnalysisAgentDef  ...   │
│                                                               │
│            每个 agent 只是一个 AgentDef 配置对象              │
└───────────────────────────┬──────────────────────────────────┘
                            │ AgentDef（唯一跨层接口）
┌───────────────────────────▼──────────────────────────────────┐
│                         Core Layer                            │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                      Router                           │    │
│  │      规则路由（优先）→ LLM 语义路由（fallback）        │    │
│  └─────────────────────────┬────────────────────────────┘    │
│                            │                                  │
│  ┌─────────────────────────▼────────────────────────────┐    │
│  │                    AgentLoop                          │    │
│  │             核心执行引擎（async generator）            │    │
│  └──┬──────────┬─────────────┬──────────┬───────────────┘    │
│     │          │             │          │                     │
│  Memory  ToolRegistry  SkillRegistry  JobManager              │
│                                                               │
│  LLMClient                EventBus                           │
└──────────────────────────────────────────────────────────────┘
```

---

## 三、AgentDef —— 跨层合同

`AgentDef` 是整个架构最重要的类型定义，也是唯一在两层之间流动的数据结构。

```typescript
interface AgentDef {
  // 身份
  id: string
  name: string
  description: string          // Router 语义匹配用，自然语言描述能力边界

  // 行为
  systemPrompt: string
  skills: string[]             // skill id 列表，从 SkillRegistry 解析
  tools?: ToolDef[]            // agent 私有工具（可选，不经过 SkillRegistry）

  // 路由
  routes?: RouteRule[]         // 应用层固定路由规则（优先于语义路由）

  // 记忆策略
  memoryPolicy?: MemoryPolicy  // 声明需要哪些 memory，由 AgentLoop 负责注入

  // 生命周期钩子（agent 个性化逻辑的唯一出口）
  hooks?: {
    beforeTurn?: (ctx: AgentContext) => Promise<AgentContext>
    afterToolCall?: (result: ToolResult, ctx: AgentContext) => Promise<void>
    convertToLlm?: (messages: Message[]) => Message[]  // 上下文压缩策略
  }
}
```

### 路由规则

```typescript
interface RouteRule {
  match: {
    intent?: string[]          // 精确意图匹配
    pattern?: RegExp           // 正则匹配
    condition?: (msg: string, ctx: SessionContext) => boolean
  }
  priority?: number            // 数值越大优先级越高，默认 0
}
```

### 记忆策略

```typescript
interface MemoryPolicy {
  workingMemory?: {
    maxMessages?: number       // 保留最近 N 条消息
    maxTokens?: number         // token 预算上限
  }
  jobMemory?: {
    includeDatasetMeta?: boolean
    includeRequirementDoc?: boolean
    includeRecentTraces?: number   // 保留最近 N 条执行轨迹
  }
  longTermMemory?: {
    enabled?: boolean
    topK?: number              // 检索最相关的 K 条记忆
  }
}
```

---

## 四、Core 层模块详解

### 4.1 Router

Router 是请求进入 AgentLoop 之前的唯一分发点。

**两级路由，串行执行：**

```
用户消息
   │
   ▼
[1] 规则路由（从所有 AgentDef.routes 汇总而来）
   │  命中 → 返回 agentId
   │  未命中
   ▼
[2] LLM 语义路由（core 层内置 fallback）
       输入：用户消息 + 每个 agent 的 description
       输出：agentId + confidence
   │  命中 → 返回 agentId
   │  未命中
   ▼
[3] 默认 agent 或 fallback 错误
```

**设计要点：**

- 规则路由的配置来源是 AgentRegistry 在启动时从所有 AgentDef 汇总的 `routes` 字段，不是单独的全局配置文件
- LLM 语义路由只有一次 LLM 调用，输出严格 JSON，不进入 AgentLoop
- Session 级路由锁定：session 确定 agent 后，后续轮次默认复用，除非用户明确切换或 agent 声明 `allowHandoff: true`

```typescript
interface RouterResult {
  agentId: string
  matchedBy: 'rule' | 'llm' | 'default'
  confidence?: number
}
```

---

### 4.2 AgentLoop

AgentLoop 是纯执行引擎，一个 async generator。它不知道自己在跑哪个 agent，只知道如何执行一个 `AgentDef`。

```typescript
async function* agentLoop(
  agentDef: AgentDef,
  messages: Message[],
  context: AgentContext,
  services: CoreServices,
): AsyncGenerator<AgentEvent>

// CoreServices 是所有 core 模块的注入容器，AgentLoop 不自己 import 任何 core 模块
interface CoreServices {
  memory: MemoryManager
  toolRegistry: ToolRegistry
  skillRegistry: SkillRegistry
  jobManager: JobManager
  llmClient: LLMClient
  eventBus: EventBus
}
```

**每轮执行顺序：**

```
1. beforeTurn hook（如果 AgentDef 声明了）
   ↓
2. Memory.assemble(policy, jobId) → 注入截断后的消息历史 + job 上下文
   ↓
3. SkillRegistry.resolve(skills) → 注入工具列表 + SKILL.md 到 system prompt
   ↓
4. LLMClient.stream(messages, tools)
      emit: message_start → message_update（流式）→ message_end
   ↓
5. 如果 LLM 输出了 tool_call：
      emit: tool_execution_start
      ToolRegistry.execute(toolCall)
      afterToolCall hook
      emit: tool_result
      → 回到步骤 4
   ↓
6. 无 tool_call，本轮结束
      JobManager.appendTrace(jobId, traceEntry)
      JobManager.update(jobId, newState)
      emit: agent_end
```

**AgentLoop 明确不负责：**
路由决策、快照触发、WebSocket 推送、Session 管理。

---

### 4.3 Memory

Memory 分三层，各自独立，统一通过 `MemoryManager` 接口访问。

```
┌──────────────────────────────────────────────────┐
│                  MemoryManager                    │
│   assemble(policy, jobId, messages): MemoryBundle │
└────────────┬──────────────────┬───────────────────┘
             │                  │                │
      WorkingMemory         JobMemory      LongTermMemory
      （消息历史）        （job 结构化状态） （跨 job 向量检索）
```

**WorkingMemory**
存储当前 session 的完整消息历史，按 `memoryPolicy.workingMemory` 的 token 预算截断。截断策略：优先保留 system prompt 和最新用户消息，中间的 assistant 消息可截断。

**JobMemory**
从 `job.json` 读取结构化状态，以格式化文本块的形式注入 context，不是原始 JSON。由 AgentLoop 按 `memoryPolicy.jobMemory` 声明决定注入哪些字段（数据集元信息、需求文档、最近 N 条 traces）。

**LongTermMemory**（Phase 2，接口预留）
跨 job 向量索引，存储历史分析方案和用户偏好。Phase 1 实现为空返回。

```typescript
interface MemoryManager {
  assemble(policy: MemoryPolicy, jobId: string, messages: Message[]): Promise<MemoryBundle>
  appendTrace(jobId: string, trace: TraceEntry): Promise<void>
}

interface MemoryBundle {
  truncatedMessages: Message[]   // 处理过 token 预算的消息历史
  jobContext?: string            // 格式化的 job 状态文本块（注入 system prompt）
  longTermContext?: string       // 格式化的长期记忆文本块
}
```

---

### 4.4 SkillRegistry + ToolRegistry

**边界定义：**

| 概念 | 定义 | 管理者 |
|------|------|--------|
| Tool | LLM 可 `function_call` 的原子操作，有严格 JSON Schema | ToolRegistry |
| Skill | 一组相关 Tool + `SKILL.md` 使用说明文档 | SkillRegistry |

**SkillRegistry** 根据 AgentDef 声明的 `skills` 列表，返回对应的 Tool 集合和 SKILL.md 内容。SKILL.md 由 AgentLoop 追加到 system prompt，告诉 LLM 这组工具的使用场景和组合方式。

**ToolRegistry** 管理所有 Tool 的执行函数。AgentLoop 发现 LLM 输出 `tool_call` 时，从 ToolRegistry 查找并执行。

```typescript
// Skill 注册示例
skillRegistry.register({
  id: 'csv-skill',
  description: 'CSV/TSV/Excel 文件处理',
  skillMdPath: './skills/csv-skill/SKILL.md',
  tools: [readFileTool, exploreDataTool, transformDataTool, mergeDataTool, transposeTool],
})

// Agent 声明使用（不 import skill 实现）
export const DataAgentDef: AgentDef = {
  id: 'data-agent',
  skills: ['csv-skill', 'bioinfo-skill'],
  // ...
}

// AgentLoop 内部解析（对 agent 完全透明）
const { tools, skillDocs } = skillRegistry.resolve(agentDef.skills)
```

---

### 4.5 JobManager

JobManager 是任务生命周期和持久化的唯一入口。所有对 `job.json` 的读写都经过 JobManager，其他模块不直接操作文件系统。

```typescript
interface JobManager {
  create(params: CreateJobParams): Promise<Job>
  get(jobId: string): Promise<Job>
  update(jobId: string, patch: Partial<JobState>): Promise<void>
  appendTrace(jobId: string, entry: TraceEntry): Promise<void>
  createSnapshot(jobId: string, trigger: SnapshotTrigger): Promise<Snapshot>
  revertToSnapshot(jobId: string, snapId: string): Promise<void>
  list(): Promise<JobSummary[]>
}
```

**快照触发来源（通过 EventBus 解耦）**

JobManager 在启动时向 EventBus 注册以下订阅，自动触发快照，不需要 routes 层或 AgentLoop 主动调用：

| 事件 | 快照触发时机 |
|------|------------|
| `requirement.saved` | 需求文档保存后 |
| `analysis.before_execute` | 执行分析前 |
| `analysis.after_execute` | 执行分析后 |
| `file.uploaded` | 文件上传后 |

这是 EventBus 在本项目最核心的使用场景：快照逻辑与执行逻辑完全解耦。

---

### 4.6 EventBus

EventBus 是观测层和扩展点，不参与控制流。

**架构位置：**
```
AgentLoop ──直接调用──▶ JobManager（状态变更，主路径）
AgentLoop ──发布事件──▶ EventBus ──▶ 订阅者（WebSocket、快照、日志）
```

```typescript
interface EventBus {
  publish<T>(event: AgentEvent<T>): void
  subscribe<T>(type: string, handler: (event: AgentEvent<T>) => void): Unsubscribe
}

type AgentEventType =
  | 'agent_start' | 'agent_end'
  | 'turn_start'  | 'turn_end'
  | 'message_start' | 'message_update' | 'message_end'
  | 'tool_execution_start' | 'tool_execution_end' | 'tool_result'
  | 'requirement.saved'
  | 'analysis.before_execute' | 'analysis.after_execute'
  | 'file.uploaded'
  | 'error'
```

**Core 层内置订阅者：**

| 订阅者 | 订阅事件 | 职责 |
|--------|----------|------|
| WsPublisher | 全部事件 | 推送到 WebSocket 客户端 |
| JobManager | 快照触发事件 | 自动创建快照 |
| TraceRecorder | tool 相关事件 | 追加执行轨迹到 job.json |

未来的 meta agent 监控、外部分析工具、审计日志均通过订阅 EventBus 接入，不修改 Core 任何代码。

---

### 4.7 LLMClient

LLM 调用的统一抽象，隔离具体模型 API 的差异。换模型提供商只需替换 LLMClient 实现。

```typescript
interface LLMClient {
  stream(params: LLMParams): AsyncGenerator<LLMStreamChunk>
  call(params: LLMParams): Promise<LLMResponse>
}

interface LLMParams {
  messages: Message[]
  tools?: ToolDef[]
  model?: string         // 不指定则使用环境变量默认值
  maxTokens?: number
}
```

---

## 五、Application 层

Application 层的每个 agent 是一个纯配置文件，导出一个 `AgentDef` 对象。没有 class，没有 import 自 core 内部模块，没有运行时状态。

### DataAgent

```typescript
// src/agents/data-agent.ts
import type { AgentDef } from '../core/types'

export const DataAgentDef: AgentDef = {
  id: 'data-agent',
  name: 'Data Agent',
  description: '负责数据文件的上传、探索、清洗、转换和合并。处理 CSV、Excel、单细胞表达矩阵等格式。',

  systemPrompt: `你是一个数据分析助手，专注于数据探索和预处理。
当用户上传数据时，主动探索数据结构并给出质量报告。
使用工具前先告诉用户你要做什么。`,

  skills: ['csv-skill', 'bioinfo-skill'],

  routes: [
    { match: { intent: ['upload', 'explore', 'transform', 'merge'] }, priority: 10 },
    { match: { pattern: /上传|读取|探索|清洗|转换|合并|数据集/ }, priority: 5 },
  ],

  memoryPolicy: {
    workingMemory: { maxTokens: 40000 },
    jobMemory: {
      includeDatasetMeta: true,
      includeRequirementDoc: false,
      includeRecentTraces: 5,
    },
  },

  hooks: {
    convertToLlm: (messages) =>
      messages.filter(m => ['user', 'assistant', 'tool'].includes(m.role)),

    beforeTurn: async (ctx) => {
      if (ctx.jobState?.activeDataset) {
        ctx.systemPromptSuffix = `\n当前数据集：${ctx.jobState.activeDataset.summary}`
      }
      return ctx
    },
  },
}
```

### AnalysisAgent（占位）

```typescript
// src/agents/analysis-agent.ts
export const AnalysisAgentDef: AgentDef = {
  id: 'analysis-agent',
  name: 'Analysis Agent',
  description: '负责统计分析、机器学习建模、可视化图表生成。在数据预处理完成后接手分析工作。',
  systemPrompt: `你是一个生物信息学分析专家...`,
  skills: ['bioinfo-skill', 'visualization-skill'],
  routes: [
    { match: { intent: ['analyze', 'visualize', 'model'] }, priority: 10 },
    { match: { pattern: /分析|聚类|降维|差异表达|可视化|画图/ }, priority: 5 },
  ],
  memoryPolicy: {
    workingMemory: { maxTokens: 60000 },
    jobMemory: {
      includeDatasetMeta: true,
      includeRequirementDoc: true,
      includeRecentTraces: 10,
    },
  },
}
```

### Agent 注册入口

```typescript
// src/agents/index.ts
import { agentRegistry } from '../core/registry/agent-registry'
import { DataAgentDef } from './data-agent'
import { AnalysisAgentDef } from './analysis-agent'

agentRegistry.register(DataAgentDef)
agentRegistry.register(AnalysisAgentDef)
// 新增 agent：在此加一行，其他地方零改动
```

---

## 六、目录结构

```
src/
├── core/                           # Core 层，不依赖 agents/
│   ├── types.ts                    # 所有核心类型：AgentDef、MemoryPolicy、AgentEvent 等
│   ├── agent-loop.ts               # 纯执行引擎（async generator）
│   ├── router.ts                   # 两级路由（规则 + LLM 语义）
│   ├── memory/
│   │   ├── index.ts                # MemoryManager 接口 + 实现入口
│   │   ├── working-memory.ts       # 消息历史 + token 截断
│   │   ├── job-memory.ts           # job 结构化状态注入
│   │   └── long-term-memory.ts     # Phase 2，接口预留，Phase 1 空实现
│   ├── registry/
│   │   ├── agent-registry.ts       # AgentDef 注册 + 查询
│   │   ├── skill-registry.ts       # Skill 注册 + resolve
│   │   └── tool-registry.ts        # Tool 执行器注册 + 调用
│   ├── job/
│   │   ├── types.ts                # Job、Snapshot、TraceEntry 类型
│   │   └── manager.ts              # JobManager 实现
│   ├── event-bus.ts                # EventBus 实现 + 内置订阅者注册
│   └── llm-client.ts               # LLMClient 接口 + 默认实现
│
├── agents/                         # Application 层，纯配置，零执行逻辑
│   ├── data-agent.ts
│   ├── model-agent.ts              # 待实现
│   ├── analysis-agent.ts           # 待实现
│   └── index.ts                    # 统一注册入口
│
├── skills/                         # Skill 实现（独立于 agents/）
│   ├── csv-skill/
│   │   ├── index.ts                # skill 定义：id、description、tools 列表
│   │   ├── tools.ts                # 各 Tool 的执行函数
│   │   └── SKILL.md                # 面向 LLM 的使用说明
│   └── bioinfo-skill/
│       ├── index.ts
│       ├── tools.ts
│       └── SKILL.md
│
├── execution/                      # Python 脚本执行器（现有，保持不变）
│
├── routes/                         # HTTP/WS 路由（只做协议适配，不含业务逻辑）
│   ├── chat.ts
│   ├── job.ts
│   ├── file.ts
│   ├── requirement.ts
│   └── upload.ts
│
├── ws/                             # WebSocket 服务（订阅 EventBus，不直接调用 AgentLoop）
├── app.ts
├── config.ts
└── server.ts
```

---

## 七、关键数据流

### 用户发消息的完整路径

```
POST /api/chat
   │
   ▼
routes/chat.ts  ←  只做协议适配，取 sessionId + message
   │
   ▼
Router.route(message, session)
   ├─ 规则路由（从 AgentRegistry 汇总的 routes）
   └─ LLM 语义路由（fallback）
   → 返回 agentId
   │
   ▼
AgentRegistry.get(agentId) → AgentDef
   │
   ▼
agentLoop(agentDef, messages, context, services)
   │
   ├─ hooks.beforeTurn(ctx)
   ├─ Memory.assemble(policy, jobId) → truncatedMessages + jobContext
   ├─ SkillRegistry.resolve(skills) → tools + skillDocs 注入 system prompt
   │
   ├─ LLMClient.stream(...)
   │     └─ emit message_update → EventBus → WsPublisher → 前端实时显示
   │
   ├─ ToolRegistry.execute(toolCall)
   │     ├─ hooks.afterToolCall(result)
   │     └─ emit tool_result → EventBus → TraceRecorder → job.json
   │
   └─ JobManager.update(jobId, newState)
         └─ emit agent_end → EventBus → 订阅者
```

### 快照自动触发路径

```
用户保存需求文档
   │
   ▼
routes/requirement.ts  →  保存文件
   │
   └─ EventBus.publish({ type: 'requirement.saved', jobId })
                              │
                              ▼
                     JobManager（订阅者）
                              │
                              ▼
                     createSnapshot(jobId, { trigger: 'requirement.saved' })
```

快照逻辑与 routes 层完全解耦：routes 层不知道快照的存在，只负责保存文件并发布事件。

---

## 八、现有代码迁移策略

当前代码与目标架构的主要差距，以及推荐的迁移顺序（每步都保持可运行）：

**Step 1：类型定义先行**
在 `src/core/types.ts` 中定义 `AgentDef`、`MemoryPolicy`、`AgentContext`、`AgentEvent` 等核心类型。不动任何现有逻辑，只是建立类型基础。

**Step 2：提取 SkillRegistry**
把 `csv-skill` 和 `bioinfo-skill` 从 data-agent 的直接依赖改为注册到 SkillRegistry，DataAgentDef 改为声明 `skills: ['csv-skill', 'bioinfo-skill']`。这是最低风险的一步，不影响执行路径。

**Step 3：抽象 Memory 层**
把 `job.json` 里的 `state.messages` 和 `traces` 封装进 `MemoryManager`，AgentLoop 通过接口访问而不是直接读文件。

**Step 4：重构 Router**
把现有 intent-classifier 替换为两级路由。现有意图规则迁移为 AgentDef 的 `routes` 字段，保留 LLM 语义路由作为 fallback。

**Step 5：EventBus 接入**
在 AgentLoop 和 JobManager 的关键节点加入 `eventBus.publish()`，把 WebSocket 推送从直接调用改为 EventBus 订阅，把快照触发逻辑移入 JobManager 的订阅处理器。

**Step 6：应用层 agent 纯化**
把 DataAgentDef 改为纯配置对象，执行逻辑全部移入 AgentLoop 或对应的 Core 模块。

每步完成后跑一次现有测试，确认不回归后再进行下一步。

---

## 九、尚未解决的问题

以下问题在当前阶段有意推迟，待 Phase 1 稳定后再决策：

**LongTermMemory 方案**
Embedding 模型选型、索引格式、跨 job 记忆的清理和过期策略。接口已预留，实现延后。

**ModelAgent 和 AnalysisAgent 的 Skill 设计**
`visualization-skill`、`statistics-skill` 的工具边界还需要实际需求驱动，不宜提前设计。

**多 agent 协作（Handoff）**
当前 session 内路由锁定到单一 agent。如果未来需要 DataAgent → AnalysisAgent 的接力，需要设计 `handoff` 机制，Router 和 AgentLoop 都需要扩展。这超出了当前设计范围。

**并发 Job**
当前 JobManager 假设单 session 单 job 串行执行。并发场景下的状态隔离和文件锁未处理。

**Skill 热加载**
当前 Skill 在启动时注册，运行时无法动态添加。科研场景可能需要用户自定义 skill，这需要 SkillRegistry 支持运行时注册和 tool 动态绑定。