import { v4 as uuidv4 } from 'uuid';
import type { ConversationContext, Dataset, Message } from './agents/types.js';

const sessions = new Map<string, ConversationContext>();

function createContext(sessionId: string): ConversationContext {
  return {
    sessionId,
    messages: [],
    datasets: new Map(),
  };
}

export function getOrCreateSession(sessionId?: string): ConversationContext {
  if (sessionId) {
    const existing = sessions.get(sessionId);
    if (existing) {
      return existing;
    }
  }

  const nextSessionId = sessionId || uuidv4();
  const context = createContext(nextSessionId);
  sessions.set(nextSessionId, context);
  return context;
}

export function createSession(): ConversationContext {
  return getOrCreateSession();
}

export function getSession(sessionId: string): ConversationContext | undefined {
  return sessions.get(sessionId);
}

export function appendMessage(sessionId: string, message: Message): ConversationContext {
  const context = getOrCreateSession(sessionId);
  context.messages.push(message);
  return context;
}

export function upsertDataset(sessionId: string, dataset: Dataset): ConversationContext {
  const context = getOrCreateSession(sessionId);
  context.datasets.set(dataset.id, dataset);
  context.activeDatasetId = dataset.id;
  return context;
}

export function serializeContext(context: ConversationContext) {
  return {
    sessionId: context.sessionId,
    activeDatasetId: context.activeDatasetId,
    currentIntent: context.currentIntent,
    messages: context.messages,
    datasets: Array.from(context.datasets.values()),
  };
}
