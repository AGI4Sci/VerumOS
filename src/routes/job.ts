import { Hono } from 'hono';
import path from 'node:path';
import fs from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';
import {
  listJobs,
  getJob,
  deleteJob,
  resumeJob,
  createJob,
  updateJob,
} from '../job/index.js';
import type { Job } from '../job/types.js';
import { config } from '../config.js';

const jobRouter = new Hono();

/**
 * 列出所有 Job
 */
jobRouter.get('/jobs', async (c) => {
  try {
    const jobs = await listJobs();
    return c.json({ ok: true, jobs });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 获取 Job 详情
 */
jobRouter.get('/jobs/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId');
    const job = await getJob(jobId);

    if (!job) {
      return c.json({ ok: false, error: 'Job not found' }, 404);
    }

    return c.json({
      ok: true,
      job: {
        id: job.id,
        sessionId: job.sessionId,
        status: job.status,
        summary: job.summary,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        intent: job.intent,
        traces: job.traces,
        state: job.state,
        inputsDir: `data/${jobId}/inputs`,
        outputsDir: `data/${jobId}/outputs`,
      },
    });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 恢复 Job
 */
jobRouter.post('/session/resume', async (c) => {
  try {
    const body = await c.req.json();
    const jobId = body.jobId;

    if (!jobId || typeof jobId !== 'string') {
      return c.json({ ok: false, error: 'jobId is required' }, 400);
    }

    const context = await resumeJob(jobId);
    if (!context) {
      return c.json({ ok: false, error: 'Job not found or cannot be resumed' }, 404);
    }

    return c.json({
      ok: true,
      sessionId: context.sessionId,
      jobId,
      context: {
        sessionId: context.sessionId,
        activeDatasetId: context.activeDatasetId,
        currentIntent: context.currentIntent,
        datasets: Array.from(context.datasets.values()),
        messages: context.messages,
      },
    });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 删除 Job
 */
jobRouter.delete('/jobs/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId');
    const success = await deleteJob(jobId);

    if (!success) {
      return c.json({ ok: false, error: 'Failed to delete job' }, 500);
    }

    return c.json({ ok: true, jobId });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 批量删除 Jobs
 * POST /api/jobs/batch-delete
 */
jobRouter.post('/jobs/batch-delete', async (c) => {
  try {
    const body = await c.req.json();
    const { jobIds } = body;

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return c.json({ ok: false, error: 'jobIds must be a non-empty array' }, 400);
    }

    const results = await Promise.allSettled(
      jobIds.map(async (jobId) => {
        const success = await deleteJob(jobId);
        return { jobId, success };
      })
    );

    const deleted = results
      .filter((r): r is PromiseFulfilledResult<{ jobId: string; success: boolean }> => r.status === 'fulfilled' && r.value.success)
      .map(r => r.value.jobId);

    const failed = results
      .filter((r): r is PromiseRejectedResult | PromiseFulfilledResult<{ jobId: string; success: boolean }> => 
        r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success))
      .map((r, i) => ({ jobId: jobIds[i], error: r.status === 'rejected' ? r.reason : 'Failed to delete' }));

    return c.json({ ok: true, deleted, failed });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 创建新 Job（支持自定义名称）
 * POST /api/jobs/create
 */
jobRouter.post('/jobs/create', async (c) => {
  try {
    const body = await c.req.json();
    const { name, sessionId } = body;

    const newSessionId = sessionId || uuidv4();
    const jobId = await createJob(newSessionId);

    if (name) {
      await updateJob(jobId, { summary: name });
    }

    const job = await getJob(jobId);
    return c.json({ ok: true, job });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 更新 Job
 * PATCH /api/jobs/:jobId
 */
jobRouter.patch('/jobs/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId');
    const body = await c.req.json();
    const { name, status } = body;

    const updates: Partial<Job> = {};
    if (name) updates.summary = name;
    if (status) updates.status = status;

    await updateJob(jobId, updates);
    const job = await getJob(jobId);

    return c.json({ ok: true, job });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 获取 Job 文件列表
 * GET /api/jobs/:jobId/files
 */
jobRouter.get('/jobs/:jobId/files', async (c) => {
  try {
    const jobId = c.req.param('jobId');
    const job = await getJob(jobId);
    if (!job) {
      return c.json({ ok: false, error: 'Job not found' }, 404);
    }

    const inputsDir = path.join(config.data.dir, jobId, 'inputs');
    const outputsDir = path.join(config.data.dir, jobId, 'outputs');

    const readDir = async (dir: string) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        return entries
          .filter(e => e.isFile())
          .map(e => ({
            name: e.name,
            path: path.join(dir, e.name),
          }));
      } catch {
        return [];
      }
    };

    const inputs = await readDir(inputsDir);
    const outputs = await readDir(outputsDir);

    return c.json({ ok: true, jobId, inputs, outputs });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

export default jobRouter;