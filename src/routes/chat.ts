import { Hono } from 'hono';
import { agentRegistry } from '../agents/index.js';
import type { Message } from '../agents/types.js';
import { appendMessage, createSession, getOrCreateSession, getSession, serializeContextForResponse, updateSession } from '../session-store.js';
import { emitSessionEvent } from '../ws/server.js';

const chatRouter = new Hono();

chatRouter.post('/session', async (c) => {
  const context = await createSession();
  return c.json({
    ok: true,
    sessionId: context.sessionId,
    context: serializeContextForResponse(context),
  });
});

chatRouter.get('/session/:id', async (c) => {
  const context = await getSession(c.req.param('id'));
  if (!context) {
    return c.json({ ok: false, error: 'Session not found' }, 404);
  }
  return c.json({ ok: true, context: serializeContextForResponse(context) });
});

chatRouter.get('/history/:sessionId', async (c) => {
  const context = await getSession(c.req.param('sessionId'));
  if (!context) {
    return c.json({ ok: false, error: 'Session not found' }, 404);
  }
  return c.json({ ok: true, messages: context.messages });
});

chatRouter.post('/chat', async (c) => {
  try {
    const body = await c.req.json();
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
      return c.json({ ok: false, error: 'Message is required' }, 400);
    }

    const context = await getOrCreateSession(typeof body.sessionId === 'string' ? body.sessionId : undefined);

    const userMessage: Message = {
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };
    await appendMessage(context.sessionId, userMessage);

    const agent = agentRegistry.getDefault();
    const response = await agent.processMessage(message, context);

    const assistantMessage: Message = {
      role: 'assistant',
      content: response.content,
      timestamp: Date.now(),
    };
    await appendMessage(context.sessionId, assistantMessage);

    emitSessionEvent(context.sessionId, {
      type: 'chat.completed',
      payload: {
        agentId: agent.id,
        response,
      },
    });

    return c.json({
      ok: true,
      sessionId: context.sessionId,
      agentId: agent.id,
      response,
      context: serializeContextForResponse(context),
    });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

export default chatRouter;