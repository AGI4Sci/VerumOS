# VerumOS 功能实现方案

## 一、问题描述

用户要求实现两个功能：
1. **LongTermMemory**：长期记忆功能，支持跨 job 向量检索
2. **前端 Agent 切换**：点击"模型"或"分析" Tab 时，切换到对应 Agent

## 二、根因分析

### LongTermMemory
当前 `long-term-memory.ts` 是 Phase 1 空实现，只返回 `null`：
- 没有持久化存储
- 没有向量嵌入能力
- 没有语义检索能力

### 前端 Agent 切换
当前 `switchAgent()` 只切换 UI 样式：
- 没有通知后端
- 后端 `/api/chat` 总是使用默认 Agent（`agentRegistry.getDefault()`）
- 没有 Agent 切换的 API 端点

## 三、解决方案

### 3.1 LongTermMemory 实现

#### 设计方案
采用 **JSON 文件存储 + Embedding API** 方案：

```
data/.memory/
├── index.json           # 记忆索引（id, metadata, embedding 路径）
├── embeddings/          # 向量文件（按 id 存储）
│   ├── {id}.json
└── config.json          # 配置（embedding 模型等）
```

#### 核心功能
1. **存储记忆**：`store(content, metadata)` → 生成 embedding 并存储
2. **检索记忆**：`retrieve(query, topK)` → 生成查询 embedding，计算相似度，返回最相关的 K 条
3. **记忆类型**：`analysis` | `preference` | `feedback` | `insight`

#### Embedding 方案
使用 OpenAI 兼容的 `/v1/embeddings` API（中转站支持），调用方式：
```typescript
const response = await fetch(`${baseUrl}/embeddings`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: text, model: 'text-embedding-3-small' })
});
```

如果 embedding API 不可用，降级为 **关键词匹配**（TF-IDF 简化版）。

#### 记忆存储时机
- 用户明确表示偏好时（如"我喜欢简洁的输出"）
- 分析方案执行成功时（存储方案供后续参考）
- 用户反馈时（如"这个结果不对"）

### 3.2 前端 Agent 切换

#### 方案 A：在 chat 请求中指定 agentId（推荐）
修改 `/api/chat` 接受可选的 `agentId` 参数：
```typescript
// 前端请求
POST /api/chat
{
  "sessionId": "xxx",
  "message": "分析这份数据",
  "agentId": "data-agent"  // 可选，不传则使用默认
}
```

#### 前端修改
```javascript
let currentAgent = 'data-agent';  // 当前 Agent ID

function switchAgent(agentId) {
  currentAgent = agentId;
  // 更新 UI
  document.querySelectorAll('.nav-item').forEach(...);
}

async function sendMessage() {
  const response = await fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      message: text,
      agentId: currentAgent  // 传递当前 Agent
    })
  });
}
```

#### 后端修改
```typescript
// chat.ts
const agentId = body.agentId || 'data-agent';
const agent = agentId === 'data-agent' 
  ? agentRegistry.getDefault()
  : agentRegistry.get(agentId) || agentRegistry.getDefault();
```

#### Model/Analysis Agent 占位
暂时显示"功能开发中"提示：
```typescript
// model-agent.ts
export const ModelAgentDef: AgentDef = {
  id: 'model-agent',
  name: 'Model Agent',
  description: '负责机器学习建模和模型训练...',
  systemPrompt: '你是模型训练助手。注意：此功能正在开发中，请告知用户暂时无法使用。',
  skills: [],
  routes: [
    { match: { pattern: /训练|模型|预测|机器学习/i }, priority: 10 },
  ],
};

// analysis-agent.ts
export const AnalysisAgentDef: AgentDef = {
  id: 'analysis-agent',
  name: 'Analysis Agent',
  description: '负责统计分析和可视化...',
  systemPrompt: '你是数据分析助手。注意：此功能正在开发中，请告知用户暂时无法使用。',
  skills: [],
  routes: [
    { match: { pattern: /分析|可视化|图表|统计/i }, priority: 10 },
  ],
};
```

## 四、修改步骤

### Step 1: 实现 LongTermMemory（核心）

