# VerumOS 重构计划 - Phase 5

## 问题描述

当前缺少 EventBus：
- WebSocket 推送是直接调用
- 快照触发逻辑在业务代码中
- 没有统一的扩展点机制

## 目标

按照 debug.md 的设计：

```
AgentLoop ──直接调用──▶ JobManager（状态变更，主路径）
AgentLoop ──发布事件──▶ EventBus ──▶ 订阅者（WebSocket、快照、日志）
```

EventBus 是观测旁路，不是控制流。核心状态变更走直接调用，EventBus 是这些调用完成后的"影子发布"。

## 修改步骤

### 1. 创建 EventBus

```typescript
// src/core/event-bus.ts

export class EventBus {
  private handlers = new Map<string, Set<(event: AgentEvent) => void>>();

  /**
   * 发布事件
   */
  publish<T>(event: AgentEvent<T>): void;

  /**
   * 订阅事件
   */
  subscribe<T>(type: string, handler: (event: AgentEvent<T>) => void): () => void;
}
```

### 2. 内置订阅者

| 订阅者 | 订阅事件 | 职责 |
|--------|----------|------|
| WsPublisher | 全部事件 | 推送到 WebSocket 客户端 |
| JobManager | 快照触发事件 | 自动创建快照 |
| TraceRecorder | tool 相关事件 | 追加执行轨迹到 job.json |

### 3. 快照触发事件

| 事件 | 快照触发时机 |
|------|------------|
| `requirement.saved` | 需求文档保存后 |
| `analysis.before_execute` | 执行分析前 |
| `analysis.after_execute` | 执行分析后 |
| `file.uploaded` | 文件上传后 |

### 4. 集成到 AgentLoop

```typescript
// 在关键节点发布事件
yield createEvent('agent_start', { agentId: agent.id });
eventBus.publish(event);

yield createEvent('tool_execution_start', { toolCalls });
eventBus.publish(event);
```

## 文件变更

- 新建 `src/core/event-bus.ts`
- 修改 `src/runtime/agent-loop.ts`
- 修改 `src/ws/` 目录

## 测试验证

- [ ] 编译通过
- [ ] 事件发布正确
- [ ] WebSocket 推送正常
- [ ] 快照触发正常

## 收尾工作

- [ ] 更新 README.md
- [ ] Git commit
