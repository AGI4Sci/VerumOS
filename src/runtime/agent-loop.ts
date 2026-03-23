/**
 * Agent Loop - 核心执行引擎（重构版）
 *
 * 完全重构，接受 CoreServices 注入，符合 debug.md 架构设计：
 * - 不自己 import 任何 core 模块
 * - 通过 CoreServices 容器接收依赖
 * - 使用 MemoryManager 组装上下文
 * - 使用 SkillRegistry 解析工具
 * - 使用 EventBus 发布事件
 */

import type {
  CoreServices,
  AgentDef,
  AgentContext,
  AgentEvent,
  AgentEventType,
  Message,
  ToolCall,
  ToolResult,
} from '../core/types.js';

/**
 * Agent Loop 配置
 */
export interface AgentLoopConfig {
  agentDef: AgentDef;
  services: CoreServices;
  maxTurns?: number;
}

/**
 * 创建 Agent 事件
 */
function createEvent(
  type: AgentEventType,
  data?: unknown,
  jobId?: string,
  sessionId?: string
): AgentEvent {
  return {
    type,
    timestamp: new Date().toISOString(),
    jobId,
    sessionId,
    data,
  };
}

/**
 * Agent Loop - 核心执行循环
 *
 * 这是一个 async generator，产出事件流。
 * 业务 Agent 只需要声明 systemPrompt、tools、hooks。
 */
