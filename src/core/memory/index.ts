/**
 * Memory Manager - Memory 管理器
 *
 * 职责：
 * - 组合 WorkingMemory、JobMemory、LongTermMemory
 * - 提供统一的接口供 AgentLoop 使用
 *
 * Memory 分三层：
 * - WorkingMemory: 消息历史 + token 截断
 * - JobMemory: job 结构化状态注入
 * - LongTermMemory: 跨 job 向量检索（Phase 2）
 */

import type { 
  Message, 
  MemoryPolicy, 
  MemoryBundle, 
  TraceEntry,
  JobMemoryPolicy,
  WorkingMemoryPolicy,
  LongTermMemoryPolicy,
} from '../types.js';
import { WorkingMemory, createWorkingMemory } from './working-memory.js';
import { JobMemory, createJobMemory } from './job-memory.js';
import { LongTermMemory, createLongTermMemory } from './long-term-memory.js';

/**
 * Memory 管理器实现
 */
export class MemoryManager {
  private workingMemory: WorkingMemory;
  private jobMemory: JobMemory;
  private longTermMemory: LongTermMemory;
  private defaultPolicy: MemoryPolicy;

  constructor(policy?: MemoryPolicy) {
    this.defaultPolicy = policy || this.createDefaultPolicy();
    
    this.workingMemory = createWorkingMemory(this.defaultPolicy.workingMemory);
    this.jobMemory = createJobMemory(this.defaultPolicy.jobMemory);
    this.longTermMemory = createLongTermMemory(this.defaultPolicy.longTermMemory);
  }

  /**
   * 组装所有 memory 为一个捆绑包
   *
   * 这是 MemoryManager 的核心方法：
   * 1. 截断消息历史（WorkingMemory）
   * 2. 读取 job 状态并格式化（JobMemory）
   * 3. 检索相关长期记忆（LongTermMemory - Phase 2）
   */
  async assemble(
    jobId: string | undefined,
    messages: Message[],
    policy?: MemoryPolicy
  ): Promise<MemoryBundle> {
    const effectivePolicy = { ...this.defaultPolicy, ...policy };

    // 1. 截断消息历史
    const truncatedMessages = this.workingMemory.truncate(messages);

    // 2. 读取 job 状态
    let jobContext: string | undefined;
    if (jobId) {
      jobContext = await this.jobMemory.assemble(jobId) ?? undefined;
    }

    // 3. 检索长期记忆（Phase 2）
    let longTermContext: string | undefined;
    if (effectivePolicy.longTermMemory?.enabled && messages.length > 0) {
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
      if (lastUserMessage) {
        const result = await this.longTermMemory.retrieve(lastUserMessage.content, jobId);
        if (result) {
          longTermContext = result.context;
        }
      }
    }

    return {
      truncatedMessages,
      jobContext,
      longTermContext,
    };
  }

  /**
   * 追加执行轨迹到 job
   *
   * 委托给 JobManager，这里提供接口保持一致性
   */
  async appendTrace(_jobId: string, _trace: TraceEntry): Promise<void> {
    // 实际实现由 JobManager 负责
    // 这里提供接口供未来扩展
  }

  /**
   * 更新策略
   */
  setPolicy(policy: Partial<MemoryPolicy>): void {
    this.defaultPolicy = { ...this.defaultPolicy, ...policy };
    
    if (policy.workingMemory) {
      this.workingMemory.setPolicy(policy.workingMemory);
    }
    if (policy.jobMemory) {
      this.jobMemory.setPolicy(policy.jobMemory);
    }
    if (policy.longTermMemory) {
      this.longTermMemory.setPolicy(policy.longTermMemory);
    }
  }

  /**
   * 创建默认策略
   */
  private createDefaultPolicy(): MemoryPolicy {
    return {
      workingMemory: {
        maxMessages: 50,
        maxTokens: 40000,
      },
      jobMemory: {
        includeDatasetMeta: true,
        includeRequirementDoc: true,
        includeRecentTraces: 5,
      },
      longTermMemory: {
        enabled: false,
        topK: 5,
      },
    };
  }
}

/**
 * 创建默认的 MemoryManager
 */
export function createMemoryManager(policy?: MemoryPolicy): MemoryManager {
  return new MemoryManager(policy);
}

// 导出子模块
export { WorkingMemory, createWorkingMemory } from './working-memory.js';
export { JobMemory, createJobMemory } from './job-memory.js';
export { LongTermMemory, createLongTermMemory } from './long-term-memory.js';
