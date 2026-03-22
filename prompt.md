# 架构重构：Agent Runtime 与业务逻辑分离

## 当前状态：部分分离，但不够彻底

### 现有分层

```
base.ts (BaseAgent)          → 提供通用能力
  ↓ 继承
data-agent.ts (DataAgent)    → 具体业务实现
```

### BaseAgent 提供的能力（偏 Runtime）

| 方法 | 作用 | 是否业务无关 |
|------|------|-------------|
| `analyzeIntent()` | 意图识别 | ❌ 硬编码了意图类型 |
| `callLLM()` | LLM 调用 | ✅ 通用 |
| `callSkill()` | Skill 调用 | ✅ 通用 |
| `heuristicIntent()` | 启发式规则 | ❌ 关键词写死 |

### DataAgent 的职责

| 方法 | 职责 |
|------|------|
| `processMessage()` | 消息入口，手动 switch-case 派发 |
| `handleUpload/Explore/...` | 各意图的业务处理逻辑 |

---

## 问题分析

### 1. BaseAgent 污染了业务逻辑

```typescript
// base.ts - heuristicIntent 方法
if (/上传|加载|读取|导入|file|csv|xlsx|xls|tsv/.test(message)) {
  return { type: 'upload', confidence: 0.95 };
}
```

这些关键词是 Data Agent 特定的，不应该放在基类。

### 2. `analyzeIntent` 的 systemPrompt 硬编码

```typescript
const systemPrompt = `你是一个意图分类器。
候选意图：upload、explore、transform、merge、requirement、execute、question、unknown。`;
```

意图类型应该是业务 Agent 定义的，而不是基类硬编码。

### 3. DataAgent.processMessage 是个大 switch-case

```typescript
switch (intent.type) {
  case 'upload': return this.handleUpload(...);
  case 'explore': return this.handleExplore(...);
  // ... 7 个 case
}
```

这不是真正的 runtime 行为 —— runtime 应该是数据驱动的，不是代码驱动的。

### 4. 缺少独立的 Agent Runtime 层

理想架构：

```
┌─────────────────────────────────────────┐
│          Agent Runtime (核心)            │
│  - 对话状态机                            │
│  - 工具调用编排                          │
│  - 意图识别（抽象）                      │
│  - ReAct / Plan-and-Execute 等策略      │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│          Agent Registry                  │
│  - 注册各 Agent 的能力声明               │
│  - 意图 → Agent 映射                     │
└─────────────────────────────────────────┘
                    ↓
┌──────────┬──────────┬──────────┐
│DataAgent │ModelAgent│Analysis  │
│          │          │Agent     │
└──────────┴──────────┴──────────┘
```

---

## 推荐重构方案

### Step 1: 抽取 AgentRuntime

```typescript
// src/runtime/agent-runtime.ts
export class AgentRuntime {
  constructor(
    private llmClient: LLMClient,
    private skillRegistry: SkillRegistry,
    private agentRegistry: AgentRegistry,
  ) {}

  async processMessage(
    message: string,
    context: ConversationContext
  ): Promise<AgentResponse> {
    // 1. 意图识别（委托给 Agent 定义的分类器）
    const intent = await this.classifyIntent(message, context);

    // 2. 找到对应的 Agent
    const agent = this.agentRegistry.getAgentForIntent(intent.type);

    // 3. 执行 Agent 的 handler
    return agent.handle(intent, context);
  }

  private async classifyIntent(message: string, context: ConversationContext) {
    // 使用注册的意图分类器，而不是硬编码
    const classifiers = this.agentRegistry.getIntentClassifiers();
    // ... LLM 或规则匹配
  }
}
```

### Step 2: Agent 只声明能力 + handler

