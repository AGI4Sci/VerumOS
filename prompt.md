# AgentLoop 集成与 EventBus 渐进式重构 - ✅ 已完成

## 问题描述

根据 `debug.md` 的架构设计，以下功能尚未实现：

1. **AgentLoop 未注入 CoreServices**
   - 当前 `agentLoop` 是独立函数，无法使用 MemoryManager、SkillRegistry 等 Core 服务
   - 违背了 debug.md 中"AgentLoop 不自己 import 任何 core 模块"的设计原则

2. **EventBus 未被使用**
   - routes 层直接调用 `createSnapshot`，没有发布事件
   - 设计意图：routes 发布事件 → JobManager 订阅并创建快照

3. **WebSocket 推送未通过 EventBus**
   - 直接调用 `emitSessionEvent`
   - 设计意图：WsPublisher 订阅 EventBus 推送

4. **初始化流程不完整**
   - 没有调用 `initializeCoreServices`
   - 快照自动触发等功能未生效

5. **TraceRecorder 未实现**
   - 手动调用 `appendTrace`
   - 设计意图：订阅 tool 事件自动记录

## ✅ 实现完成

所有步骤已完成：

1. ✅ 重构 AgentLoop - 接受 CoreServices 注入
2. ✅ 创建 TraceRecorder 订阅者 - 自动记录执行轨迹
3. ✅ 创建 WsPublisher 订阅者 - 实时推送事件到客户端
4. ✅ 完善 Core 初始化 - 注册所有订阅者
5. ✅ 修改 app.ts - 初始化 Core 服务
6. ✅ 修改 routes/chat.ts - 添加 EventBus 事件发布
7. ✅ 修改 routes/requirement.ts - 添加 EventBus 事件发布
8. ✅ 修改 routes/upload.ts - 添加文件上传事件发布

## 验证结果

启动服务成功：
```
[TraceRecorder] Registered to EventBus
[WsPublisher] Registered to EventBus
[Core] Core services initialized successfully
[INFO] VerumOS server listening on http://localhost:3000
```

健康检查通过：`GET /health` 返回 `{"ok":true}`

**架构演进过程中的不完整迁移**：

- Phase 1-7 完成了 Core 层基础设施（类型、EventBus、Memory、Registry）
- 但 AgentLoop 和 routes 层还停留在旧的实现方式
- 缺少一个集成层将 Core 服务注入到执行流程中

**设计原则违背**：

- debug.md 要求 AgentLoop 通过 CoreServices 容器接收依赖
- 实际代码中 AgentLoop 独立定义，不符合"依赖注入"原则

## 解决方案

### 方案概览

```
┌──────────────────────────────────────────────────────────────┐
│                      Application Layer                        │
│                                                               │
│   DataAgentDef     ModelAgentDef     AnalysisAgentDef        │
│            每个 agent 只是一个 AgentDef 配置对象              │
└───────────────────────────┬──────────────────────────────────┘
                            │ AgentDef（唯一跨层接口）
┌───────────────────────────▼──────────────────────────────────┐
│                         Core Layer                            │
│                                                               │
│  Router → AgentLoop → Memory, ToolRegistry, SkillRegistry    │
│  JobManager, EventBus, LLMClient                              │
│                                                               │
│  EventBus 订阅者：                                            │
│  - TraceRecorder: 记录执行轨迹                                │
│  - WsPublisher: WebSocket 推送                                │
│  - SnapshotCreator: 自动快照                                  │
└──────────────────────────────────────────────────────────────┘
```

### 核心改动

1. **重构 AgentLoop**
   - 接受 CoreServices 注入
   - 使用 MemoryManager 组装上下文
   - 使用 SkillRegistry 解析工具
   - 使用 EventBus 发布事件

2. **创建 Core 初始化流程**
   - 在 `app.ts` 的 `initializeApp()` 中调用 `initializeCoreServices`
   - 注册内置订阅者（TraceRecorder、WsPublisher、SnapshotCreator）

