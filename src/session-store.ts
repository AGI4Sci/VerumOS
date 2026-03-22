import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import type { ConversationContext, Dataset, Message } from './agents/types.js';

const SESSIONS_DIR = 'sessions';

function getSessionsDir(): string {
  return path.join(config.data.dir, SESSIONS_DIR);
}

function getSessionPath(sessionId: string): string {
  return path.join(getSessionsDir(), `${sessionId}.json`);
}

function createContext(sessionId: string): ConversationContext {
  return {
    sessionId,
    messages: [],
    datasets: new Map(),
  };
}

/**
 * 序列化上下文（Map 转数组）
 */
function serializeContext(context: ConversationContext): string {
  return JSON.stringify({
    sessionId: context.sessionId,
    activeDatasetId: context.activeDatasetId,
    currentIntent: context.currentIntent,
    messages: context.messages,
    datasets: Array.from(context.datasets.values()),
  });
}

/**
 * 反序列化上下文（数组转 Map）
 */
function deserializeContext(data: string): ConversationContext {
  const parsed = JSON.parse(data);
  const context: ConversationContext = {
    sessionId: parsed.sessionId,
    messages: parsed.messages || [],
    datasets: new Map(),
    activeDatasetId: parsed.activeDatasetId,
    currentIntent: parsed.currentIntent,
  };

  // 恢复 datasets Map
  if (Array.isArray(parsed.datasets)) {
    for (const dataset of parsed.datasets) {
      context.datasets.set(dataset.id, dataset);
    }
  }

  return context;
}

/**
 * 保存会话到文件
 */
async function saveSession(context: ConversationContext): Promise<void> {
  const sessionsDir = getSessionsDir();
  await fs.mkdir(sessionsDir, { recursive: true });
  const sessionPath = getSessionPath(context.sessionId);
  await fs.writeFile(sessionPath, serializeContext(context));
}

/**
 * 加载会话从文件
 */
async function loadSession(sessionId: string): Promise<ConversationContext | null> {
  const sessionPath = getSessionPath(sessionId);
  try {
    const data = await fs.readFile(sessionPath, 'utf-8');
    return deserializeContext(data);
  } catch {
    return null;
  }
}

/**
 * 获取或创建会话
 */
export async function getOrCreateSession(sessionId?: string): Promise<ConversationContext> {
  if (sessionId) {
    const existing = await loadSession(sessionId);
    if (existing) {
      return existing;
    }
  }

  const nextSessionId = sessionId || uuidv4();
  const context = createContext(nextSessionId);
  await saveSession(context);
  return context;
}

/**
 * 创建新会话
 */
export async function createSession(): Promise<ConversationContext> {
  return getOrCreateSession();
}

/**
 * 获取会话
 */
export async function getSession(sessionId: string): Promise<ConversationContext | undefined> {
  const context = await loadSession(sessionId);
  return context || undefined;
}

/**
 * 追加消息到会话
 */
export async function appendMessage(sessionId: string, message: Message): Promise<ConversationContext> {
  const context = await getOrCreateSession(sessionId);
  context.messages.push(message);
  await saveSession(context);
  return context;
}

/**
 * 更新数据集
 */
export async function upsertDataset(sessionId: string, dataset: Dataset): Promise<ConversationContext> {
  const context = await getOrCreateSession(sessionId);
  context.datasets.set(dataset.id, dataset);
  context.activeDatasetId = dataset.id;
  await saveSession(context);
  return context;
}

/**
 * 更新会话上下文
 */
export async function updateSession(context: ConversationContext): Promise<void> {
  await saveSession(context);
}

/**
 * 列出所有会话
 */
export async function listSessions(): Promise<Array<{ sessionId: string; updatedAt: Date }>> {
  const sessionsDir = getSessionsDir();
  try {
    const files = await fs.readdir(sessionsDir);
    const sessions: Array<{ sessionId: string; updatedAt: Date }> = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const sessionId = file.slice(0, -5);
        const stat = await fs.stat(path.join(sessionsDir, file));
        sessions.push({
          sessionId,
          updatedAt: stat.mtime,
        });
      }
    }

    return sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  } catch {
    return [];
  }
}

/**
 * 删除会话
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  const sessionPath = getSessionPath(sessionId);
  try {
    await fs.unlink(sessionPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 序列化上下文（用于 API 响应）
 */
export function serializeContextForResponse(context: ConversationContext) {
  return {
    sessionId: context.sessionId,
    activeDatasetId: context.activeDatasetId,
    currentIntent: context.currentIntent,
    messages: context.messages,
    datasets: Array.from(context.datasets.values()),
  };
}