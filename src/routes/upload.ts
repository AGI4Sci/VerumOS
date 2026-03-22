import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { dataAgent } from '../agents/data-agent.js';
import type { Message } from '../agents/types.js';
import { config } from '../config.js';
import { appendMessage, getOrCreateSession, serializeContext } from '../session-store.js';
import { ensureDataDir } from '../utils/data.js';
import { emitSessionEvent } from '../ws/server.js';

const uploadRouter = new Hono();

uploadRouter.post('/upload', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined;

    if (!(file instanceof File)) {
      return c.json({ ok: false, error: 'No file uploaded' }, 400);
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!['.csv', '.tsv', '.xlsx', '.xls'].includes(ext)) {
      return c.json({ ok: false, error: `Unsupported file type: ${ext}` }, 400);
    }

    const dataDir = await ensureDataDir();
    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const savedPath = path.resolve(dataDir, safeName);
    await fs.writeFile(savedPath, Buffer.from(await file.arrayBuffer()));

    const context = getOrCreateSession(sessionId);
    const uploadMessage: Message = {
      role: 'user',
      content: `上传文件：${file.name}`,
      timestamp: Date.now(),
    };
    appendMessage(context.sessionId, uploadMessage);

    const response = await dataAgent.ingestFile(savedPath, context, file.name);
    const assistantMessage: Message = {
      role: 'assistant',
      content: response.content,
      timestamp: Date.now(),
    };
    appendMessage(context.sessionId, assistantMessage);

    emitSessionEvent(context.sessionId, {
      type: 'dataset.registered',
      payload: {
        fileName: file.name,
        savedPath,
        dataDir: path.resolve(config.data.dir),
        response,
      },
    });

    return c.json({
      ok: true,
      sessionId: context.sessionId,
      file: {
        name: file.name,
        path: savedPath,
        size: file.size,
        type: ext,
      },
      response,
      context: serializeContext(context),
    });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

uploadRouter.get('/files', async (c) => {
  try {
    const dataDir = await ensureDataDir();
    const entries = await fs.readdir(dataDir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const filePath = path.resolve(dataDir, entry.name);
          const stat = await fs.stat(filePath);
          return {
            name: entry.name,
            path: filePath,
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
          };
        })
    );

    return c.json({ ok: true, files });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

export default uploadRouter;