```typescript
// src/agents/data-agent.ts
export class DataAgent implements AgentHandler {
  id = 'data-agent';
  capabilities = {
    intents: ['upload', 'explore', 'transform', 'merge', 'question'],
    skills: ['csv-skill', 'bioinfo-skill'],
  };

  // 声明式意图分类规则
  intentRules: IntentRule[] = [
    { intent: 'upload', patterns: [/上传|加载|读取|导入|file|csv|xlsx/i] },
    { intent: 'explore', patterns: [/探索|预览|概览|summary/i] },
    // ...
  ];

  async handle(intent: Intent, context: ConversationContext): Promise<AgentResponse> {
    // 纯业务逻辑
    switch (intent.type) {
      case 'upload': return this.handleUpload(intent, context);
      // ...
    }
  }
}
```

### Step 3: 文件结构重组

```
src/
├── runtime/                    # 核心 Runtime
│   ├── agent-runtime.ts        # 执行引擎
│   ├── intent-classifier.ts    # 意图分类器
│   ├── tool-executor.ts        # 工具调用编排
│   └── conversation-state.ts   # 对话状态机
├── agents/                     # 业务 Agent
│   ├── data-agent.ts           # 只做数据处理
│   ├── model-agent.ts          # (Phase 2) 模型训练
│   └── analysis-agent.ts       # (Phase 2) 分析报告
├── skills/                     # 技能层（保持不变）
│   ├── csv-skill.ts
│   └── bioinfo-skill.ts
└── registry/
    ├── agent-registry.ts       # Agent 注册表
    └── skill-registry.ts       # Skill 注册表
```

---

## 快速评估

| 维度 | 当前 | 重构后 |
|------|------|--------|
| Agent 切换 | 需要改 BaseAgent | 只需注册新 Agent |
| 意图扩展 | 改 base.ts + agent.ts | 只改 agent 声明 |
| 多 Agent 协作 | 不支持 | Runtime 自动路由 |
| 测试性 | 需要模拟整个 Agent | 可单独测试 Runtime |

---

## 配置硬编码问题

### 当前问题

`src/config.ts` 有硬编码的默认值：

```typescript
baseUrl: process.env.LLM_BASE_URL || 'http://35.220.164.252:3888/v1/',
model: process.env.LLM_MODEL || 'glm-5',
pythonPath: process.env.PYTHON_PATH || '/opt/homebrew/Caskroom/miniconda/base/bin/python',
```

这些值应该：
1. 只在 `.env.example` 作为示例
2. 生产环境必须显式配置，不应有静默 fallback

### 建议修复

```typescript
// config.ts
export function loadConfig(): AppConfig {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    console.warn('[config] LLM_API_KEY not set, LLM features will be disabled');
  }

  return schema.parse({
    llm: {
      apiKey: apiKey || '',
      baseUrl: process.env.LLM_BASE_URL,  // 必填，由 zod 校验
      model: process.env.LLM_MODEL || 'glm-5',  // model 可以有默认值
    },
    // ...
  });
}

// 或者更严格：启动时检查
if (!process.env.LLM_API_KEY || !process.env.LLM_BASE_URL) {
  throw new Error('Missing required env: LLM_API_KEY, LLM_BASE_URL');
}
```

---

---

## 任务持久化与 Workspace 架构

### 当前问题

1. **数据处理后不保存** - `transform_data` 只返回结果，不写入文件
2. **会话不持久化** - `session-store.ts` 是内存 Map，重启即丢
3. **文件混在一起** - `data/` 是扁平目录，无任务隔离
4. **无执行轨迹** - 没有记录任务的执行历史
5. **无法恢复任务** - 中断后续不上

### 建议架构：Job Workspace

```
data/
├── jobs/
│   ├── job_20260322_2201_a1b2c3/          # 任务 workspace
│   │   ├── job.json                        # 任务元数据（状态、创建时间、意图）
│   │   ├── memory.md                       # 任务级记忆（可选，或合并到 job.json）
│   │   ├── trace.jsonl                     # 执行轨迹（每步操作记录）
│   │   ├── inputs/                         # 输入资产
│   │   │   ├── count_matrix.csv
│   │   │   └── cell_metadata.csv
│   │   ├── outputs/                        # 输出资产
│   │   │   ├── normalized_matrix.csv
│   │   │   └── qc_report.json
│   │   └── checkpoints/                    # 中间状态（用于恢复）
│   │       └── step_001.json
│   └── job_20260322_2230_d4e5f6/
│       └── ...
└── uploads/                                # 临时上传区（入库后移动到 job/inputs）
```