export async function* agentLoop(
  messages: Message[],
  context: AgentContext,
  config: AgentLoopConfig
): AsyncGenerator<AgentEvent> {
  const { agentDef, services, maxTurns = 10 } = config;
  const { memory, skillRegistry, toolRegistry, jobManager, llmClient, eventBus } = services;

  let stepCount = 0;

  // 发布 agent_start 事件
  const startEvent = createEvent('agent_start', { agentId: agentDef.id }, context.jobId, context.sessionId);
  eventBus.publish(startEvent);
  yield startEvent;

  try {
    while (stepCount < maxTurns) {
      stepCount++;
      const turnStartEvent = createEvent('turn_start', { step: stepCount }, context.jobId, context.sessionId);
      eventBus.publish(turnStartEvent);
      yield turnStartEvent;

      // 1. 执行 beforeTurn hook
      let currentContext = { ...context };
      if (agentDef.hooks?.beforeTurn) {
        currentContext = await agentDef.hooks.beforeTurn(currentContext);
      }

      // 2. 使用 MemoryManager 组装上下文
      const memoryBundle = await memory.assemble(
        agentDef.memoryPolicy || {},
        context.jobId,
        messages
      );

      // 3. 使用 SkillRegistry 解析工具
      const { tools, skillDocs } = skillRegistry.resolve(agentDef.skills);

      // 合并 agent 私有工具
      const allTools = [...tools, ...(agentDef.tools || [])];

      // 4. 构建系统提示
      let systemPrompt = agentDef.systemPrompt;
      if (skillDocs.length > 0) {
        systemPrompt += '\n\n# 可用工具说明\n\n' + skillDocs.join('\n\n');
      }
      if (memoryBundle.jobContext) {
        systemPrompt += '\n\n# 当前任务上下文\n\n' + memoryBundle.jobContext;
      }
      if (currentContext.systemPromptSuffix) {
        systemPrompt += '\n\n' + currentContext.systemPromptSuffix;
      }

      // 5. 准备消息（应用 convertToLlm hook）
      let messagesForLlm = memoryBundle.truncatedMessages;
      if (agentDef.hooks?.convertToLlm) {
        messagesForLlm = agentDef.hooks.convertToLlm(messagesForLlm);
      }

      // 添加系统消息
      const llmMessages: Message[] = [
        { role: 'system', content: systemPrompt },
        ...messagesForLlm,
      ];

      // 6. 调用 LLM
      const messageStartEvent = createEvent('message_start', undefined, context.jobId, context.sessionId);
      eventBus.publish(messageStartEvent);
      yield messageStartEvent;

      let response: string;
      let toolCalls: ToolCall[] = [];

      if (llmClient.isAvailable()) {
        try {
          const result = await llmClient.chatWithTools(llmMessages, allTools);
          response = result.content;
          toolCalls = result.toolCalls;

          // 流式产出消息更新
          const messageUpdateEvent = createEvent('message_update', { delta: response }, context.jobId, context.sessionId);
          eventBus.publish(messageUpdateEvent);
          yield messageUpdateEvent;
        } catch (error) {
          response = 'LLM 调用失败，请稍后重试。';
          const errorEvent = createEvent('error', {
            message: error instanceof Error ? error.message : String(error),
          }, context.jobId, context.sessionId);
          eventBus.publish(errorEvent);
          yield errorEvent;
        }
      } else {
        response = '当前未配置 LLM API，无法处理此请求。';
      }

      const messageEndEvent = createEvent('message_end', { content: response }, context.jobId, context.sessionId);
      eventBus.publish(messageEndEvent);
      yield messageEndEvent;

      // 7. 添加助手消息
      const assistantMessage: Message = {
        role: 'assistant',
        content: response,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
      messages.push(assistantMessage);

      // 8. 检查是否有工具调用
      if (toolCalls.length === 0) {
        const turnEndEvent = createEvent('turn_end', { step: stepCount }, context.jobId, context.sessionId);
        eventBus.publish(turnEndEvent);
        yield turnEndEvent;
        break;
      }

      // 9. 执行工具
      const toolExecutionStartEvent = createEvent('tool_execution_start', { toolCalls }, context.jobId, context.sessionId);
      eventBus.publish(toolExecutionStartEvent);
      yield toolExecutionStartEvent;

      const results: ToolResult[] = [];
      for (const toolCall of toolCalls) {
        const tool = allTools.find((t) => t.name === toolCall.name);
        if (!tool) {
          const result: ToolResult = {
            toolCallId: toolCall.id,
            name: toolCall.name,
            result: null,
            error: `Tool not found: ${toolCall.name}`,
          };
          results.push(result);
          continue;
        }

        try {
          const toolContext = {
            jobId: context.jobId,
            sessionId: context.sessionId,
            datasets: currentContext.datasets,
            activeDatasetId: currentContext.activeDatasetId,
          };
          const result = await tool.execute(toolCall.arguments, toolContext);
          const toolResult: ToolResult = {
            toolCallId: toolCall.id,
            name: toolCall.name,
            result,
          };
          results.push(toolResult);

          // 执行 afterToolCall hook
          if (agentDef.hooks?.afterToolCall) {
            await agentDef.hooks.afterToolCall(toolResult, currentContext);
          }
        } catch (error) {
          const result: ToolResult = {
            toolCallId: toolCall.id,
            name: toolCall.name,
            result: null,
            error: error instanceof Error ? error.message : String(error),
          };
          results.push(result);
        }
      }

      const toolExecutionEndEvent = createEvent('tool_execution_end', { results }, context.jobId, context.sessionId);
      eventBus.publish(toolExecutionEndEvent);
      yield toolExecutionEndEvent;

      // 10. 添加工具结果消息
      for (const result of results) {
        const toolResultEvent = createEvent('tool_result', result, context.jobId, context.sessionId);
        eventBus.publish(toolResultEvent);
        yield toolResultEvent;

        messages.push({
          role: 'tool',
          content: JSON.stringify(result.result),
          toolCallId: result.toolCallId,
          name: result.name,
        });
      }

      // 11. 更新 Job 状态
      // 获取当前 job 并更新状态
      const currentJob = await jobManager.get(context.jobId);
      if (currentJob) {
        await jobManager.update(context.jobId, {
          state: {
            activeDatasetId: currentContext.activeDatasetId,
            datasets: Array.from(currentContext.datasets.values()).map(d => ({
              id: d.id,
              name: d.name,
              path: d.path,
              format: d.format,
              skill: d.skill,
              metadata: d.metadata,
            })),
            messages,
          },
        } as any); // 使用 any 避免类型不匹配问题
      }

      const turnEndEvent = createEvent('turn_end', { step: stepCount }, context.jobId, context.sessionId);
      eventBus.publish(turnEndEvent);
      yield turnEndEvent;
    }
  } catch (error) {
    const errorEvent = createEvent('error', {
      message: error instanceof Error ? error.message : String(error),
    }, context.jobId, context.sessionId);
    eventBus.publish(errorEvent);
    yield errorEvent;
  }

  const agentEndEvent = createEvent('agent_end', { stepCount }, context.jobId, context.sessionId);
  eventBus.publish(agentEndEvent);
  yield agentEndEvent;
}

// ============================================================================
// 向后兼容的旧版 API（将被废弃）
// ============================================================================

/**
 * @deprecated 使用新版 agentLoop，接受 CoreServices 注入
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

/**
 * @deprecated 使用新版 AgentLoopConfig
 */
export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  tools: AgentTool[];
  convertToLlm?: (messages: AgentMessage[]) => AgentMessage[];
}

/**
 * @deprecated 使用 core/types.ts 中的 Message
 */
export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

/**
 * @deprecated 使用新版 agentLoop
 */
export interface AgentLoopConfigLegacy {
  llmClient: any;
  agent: AgentConfig;
  maxTurns?: number;
  onIntent?: (intent: any) => void;
}

/**
 * @deprecated 使用新版 agentLoop
 */
export async function* agentLoopLegacy(
  messages: AgentMessage[],
  conversationContext: any,
  config: AgentLoopConfigLegacy
): AsyncGenerator<any> {
  console.warn('[agentLoop] Using legacy agentLoop. Please migrate to new CoreServices-based API.');
  // 保留旧的实现逻辑...
  // 这里只是占位，实际调用应该迁移到新版
  yield { type: 'error', data: { message: 'Legacy agentLoop is deprecated' } };
}
