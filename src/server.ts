import type { Server } from 'node:http';
import { createAdaptorServer } from '@hono/node-server';
import { initializeApp } from './app.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { attachWebSocketServer } from './ws/server.js';

async function main(): Promise<void> {
  const app = await initializeApp();
  const server = createAdaptorServer({ fetch: app.fetch }) as Server;
  attachWebSocketServer(server);

  server.listen(config.server.port, () => {
    logger.info(`VerumOS server listening on http://localhost:${config.server.port}`);
    logger.info(`WebSocket endpoint available at ws://localhost:${config.server.port}/ws`);
  });
}

main().catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});