#### 1.1 更新 `src/core/memory/long-term-memory.ts`
```typescript
// 新增：
// - MemoryStore 类：管理 JSON 文件存储
// - EmbeddingClient 类：调用 embedding API
// - LongTermMemory 类增强：
//   - store(): 存储记忆 + 生成 embedding
//   - retrieve(): 检索相关记忆
//   - cosineSimilarity(): 计算余弦相似度
//   - fallbackKeywordMatch(): 降级关键词匹配
```

#### 1.2 更新 `src/config.ts`
```typescript
// 新增 embedding 配置
embedding: z.object({
  enabled: z.boolean().default(true),
  model: z.string().default('text-embedding-3-small'),
}).optional(),
```

#### 1.3 创建存储目录
```typescript
// 在 server.ts 启动时
import fs from 'node:fs/promises';
await fs.mkdir(path.join(config.data.dir, '.memory', 'embeddings'), { recursive: true });
```

### Step 2: 实现 Agent 切换

#### 2.1 创建 `src/agents/model-agent.ts`
- 实现 ModelAgentDef（占位，提示功能开发中）

#### 2.2 创建 `src/agents/analysis-agent.ts`
- 实现 AnalysisAgentDef（占位，提示功能开发中）

#### 2.3 更新 `src/agents/index.ts`
```typescript
import { ModelAgentDef } from './model-agent.js';
import { AnalysisAgentDef } from './analysis-agent.js';

agentRegistry.register(DataAgentDef);
agentRegistry.register(ModelAgentDef);
agentRegistry.register(AnalysisAgentDef);
```

#### 2.4 更新 `src/routes/chat.ts`
```typescript
// 在 chat handler 中
const requestedAgentId = body.agentId;
const agent = requestedAgentId 
  ? agentRegistry.get(requestedAgentId) || agentRegistry.getDefault()
  : agentRegistry.getDefault();
```

#### 2.5 更新 `web/index.html`
```javascript
// 修改 switchAgent 函数
let currentAgent = 'data-agent';

function switchAgent(agentKey) {
  const agentMap = { 'data': 'data-agent', 'model': 'model-agent', 'analysis': 'analysis-agent' };
  currentAgent = agentMap[agentKey] || 'data-agent';
  // 更新 UI...
}

// 修改 sendMessage 函数
body: JSON.stringify({ sessionId, message: text, agentId: currentAgent }),
```

### Step 3: 集成长期记忆到 AgentLoop

#### 3.1 更新 `src/runtime/agent-loop.ts`
```typescript
// 在消息处理后，检测是否需要存储长期记忆
// 例如：用户反馈、偏好、成功的分析方案
```

#### 3.2 更新 `src/core/memory/index.ts`
```typescript
// 确保 LongTermMemory 正确初始化并传递
```

## 五、测试验证

修改完成后，**必须**进行以下测试：

### 功能测试

1. **LongTermMemory 存储**
   - [ ] 启动服务后，发送消息产生偏好/反馈
   - [ ] 检查 `data/.memory/index.json` 是否有记录
   - [ ] 检查 `data/.memory/embeddings/` 是否有向量文件

2. **LongTermMemory 检索**
   - [ ] 发送相似查询，检查是否返回相关记忆
   - [ ] 检查日志是否有 `[LongTermMemory]` 相关输出
   - [ ] 测试 embedding API 不可用时的降级

3. **Agent 切换**
   - [ ] 点击"数据" Tab，发送消息，检查响应来自 data-agent
   - [ ] 点击"模型" Tab，发送消息，检查响应提示"功能开发中"
   - [ ] 点击"分析" Tab，发送消息，检查响应提示"功能开发中"

### 边界测试

- [ ] LongTermMemory 在 `enabled: false` 时不工作
- [ ] 切换到不存在的 agent 时回退到默认
- [ ] embedding API 超时或失败时降级到关键词匹配
- [ ] `.memory` 目录不存在时自动创建

### 回归测试

- [ ] 原有 data-agent 功能正常（上传、探索、需求讨论）
- [ ] 快照功能正常
- [ ] 文件树浏览正常
- [ ] 控制台无报错

## 六、收尾工作

- [ ] 修改相关代码文件
- [ ] 执行测试验证（必须）
- [ ] 更新 README.md：
  - 添加 LongTermMemory 说明
  - 添加 Agent 切换说明
  - 更新 API 端点列表（chat 接受 agentId）
- [ ] 提交 git commit，message: `feat: implement LongTermMemory and agent switching`
- [ ] push 到远程仓库
