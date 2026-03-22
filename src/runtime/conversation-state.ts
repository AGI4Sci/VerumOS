/**
 * Conversation State - 对话状态机
 *
 * 管理对话的状态转换和历史记录
 */

import type { Message, ConversationContext } from '../agents/types.js';

export type ConversationState =
  | 'idle'
  | 'uploading'
  | 'exploring'
  | 'discussing'
  | 'executing'
  | 'completed'
  | 'error';

export interface StateTransition {
  from: ConversationState;
  to: ConversationState;
  trigger: string;
}

export class ConversationStateMachine {
  private state: ConversationState = 'idle';
  private transitions: StateTransition[] = [
    { from: 'idle', to: 'uploading', trigger: 'upload' },
    { from: 'uploading', to: 'idle', trigger: 'complete' },
    { from: 'idle', to: 'exploring', trigger: 'explore' },
    { from: 'exploring', to: 'idle', trigger: 'complete' },
    { from: 'idle', to: 'discussing', trigger: 'requirement' },
    { from: 'discussing', to: 'idle', trigger: 'cancel' },
    { from: 'discussing', to: 'executing', trigger: 'execute' },
    { from: 'executing', to: 'completed', trigger: 'complete' },
    { from: 'executing', to: 'error', trigger: 'error' },
    { from: 'error', to: 'idle', trigger: 'reset' },
    { from: 'completed', to: 'idle', trigger: 'reset' },
  ];

  getState(): ConversationState {
    return this.state;
  }

  canTransition(trigger: string): boolean {
    return this.transitions.some(
      (t) => t.from === this.state && t.trigger === trigger
    );
  }

  transition(trigger: string): boolean {
    const transition = this.transitions.find(
      (t) => t.from === this.state && t.trigger === trigger
    );
    if (transition) {
      this.state = transition.to;
      return true;
    }
    return false;
  }

  reset(): void {
    this.state = 'idle';
  }
}

/**
 * 创建空的对话上下文
 */
export function createEmptyContext(sessionId: string): ConversationContext {
  return {
    sessionId,
    messages: [],
    datasets: new Map(),
  };
}

/**
 * 添加消息到上下文
 */
export function appendMessage(
  context: ConversationContext,
  role: 'user' | 'assistant' | 'system',
  content: string
): void {
  const message: Message = {
    role,
    content,
    timestamp: Date.now(),
  };
  context.messages.push(message);
}