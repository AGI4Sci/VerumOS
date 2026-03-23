# VerumOS 重构计划 - Phase 4

## 问题描述

当前缺少独立的 Router 层：
- 意图路由逻辑散落在 `DataAgentProcessor.heuristicIntent()` 中
- 没有统一的两级路由机制（规则路由 + LLM 语义路由）
- 路由规则没有从 AgentDef 汇总

## 目标

按照 debug.md 的设计，实现两级路由：

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

## 修改步骤

### 1. 创建 Router 模块

```typescript
// src/core/router.ts

export class Router {
  private agentRegistry: AgentRegistry;
  private llmClient: LLMClient;

  /**
   * 路由用户消息到合适的 Agent
   */
  async route(message: string, session: SessionContext): Promise<RouterResult>;

  /**
   * 规则路由（第一级）
   */
  private ruleRoute(message: string, session: SessionContext): RouterResult | null;

  /**
   * LLM 语义路由（第二级）
   */
  private llmRoute(message: string): Promise<RouterResult | null>;
}
```

### 2. 迁移意图规则

把 `DATA_AGENT_INTENT_RULES` 迁移到 `DataAgentDef.routes`：

```typescript
// data-agent.ts
export const DataAgentDef: AgentDef = {
  id: 'data-agent',
  routes: [
    { match: { intent: ['upload', 'explore', 'transform', 'merge'] }, priority: 10 },
    { match: { pattern: /上传|加载|读取|导入|file|csv|xlsx/i }, priority: 5 },
  ],
  // ...
};
```

### 3. AgentRegistry 增强

添加 `getAllRoutes()` 方法汇总所有 Agent 的路由规则：

```typescript
interface AgentRegistry {
  register(agent: AgentDef): void;
  get(agentId: string): AgentDef | undefined;
  getAllRoutes(): RouteRuleEntry[];  // 新增
}

interface RouteRuleEntry {
  agentId: string;
  rule: RouteRule;
}
```

### 4. LLM 语义路由

使用 LLM 判断用户意图属于哪个 Agent：

```typescript
private async llmRoute(message: string): Promise<RouterResult | null> {
  const agents = this.agentRegistry.getAll();
  const descriptions = agents.map(a => `${a.id}: ${a.description}`).join('\n');
  
  const prompt = `根据用户消息，判断应该由哪个 Agent 处理。

可选的 Agents:
${descriptions}

用户消息: ${message}

请只返回最合适的 Agent ID，不要返回其他内容。`;

  const response = await this.llmClient.call({ messages: [{ role: 'user', content: prompt }] });
  const agentId = response.content.trim();
  
  if (this.agentRegistry.get(agentId)) {
    return { agentId, matchedBy: 'llm', confidence: 0.8 };
  }
  
  return null;
}
```

## 文件变更

- 新建 `src/core/router.ts`
- 修改 `src/registry/agent-registry.ts`
- 修改 `src/agents/data-agent.ts`

## 测试验证

- [ ] 编译通过
- [ ] 规则路由正确匹配
- [ ] LLM 语义路由正确
- [ ] 默认 agent 正确

## 收尾工作

- [ ] 更新 README.md
- [ ] Git commit
