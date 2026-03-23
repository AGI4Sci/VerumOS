/**
 * TraceRecorder - 执行轨迹记录器
 *
 * 订阅 tool 相关事件，自动记录执行轨迹到 job.json
 */

import type { EventBus, AgentEvent, JobManager } from '../types.js';

/**
 * 注册 TraceRecorder 订阅者
 *
 * 订阅事件：
 * - tool_execution_start: 记录工具调用开始
 * - tool_result: 记录工具执行结果
 */
export function registerTraceRecorder(eventBus: EventBus, jobManager: JobManager): void {
  // 订阅工具调用开始
  eventBus.subscribe('tool_execution_start', async (event: AgentEvent) => {
    if (event.jobId && event.data) {
      try {
        await jobManager.appendTrace(event.jobId, {
          type: 'tool_call',
          step: 0, // 将由 jobManager 自动分配
          timestamp: new Date().toISOString(),
          data: event.data as Record<string, unknown>,
        });
      } catch (error) {
        console.error('[TraceRecorder] Failed to append tool_call trace:', error);
      }
    }
  });

  // 订阅工具执行结果
  eventBus.subscribe('tool_result', async (event: AgentEvent) => {
    if (event.jobId && event.data) {
      try {
        await jobManager.appendTrace(event.jobId, {
          type: 'tool_result',
          step: 0, // 将由 jobManager 自动分配
          timestamp: new Date().toISOString(),
          data: event.data as Record<string, unknown>,
        });
      } catch (error) {
        console.error('[TraceRecorder] Failed to append tool_result trace:', error);
      }
    }
  });

  console.log('[TraceRecorder] Registered to EventBus');
}