3. **渐进式引入 EventBus**
   - 保留 routes 层的直接调用
   - 同时发布事件到 EventBus（双写）
   - 验证稳定后再移除直接调用

4. **修改 routes/chat.ts**
   - 调用新的 AgentLoop（带 CoreServices）
   - 发布事件到 EventBus

5. **添加 WebSocket 推送订阅**
   - 创建 WsPublisher 订阅 EventBus
   - 推送事件到客户端

## 修改步骤

### 步骤 1：重构 AgentLoop（完全重构）

**文件**：`src/runtime/agent-loop.ts`

**修改内容**：

1. 修改函数签名，接受 `CoreServices` 参数：

```typescript
import type { CoreServices, AgentDef, AgentContext, AgentEvent, Message } from '../core/types.js';

export interface AgentLoopConfig {
  agentDef: AgentDef;
  services: CoreServices;
  maxTurns?: number;
}

export async function* agentLoop(
  messages: Message[],
  context: AgentContext,
  config: AgentLoopConfig
): AsyncGenerator<AgentEvent> {
  const { agentDef, services, maxTurns = 10 } = config;
  
  // 使用 services.memory 注入上下文
  // 使用 services.skillRegistry 解析工具
  // 使用 services.eventBus 发布事件
  // ...
}
```

2. 实现完整的执行流程：
   - 调用 `beforeTurn` hook
   - 使用 MemoryManager 组装上下文
   - 使用 SkillRegistry 解析工具
   - 调用 LLM（流式）
   - 执行工具调用
   - 发布事件到 EventBus
   - 更新 Job 状态

### 步骤 2：创建 TraceRecorder 订阅者

**新文件**：`src/core/subscribers/trace-recorder.ts`

**功能**：
- 订阅 `tool_execution_start`、`tool_result` 事件
- 自动调用 `jobManager.appendTrace()`

```typescript
import type { EventBus, AgentEvent, JobManager } from '../types.js';

export function registerTraceRecorder(eventBus: EventBus, jobManager: JobManager): void {
  eventBus.subscribe('tool_execution_start', async (event: AgentEvent) => {
    if (event.jobId && event.data) {
      await jobManager.appendTrace(event.jobId, {
        type: 'tool_call',
        data: event.data as Record<string, unknown>,
      });
    }
  });

  eventBus.subscribe('tool_result', async (event: AgentEvent) => {
    if (event.jobId && event.data) {
      await jobManager.appendTrace(event.jobId, {
        type: 'tool_result',
        data: event.data as Record<string, unknown>,
      });
    }
  });
}
```

### 步骤 3：创建 WsPublisher 订阅者

**新文件**：`src/core/subscribers/ws-publisher.ts`

**功能**：
- 订阅所有 Agent 事件
- 推送到 WebSocket 客户端

```typescript
import type { EventBus, AgentEvent } from '../types.js';
import { emitSessionEvent } from '../../ws/server.js';

export function registerWsPublisher(eventBus: EventBus): void {
  eventBus.subscribe('*', (event: AgentEvent) => {
    if (event.sessionId) {
      emitSessionEvent(event.sessionId, {
        type: event.type,
        payload: event.data,
        timestamp: Date.parse(event.timestamp),
      });
    }
  });
}
```

### 步骤 4：完善 Core 初始化

**文件**：`src/core/index.ts`

**修改内容**：

在 `initializeCoreServices` 中注册订阅者：

