/**
 * Long Term Memory - 长期记忆（Phase 2）
 *
 * 职责：
 * - 跨 job 向量检索
 * - 存储历史分析方案和用户偏好
 *
 * Phase 1 实现：空返回
 * Phase 2 实现：向量索引 + 语义检索
 */

import type { MemoryPolicy } from '../types.js';

interface LongTermMemoryPolicy {
  enabled?: boolean;
  topK?: number;              // 检索最相关的 K 条记忆
}

/**
 * 长期记忆条目
 */
interface LongTermMemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    jobId?: string;
    type: 'analysis' | 'preference' | 'feedback' | 'insight';
    createdAt: string;
  };
}

/**
 * 长期记忆检索结果
 */
interface LongTermMemoryResult {
  entries: LongTermMemoryEntry[];
  context: string;
}

/**
 * Phase 1 实现：空返回
 *
 * Phase 2 将实现：
 * - 向量索引（使用 pgvector 或本地 FAISS）
 * - 语义检索
 * - 记忆过期和清理策略
 */
export class LongTermMemory {
  private policy: LongTermMemoryPolicy;

  constructor(policy?: LongTermMemoryPolicy) {
    this.policy = {
      enabled: false,
      topK: 5,
      ...policy,
    };
  }

  /**
   * 检索相关记忆
   *
   * Phase 1: 返回空结果
   * Phase 2: 语义检索最相关的 K 条记忆
   */
  async retrieve(query: string, _jobId?: string): Promise<LongTermMemoryResult | null> {
    if (!this.policy.enabled) {
      return null;
    }

    // Phase 1: 空实现
    // Phase 2: 向量检索
    console.log(`[LongTermMemory] Query: ${query} (Phase 2 feature)`);

    return null;
  }

  /**
   * 存储记忆
   *
   * Phase 1: 不存储
   * Phase 2: 向量嵌入 + 存储
   */
  async store(_entry: Omit<LongTermMemoryEntry, 'id' | 'createdAt'>): Promise<string | null> {
    if (!this.policy.enabled) {
      return null;
    }

    // Phase 1: 空实现
    // Phase 2: 向量嵌入 + 存储
    return null;
  }

  /**
   * 更新策略
   */
  setPolicy(policy: Partial<LongTermMemoryPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }

  /**
   * 检查是否启用
   */
  isEnabled(): boolean {
    return this.policy.enabled ?? false;
  }
}

/**
 * 创建默认的 LongTermMemory
 */
export function createLongTermMemory(policy?: LongTermMemoryPolicy): LongTermMemory {
  return new LongTermMemory(policy);
}
