/**
 * Working Memory - 消息历史管理
 *
 * 职责：
 * - 存储当前 session 的完整消息历史
 * - 按 token 预算截断
 * - 优先保留 system prompt 和最新用户消息
 */

import type { Message, MemoryPolicy } from '../types.js';

interface WorkingMemoryPolicy {
  maxMessages?: number;       // 保留最近 N 条消息
  maxTokens?: number;         // token 预算上限
}

/**
 * 消息节点（用于截断决策）
 */
interface MessageNode {
  message: Message;
  tokens: number;
  priority: number;           // 越高越重要
}

/**
 * 默认 token 预算
 */
const DEFAULT_MAX_TOKENS = 40000;
const DEFAULT_MAX_MESSAGES = 50;

/**
 * 字符到 token 的粗略估算比例
 * 中文约 1.5 字符/token，英文约 4 字符/token
 * 取保守值 2
 */
const CHARS_PER_TOKEN = 2;

export class WorkingMemory {
  private policy: WorkingMemoryPolicy;

  constructor(policy?: WorkingMemoryPolicy) {
    this.policy = policy || {};
  }

  /**
   * 截断消息历史以适应 token 预算
   *
   * 策略：
   * 1. 保留所有 system 消息（优先级最高）
   * 2. 保留最新的用户消息
   * 3. 按时间倒序保留消息，直到达到 token 预算
   */
  truncate(messages: Message[]): Message[] {
    const maxTokens = this.policy.maxTokens || DEFAULT_MAX_TOKENS;
    const maxMessages = this.policy.maxMessages || DEFAULT_MAX_MESSAGES;

    // 先按消息数量限制
    if (messages.length <= maxMessages) {
      const totalTokens = this.estimateMessagesTokens(messages);
      if (totalTokens <= maxTokens) {
        return messages;
      }
    }

    // 计算每条消息的优先级和 token 数
    const nodes: MessageNode[] = messages.map((msg, index) => ({
      message: msg,
      tokens: this.estimateTokens(msg),
      priority: this.calculatePriority(msg, index, messages.length),
    }));

    // 按优先级排序（高优先级在前）
    nodes.sort((a, b) => b.priority - a.priority);

    // 按优先级选择消息，直到达到 token 预算
    const selected: MessageNode[] = [];
    let totalTokens = 0;

    for (const node of nodes) {
      if (totalTokens + node.tokens <= maxTokens) {
        selected.push(node);
        totalTokens += node.tokens;
      }
    }

    // 按原始顺序返回
    return selected
      .sort((a, b) => messages.indexOf(a.message) - messages.indexOf(b.message))
      .map((node) => node.message);
  }

  /**
   * 计算消息的优先级
   *
   * 规则：
   * - system 消息：100（最高）
   * - 最新用户消息：90
   * - 最新助手消息：80
   * - 工具结果消息：70
   * - 其他消息：50 + (index / total) * 30（越新越重要）
   */
  private calculatePriority(msg: Message, index: number, total: number): number {
    // system 消息最高优先级
    if (msg.role === 'system') {
      return 100;
    }

    // 最新消息优先级高
    const recency = index / total;

    switch (msg.role) {
      case 'user':
        // 最新用户消息优先级更高
        return 85 + recency * 10;
      case 'assistant':
        // 最新助手消息
        return 75 + recency * 10;
      case 'tool':
        // 工具结果
        return 65 + recency * 10;
      default:
        return 50 + recency * 30;
    }
  }

  /**
   * 估算消息的 token 数量
   */
  estimateTokens(message: Message): number {
    let total = 0;

    // 内容
    if (message.content) {
      total += Math.ceil(message.content.length / CHARS_PER_TOKEN);
    }

    // 工具调用
    if (message.toolCalls) {
      for (const tc of message.toolCalls) {
        total += Math.ceil(JSON.stringify(tc).length / CHARS_PER_TOKEN);
      }
    }

    // 名称和角色开销
    total += 10;

    return total;
  }

  /**
   * 估算多条消息的 token 总数
   */
  estimateMessagesTokens(messages: Message[]): number {
    return messages.reduce((sum, msg) => sum + this.estimateTokens(msg), 0);
  }

  /**
   * 更新策略
   */
  setPolicy(policy: WorkingMemoryPolicy): void {
    this.policy = { ...this.policy, ...policy };
  }
}

/**
 * 创建默认的 WorkingMemory
 */
export function createWorkingMemory(policy?: WorkingMemoryPolicy): WorkingMemory {
  return new WorkingMemory(policy);
}