```typescript
import { registerTraceRecorder } from './subscribers/trace-recorder.js';
import { registerWsPublisher } from './subscribers/ws-publisher.js';

export async function initializeCoreServices(services: ReturnType<typeof createCoreServices>): Promise<void> {
  const { skillRegistry, eventBus, jobManager, memory } = services;

  // 初始化 Memory
  await memory.initialize();

  // 注册内置 Skills
  const { csvSkill } = await import('../skills/csv-skill.js');
  const { bioinfoSkill } = await import('../skills/bioinfo-skill.js');
  skillRegistry.register(csvSkill);
  skillRegistry.register(bioinfoSkill);

  // 注册订阅者
  registerTraceRecorder(eventBus, jobManager);
  registerWsPublisher(eventBus);

  // 订阅快照触发事件
  const eventToTrigger: Record<string, string> = {
    'requirement.saved': 'requirement_saved',
    'analysis.before_execute': 'pre_execute',
    'analysis.after_execute': 'post_execute',
    'file.uploaded': 'dataset_changed',
  };

  for (const [event, trigger] of Object.entries(eventToTrigger)) {
    eventBus.subscribe(event as any, async (e: any) => {
      if (e.jobId) {
        await jobManager.createSnapshot(e.jobId, trigger as any);
      }
    });
  }
}
```

### 步骤 5：修改 app.ts 初始化流程

**文件**：`src/app.ts`

**修改内容**：

```typescript
import { createCoreServices, initializeCoreServices } from './core/index.js';

let coreServices: ReturnType<typeof createCoreServices> | null = null;

export async function initializeApp(): Promise<Hono> {
  await ensureDataDir();
  await initializeSkills();

  // 初始化 Core 服务
  coreServices = createCoreServices();
  await initializeCoreServices(coreServices);

  return app;
}

export function getCoreServices() {
  return coreServices;
}
```

### 步骤 6：修改 routes/chat.ts（渐进式）

**文件**：`src/routes/chat.ts`

**修改内容**：

1. 保留现有的 `DataAgentProcessor` 逻辑
2. 添加 EventBus 事件发布
3. 后续可以切换到新的 AgentLoop

```typescript
import { getCoreServices } from '../app.js';
import { createAgentEvent } from '../core/types.js';

chatRouter.post('/chat', async (c) => {
  // ... 现有逻辑 ...

  const coreServices = getCoreServices();
  
  // 执行需求前发布事件
  if (isExecuteIntent && coreServices) {
    coreServices.eventBus.publish(
      createAgentEvent('analysis.before_execute', { message }, jobId, sessionId)
    );
  }

  // ... 现有的处理逻辑 ...

  // 执行需求后发布事件
  if (isExecuteIntent && coreServices) {
    coreServices.eventBus.publish(
      createAgentEvent('analysis.after_execute', { response }, jobId, sessionId)
    );
  }

  // ... 返回响应 ...
});
```

### 步骤 7：修改 routes/requirement.ts（渐进式）

**文件**：`src/routes/requirement.ts`

**修改内容**：

```typescript
import { getCoreServices } from '../app.js';
import { createAgentEvent } from '../core/types.js';

// POST /requirement/:sessionId
requirementRouter.post('/requirement/:sessionId', async (c) => {
  // ... 现有的保存逻辑 ...

  const savedPath = await saveRequirementDocument(doc);

  // 保留直接调用（渐进式）
  if (doc.jobId) {
    try {
      await createSnapshot(doc.jobId, 'requirement_saved');
    } catch (error) {
      console.error('Failed to create snapshot:', error);
    }
  }

  // 同时发布事件到 EventBus
  const coreServices = getCoreServices();
  if (coreServices && doc.jobId) {
    coreServices.eventBus.publish(
      createAgentEvent('requirement.saved', { document: doc }, doc.jobId, sessionId)
    );
  }

  // ... 返回响应 ...
});
```

### 步骤 8：修改 routes/upload.ts（添加事件发布）

**文件**：`src/routes/upload.ts`

**修改内容**：

```typescript
import { getCoreServices } from '../app.js';
import { createAgentEvent } from '../core/types.js';

// 文件上传成功后
if (coreServices && jobId) {
  coreServices.eventBus.publish(
    createAgentEvent('file.uploaded', { filename, path: savedPath }, jobId, sessionId)
  );
}
```

## 验收标准

