/**
 * EventBus - 事件总线
 *
 * 职责：
 * - 发布/订阅事件
 * - 解耦事件源和事件处理者
 *
 * 设计原则：
 * - EventBus 是观测旁路，不是控制流
 * - 核心状态变更走直接调用，EventBus 是这些调用完成后的"影子发布"
 * - 订阅者不应该抛出异常影响主流程
 */

import type { AgentEvent, AgentEventType } from './types.js';

/**
 * 事件处理器
 */
type EventHandler<T = unknown> = (event: AgentEvent<T>) => void | Promise<void>;

/**
 * EventBus 实现
 */
export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private asyncHandlers = new Map<string, Set<EventHandler>>();
  private eventLog: AgentEvent[] = [];
  private maxLogSize = 100;

  /**
   * 发布事件
   *
   * 同步调用所有订阅者，不等待结果
   * 订阅者的异常会被捕获并记录，不影响主流程
   */
  publish<T>(event: AgentEvent<T>): void {
    // 记录事件日志
    this.logEvent(event);

    // 获取所有匹配的处理器
    const handlers = this.handlers.get(event.type);
    const asyncHandlers = this.asyncHandlers.get(event.type);

    // 调用同步处理器
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`[EventBus] Handler error for ${event.type}:`, error);
        }
      }
    }

    // 调用异步处理器（不等待）
    if (asyncHandlers) {
      for (const handler of asyncHandlers) {
        const result = handler(event);
        if (result instanceof Promise) {
          result.catch((error: Error) => {
            console.error(`[EventBus] Async handler error for ${event.type}:`, error);
          });
        }
      }
    }

    // 也调用通配符处理器
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`[EventBus] Wildcard handler error:`, error);
        }
      }
    }
  }

  /**
   * 发布事件并等待所有异步处理器完成
   */
  async publishAndWait<T>(event: AgentEvent<T>): Promise<void> {
    this.logEvent(event);

    const handlers = this.handlers.get(event.type);
    const asyncHandlers = this.asyncHandlers.get(event.type);

    const promises: Promise<void>[] = [];

    if (handlers) {
      for (const handler of handlers) {
        try {
          const result = handler(event);
          if (result instanceof Promise) {
            promises.push(result);
          }
        } catch (error) {
          console.error(`[EventBus] Handler error for ${event.type}:`, error);
        }
      }
    }

    if (asyncHandlers) {
      for (const handler of asyncHandlers) {
        const result = handler(event);
        if (result instanceof Promise) {
          promises.push(result);
        }
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * 订阅事件
   *
   * @returns 取消订阅的函数
   */
  subscribe<T>(type: AgentEventType | '*', handler: EventHandler<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler as EventHandler);

    // 返回取消订阅函数
    return () => {
      this.handlers.get(type)?.delete(handler as EventHandler);
    };
  }

  /**
   * 订阅事件（异步处理器）
   *
   * @returns 取消订阅的函数
   */
  subscribeAsync<T>(type: AgentEventType | '*', handler: EventHandler<T>): () => void {
    if (!this.asyncHandlers.has(type)) {
      this.asyncHandlers.set(type, new Set());
    }
    this.asyncHandlers.get(type)!.add(handler as EventHandler);

    return () => {
      this.asyncHandlers.get(type)?.delete(handler as EventHandler);
    };
  }

  /**
   * 取消所有订阅
   */
  clear(): void {
    this.handlers.clear();
    this.asyncHandlers.clear();
    this.eventLog = [];
  }

  /**
   * 获取事件日志
   */
  getEventLog(limit?: number): AgentEvent[] {
    if (limit) {
      return this.eventLog.slice(-limit);
    }
    return [...this.eventLog];
  }

  /**
   * 记录事件
   */
  private logEvent<T>(event: AgentEvent<T>): void {
    this.eventLog.push(event as AgentEvent);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }
  }
}

/**
 * 全局 EventBus 实例
 */
export const eventBus = new EventBus();

/**
 * 创建 EventBus
 */
export function createEventBus(): EventBus {
  return new EventBus();
}

/**
 * 快速发布事件的辅助函数
 */
export function publishEvent<T>(
  type: AgentEventType,
  data?: T,
  jobId?: string,
  sessionId?: string
): void {
  eventBus.publish({
    type,
    timestamp: new Date().toISOString(),
    jobId,
    sessionId,
    data,
  });
}
