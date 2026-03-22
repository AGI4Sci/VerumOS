/**
 * Agent Loop - 核心执行引擎
 *
 * 纯执行引擎，不包含任何业务逻辑。
 * 参考 pi-mono 的 @mariozechner/pi-agent-core 架构。
 */

import type { LLMClient } from './llm-client.js';
import type { ConversationContext, Intent } from '../agents/types.js';

/**
 * Agent 事件类型
 */
export type AgentEventType =
  | 'agent_start'
  | 'agent_end'
  | 'turn_start'
  | 'turn_end'
  | 'message_start'
  | 'message_update'
  | 'message_end'
  | 'tool_execution_start'
  | 'tool_execution_end'
  | 'tool_result'
  | 'error';

/**
 * Agent 事件
 */
export interface AgentEvent {
  type: AgentEventType;
  timestamp: string;
  data?: unknown;
}

/**
 * 工具定义
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

/**
 * 工具调用
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * 工具结果
 */
export interface ToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  error?: string;
}

/**
 * Agent 配置（声明式）
 */
export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  tools: AgentTool[];
  convertToLlm?: (messages: AgentMessage[]) => AgentMessage[];
}

/**
 * Agent 消息
 */
export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

/**
 * Agent Loop 配置
 */
export interface AgentLoopConfig {
  llmClient: LLMClient;
  agent: AgentConfig;
  maxTurns?: number;
  onIntent?: (intent: Intent) => void;
}

/**
 * Agent 上下文
 */
export interface AgentContext {
  messages: AgentMessage[];
  context: ConversationContext;
  steeringQueue: AgentMessage[];
  stepCount: number;
}

/**
 * 创建 Agent 事件
 */
function createEvent(type: AgentEventType, data?: unknown): AgentEvent {
  return {
    type,
    timestamp: new Date().toISOString(),
    data,
  };
}

/**
 * Agent Loop - 核心执行循环
 *
 * 这是一个 async generator，产出事件流。
 * 业务 Agent 只需要声明 systemPrompt、tools、convertToLlm。
 */
export async function* agentLoop(
  messages: AgentMessage[],
  conversationContext: ConversationContext,
  config: AgentLoopConfig
): AsyncGenerator<AgentEvent> {
  const { llmClient, agent, maxTurns = 10 } = config;

  // 初始化上下文
  const ctx: AgentContext = {
    messages: [...messages],
    context: conversationContext,
    steeringQueue: [],
    stepCount: 0,
  };

  yield createEvent('agent_start', { agentId: agent.id });

  try {
    while (ctx.stepCount < maxTurns) {
      ctx.stepCount++;
      yield createEvent('turn_start', { step: ctx.stepCount });

      // 1. 准备消息
      const messagesForLlm = agent.convertToLlm
        ? agent.convertToLlm(ctx.messages)
        : ctx.messages;

      // 2. 调用 LLM
      yield createEvent('message_start');

      const systemMessage: AgentMessage = {
        role: 'system',
        content: agent.systemPrompt,
      };

      const llmMessages = [systemMessage, ...messagesForLlm];

      let response: string;
      let toolCalls: ToolCall[] = [];

      if (llmClient.isAvailable()) {
        try {
          const result = await llmClient.chatWithTools(
            llmMessages,
            agent.tools
          );
          response = result.content;
          toolCalls = result.toolCalls;
        } catch {
          response = 'LLM 调用失败，请稍后重试。';
        }
      } else {
        response = '当前未配置 LLM API，无法处理此请求。';
      }

      // 3. 流式产出消息更新
      yield createEvent('message_update', { delta: response });
      yield createEvent('message_end', { content: response });

      // 4. 添加助手消息
      const assistantMessage: AgentMessage = {
        role: 'assistant',
        content: response,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
      ctx.messages.push(assistantMessage);

      // 5. 检查是否有工具调用
      if (toolCalls.length === 0) {
        yield createEvent('turn_end', { step: ctx.stepCount });
        break;
      }

      // 6. 执行工具
      yield createEvent('tool_execution_start', { toolCalls });

      const results: ToolResult[] = [];
      for (const toolCall of toolCalls) {
        const tool = agent.tools.find((t) => t.name === toolCall.name);
        if (!tool) {
          results.push({
            toolCallId: toolCall.id,
            name: toolCall.name,
            result: null,
            error: `Tool not found: ${toolCall.name}`,
          });
          continue;
        }

        try {
          const result = await tool.execute(toolCall.arguments);
          results.push({
            toolCallId: toolCall.id,
            name: toolCall.name,
            result,
          });
        } catch (error) {
          results.push({
            toolCallId: toolCall.id,
            name: toolCall.name,
            result: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      yield createEvent('tool_execution_end', { results });

      // 7. 添加工具结果消息
      for (const result of results) {
        yield createEvent('tool_result', result);
        ctx.messages.push({
          role: 'tool',
          content: JSON.stringify(result.result),
          toolCallId: result.toolCallId,
          name: result.name,
        });
      }

      // 8. 检查 steering
      if (ctx.steeringQueue.length > 0) {
        ctx.messages.push(...ctx.steeringQueue);
        ctx.steeringQueue = [];
      }

      yield createEvent('turn_end', { step: ctx.stepCount });
    }
  } catch (error) {
    yield createEvent('error', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  yield createEvent('agent_end', { stepCount: ctx.stepCount });
}

/**
 * 创建空的 Agent 上下文
 */
export function createAgentContext(
  conversationContext: ConversationContext
): AgentContext {
  return {
    messages: [],
    context: conversationContext,
    steeringQueue: [],
    stepCount: 0,
  };
}

/**
 * 向上下文添加消息
 */
export function pushMessage(
  ctx: AgentContext,
  message: AgentMessage
): void {
  ctx.messages.push(message);
}

/**
 * 向 steering 队列添加消息
 */
export function pushSteering(
  ctx: AgentContext,
  message: AgentMessage
): void {
  ctx.steeringQueue.push(message);
}