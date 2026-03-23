/**
 * WsPublisher - WebSocket 事件推送器
 *
 * 订阅所有 Agent 事件，推送到 WebSocket 客户端
 */

import type { EventBus, AgentEvent } from '../types.js';
import { emitSessionEvent } from '../../ws/server.js';

/**
 * 注册 WsPublisher 订阅者
 *
 * 订阅所有事件（通配符 '*'），推送到对应 session 的 WebSocket 客户端
 */
export function registerWsPublisher(eventBus: EventBus): void {
  eventBus.subscribe('*', (event: AgentEvent) => {
    if (event.sessionId) {
      try {
        emitSessionEvent(event.sessionId, {
          type: event.type,
          payload: event.data,
          timestamp: event.timestamp ? Date.parse(event.timestamp) : Date.now(),
        });
      } catch (error) {
        console.error('[WsPublisher] Failed to emit WebSocket event:', error);
      }
    }
  });

  console.log('[WsPublisher] Registered to EventBus');
}