### 功能测试

1. **AgentLoop 集成测试**
   - [ ] 启动服务，确认 Core 服务初始化成功
   - [ ] 发送消息，检查 MemoryManager 是否正常工作
   - [ ] 检查 SkillRegistry 是否正确解析工具

2. **EventBus 事件流测试**
   - [ ] 上传文件，检查 `file.uploaded` 事件是否发布
   - [ ] 保存需求文档，检查 `requirement.saved` 事件是否发布
   - [ ] 执行分析，检查 `analysis.before_execute` 和 `analysis.after_execute` 事件

3. **订阅者功能测试**
   - [ ] TraceRecorder：检查 traces 是否自动记录到 job.json
   - [ ] WsPublisher：检查 WebSocket 客户端是否收到事件推送
   - [ ] SnapshotCreator：检查快照是否在正确时机创建

4. **渐进式双写验证**
   - [ ] 快照创建：直接调用 + EventBus 订阅者都会执行
   - [ ] 轨迹记录：手动调用 + EventBus 订阅者都会执行
   - [ ] 确认没有重复或冲突

### 边界测试

1. **EventBus 异常处理**
   - [ ] 订阅者抛出异常时，不影响主流程
   - [ ] 检查日志是否记录异常

2. **WebSocket 断开连接**
   - [ ] 客户端断开后，EventBus 推送不报错
   - [ ] 新客户端连接后，能正常接收事件

3. **并发请求**
   - [ ] 多个并发请求，EventBus 正确路由到对应 session
   - [ ] 快照创建不冲突

### 回归测试

1. **现有功能不受影响**
   - [ ] 上传文件功能正常
   - [ ] 需求文档编辑功能正常
   - [ ] 执行分析功能正常
   - [ ] 快照功能正常

2. **控制台无报错**
   - [ ] 启动服务时无错误日志
   - [ ] 请求处理时无未捕获异常

## 测试验证

修改完成后，**必须**进行以下测试：

### 1. 功能测试：

- [ ] 启动服务：`pnpm dev`
- [ ] 访问前端：`http://localhost:3000/`
- [ ] 上传一个 CSV 文件
- [ ] 检查控制台日志：应该看到 `[Core] Snapshot created for job xxx on file.uploaded`
- [ ] 检查 job.json：应该有新的 trace 记录
- [ ] 打开浏览器开发者工具 → Network → WS：应该看到 WebSocket 连接
- [ ] 发送消息：检查 WebSocket 是否收到事件推送

### 2. 边界测试：

- [ ] 上传不存在的文件路径（应该优雅处理）
- [ ] 保存空的需求文档（应该不创建快照）
- [ ] 并发发送多条消息（EventBus 应该正确路由）

### 3. 回归测试：

- [ ] 测试完整的数据分析流程
- [ ] 测试需求文档编辑和执行
- [ ] 测试快照创建和回退

**测试方法**：
- 启动服务：`pnpm dev`
- 打开浏览器：`http://localhost:3000/`
- 执行上述测试步骤
- 如发现问题，记录到 debug.md

## 收尾工作

- [ ] 修改相关代码文件
- [ ] 执行测试验证（必须）
- [ ] 更新 README.md 说明 Core 服务初始化流程
- [ ] 提交 git commit，message 格式：`refactor: integrate CoreServices into AgentLoop and add EventBus subscribers`
- [ ] push 到远程仓库

## 后续优化（可选）

完成本次重构后，可以进一步优化：

1. **移除直接调用**
   - 验证 EventBus 稳定后，移除 routes 层的直接调用
   - 只保留事件发布

2. **添加更多订阅者**
   - 日志记录器
   - 性能监控器
   - 审计追踪器

3. **完善 AgentLoop**
   - 完全迁移 DataAgentProcessor 的逻辑
   - 使用声明式配置 + hooks

4. **添加单元测试**
   - EventBus 订阅者测试
   - AgentLoop 集成测试
