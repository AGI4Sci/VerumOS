# VerumOS 重构计划 - Phase 3

## 问题描述

当前缺少独立的 Memory 层：
- 消息历史存储在 `job.json.state.messages`
- 数据集元信息存储在 `job.json.state.datasets`
- 需求文档存储在单独的 `requirement.json` 文件
- 没有统一的消息截断策略
- 没有 job 上下文格式化注入

## 目标

按照 debug.md 的设计，Memory 分三层：

```
┌──────────────────────────────────────────────────┐
│                  MemoryManager                    │
│   assemble(policy, jobId, messages): MemoryBundle │
└────────────┬──────────────────┬───────────────────┘
             │                  │                │
      WorkingMemory         JobMemory      LongTermMemory
      （消息历史）        （job 结构化状态） （跨 job 向量检索）
```

### WorkingMemory
- 存储当前 session 的完整消息历史
- 按 `memoryPolicy.workingMemory` 的 token 预算截断
- 截断策略：优先保留 system prompt 和最新用户消息

### JobMemory
- 从 `job.json` 读取结构化状态
- 以格式化文本块的形式注入 context
- 包含：数据集元信息、需求文档、最近 N 条 traces

### LongTermMemory
- Phase 2 功能，接口预留
- Phase 1 实现为空返回

## 修改步骤

### 1. 创建 Memory 目录结构

```
src/core/memory/
├── index.ts            # MemoryManager 接口 + 实现入口
├── working-memory.ts   # 消息历史 + token 截断
├── job-memory.ts       # job 结构化状态注入
└── long-term-memory.ts # Phase 2，接口预留
```

### 2. 实现 WorkingMemory

```typescript
export class WorkingMemory {
  /**
   * 截断消息历史以适应 token 预算
   */
  truncate(messages: Message[], policy: WorkingMemoryPolicy): Message[];
  
  /**
   * 估算消息的 token 数量
   */
  estimateTokens(message: Message): number;
}
```

### 3. 实现 JobMemory

```typescript
export class JobMemory {
  /**
   * 从 job.json 读取结构化状态并格式化为文本
   */
  async assemble(jobId: string, policy: JobMemoryPolicy): Promise<string | null>;
  
  /**
   * 格式化数据集元信息
   */
  formatDatasets(datasets: DatasetInfo[]): string;
  
  /**
   * 格式化需求文档
   */
  formatRequirement(requirement: RequirementDocument): string;
  
  /**
   * 格式化执行轨迹
   */
  formatTraces(traces: TraceEntry[]): string;
}
```

### 4. 实现 MemoryManager

```typescript
export class MemoryManager {
  private workingMemory: WorkingMemory;
  private jobMemory: JobMemory;
  private longTermMemory: LongTermMemory;

  /**
   * 组装所有 memory 为一个捆绑包
   */
  async assemble(
    policy: MemoryPolicy,
    jobId: string,
    messages: Message[]
  ): Promise<MemoryBundle>;
}
```

## 文件变更

- 新建 `src/core/memory/index.ts`
- 新建 `src/core/memory/working-memory.ts`
- 新建 `src/core/memory/job-memory.ts`
- 新建 `src/core/memory/long-term-memory.ts`

## 测试验证

- [ ] 编译通过
- [ ] 消息截断正确
- [ ] Job 上下文格式化正确
- [ ] 现有功能运行正常

## 收尾工作

- [ ] 更新 README.md
- [ ] Git commit
