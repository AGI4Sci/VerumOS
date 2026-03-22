# 架构重构：Agent Runtime 与业务逻辑分离

## 参考架构：pi-mono `@mariozechner/pi-agent-core`

pi-mono 的 Agent Runtime 是一个**纯执行引擎**，不含任何业务逻辑：

```
┌─────────────────────────────────────────────────────────┐
│                    agentLoop (核心循环)                  │
│  for await (const event of agentLoop(messages, ctx)) {} │
└─────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
      agent_start    message_start    tool_execution_start
      turn_start     message_update   tool_execution_end
      turn_end       message_end      tool_result
      agent_end
```

**核心能力**（全部业务无关）：

| 能力 | 说明 |
|------|------|
| LLM 调用 | 统一的 multi-provider API |
| 工具执行 | parallel/sequential 模式，before/after 钩子 |
| 事件流 | 订阅式事件，支持 streaming |
| 状态管理 | messages、tools、isStreaming |
| 消息转换 | `convertToLlm` 过滤/转换自定义类型 |
| 运行时注入 | steering（中断）、follow-up（追加） |

**业务 Agent 只定义**：

```typescript
// DataAgent 不继承 runtime，只声明能力
const dataAgent = {
  id: 'data-agent',
  tools: [csvSkill, bioinfoSkill],
  systemPrompt: '你是一个数据分析助手...',
  convertToLlm: (messages) => messages.filter(m => m.role !== 'notification'),
};
```

---

## 当前问题

VerumOS 的 `BaseAgent` 混合了执行引擎和业务逻辑：

```typescript
// base.ts - 执行引擎部分（正确）
async callLLM(prompt, context) { ... }
async callSkill(skillName, toolName, params) { ... }

// base.ts - 业务逻辑部分（错误，不该在基类）
private heuristicIntent(message) {
  if (/上传|加载|读取|file|csv/.test(message)) {  // 硬编码关键词
    return { type: 'upload' };
  }
}
```

---

## 推荐架构

```
src/
├── runtime/                      # 纯执行引擎（业务无关）
│   ├── agent-loop.ts             # 核心循环：async generator
│   ├── agent-state.ts            # 状态：messages, tools, streaming
│   ├── tool-executor.ts          # 工具执行：parallel/sequential
│   ├── event-emitter.ts          # 事件订阅
│   └── types.ts                  # AgentMessage, AgentEvent, AgentTool
│
├── agents/                       # 业务 Agent（只声明，不继承）
│   ├── data-agent.ts             # systemPrompt + tools + convertToLlm
│   ├── model-agent.ts
│   └── registry.ts               # Agent 注册表
│
├── skills/                       # 工具实现
│   ├── csv-skill.ts
│   └── bioinfo-skill.ts
│
└── app.ts                        # 组装 runtime + agents
```

---

## 核心 API 设计

```typescript
// runtime/agent-loop.ts
export async function* agentLoop(
  messages: AgentMessage[],
  context: AgentContext,
  config: AgentLoopConfig
): AsyncGenerator<AgentEvent> {
  while (true) {
    // 1. 调用 LLM
    yield { type: 'turn_start' };
    const response = await callLlm(context, config);

    // 2. 流式产出
    for await (const chunk of response.stream) {
      yield { type: 'message_update', delta: chunk };
    }

    // 3. 检查工具调用
    const toolCalls = response.toolCalls;
    if (toolCalls.length === 0) {
      yield { type: 'turn_end' };
      break;
    }

    // 4. 执行工具（parallel 或 sequential）
    yield { type: 'tool_execution_start', toolCalls };
    const results = await executeTools(toolCalls, config);
    yield { type: 'tool_execution_end', results };

    // 5. 注入 toolResult，继续循环
    context.messages.push(...results.map(toToolResultMessage));

    // 6. 检查 steering/follow-up
    if (context.steeringQueue.length > 0) {
      context.messages.push(...context.steeringQueue);
      context.steeringQueue = [];
    }
  }
}

// 业务 Agent 使用
const dataAgent = {
  systemPrompt: '你是一个数据分析助手...',
  tools: [readFileTool, exploreDataTool, transformDataTool],
  convertToLlm: (messages) => messages.filter(m => ['user', 'assistant', 'toolResult'].includes(m.role)),
};

const context = { systemPrompt: dataAgent.systemPrompt, messages: [], tools: dataAgent.tools };
const config = { model: getModel('anthropic', 'claude-sonnet-4'), ...dataAgent };

for await (const event of agentLoop([{ role: 'user', content: '分析这份数据' }], context, config)) {
  console.log(event.type);
}
```

---

## 迁移步骤

1. **新建 `runtime/` 目录**，从零实现 agentLoop（不依赖现有 BaseAgent）
2. **抽取工具定义**，把 `csv-skill`、`bioinfo-skill` 改成 `AgentTool` 格式
3. **改造 DataAgent**，删除继承，改为声明式配置
4. **删除 BaseAgent**，用 runtime 替代
5. **前端接入事件流**，通过 WebSocket 订阅 agentLoop 事件

---

## 配置硬编码问题

### 当前问题

`src/config.ts` 有硬编码的默认值：

```typescript
baseUrl: process.env.LLM_BASE_URL || 'http://35.220.164.252:3888/v1/',
model: process.env.LLM_MODEL || 'glm-5',
pythonPath: process.env.PYTHON_PATH || '/opt/homebrew/Caskroom/miniconda/base/bin/python',
```

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
```

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

---

## 建议优先级

1. **P1**: 抽取 `runtime/` 目录，实现 agentLoop（参考 pi-mono 架构）
2. **P1**: 移除配置硬编码，关键配置缺失时抛错或警告
3. **P1**: 实现 Job Workspace 架构（任务隔离 + 持久化 + trace）
4. **P2**: 改造 DataAgent 为声明式配置，删除 BaseAgent 继承
5. **P2**: 前端历史任务浏览与恢复
6. **P3**: 添加 steering/follow-up 机制

---

## 收尾工作

- [ ] 修改相关代码文件
- [ ] 更新 README.md 使项目状态与描述一致
- [ ] 提交 git commit，message 格式：`fix: xxx` / `feat: xxx` / `refactor: xxx`
- [ ] push 到远程仓库

工作结束后必需修改相关文件和 README.md, 使得项目状态与描述一致, 最后 push 到 git"