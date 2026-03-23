/**
 * Runtime 模块导出
 */

export { AgentRuntime, type RuntimeConfig } from './agent-runtime.js';
export { LLMClient, type LLMClientConfig, type ChatWithToolsResult } from './llm-client.js';
export { IntentClassifier, type IntentRule, type IntentClassifierConfig } from './intent-classifier.js';
export {
  ConversationStateMachine,
  type ConversationState,
  type StateTransition,
  createEmptyContext,
  appendMessage,
} from './conversation-state.js';

// AgentLoop 相关类型从 core/types.ts 导入
export type {
  AgentEventType,
  AgentEvent,
  ToolCall,
  ToolResult,
  Message,
  AgentContext,
} from '../core/types.js';

// 新版 AgentLoop（带 CoreServices 注入）
export { agentLoop, type AgentLoopConfig } from './agent-loop.js';