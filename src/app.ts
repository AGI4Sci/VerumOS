import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import { config } from './config.js';
import chatRouter from './routes/chat.js';
import uploadRouter from './routes/upload.js';
import requirementRouter from './routes/requirement.js';
import jobRouter from './routes/job.js';
import fileRouter from './routes/file.js';
import snapshotRouter from './routes/snapshot.js';
import { initializeSkills } from './skills/index.js';
import { ensureDataDir } from './job/index.js';
import { createCoreServices, initializeCoreServices } from './core/index.js';

const app = new Hono();

app.use('*', honoLogger());
app.use('*', cors());

app.get('/health', (c) => c.json({ ok: true }));
app.route('/api', chatRouter);
app.route('/api', uploadRouter);
app.route('/api', requirementRouter);
app.route('/api', jobRouter);
app.route('/api', fileRouter);
app.route('/api', snapshotRouter);
app.get('/', serveStatic({ path: './web/index.html' }));
app.use('/*', serveStatic({ root: './web' }));

/**
 * Core 服务实例（单例）
 */
let coreServicesInstance: ReturnType<typeof createCoreServices> | null = null;

/**
 * 初始化应用
 */
export async function initializeApp(): Promise<Hono> {
  await ensureDataDir();
  await initializeSkills();

  // 初始化 Core 服务
  coreServicesInstance = createCoreServices();
  await initializeCoreServices(coreServicesInstance);

  return app;
}

/**
 * 获取 Core 服务实例
 */
export function getCoreServices(): ReturnType<typeof createCoreServices> | null {
  return coreServicesInstance;
}

export { app, config };