import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import { config } from './config.js';
import chatRouter from './routes/chat.js';
import uploadRouter from './routes/upload.js';
import requirementRouter from './routes/requirement.js';
import jobRouter from './routes/job.js';
import { initializeSkills } from './skills/index.js';
import { ensureDataDir } from './job/index.js';

const app = new Hono();

app.use('*', honoLogger());
app.use('*', cors());

app.get('/health', (c) => c.json({ ok: true }));
app.route('/api', chatRouter);
app.route('/api', uploadRouter);
app.route('/api', requirementRouter);
app.route('/api', jobRouter);
app.get('/', serveStatic({ path: './web/index.html' }));
app.use('/*', serveStatic({ root: './web' }));

export async function initializeApp(): Promise<Hono> {
  await ensureDataDir();
  await initializeSkills();
  return app;
}

export { app, config };