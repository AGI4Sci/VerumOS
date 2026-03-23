/**
 * Snapshot Routes - 快照 API 路由
 */

import { Hono } from 'hono';
import {
  createSnapshot,
  loadSnapshotContent,
  revertToSnapshot,
  listSnapshots,
  editHistoryMessage,
  deleteSnapshot,
} from '../job/snapshot-manager.js';
import { getJob } from '../job/manager.js';

const app = new Hono();

/**
 * POST /jobs/:jobId/snapshots - 创建快照（手动）
 */
app.post('/jobs/:jobId/snapshots', async (c) => {
  const jobId = c.req.param('jobId');

  try {
    const snapshot = await createSnapshot(jobId, 'manual', 'manual');
    if (!snapshot) {
      return c.json({
        ok: true,
        message: 'No changes detected, snapshot not created',
      });
    }
    return c.json({ ok: true, snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ ok: false, error: message }, 500);
  }
});

/**
 * GET /jobs/:jobId/snapshots - 列出快照
 */
app.get('/jobs/:jobId/snapshots', async (c) => {
  const jobId = c.req.param('jobId');

  try {
    const snapshots = await listSnapshots(jobId);
    return c.json({ ok: true, snapshots });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ ok: false, error: message }, 500);
  }
});

/**
 * GET /jobs/:jobId/snapshots/:snapId - 获取快照详情
 */
app.get('/jobs/:jobId/snapshots/:snapId', async (c) => {
  const jobId = c.req.param('jobId');
  const snapId = c.req.param('snapId');

  try {
    const content = await loadSnapshotContent(jobId, snapId);
    return c.json({ ok: true, content });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ ok: false, error: message }, 500);
  }
});

/**
 * POST /jobs/:jobId/snapshots/:snapId/revert - Revert 到快照
 */
app.post('/jobs/:jobId/snapshots/:snapId/revert', async (c) => {
  const jobId = c.req.param('jobId');
  const snapId = c.req.param('snapId');

  try {
    await revertToSnapshot(jobId, snapId);
    return c.json({ ok: true, message: 'Reverted successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ ok: false, error: message }, 500);
  }
});

/**
 * DELETE /jobs/:jobId/snapshots/:snapId - 删除快照
 */
app.delete('/jobs/:jobId/snapshots/:snapId', async (c) => {
  const jobId = c.req.param('jobId');
  const snapId = c.req.param('snapId');

  try {
    const deleted = await deleteSnapshot(jobId, snapId);
    return c.json({ ok: deleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ ok: false, error: message }, 500);
  }
});

/**
 * PUT /jobs/:jobId/messages/:index - 编辑历史消息
 */
app.put('/jobs/:jobId/messages/:index', async (c) => {
  const jobId = c.req.param('jobId');
  const index = parseInt(c.req.param('index'), 10);

  try {
    const body = await c.req.json();
    const { content, mode } = body;

    if (!content || typeof content !== 'string') {
      return c.json({ ok: false, error: 'Content is required' }, 400);
    }

    if (!['revert_and_reexecute', 'keep_and_continue'].includes(mode)) {
      return c.json({ ok: false, error: 'Invalid mode' }, 400);
    }

    const result = await editHistoryMessage(jobId, index, content, mode);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ ok: false, error: message }, 500);
  }
});

/**
 * GET /jobs/:jobId/messages - 获取消息列表
 */
app.get('/jobs/:jobId/messages', async (c) => {
  const jobId = c.req.param('jobId');

  try {
    const job = await getJob(jobId);
    if (!job) {
      return c.json({ ok: false, error: 'Job not found' }, 404);
    }
    return c.json({ ok: true, messages: job.state.messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ ok: false, error: message }, 500);
  }
});

export default app;