### 核心数据结构

```typescript
// job.json
interface JobMeta {
  id: string;                    // job_20260322_2201_a1b2c3
  sessionId: string;             // 关联的会话 ID
  status: 'created' | 'running' | 'paused' | 'completed' | 'failed';
  intent: Intent;                // 初始意图
  createdAt: string;
  updatedAt: string;
  summary?: string;              // 任务摘要（用于历史列表展示）
}

// trace.jsonl（每行一个 JSON）
interface TraceEntry {
  timestamp: string;
  step: number;
  type: 'intent' | 'tool_call' | 'tool_result' | 'llm_call' | 'checkpoint';
  data: Record<string, unknown>;
}
```

### 执行轨迹记录点

```typescript
// 在 AgentRuntime 或 DataAgent 中埋点
async handleTransform(intent, context) {
  const jobDir = context.jobDir;  // 当前任务的 workspace

  // 记录轨迹
  await appendTrace(jobDir, {
    step: context.stepCount++,
    type: 'tool_call',
    data: { tool: 'csv-skill.transform_data', params: intent.params }
  });

  const result = await this.callSkill('csv-skill', 'transform_data', params);

  // 保存输出文件
  const outputPath = path.join(jobDir, 'outputs', `transformed_${Date.now()}.csv`);
  await saveResult(result, outputPath);

  // 记录结果
  await appendTrace(jobDir, {
    step: context.stepCount++,
    type: 'tool_result',
    data: { output: outputPath, shape: result.shape }
  });

  return result;
}
```

### 任务恢复机制

```typescript
// 从 job.json 和 trace.jsonl 恢复
async function resumeJob(jobId: string): Promise<ConversationContext> {
  const jobMeta = await readJson(`data/jobs/${jobId}/job.json`);
  const traces = await readTrace(`data/jobs/${jobId}/trace.jsonl`);

  // 重建 context
  const context = createEmptyContext(jobMeta.sessionId);
  context.jobDir = `data/jobs/${jobId}`;
  context.stepCount = traces.length;

  // 重放历史（可选：只加载关键状态）
  for (const trace of traces) {
    if (trace.type === 'tool_result' && trace.data.dataset) {
      context.datasets.set(trace.data.dataset.id, trace.data.dataset);
    }
  }

  return context;
}
```

### 前端需求

1. **历史任务列表** - `GET /api/jobs` 返回所有 job 目录的元数据
2. **加载任务** - `POST /api/session/resume` 传入 jobId，返回恢复的 session
3. **任务详情** - `GET /api/jobs/:jobId` 返回 trace + assets 列表

### Memory 设计选择

**方案 A**：任务级 `memory.md`
- 每个 job 有独立的 memory.md，记录关键决策、上下文
- 优点：隔离清晰
- 缺点：碎片化，跨任务知识难复用

**方案 B**：全局 memory + job trace
- `MEMORY.md` 存用户偏好、项目知识（全局）
- `trace.jsonl` 存任务执行细节（任务级）
- 优点：职责清晰
- 缺点：需要两个维度管理

**推荐方案 B**：
- 全局 `MEMORY.md`：用户背景、偏好、常用配置
- 任务 `trace.jsonl`：执行轨迹、中间状态
- 任务 `job.json`：元数据 + summary（用于快速浏览）

---

## 建议优先级

1. **P1**: 抽取 `AgentRuntime`，把 `heuristicIntent` 和 `analyzeIntent` 的硬编码移出去
2. **P1**: 移除配置硬编码，关键配置缺失时抛错或警告
3. **P1**: 实现 Job Workspace 架构（任务隔离 + 持久化 + trace）
4. **P2**: 实现 Agent Registry，支持多 Agent 注册
5. **P2**: 前端历史任务浏览与恢复
6. **P3**: 添加工具调用编排（ReAct 或 Chain-of-Tools）
